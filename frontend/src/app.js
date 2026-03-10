import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { tableFromIPC } from 'apache-arrow';

document.addEventListener('DOMContentLoaded', function () {

const SATELLITE_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const PROJECTIONS = {
  mercator: { label: 'Mercator', desc: 'Cylindrical conformal — preserves angles locally. Standard for web mapping.' },
  globe:    { label: 'Globe',    desc: 'Spherical globe — transitions to mercator when zoomed in past ~z12.' },
};

let is3D = false;
let currentPopup = null;
let currentProj = 'mercator';

const map = new maplibregl.Map({
  container: 'map',
  style: SATELLITE_STYLE,
  center: [20, 20],
  zoom: 2.2,
  minZoom: 1,
  maxZoom: 20,
  attributionControl: false,
});

function hideLabels() {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach(layer => {
    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });
}

// ── SERVER DATA — fetched from backend via Apache Arrow IPC stream ──
const API_BASE = '/api';

let TEMP_GRID = null, WIND_GRID = null;
let TMIN = -2, TMAX = 35;
let WMIN =  0, WMAX = 50;

async function loadVariable(variableName) {
  const res = await fetch(`${API_BASE}/get_data/${variableName}`);
  if (!res.ok) throw new Error(`Failed to load variable '${variableName}': ${res.status}`);
  const table = await tableFromIPC(res);
  const meta  = table.schema.metadata;

  const colData = table.getChild('variable_data');

  const values = new Float32Array(colData.length);
  for (let i = 0; i < colData.length; i++) values[i] = colData.get(i);

  // Decode lat/lon from hex-encoded float32 bytes in metadata
  function hexToFloat32Array(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    return new Float32Array(bytes.buffer);
  }
  const latArr = hexToFloat32Array(meta.get('lat'));
  const lonArr = hexToFloat32Array(meta.get('lon'));

  const grid = {
    values,
    latArr,
    lonArr,
    rows: parseInt(meta.get('n_lat')),
    cols: parseInt(meta.get('n_lon')),
    vmin: parseFloat(meta.get('data_min')),
    vmax: parseFloat(meta.get('data_max')),
    name: meta.get('variable_name'),
  };

  return grid;
}

async function loadAllData() {
  const [temp, wind] = await Promise.all([
    loadVariable('Q'),
    loadVariable('M'),
  ]);
  TEMP_GRID = temp;  TMIN = temp.vmin;  TMAX = temp.vmax;
  WIND_GRID = wind;  WMIN = wind.vmin;  WMAX = wind.vmax;
}

// ── WEBGL CUSTOM LAYER FACTORY ──
// Vertex shader — uses MapLibre's injected projectTile() helper.
// Vertices are in Mercator [0,1] space. We pass three world-copies
// (wraps -1, 0, +1) by shifting tileMercatorCoords.x.
const VERT_SRC = (prelude, define) => `#version 300 es
${prelude}
${define}
in  vec2  a_merc;        // Mercator [0,1]
in  vec2  a_uv;          // texture coords [0,1]
out vec2  v_uv;
uniform float u_world_offset; // -1, 0, or 1 world-widths for wrapping
void main() {
  v_uv        = a_uv;
  gl_Position = projectTile(vec2(a_merc.x + u_world_offset, a_merc.y));
}`;

// Fragment shader — decodes float texture, applies colour ramp, premultiplied alpha
const FRAG_SRC = (stops) => {
  const stopLines = stops.map((s, i) =>
    `  stops[${i}] = vec4(${s[0].toFixed(4)},${s[1].toFixed(4)},${s[2].toFixed(4)},${s[3].toFixed(4)});`
  ).join('\n');
  return `#version 300 es
precision mediump float;
in  vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_data;
uniform float     u_opacity;
uniform float     u_vmin;
uniform float     u_vmax;
const int N = ${stops.length};
void main() {
  float raw = texture(u_data, v_uv).r;
  if (raw < -1e9 || raw > 1e9) { fragColor = vec4(0.0); return; }
  float range = u_vmax - u_vmin;
  float t = clamp((raw - u_vmin) / (range == 0.0 ? 1.0 : range), 0.0, 1.0);
  vec4 stops[${stops.length}];
${stopLines}
  float pos = t * float(N - 1);
  int   lo  = int(floor(pos));
  int   hi  = min(lo + 1, N - 1);
  float f   = pos - float(lo);
  vec4  col = mix(stops[lo], stops[hi], f);
  fragColor = vec4(col.rgb * col.a * u_opacity, col.a * u_opacity);
}`;
};

// Build a subdivided quad mesh in Mercator [0,1] space + matching UVs.
// Subdivision ensures globe curvature is smooth (no visible straight-edge artifacts).
// Build mesh using the actual latArr/lonArr from the grid.
// One vertex row per latitude, one vertex column per longitude —
// this ensures Mercator y and UV v are exact at every grid line,
// preventing the stretch/pinch distortion from linear UV interpolation.
function buildMesh(gl, grid) {
  const lat2merc = lat => {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  };

  const { latArr, lonArr } = grid;
  const NY = latArr.length - 1;
  const NX = lonArr.length - 1;

  // latArr may be descending (90→-90); row 0 of the texture = latArr[0]
  // OpenGL v=0 is the bottom of the texture, so:
  //   if descending: latArr[0]=north=row0 → v=1 (top of screen, bottom of tex)
  //   if ascending:  latArr[0]=south=row0 → v=0
  const latDesc = latArr[0] > latArr[latArr.length - 1];

  // Mercator x: lon mapped to [0,1] world space (-180→180)
  const lon2merc = lon => (lon + 180) / 360;

  // Interleaved: merc.x, merc.y, uv.u, uv.v  (4 floats per vertex)
  const verts = [];
  for (let iy = 0; iy <= NY; iy++) {
    const lat = latArr[iy];
    const my  = lat2merc(lat);
    // UV v: with UNPACK_FLIP_Y=false, data row 0 is at v=0 (GL bottom).
    // For descending lat (row 0 = north), north must appear at top → v=1, so we use iy/NY.
    const v = latDesc ? (iy / NY) : 1.0 - (iy / NY);
    for (let ix = 0; ix <= NX; ix++) {
      const mx = lon2merc(lonArr[ix]);
      const u  = ix / NX;
      verts.push(mx, my, u, v);
    }
  }

  const idx = [];
  for (let iy = 0; iy < NY; iy++) {
    for (let ix = 0; ix < NX; ix++) {
      const a = iy * (NX+1) + ix;
      idx.push(a, a+1, a+(NX+1), a+1, a+(NX+1)+1, a+(NX+1));
    }
  }

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);

  return { vbo, ibo, count: idx.length };
}

function makeScalarLayer(id, grid, colorStops, vmin0, vmax0, toggleId, opacityId) {
  const shaderMap = new Map();
  let tex = null, mesh = null;

  function uploadTexture(gl) {
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const { values, rows, cols } = grid;
    // Pack float values into RGBA32F texture (R channel = value)
    const data = new Float32Array(rows * cols * 4);
    for (let i = 0; i < rows * cols; i++) {
      data[i * 4] = isNaN(values[i]) ? -9999.0 : values[i];
    }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cols, rows, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function getProgram(gl, shaderDesc) {
    const key = id + "|" + shaderDesc.variantName;
    if (shaderMap.has(key)) return shaderMap.get(key);
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error(id, type === gl.VERTEX_SHADER ? 'vert' : 'frag', gl.getShaderInfoLog(s));
      return s;
    };
    const fragSrc = FRAG_SRC(colorStops);
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER,   VERT_SRC(shaderDesc.vertexShaderPrelude, shaderDesc.define)));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      console.error(id, 'link', gl.getProgramInfoLog(p));
    shaderMap.set(key, p);
    return p;
  }

  return {
    id, type: 'custom', renderingMode: '3d',

    onAdd(m, gl) {
      tex  = uploadTexture(gl);
      mesh = buildMesh(gl, grid); // one vertex per lat/lon grid point
    },

    render(gl, args) {
      const visible = document.getElementById(toggleId).checked;
      const opacity = visible ? document.getElementById(opacityId).value / 100 : 0;
      if (opacity === 0) return;

      const p = getProgram(gl, args.shaderData);
      gl.useProgram(p);

      // Colour range from server-provided values
      const vmin = vmin0;
      const vmax = vmax0;
      gl.uniform1f(gl.getUniformLocation(p, 'u_vmin'), vmin);
      gl.uniform1f(gl.getUniformLocation(p, 'u_vmax'), vmax !== vmin ? vmax : vmin + 1);

      gl.uniform1f(gl.getUniformLocation(p, 'u_opacity'), opacity);

      // Data texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(p, 'u_data'), 0);

      // Vertex buffers — interleaved merc(2) + uv(2)
      const stride = 4 * 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      const aMerc = gl.getAttribLocation(p, 'a_merc');
      const aUV   = gl.getAttribLocation(p, 'a_uv');
      gl.enableVertexAttribArray(aMerc);
      gl.vertexAttribPointer(aMerc, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV,   2, gl.FLOAT, false, stride, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      // Render three world-copies (wraps -1, 0, +1) for correct Mercator panning/wrapping.
      const pd = args.defaultProjectionData;
      const uMat      = gl.getUniformLocation(p, 'u_projection_matrix');
      const uFallback = gl.getUniformLocation(p, 'u_projection_fallback_matrix');
      const uTrans    = gl.getUniformLocation(p, 'u_projection_transition');
      const uTMC      = gl.getUniformLocation(p, 'u_projection_tile_mercator_coords');
      const uClip     = gl.getUniformLocation(p, 'u_projection_clipping_plane');

      gl.uniformMatrix4fv(uMat,      false, pd.mainMatrix);
      gl.uniformMatrix4fv(uFallback, false, pd.fallbackMatrix);
      gl.uniform1f(uTrans, pd.projectionTransition);
      gl.uniform4f(uTMC,   ...pd.tileMercatorCoords);
      gl.uniform4f(uClip,  ...pd.clippingPlane);

      const uWorldOffset = gl.getUniformLocation(p, 'u_world_offset');
      // In globe mode (projectionTransition > 0) only render the center copy —
      // world-wrap offsets cause artifacts on the sphere.
      const wraps = pd.projectionTransition > 0 ? [0] : [-1, 0, 1];
      for (const wrap of wraps) {
        gl.uniform1f(uWorldOffset, wrap);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
      }

      gl.disableVertexAttribArray(aMerc);
      gl.disableVertexAttribArray(aUV);
    },

    onRemove(m, gl) {
      shaderMap.forEach(p => gl.deleteProgram(p));
      shaderMap.clear();
      if (tex)       gl.deleteTexture(tex);
      if (mesh?.vbo) gl.deleteBuffer(mesh.vbo);
      if (mesh?.ibo) gl.deleteBuffer(mesh.ibo);
    },
  };
}

