// The js utilities for the lurch.plus site

// open a standalone lurch window with minimal browser goo
const openLurch = url => {
  const height = 0.85 * window.screen.height
  const width = 853
  const top = 0.075 * window.screen.height
  const left = (window.screen.width - width) / 2
  var features =
    'width=853, height=' +
    height +
    ', top=' +
    top +
    ', left=' +
    left +
    ', toolbar=no, menubar=no, location=no, status=no' +
    ', noopener, noreferrer'
  window.open(url, '_blank', features)
}

// document.addEventListener("DOMContentLoaded", function () {
//   // Get the left nav UL element
//   const navList = document.getElementById("anchor-links");

//   // Find all span elements with id attributes that start with "nav-"
//   const navItems = document.querySelectorAll("span[id^='nav-']");

//   navItems.forEach(function (item) {
//     const id = item.id;              // Get the id attribute (e.g., "nav-intro")
//     const label = item.dataset.label; // Get the data-label attribute

//     // Create an LI element for each anchor
//     const listItem = document.createElement("li");

//     // Create the anchor link
//     const link = document.createElement("a");
//     link.href = `#${id}`;
//     link.textContent = label;        // Set the text from the data-label attribute

//     // Append the link to the list item, and the list item to the nav
//     listItem.appendChild(link);
//     navList.appendChild(listItem);
//   });
// });

// window.onload = function () {
//   document.querySelectorAll('#leftnav li a').forEach(anchor => {
//     anchor.addEventListener('click', function (e) {
//       e.preventDefault()
//       const targetId = this.getAttribute('href').substring(1)
//       document.getElementById(targetId).scrollIntoView({ behavior: 'smooth' })
//     })
//   })
// }

