// main.js

// Get references to the checkboxes
const toggleEarth = document.getElementById('toggleEarth');
const toggleVar1 = document.getElementById('toggleVar1');
const toggleBorders = document.getElementById('toggleBorders');

// Get references to the images
const earthImg = document.querySelector('.earth-img');
const var1Img = document.querySelector('.var1-img');
const borderImg = document.querySelector('.border-img');

// Function to toggle visibility of images based on checkbox state
function toggleImageVisibility() {
  earthImg.style.display = toggleEarth.checked ? 'block' : 'none';
  var1Img.style.display = toggleVar1.checked ? 'block' : 'none';
  borderImg.style.display = toggleBorders.checked ? 'block' : 'none';
}

// Attach event listeners to checkboxes to call toggle function when clicked
toggleEarth.addEventListener('change', toggleImageVisibility);
toggleVar1.addEventListener('change', toggleImageVisibility);
toggleBorders.addEventListener('change', toggleImageVisibility);

// Initial call to set the initial visibility based on checkbox state
toggleImageVisibility();