// Colour stop definitions
const TEMP_STOPS = [
  [0.182, 0.254, 0.568, 0.0],
  [0.246, 0.701, 0.955, 0.5],
  [0.832, 0.990, 1.000, 1.0],
];
const WIND_STOPS = [
  [0.568, 0.254, 0.182, 0.0],
  [0.955, 0.701, 0.246, 0.65],
  [1.000, 0.990, 0.832, 1.0],
];

function addTempLayer() {
  if (map.getLayer('temp-layer')) map.removeLayer('temp-layer');
  if (TEMP_GRID?.name) {
    document.getElementById('temp-layer-name').textContent = TEMP_GRID.name.replace(/_/g, ' ') + ' layer';
    document.getElementById('temp-hud-label').textContent = TEMP_GRID.name.replace(/_/g, ' ').toUpperCase();
  }
  map.addLayer(makeScalarLayer(
    'temp-layer', TEMP_GRID, TEMP_STOPS,
    TMIN, TMAX, 'temp-toggle', 'temp-opacity'
  ));
}

function addWindLayer() {
  if (map.getLayer('wind-layer')) map.removeLayer('wind-layer');
  if (WIND_GRID?.name) {
    document.getElementById('wind-layer-name').textContent = WIND_GRID.name.replace(/_/g, ' ') + ' layer';
    document.getElementById('wind-hud-label').textContent = WIND_GRID.name.replace(/_/g, ' ').toUpperCase();
  }
  map.addLayer(makeScalarLayer(
    'wind-layer', WIND_GRID, WIND_STOPS,
    WMIN, WMAX, 'wind-toggle', 'wind-opacity'
  ));
}

