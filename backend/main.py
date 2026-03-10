from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path
import numpy as np
import xarray as xr
import pyarrow as pa
import io

NETCDF_DIR = "./data"
NETCDF_FILE = "QTUV_pred_2025-07-02T00Z_001.nc"  # TODO: receive from client
TIMESTEP = 0   # TODO: receive from client
LEVEL = 12     # TODO: receive from client

def netcdf_reader(netcdf_path):
    return xr.open_dataset(netcdf_path)

def get_variable_data(netcdf_data, variable_name):
    variable = getattr(netcdf_data, variable_name)
    return np.array(variable[TIMESTEP, LEVEL, :, :])

app = FastAPI()

@app.get("/get_data/{variable_name}")
def get_data(variable_name: str):
    netcdf_path = Path(NETCDF_DIR, NETCDF_FILE)
    if not netcdf_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {NETCDF_FILE}")

    netcdf_data = netcdf_reader(netcdf_path)

    if variable_name == 'M':
        u = get_variable_data(netcdf_data, 'U')
        v = get_variable_data(netcdf_data, 'V')
        variable_data = np.sqrt(np.maximum(0.0, u**2 + v**2))
        data_min, data_max = 0.0, 50.0
    elif variable_name == 'Q':
        variable_data = get_variable_data(netcdf_data, variable_name)
        data_min, data_max = 0.0, 0.02
    else:
        try:
            variable_data = get_variable_data(netcdf_data, variable_name)
        except AttributeError:
            raise HTTPException(status_code=400, detail=f"Variable '{variable_name}' not found in dataset")
        data_min, data_max = float(variable_data.min()), float(variable_data.max())

    # -- Get lat/lon coordinate arrays, normalise lon to -180→180 --------------
    lat_arr = np.array(netcdf_data.latitude, dtype=np.float32)
    lon_arr = np.array(netcdf_data.longitude, dtype=np.float32)

    # Roll 0→360 longitude to -180→180 so the mesh aligns with Mercator
    if lon_arr.max() > 180:
        split = np.searchsorted(lon_arr, 180)
        lon_arr = np.concatenate([lon_arr[split:] - 360, lon_arr[:split]])
        variable_data = np.concatenate([variable_data[:, split:], variable_data[:, :split]], axis=1)

    lat_hex = lat_arr.tobytes().hex()
    lon_hex = lon_arr.tobytes().hex()

    # -- Send array with Apache Arrow ------------------------------------------
    n_lat, n_lon = variable_data.shape
    table = pa.table({
        'variable_data': variable_data.flatten().astype(np.float32),
    })
    table = table.replace_schema_metadata({
        "variable_name": variable_name,
        "n_lat": str(n_lat),
        "n_lon": str(n_lon),
        "data_min": str(data_min),
        "data_max": str(data_max),
        "lat": lat_hex,
        "lon": lon_hex,
    })

    stream = io.BytesIO()
    with pa.ipc.new_stream(stream, table.schema) as writer:
        writer.write_table(table)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.apache.arrow.stream",
    )

@app.get("/debug")
def debug():
    netcdf_path = Path(NETCDF_DIR, NETCDF_FILE)
    ds = netcdf_reader(netcdf_path)
    lat = np.array(ds.latitude, dtype=np.float32)
    lon = np.array(ds.longitude, dtype=np.float32)
    return {
        "lat_len": len(lat),
        "lon_len": len(lon),
        "lat_min": float(lat.min()),
        "lat_max": float(lat.max()),
        "lat_first": float(lat[0]),
        "lat_last": float(lat[-1]),
        "lon_min": float(lon.min()),
        "lon_max": float(lon.max()),
        "lon_first": float(lon[0]),
        "lon_last": float(lon[-1]),
        "variables": list(ds.data_vars),
    }
