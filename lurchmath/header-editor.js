
/**
 * Users who want to edit the invisible header inside of a Lurch document (which
 * is stored in its metadata) can do so in one of two ways.
 * 
 * First, they can extract the document header into the document, which brings
 * all content *except for* dependencies into the document.  They can edit this
 * content and then push it back up into the document header.  This module
 * provides actions (menu items) for doing so.
 * 
 * Second, they can edit the list of dependencies in the document header, which
 * we refer to by the more mathematical term "background material."  This module
 * also provides an action (menu item) for editing that list of dependencies
 * (background material).
 * 
 * @module HeaderEditor
 */

import { LurchDocument } from './lurch-document.js'
import { appSettings } from './settings-install.js'
import { Dialog, ButtonItem, ListItem, DialogRow, TextInputItem } from './dialog.js'
import { Dependency } from './dependencies.js'
import { Atom } from './atoms.js'
import { autoOpenLink, openFileInNewWindow } from './load-from-url.js'
import { FileSystem } from './file-system.js'

/**
 * The metadata element for a document is stored in the editor rather than the
 * DOM, because we do not want TinyMCE to be able to edit it.  It is sometimes
 * useful to be able to extract the header element from that metadata, so that
 * it can be treated like an entire document (fragment), since it effectively is
 * one.
 * 
 * @param {tinymce.Editor} editor - the editor from which to extract the
 *   document header
 * @returns {HTMLElement} the HTMLElement that contains the document header
 *   for this editor
 * @function
 */
export const getHeader = editor =>
    new LurchDocument( editor ).getMetadata( 'main', 'header' )

// For internal use only:  Extract the header from the document metadata, as a
// string of HTML
const getHeaderHTML = editor => {
    const result = getHeader( editor )
    return result ? result.innerHTML : ''
}
// For internal use only:  Save the given HTML text into the document metadata
// as the document's header
export const setHeader = ( editor, header ) =>
    new LurchDocument( editor ).setMetadata( 'main', 'header', 'html', header )

/**
 * Install into a TinyMCE editor instance the menu items that can be used in
 * the primary window to pop open the secondary window, or instead to move
 * content between the header and the main document.  The menu items in question
 * are intended for the Document menu, but could be placed anywhere.
 * 
 * @param {tinymce.editor} editor - the TinyMCE editor into which to install the
 *   tools
 * @function
 */