// Binary search helper for sorted coordinate arrays
function bisect(arr, val) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function gridLookup(grid, lat, lng) {
  if (!grid) return NaN;
  const { values, latArr, lonArr, rows, cols } = grid;

  // Find surrounding lat indices (latArr may be descending)
  const latDesc = latArr[0] > latArr[latArr.length - 1];
  let r0, r1, rf;
  if (latDesc) {
    // descending: search reversed
    const ri = bisect(latArr.slice().reverse(), lat);
    r0 = Math.max(0, Math.min(rows - 2, rows - 1 - ri));
    r1 = r0 + 1;
    rf = (latArr[r0] - lat) / (latArr[r0] - latArr[r1] || 1);
  } else {
    const ri = bisect(latArr, lat);
    r0 = Math.max(0, Math.min(rows - 2, ri - 1));
    r1 = r0 + 1;
    rf = (lat - latArr[r0]) / (latArr[r1] - latArr[r0] || 1);
  }

  // Find surrounding lon indices (lonArr assumed ascending)
  const ci = bisect(lonArr, lng);
  const c0 = Math.max(0, Math.min(cols - 2, ci - 1));
  const c1 = c0 + 1;
  const cf = (lng - lonArr[c0]) / (lonArr[c1] - lonArr[c0] || 1);

  const v00 = values[r0 * cols + c0], v01 = values[r0 * cols + c1];
  const v10 = values[r1 * cols + c0], v11 = values[r1 * cols + c1];
  if (isNaN(v00) || isNaN(v01) || isNaN(v10) || isNaN(v11)) return NaN;
  return v00*(1-rf)*(1-cf) + v01*(1-rf)*cf + v10*rf*(1-cf) + v11*rf*cf;
}

