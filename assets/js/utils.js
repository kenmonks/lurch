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

// open .lurch url's in a separate tab
document.addEventListener('click', (event) => {
 const link = event.target.closest('a') // Check if the clicked element is an anchor
 if (link && !link.hasAttribute('target') && 
     link.getAttribute('href')?.endsWith('.lurch')) {
   event.preventDefault() // Prevent default behavior
   window.open(link.href, '_blank') // Open link in a new tab
 }
})

// enable clicking on the completed rows in the 100 theorem table
document.addEventListener('DOMContentLoaded', function () {
  const rows = document.querySelectorAll('tr[data-href]') // Select only rows with data-href
  rows.forEach(row => {
    row.addEventListener('click', function () {
      const url = this.getAttribute('data-href')
      if (url) {
        openLurch(url)
        // window.location.href = url // Navigate to the URL
      }
    })
  })
})

// make submenus collapsible
document.querySelectorAll('.has-submenu').forEach(item => {
  item.addEventListener('click', () => {
    const submenu = item.nextElementSibling
    const icon = item.querySelector('i')

    // Toggle submenu visibility
    submenu?.classList.toggle('hidden')

    // Toggle icon class
    if (icon) {
      icon.classList.toggle('fa-caret-down')
      icon.classList.toggle('fa-caret-right')
    }
  })
})

// Function to load the state of checkboxes from localStorage
const loadCheckboxState = () => {
  document.querySelectorAll('.contains-task-list input[type="checkbox"]')
          .forEach( (checkbox,n) => {
    checkbox.id = `checkbox-${n}`
    const isChecked = localStorage.getItem(checkbox.id) === 'true'
    checkbox.checked = isChecked
    checkbox.parentElement.classList.toggle('checked', isChecked)
  })
}

// Function to save the state of checkboxes to localStorage
const saveCheckboxState =  (event) => {
  const checkbox = event.target
  localStorage.setItem(checkbox.id, checkbox.checked)
  checkbox.parentElement.classList.toggle('checked', checkbox.checked)
}

// Attach change event listeners to all checkboxes
document.querySelectorAll('.contains-task-list input[type="checkbox"]').forEach(checkbox => {
  checkbox.addEventListener('change', saveCheckboxState)
})

// Load the checkbox state when the page loads
loadCheckboxState()