export const install = editor => {
    // Utility functions and global-ish variables for dependency preview searching
    const getDeclares = () => Atom.allIn( editor)
      .filter( atom => {
        const notation = atom.getMetadata('lurchNotation')
        return notation && /^\s*declare/i.test(notation)
      })

    const getPreviews = () => Atom.allIn( editor ).filter(
        atom => atom.getMetadata( 'type' ) == 'preview' )

    const previewExists = () => Atom.allIn( editor ).some(
      atom => atom.getMetadata( 'type' ) == 'preview' )

    const contextExists = () => (editor.getBody().querySelector('#context')) ? true : false
    
    const shiftHTML = ( div, html ) => {
      const range = editor.dom.createRng()
      range.setStart( div, 0)
      range.collapse(true)
      editor.selection.setRng(range)

      editor.insertContent( html )
      
      editor.undoManager.clear()
      editor.selection.collapse(true)
    }

    let searchToolbar = null
    let searchBox = null
    let searchCounter = null
    let doSearch = null
    // Dependency preview search toolbar
    editor.once( 'PostRender', () => {
        // Install the toolbar and all of its elements
        searchBox = document.createElement( 'input' )
        searchBox.setAttribute( 'type', 'text' )
        searchBox.classList.add( 'search-input' )
        const searchLabel = document.createElement( 'p' )
        searchLabel.classList.add( 'search-label' )
        searchLabel.textContent = 'Show rules that mention'
        searchLabel.appendChild( searchBox )
        searchCounter = new Text( '' )
        searchLabel.appendChild( searchCounter )
        const searchGroup = document.createElement( 'div' )
        searchGroup.classList.add( 'tox-toolbar__group' )
        searchGroup.setAttribute( 'role', 'toolbar' )
        searchGroup.appendChild( searchLabel )
        searchToolbar = document.createElement( 'div' )
        searchToolbar.classList.add( 'tox-toolbar__overflow' )
        searchToolbar.classList.add( 'rule-search-toolbar' )
        searchToolbar.setAttribute( 'role', 'group' )
        searchToolbar.style.display = 'none'
        searchToolbar.appendChild( searchGroup )
        const toolbarParent = document.querySelector( '.tox-toolbar-overlord' )
        toolbarParent.appendChild( searchToolbar )
        // Define the search function
        doSearch = () => {
            const searchText = searchBox.value.toLowerCase()
            // if the search box has something to search for, hide the context
            // head div
            const head = editor.getBody().querySelector('#context-head')
            const fhead = editor.getBody().querySelector('#filter-head')
            const searching = searchText!==''
            if (head && fhead) {
                head.classList.toggle('hidden',searching)
                fhead.classList.toggle('hidden',!searching)
                editor.getWin().scrollTo(0, 0)
            }
            let numShown = 0
            const relevantText = rulenode => {
                // start with the text content of the rule
                let ans = rulenode.textContent
                // get the elements with data-metadata_latex or
                // data-metadata_lurchnotation attributes
                const lurchnodes = rulenode.querySelectorAll(
                    '[data-metadata_lurch-notation]')
                const texnodes = rulenode.querySelectorAll(
                    '[data-metadata_latex]')
                // concatenate all of their values 
                lurchnodes.forEach( x => ans += 
                    x.getAttribute('data-metadata_lurch-notation') )
                texnodes.forEach( x => ans += 
                    x.getAttribute('data-metadata_latex') )
                return ans.toLowerCase()
            }
            const showRecursive = node => {
                // Base case 1: The node is not an HTMLElement; ignore.
                if ( node.nodeType != Node.ELEMENT_NODE ) return
                // Base case 2: The node is a Rule atom; show iff filter applies.
                if ( Atom.isAtomElement( node )
                  && Atom.from( node, editor ).getMetadata( 'type' ) == 'rule' ) {
                    node.style.display = (
                        searchText == ''
                        || relevantText(node).includes( searchText )
                    ) ? '' : 'none'
                    numShown += (node.style.display == '' || searchText == '') ? 1 : 0
                    return
                }
                // Recursive case: Apply filter to all children, then show this
                // node iff the filter is empty or it contains a descendant that
                // was displayed as a rule that passed the filter.
                const numShownBefore = numShown
                Array.from( node.childNodes ).forEach( showRecursive )
                node.style.display = (
                    searchText == ''
                 || numShown > numShownBefore
                ) ? '' : 'none'
            }
            getPreviews().forEach( preview => showRecursive( preview.element ) )
            searchCounter.textContent = 
            // searchText == '' ? '' :
                                        numShown == 1 ? '1 rule found' :
                                        `${numShown} rules found`
            // edge case formatting when there are no rules that match the
            // filter
            if (fhead) fhead.classList.toggle('no-rules-found',numShown==0)
        }
        // Install the search functions
        searchBox.addEventListener( 'input', doSearch )
        searchBox.addEventListener('keydown', event => {
            const isMac = /Mac/.test(navigator.platform)
            const metaKey = isMac ? event.metaKey : event.ctrlKey
            if (metaKey && event.altKey && event.code === 'Digit0') {
                event.preventDefault()
                event.stopPropagation()
                // If the context is shown (it should be), delete it and return
                const existingContext = editor.getBody().querySelector('#context')
                if ( existingContext ) {
                    existingContext.remove()
                    editor.selection.setCursorLocation( editor.getBody(), 0 )
                    // Also, if we have a cursor location stored from before we
                    // showed this preview, put the user's cursor location back
                    // there for convenience.  (See more comments on this below.)
                    if ( editor.selectionBeforePreview ) {
                        editor.selection.setRng( editor.selectionBeforePreview )
                        editor.selectionBeforePreview = null
                        editor.selection.getStart()?.scrollIntoView()
                    } else {
                        // If none was saved, place the cursor at start of document
                        editor.selection.setCursorLocation( editor.getBody(), 0 )
                    }
                    // return focus to the editor
                    editor.focus()
                    // restor the scroll position if it was saved
                    if (editor.scrollYBeforePreview !== undefined) {
                        editor.getWin().scrollTo(0, editor.scrollYBeforePreview)
                        delete editor.scrollYBeforePreview
                    }
                }
            }
        })
    } )
    // Whenever anything in the document changes (even the cursor position),
    // decide whether to show the search toolbar
    editor.on( 'input NodeChange Paste Change Undo Redo SelectionChange ExecCommand', () => {
        if ( searchToolbar ) {
            const show = contextExists()
            const wasShown = searchToolbar.style.display == ''
            searchToolbar.style.display = show ? '' : 'none'
            // If the toolbar just appeared, clear its search box
            if ( show && !wasShown ) {
                searchBox.value = ''
                doSearch()
                searchBox.focus()
            }
        }
    } )

    // Add menu items for moving the (non-dependency portions of the) header
    // into the document and back into the header
    editor.ui.registry.addMenuItem( 'extractheader', {
        text : 'Move header into document',
        icon : 'chevron-down',
        tooltip : 'Extract header to top of document',
        onAction : () => {
            // Get the header, then move all of its dependencies into a holding
            // location.  Note that none of this modifies the document; this is
            // all operating on a COPY of the actual document header.
            const headerCopy = getHeader( editor ) // a copy
            const justDependencies = headerCopy.ownerDocument.createElement( 'div' )
            Dependency.topLevelDependenciesIn( headerCopy, editor ).forEach( dependency => {
                dependency.element.remove()
                justDependencies.appendChild( dependency.element )
            } )
            // Now see if there's anything left to extract
            const headerHTML = headerCopy.innerHTML
            if ( headerHTML == '' )
                return Dialog.notify( editor, 'warning',
                    'This document\'s header is currently empty.' )
            // There is, so ask the user if we can proceed, and if so, put the
            // header (without dependencies) into the document and then put the
            // extracted dependencies, alone, back into the header.
            // The reason we show a warning is because this action cannot be
            // undone (since it edits the header, which is not in the document).
            appSettings.load()
            appSettings.showWarning( 'warn before extract header', editor )
            .then( userSaidToProceed => {
                if ( !userSaidToProceed ) return
                editor.selection.setCursorLocation() // == start of document
                editor.insertContent( headerHTML )
                setHeader( editor, justDependencies.innerHTML )
                editor.undoManager.clear() // cannot be undone
            } )
        }
    } )
    editor.ui.registry.addMenuItem( 'embedheader', {
        text : 'Move selection to end of header',
        icon : 'chevron-up',
        tooltip : 'Embed selection from document to end of header',
        onAction : () => {
            // Get the current selection, or give an error if there isn't one
            const toEmbed = editor.selection.getContent()
            if ( toEmbed == '' )
                return Dialog.notify( editor, 'error',
                    'You do not currently have any content selected.' )
            // Ask the user if we can proceed, and if so, append the selection
            // onto the end of the curent document header.
            // The reason we show a warning is because this action cannot be
            // undone (since it edits the header, which is not in the document).
            appSettings.load()
            appSettings.showWarning( 'warn before embed header', editor )
            .then( userSaidToProceed => {
                if ( !userSaidToProceed ) return
                setHeader( editor, getHeaderHTML( editor ) + toEmbed )
                editor.execCommand( 'delete' )
                editor.undoManager.clear() // cannot be undone
            } )
        }
    } )

    // Add a menu item for editing the "background material" (list of
    // dependencies) in the header.  This list of dependencies never leaves the
    // header, so this is the only way to edit it.
    editor.ui.registry.addMenuItem( 'editdependencyurls', {
        text : 'Add or remove context',
        tooltip : 'Edit the list of documents on which this one depends',
        icon : 'edit-block',
        onAction : () => {
            // Get all dependencies from the document
            let header = getHeader( editor ) // NOTE! this is a clone!
            const dependencies = !header ? [ ] :
                Dependency.topLevelDependenciesIn( header, editor ).map( atom => {
                    return {
                        filename : atom.getMetadata( 'filename' ),
                        dynamic : atom.getMetadata( 'autoRefresh' )
                    }
                } )
            // Create the dialog, but do not populate it with dependencies yet.
            const dialog = new Dialog( 'Add or remove context documents', editor )
            dialog.json.size = 'medium'
            const listItem = new ListItem( 'dependencies' )
            listItem.setSelectable()
            listItem.onSelectionChanged = () => {
                dialog.dialog.setEnabled( 'View', !!listItem.selectedItem )
                dialog.dialog.setEnabled( 'Remove', !!listItem.selectedItem )
            }
            dialog.addItem( listItem )
            const staticButton = new ButtonItem( 'Add static' )
            const dynamicButton = new ButtonItem( 'Add dynamic' )
            const viewButton = new ButtonItem( 'View' )
            const removeButton = new ButtonItem( 'Remove' )
            dialog.addItem( new DialogRow(
                staticButton, dynamicButton, viewButton, removeButton ) )
            // Define what happens when the dialog is closed, then show it
            dialog.show().then( userHitOK => {
                if ( !userHitOK ) return
                // Ensure the document has a header, even if it's empty.
                if ( !header ) {
                    setHeader( editor, '' )
                    header = getHeader( editor )
                }
                // (NOTE: At this point, "header" is a CLONE of the actual
                // document header, so changes made to it do NOT update the doc.)
                // Remove all dependencies from the header (clone):
                Dependency.topLevelDependenciesIn( header, editor ).forEach(
                    atom => atom.element.remove() )
                // Add new dependencies to the end of the header (clone),
                // representing the current contents of this dialog:
                dependencies.forEach( dependency => {
                    const newDependency = Atom.newBlock( editor, '', {
                        type : 'dependency',
                        description : 'none',
                        filename : dependency.filename,
                        source : dependency.fileSystem || 'the web',
                        autoRefresh : dependency.dynamic
                    } )
                    if ( dependency.contents )
                        newDependency.setHTMLMetadata( 'content', dependency.contents )
                    newDependency.update()
                    header.appendChild( newDependency.element )
                } )
                // Now use that header clone we've been editing to change the
                // actual document header for real:
                setHeader( editor, header.innerHTML )
                // Now use a bit of a hack (the private method findMetadataElement())
                // to find the dependency atoms inside the header, to refresh them.
                const savedHeader = new LurchDocument( editor )
                    .findMetadataElement( 'main', 'header' )
                // Refresh any dependency that is marked as web-based and auto-refresh:
                Dependency.refreshAllIn( savedHeader, true ).then( () => {
                    Dialog.notify( editor, 'success',
                        'Reloaded any web-based background material.',
                        5000 )
                } ).catch( error => {
                    Dialog.notify( editor, 'error',
                        'Failed to reload some web-based background material.' )
                    console.log( 'Error when refreshing background material',
                        error )
                } )
            } )
            // Now define a function that will populate it with dependencies.
            const updateList = () => {
                // If there are no dependencies, print a special "empty" message.
                if ( dependencies.length == 0 ) {
                    const message = 'No background material defined yet.'
                    listItem.showText(
                        `<span style="color:gray;">${message}</span>` )
                    return
                }
                // If there are dependencies, show each with all its info.
                listItem.showList( dependencies.map( dependency => {
                    return `${dependency.filename} (${dependency.dynamic ? 'dynamic' : 'static'})`
                } ), dependencies )
            }
            updateList()
            // Add actions to all buttons in dialog
            dynamicButton.action = () => {
                const urlDialog = new Dialog( 'Add dynamic background document',
                    editor )
                urlDialog.addItem( new TextInputItem(
                    'url',
                    'URL for background document',
                    'http://www.example.com/mydoc.lurch'
                ) )
                urlDialog.show().then( userHitOK => {
                    if ( !userHitOK ) return
                    const url = urlDialog.get( 'url' )
                    if ( url == '' ) return
                    dependencies.push( { filename : url, dynamic : true } )
                    updateList()
                } )
            }
            staticButton.action = () => {
                FileSystem.openFile( editor, document => {
                    if ( !document ) return
                    dependencies.push( {
                        filename : document.filename,
                        source : document.fileSystem,
                        contents : document.contents,
                        dynamic : false
                    } )
                    updateList()
                } )
            }
            viewButton.action = () => {
                const dependency = listItem.selectedItem
                if ( dependency.dynamic )
                    window.open( autoOpenLink( dependency.filename ), '_blank' )
                else if ( dependency.contents )
                    openFileInNewWindow( dependency.contents )
                else
                    console.error( 'No contents in dependency: ' + dependency )
            }
            removeButton.action = () => {
                const dependency = listItem.selectedItem
                dependencies.splice( dependencies.indexOf( dependency ), 1 )
                updateList()
            }
        }
    } )

    // the context action for both the menu item and the toolbar button
    const toggleContext = () => {
      // get the document 
      const doc = editor.getDoc()
      // get the body element
      const body = editor.getBody()
       
      // If the context is shown, delete it and return
      const existingContext = editor.getBody().querySelector('#context')
      if ( existingContext ) {
        existingContext.remove()
        editor.selection.setCursorLocation( editor.getBody(), 0 )
        // Also, if we have a cursor location stored from before we
        // showed this preview, put the user's cursor location back
        // there for convenience.  (See more comments on this below.)
        if ( editor.selectionBeforePreview ) {
          editor.selection.setRng( editor.selectionBeforePreview )
          editor.selectionBeforePreview = null
          editor.selection.getStart()?.scrollIntoView()
        }
        if (editor.scrollYBeforePreview !== undefined) {
          editor.getWin().scrollTo(0, editor.scrollYBeforePreview)
          delete editor.scrollYBeforePreview
        }
        return
      }
         
      // If not, we have to create them from the content in the header and
      // the declarations.
          
      // Remember where the user's cursor was before we insert the preview,
      // because it may be large and require them to scroll to see it.
      // If they then hide it, it's nice to jump back to where they were.
      editor.selectionBeforePreview = editor.selection.getRng()
      editor.scrollYBeforePreview = editor.getWin().scrollY
         
      // get the dependency content
      const header = getHeader( editor )
        
      // Accumulate the HTML representation of all previews of all
      // dependencies in the header.
      let allPreviewHTML = ''
      if (header)
        Dependency.topLevelDependenciesIn( header ).forEach( dependency => {
          const preview = Atom.newBlock( editor, '', { type: 'preview' } )
          preview.imitate( dependency )
          allPreviewHTML += preview.element.outerHTML
        } )
              
           
      // wrap everything in a #context div and insert it
      shiftHTML( body, 
        `<div class='lurch-atom' id='context' contenteditable='true'>
           ${allPreviewHTML}
         </div>`
      )
      const context = editor.getBody().querySelector('#context')
          
           
      // now that the context is shown, fetch all of the declares in both
      // the context and the document itself and add it to the top. To
      // make it more legible, upper case all the 'declares'.
      let decHTML = ''
      getDeclares().forEach(dec => {
        decHTML += `${dec.element.outerHTML.replace('declare','Declare')}.<br/>`
      })
        
      // create a title for the context and a subtitle for the Constant
      // decs.  We don't make a subtitle for the dependencies because they
      // can just type their own (or make a fake dependency at the top of
      // the import chain that only has flarf).
      const title = `<h1 id='contextTitle'>Mathematical Context</h1>`
      const subtitle = `<h2>Constants</h2>`
         
      // then format the output, taking into account when things are empty
      let HTML = ''
      // if they are both empty 
      if (!allPreviewHTML) {
        // no constants or previews
        if (!decHTML) {
          HTML = 
            `${title}
             <p>There is nothing defined in this document's context.</p>`
        // there are declarations but no previews
        } else {
          HTML = 
            `${title}
             ${subtitle}
             <p>The following symbols are declared to be 
                constants in this document.</p> 
             <div id='declaresPanel' contenteditable='false'>
                ${decHTML}
             </div>
             <p>There is no math defined in this document's context.</p>`
        }
      // otherwise the previews are already inserted  
      } else { 
        if (!decHTML) {
          HTML = 
            `${title}
             <p>There are no globally defined constants in this document.</p>` 
        } else { 
          HTML =
            `${title}
             ${subtitle}
             <p>The following symbols are declared to be 
                constants in this document.</p> 
             <div id='declaresPanel' contenteditable='false'>
                ${decHTML}
             </div>` 
        }
      }
      HTML = `<div id="context-head">${HTML}</div>
              <div id="filter-head" class="hidden"><h2>Matching rules:</h2></div>`
      shiftHTML( context, HTML)
        
      // hopefully this will lock everything down
      context.contentEditable='false'
       
      setTimeout( () => { 
        const context = editor.getBody().querySelector('#context')
        context.contentEditable = 'false'
        context.setAttribute( 'contenteditable', 'false' )
        // after checking this be sure nothing is selected by TinyMCE and
        // the cursor is at the beginning of the document
        editor.selection.select(editor.getBody(), true) 
        editor.selection.collapse(true) 
      } , 0)
       
      editor.getWin().scrollTo(0, 0) // scroll the window to the top
    }

    // Add a menu item for moving into the document non-editable versions of
    // the *contents of* the background material, so that student users who need
    // to see a list of all axioms, theorems, and rules in force can do so.
    // Revealing these previews also shows a search/filter box in the toolbar.
    editor.ui.registry.addMenuItem( 'viewcontext', {
      text : 'Show/Hide context',
      icon: 'preview',
      shortcut : 'meta+Alt+0',
      tooltip : 'View the mathematical content on which this document depends',
      onAction : toggleContext
    } )
    // the same thing, but on the toolbar
    editor.ui.registry.addButton('viewcontext', {
      icon: 'preview',
      tooltip: 'Show/Hide context',
      onAction: toggleContext
    })
    
}

export default { install }