map.on('load', async () => {
  hideLabels();
  try {
    await loadAllData();
  } catch (err) {
    console.error('Data load failed:', err);
    document.getElementById('loading').classList.add('gone');
    return;
  }
  addTempLayer();
  addWindLayer();
  setTimeout(() => {
    document.getElementById('loading').classList.add('gone');
    updateHUD();
  }, 800);
});


let tooltipActive = false;

function gridLabel(grid, fallback) {
  return grid?.name ? grid.name.replace(/_/g, ' ') : fallback;
}

function buildPopupHTML(lat, lng) {
  const tempOn = document.getElementById('temp-toggle').checked;
  const windOn = document.getElementById('wind-toggle').checked;
  let extra = '';
  if (tempOn) {
    const t = gridLookup(TEMP_GRID, lat, lng);
    extra += `<div class="popup-zoom">${gridLabel(TEMP_GRID, 'TEMP').toUpperCase()} ${t.toFixed(4)}</div>`;
  }
  if (windOn) {
    const w = gridLookup(WIND_GRID, lat, lng);
    extra += `<div class="popup-zoom">${gridLabel(WIND_GRID, 'WIND').toUpperCase()} ${w.toFixed(4)}</div>`;
  }
  return `
    <div class="popup-coords"><span style="color:var(--ghost)">LAT</span> ${lat.toFixed(5)}°<br><span style="color:var(--ghost)">LNG</span> ${lng.toFixed(5)}°</div>
    ${extra}
  `;
}

function clearHUD() {
  document.getElementById('lat-val').textContent = '—';
  document.getElementById('lng-val').textContent = '—';
  document.getElementById('temp-val').textContent = '—';
  document.getElementById('wind-val').textContent = '—';
}

