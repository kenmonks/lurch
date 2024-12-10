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

// allow #leftnav to adjust width to fit content without overlapping #wrap
const adjustWrapPosition = () => {
  const leftNav = document.getElementById("leftnav")
  const wrap = document.getElementById("wrap")

  // Get the width of #leftnav
  const leftNavWidth = leftNav.offsetWidth
  wrap.style.marginLeft = `${leftNavWidth}px` // Adjust padding as needed
}

// Call the function on load
window.addEventListener("load", adjustWrapPosition)

// Call the function on resize to handle dynamic changes
window.addEventListener("resize", adjustWrapPosition)
