// main.js

// Get references to the checkboxes
const toggleImage1 = document.getElementById('toggleImage1');
const toggleImage2 = document.getElementById('toggleImage2');
const toggleImage3 = document.getElementById('toggleImage3');

// Get references to the images
const image1 = document.querySelector('.image1');
const image2 = document.querySelector('.image2');
const image3 = document.querySelector('.image3');

// Function to toggle visibility of images based on checkbox state
function toggleImageVisibility() {
  image1.style.display = toggleImage1.checked ? 'block' : 'none';
  image2.style.display = toggleImage2.checked ? 'block' : 'none';
  image3.style.display = toggleImage3.checked ? 'block' : 'none';
}

// Attach event listeners to checkboxes to call toggle function when clicked
toggleImage1.addEventListener('change', toggleImageVisibility);
toggleImage2.addEventListener('change', toggleImageVisibility);
toggleImage3.addEventListener('change', toggleImageVisibility);

// Initial call to set the initial visibility based on checkbox state
toggleImageVisibility();