map.on('mousemove', (e) => {
  if (!e.lngLat) { clearHUD(); return; }

  const lat = e.lngLat.lat, lng = e.lngLat.lng;
  if (lat < -90 || lat > 90) { clearHUD(); return; }

  document.getElementById('lat-val').textContent = lat.toFixed(4);
  document.getElementById('lng-val').textContent = lng.toFixed(4);

  const tempOn = document.getElementById('temp-toggle').checked;
  const windOn = document.getElementById('wind-toggle').checked;
  const tempHud = document.getElementById('temp-hud');
  const windHud = document.getElementById('wind-hud');

  if (tempOn) {
    const t = gridLookup(TEMP_GRID, lat, lng);
    document.getElementById('temp-val').textContent = t.toFixed(4) + '°C';
    tempHud.style.display = '';
  } else {
    tempHud.style.display = 'none';
  }

  if (windOn) {
    const w = gridLookup(WIND_GRID, lat, lng);
    document.getElementById('wind-val').textContent = isNaN(w) ? '—' : w.toFixed(4);
    windHud.style.display = '';
  } else {
    windHud.style.display = 'none';
  }

  if (tooltipActive && currentPopup) {
    currentPopup.setLngLat(e.lngLat).setHTML(buildPopupHTML(lat, lng));
  }
});

map.on('mouseleave', () => clearHUD());

map.on('touchmove', (e) => {
  if (!e.lngLat) return;
  const lat = e.lngLat.lat, lng = e.lngLat.lng;
  if (lat < -90 || lat > 90) return;
  document.getElementById('lat-val').textContent = lat.toFixed(4);
  document.getElementById('lng-val').textContent = lng.toFixed(4);
  if (tooltipActive && currentPopup) {
    currentPopup.setLngLat(e.lngLat).setHTML(buildPopupHTML(lat, lng));
  }
});

map.on('move', updateHUD);

map.on('click', (e) => {
  if (!e.lngLat) return;
  const lat = e.lngLat.lat, lng = e.lngLat.lng;
  if (lat < -90 || lat > 90) return;

  if (tooltipActive) {
    if (currentPopup) { currentPopup.remove(); currentPopup = null; }
    tooltipActive = false;
    return;
  }

  tooltipActive = true;
  if (currentPopup) currentPopup.remove();
  currentPopup = new maplibregl.Popup({ offset: 8, closeButton: false, closeOnClick: false })
    .setLngLat(e.lngLat)
    .setHTML(buildPopupHTML(lat, lng))
    .addTo(map);
});

function updateHUD() {
  const z   = map.getZoom();
  const ctr = map.getCenter();
  document.getElementById('zoom-val').textContent = z.toFixed(1);
  const mpp = 156543.03392 * Math.cos(ctr.lat * Math.PI / 180) / Math.pow(2, z);
  const m   = mpp * 80;
  document.getElementById('scale-label').textContent =
    m > 1000 ? (m / 1000).toFixed(0) + ' KM' : Math.round(m) + ' M';
}

function setProjection(proj) {
  try {
    map.setProjection({ type: proj });
    currentProj = proj;
  } catch(e) {
    showToast('UNSUPPORTED IN THIS STYLE');
    return;
  }
  document.querySelectorAll('.proj-tb-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.proj === proj)
  );
  showToast('PROJECTION: ' + (PROJECTIONS[proj]?.label ?? proj).toUpperCase());
}

function resetNorth() {
  map.easeTo({ bearing: 0, pitch: 0, duration: 700 });
  is3D = false;
  document.getElementById('btn-3d').style.color = '';
}

function toggle3D() {
  is3D = !is3D;
  map.easeTo({ pitch: is3D ? 50 : 0, duration: 700 });
  document.getElementById('btn-3d').style.color = is3D ? 'var(--accent)' : '';
  showToast(is3D ? '3D PITCH ENABLED' : 'PITCH RESET');
}

