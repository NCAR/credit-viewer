import Panzoom from "@panzoom/panzoom";




// Get references to the checkboxes
const toggleEarth = document.getElementById('toggleEarth');
const toggleVar1 = document.getElementById('toggleVar1');
const toggleVar2 = document.getElementById('toggleVar2');
const toggleVar3 = document.getElementById('toggleVar3');
const toggleVar4 = document.getElementById('toggleVar4');
const toggleVar5 = document.getElementById('toggleVar5');
const toggleBorders = document.getElementById('toggleBorders');

// Get references to the images
const earthImg = document.querySelector('.earth-img');
const var1Img = document.querySelector('.var1-img');
const var2Img = document.querySelector('.var2-img');
const var3Img = document.querySelector('.var3-img');
const var4Img = document.querySelector('.var4-img');
const var5Img = document.querySelector('.var5-img');
const borderImg = document.querySelector('.border-img');

// Function to toggle visibility of images based on checkbox state
function toggleImageVisibility() {
  earthImg.style.display = toggleEarth.checked ? 'block' : 'none';
  var1Img.style.display = toggleVar1.checked ? 'block' : 'none';
  var2Img.style.display = toggleVar2.checked ? 'block' : 'none';
  var3Img.style.display = toggleVar3.checked ? 'block' : 'none';
  var4Img.style.display = toggleVar4.checked ? 'block' : 'none';
  var5Img.style.display = toggleVar5.checked ? 'block' : 'none';
  borderImg.style.display = toggleBorders.checked ? 'block' : 'none';
}

// Attach event listeners to checkboxes to call toggle function when clicked
toggleEarth.addEventListener('change', toggleImageVisibility);
toggleVar1.addEventListener('change', toggleImageVisibility);
toggleVar2.addEventListener('change', toggleImageVisibility);
toggleVar3.addEventListener('change', toggleImageVisibility);
toggleVar4.addEventListener('change', toggleImageVisibility);
toggleVar5.addEventListener('change', toggleImageVisibility);
toggleBorders.addEventListener('change', toggleImageVisibility);

// Initial call to set the initial visibility based on checkbox state
toggleImageVisibility();







// TODO Update this later ->

const userInfo = document.getElementById('file-info');
const form = document.getElementById('variable-form');
const select = document.getElementById('file-select');

function fetchUserData() {
  const username = select.value;

  fetch(`http://localhost:8000/data?user=${username}`)
    .then(res => res.json())
    .then(data => renderUserData(data))
    .catch(err => {
      userInfo.innerHTML = `<p style="color:red;">Error loading data</p>`;
      console.error(err);
    });
}

// Render only selected fields (checkboxes)
function renderUserData(data) {
  const formData = new FormData(form);
  const selectedFields = Array.from(formData.keys());

  const filteredData = Object.entries(data)
    .filter(([key]) => selectedFields.includes(key));

  if (filteredData.length === 0) {
    userInfo.innerHTML = '<p>No fields selected</p>';
    return;
  }

  userInfo.innerHTML = '<pre>' + filteredData
    .map(([key, value]) => `${key.padEnd(10)} : ${value}`)
    .join('\n') + '</pre>';
}

// Event listeners
form.addEventListener('change', fetchUserData);
select.addEventListener('change', fetchUserData);

// Initial fetch
fetchUserData();



// Map Zoom
const elem = document.getElementById('panzoom-container');
const panzoom = Panzoom(elem, {
  maxScale: 5,
  minScale: 1,
  contain: 'outside', // allow full panning
  animate: true,
});
// Enable mouse wheel zoom
elem.parentElement.addEventListener('wheel', panzoom.zoomWithWheel);



