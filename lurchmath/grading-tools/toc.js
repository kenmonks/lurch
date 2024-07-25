/**
 * This file can be used to make it easier to grade student work and manage your
 * Lurch files and libraries in a local LFY installation.  To run it, simply
 * call `toc()` in Lode.
 *
 * It will create a file in the root of the Site called `toc.html`.  When opened
 * in the browser it shows a collapsible nested list of all of the folders
 * specified by the Lode global `contentFolders` array, and hyperlinks to any
 * `.lurch` files in those folders that when clicked will open the given file
 * directly in Lurch. For lurch files in local folders that are not contained in
 * the Site root you can create a symbolic link to those folders to have them
 * included.
 */

import url from 'url'
import fs from 'fs'
import path from 'path'

// count the number of files
let count=0

// Load stylesheet so we don't have to serve it dynamically, which would require
// us to figure out how to handle paths correctly from any possible root folder:
const CSS = fs.readFileSync( path.join(
    path.dirname( url.fileURLToPath( import.meta.url ) ),
    'toc.css' ), 'utf8' )

// We assume that for an LFY the root folder of the server contains
// the lurchmath repo as one of its subfolder.
const rootFolder = path.resolve(url.fileURLToPath( import.meta.url ),'../../..')

// Utility functions to generate the nested lists of folders and files:
const fileToHTML = ( name, relPath ) => {
    const relPathName = 
        path.join( path.sep, relPath , name ).replace(/#/g,'%2523')
    return `<div class="file">
        <a href="instructor.html?load=${relPathName}" target="_blank">${name}</a>
    </div>`
}

const folderToHTML = ( name, relPath ) => {
    const fullPath = path.resolve(rootFolder,relPath)
    const contents = fs.readdirSync( fullPath ).map( name => {
        const fullinner = path.join( fullPath, name )
        const inner = path.join( relPath, name )
        if ( fs.statSync( fullinner ).isDirectory() )
            return folderToHTML( name, inner )
        else if ( name.endsWith( '.lurch' ) ) { 
            count++
            return fileToHTML( name, relPath ) 
        } else
            return ''
    } ).filter(s => (typeof s === 'string' && s!=='') ).join( '\n' )
    return `<div class='folder'>
        <div class='folder-name collapsible'>${name}</div>
        <div class='folder-contents' style='display:none;'>${contents}</div>
    </div>`
}

const foldersToHTML = relPaths => 
    relPaths.map( relPath => folderToHTML( relPath, relPath ) ).join( '\n' )
  
export const generatePage = (...folders) => {
    if (folders.length == 0) folders = ['.']
    const folderHTML = foldersToHTML( folders )
    const page =
`
<html>
    <head><style>${CSS}</style>
      <title>Lurch ToC</title>
      <link rel="shortcut icon" href="lurchmath/grading-tools/favicon.svg">
    </head>
    <body>
      <div id='container'>
        <div id="logo">Lurch<span id="check">&#x2713</span></div>
        <h1>Table of Contents</h1>
        <p><button id='expandall'>⇅ - all</button> <span id='count'>(${count} files)</span></p>
        ${folderHTML}
      <div>
    </body>
    <script>
      const coll = document.getElementsByClassName("collapsible")
      let i;
      for (i = 0; i < coll.length; i++) {
        coll[i].addEventListener('click', function() {
          let content = this.nextElementSibling;
          if (this.classList.contains('active'))
            content.style.display = 'none'
          else 
            content.style.display = null
          this.classList.toggle('active');
        })
      }
      const toggleall = document.getElementById('expandall')
      toggleall.addEventListener('click', function() {
        const open = toggleall.classList.contains('expanded')
        for (i = 0; i < coll.length; i++) {
          let content = coll[i].nextElementSibling
          if (open) {
            content.style.display = 'none'
            coll[i].classList.remove('active')
          } else {
            content.style.display = null
            coll[i].classList.add('active')
          }
        }
        toggleall.classList.toggle('expanded')
      })
    </script>
</html>`

    const tocfile = path.join( path.sep , rootFolder, 'toc.html')
    fs.writeFile(tocfile, page, (err) => {
        if (err) { 
            console.error(err) 
            return 
        }
      })
    write('The Lurch TOC page was written successfully.')
    return 
}