function locateUser() {
  if (!navigator.geolocation) return showToast('GEOLOCATION UNAVAILABLE');
  showToast('LOCATING…');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    if (currentPopup) currentPopup.remove();
    currentPopup = new maplibregl.Popup({ offset: 16, closeButton: true })
      .setLngLat([lng, lat])
      .setHTML(`
        <div class="popup-coords"><span style="color:var(--ghost)">LAT</span> ${lat.toFixed(5)}°<br><span style="color:var(--ghost)">LNG</span> ${lng.toFixed(5)}°</div>
        <div class="popup-zoom">YOU ARE HERE</div>
      `)
      .addTo(map);
    map.flyTo({ center: [lng, lat], zoom: 13, duration: 1600 });
    showToast('POSITION ACQUIRED');
  }, () => showToast('LOCATION DENIED'));
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── BUTTON BINDINGS ──
document.getElementById('btn-zoom-in').addEventListener('click',  () => map.zoomIn());
document.getElementById('btn-zoom-out').addEventListener('click', () => map.zoomOut());
document.getElementById('btn-north').addEventListener('click',    resetNorth);
document.getElementById('btn-3d').addEventListener('click',       toggle3D);
document.getElementById('btn-locate').addEventListener('click',   locateUser);

document.querySelectorAll('.proj-tb-btn').forEach(btn =>
  btn.addEventListener('click', () => setProjection(btn.dataset.proj))
);

// Temperature layer controls
document.getElementById('temp-toggle').addEventListener('change', (e) => {
  document.getElementById('temp-hud').style.display = e.target.checked ? '' : 'none';
  map.triggerRepaint();
});
document.getElementById('temp-opacity').addEventListener('input', (e) => {
  document.getElementById('opacity-val').textContent = e.target.value + '%';
  map.triggerRepaint();
});

// Wind layer controls
document.getElementById('wind-toggle').addEventListener('change', (e) => {
  document.getElementById('wind-hud').style.display = e.target.checked ? '' : 'none';
  map.triggerRepaint();
});
document.getElementById('wind-opacity').addEventListener('input', (e) => {
  document.getElementById('wind-opacity-val').textContent = e.target.value + '%';
  map.triggerRepaint();
});

// ── LAYER DRAG-TO-REORDER ──
let dragSrc = null;

document.querySelectorAll('#sidebar .section').forEach(sec => {
  const handle = sec.querySelector('.drag-handle');

  handle.addEventListener('mousedown', () => { sec.draggable = true; });
  document.addEventListener('mouseup', () => { sec.draggable = false; });

  sec.addEventListener('dragstart', (e) => {
    if (!sec.draggable) { e.preventDefault(); return; }
    dragSrc = sec;
    sec.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  sec.addEventListener('dragend', () => {
    sec.draggable = false;
    sec.classList.remove('dragging');
    document.querySelectorAll('#sidebar .section').forEach(s => s.classList.remove('drag-over'));
  });
  sec.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sec !== dragSrc) {
      document.querySelectorAll('#sidebar .section').forEach(s => s.classList.remove('drag-over'));
      sec.classList.add('drag-over');
    }
  });
  sec.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragSrc || dragSrc === sec) return;
    sec.classList.remove('drag-over');

    const parent = sec.parentNode;
    const sections = [...parent.querySelectorAll('.section')];
    const srcIdx = sections.indexOf(dragSrc);
    const tgtIdx = sections.indexOf(sec);
    if (srcIdx < tgtIdx) {
      parent.insertBefore(dragSrc, sec.nextSibling);
    } else {
      parent.insertBefore(dragSrc, sec);
    }

    // Sync MapLibre layer order (top of list = drawn on top)
    const orderedLayers = [...parent.querySelectorAll('.section')]
      .map(s => s.dataset.layer)
      .filter(Boolean)
      .reverse(); // first in sidebar = drawn last (on top)

    orderedLayers.forEach((layerId, i) => {
      if (map.getLayer(layerId)) {
        const before = orderedLayers[i + 1];
        map.moveLayer(layerId, before && map.getLayer(before) ? before : undefined);
      }
    });

    showToast('LAYER ORDER UPDATED');
  });
});

}); // end DOMContentLoaded
