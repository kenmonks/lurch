
/**
 * A set of generic utility functions used in this project.
 * 
 * @module Utilities
 */

/**
 * Create a script element to load a script from the given URL, append that
 * script element to the page's head, and notify us (via a returned `Promise`)
 * when the script completes loading successfully or fails with an error.
 * 
 * Example use:
 * ```
 * loadScript( 'https://some.cdn.org/script.js' ).then( () => {
 *     // Run code that depends on the script having loaded.
 * } )
 * ```
 * 
 * Note that if this function has already been called on this URL, so that there
 * already is a script tag with this source, then the promise resolves
 * immediately without doing anything first.
 * 
 * @param {String} url - URL of the script to load
 * @returns {Promise} a promise that is resolved if the script finishes loading
 *   or rejected if the script encounters an error
 * @function
 * @see {@link module:Utilities.loadStylesheet loadStylesheet()}
 */
export const loadScript = url =>
    Array.from( document.head.querySelectorAll( 'script' ) ).some(
        script => script.getAttribute( 'src' ) == url ) ?
    Promise.resolve() :
    new Promise( ( resolve, reject ) => {
        const scriptTag = document.createElement( 'script' )
        document.head.append( scriptTag )
        scriptTag.setAttribute( 'defer', true )
        scriptTag.setAttribute( 'referrerpolicy', 'origin' )
        scriptTag.addEventListener( 'load', resolve )
        scriptTag.addEventListener( 'error', reject )
        scriptTag.setAttribute( 'src', url )
    } )

/**
 * Create a link element to load a stylesheet from the given URL, append that
 * link element to the page's head, and notify us (via a returned `Promise`)
 * when the stylesheet completes loading successfully or fails with an error.
 * 
 * Example use:
 * ```
 * loadStylesheet( 'https://some.cdn.org/styles.css' ).then( () => {
 *     // Run code that depends on the stylesheet having loaded.
 * } )
 * ```
 * 
 * Note that if this function has already been called on this URL, so that there
 * already is a link tag with this source, then the promise resolves
 * immediately without doing anything first.
 * 
 * @param {String} url - URL of the stylesheet to load
 * @returns {Promise} a promise that is resolved if the stylesheet finishes
 *   loading or rejected if the loading encounters an error
 * @function
 * @see {@link module:Utilities.loadScript loadScript()}
 */
export const loadStylesheet = url =>
    Array.from( document.head.querySelectorAll( 'link' ) ).some(
        link => link.getAttribute( 'href' ) == url ) ?
    Promise.resolve() :
    new Promise( ( resolve, reject ) => {
        const linkTag = document.createElement( 'link' )
        document.head.append( linkTag )
        linkTag.setAttribute( 'rel', 'stylesheet' )
        linkTag.addEventListener( 'load', resolve )
        linkTag.addEventListener( 'error', reject )
        linkTag.setAttribute( 'href', url )
    } )

/**
 * Convert arbitrary HTML code to an HTML image element whose contents is the
 * rendered version of the given HTML code.  This uses the html2canvas library,
 * imported from a CDN on the fly as needed, to accomplish this.  The function
 * is asynchronous, returning a promise that resolves to the image element on
 * success, or rejects on failure.
 * 
 * @param {string} html - the code to convert to an image
 * @param {Object} options - the options to pass to html2canvas (detailed in the
 *   documentation for that library, separately from these docs)
 * @param {string} tagName - the tag name to use for the temporary element that
 *   will be created to contain the given HTML code (defaults to `span`)
 * @returns {Promise} the promise described above
 */
export const htmlToImage = (
    html, options = { backgroundColor : null }, tagName = 'span'
) => loadScript(
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
).then( () => {
    const element = document.createElement( tagName )
    element.innerHTML = html
    document.body.appendChild( element )
    return html2canvas( element, options ).then( canvas => {
        const image = document.createElement( 'img' )
        image.src = canvas.toDataURL( 'image/png' )
        return image
    } ).finally( () => {
        element.remove()
    } )
} )

/**
 * From any JavaScript object, we can create another object by first
 * constructing a new instance of the Object prototype, then copying over all of
 * the "own" properties from the original object (by reference).  This is like
 * the original object, but without its prototype or any other inherited data or
 * methods.  This function does that.
 * 
 * @param {Object} object - any JavaScript object
 * @returns {Object} a shallow copy of the original object, but without copying
 *   its prototype information
 * @function
 */
export const copyWithoutPrototype = object => {
    const result = new Object()
    for ( let key in object )
        if ( object.hasOwnProperty( key ) )
            result[key] = object[key]
    return result
}

/**
 * Return the URL for this app.  It is taken directly from the browser's
 * navigation bar, but it excludes any query string that may be present.
 * It will be of the form `protocol://domain.name/path/to/file.html`.
 *
 * @function
 * @see {@link module:ImportFromURL.autoOpenLink autoOpenLink()}
 */
export const appURL = () => {
    const result = window.location.protocol + '//'
                 + window.location.host + window.location.pathname
    return result.endsWith( '/' ) || result.endsWith( '.html' ) ?
        result : result + '/'
}

/**
 * Take a relative path and convert it to an absolute URL on the same server as
 * the current page.  If the path begins with a slash, it will just have the
 * protocol and host prepended to it.  If it does not begin with a slash, it
 * will also have the full path to the current page (minus the page name)
 * prepended as well. If the path is already absolute, it is just returned
 * unmodified.
 *
 * @function
 * @see {@link module:Utilities.appURL appURL()}
 */
export const makeAbsoluteURL = path => {
    if ( /^https?:\/\//i.test(path) ) return path
    if ( path.startsWith( '/' ) ) {
        return window.location.protocol + '//' + window.location.host + path
    } else {
        let allButFile = appURL().split( '/' )
        allButFile.pop()
        return allButFile.join( '/' ) + '/' + path
    }
}

/**
 * Escape a string so that it can be safely inserted into an HTML document and
 * still represent the plain text within the given string (not interpreting the
 * string as HTML itself).  For example, the string `"x < a and a > b"` should
 * appear exactly that way in the rendered HTML, meaning that the `<` and `>`
 * will need to be escaped so that `"<a and a>"` does not appear to be a tag.
 * 
 * @param {string} text - text to escape for insertion into HTML
 * @returns {string} the same text, but with the characters `"&"`, `"<"`, `">"`,
 *   `"'"`, and `'"'` replaced with character references instead
 * @function
 * @see {@link module:Utilities.unescapeHTML unescapeHTML()}
 * @see {@link module:Utilities.escapeLatex escapeLatex()}
 */
export const escapeHTML = ( text = '' ) =>
    text.replaceAll( '&', '&amp;' )
        .replaceAll( '<', '&lt;' )
        .replaceAll( '>', '&gt;' )
        .replaceAll( '"', '&quot;' )
        .replaceAll( "'", '&#039;' )

/**
 * Escape a string so that it can be safely inserted into a LaTeX document and
 * still represent the plain text within the given string (not interpreting any
 * symbols in the string as LaTeX code).  All backslashes, dollar signs, 
 * octothorpes, and curly brackets in the string will be replaced with escaped
 * versions of themselves.  Although this may not be a comprehensive list of
 * escaping needs for LaTeX, it is what is implemented here.
 * 
 * @param {string} text - text to escape for insertion into LaTeX
 * @returns {string} the same text, but with the characters `"\\"`, `"$"`, `"#"`,
 *   `"{"`, and `"}"` replaced with backslash-escaped versions of themselves
 * @function
 * @see {@link module:Utilities.escapeHTML escapeHTML()}
 */
export const escapeLatex = ( text = '' ) =>
    text.replaceAll( '\\', '\\\\' )
        .replaceAll( '#', '\\#' )
        .replaceAll( '$', '\\$' )
        .replaceAll( '{', '\\{' )
        .replaceAll( '}', '\\}' )

/**
 * Unescape a string so that was escaped by the `escapeHTML` function.
 * 
 * @param {string} text - text to unescape
 * @returns {string} the same text, but with the characters `"&"`, `"<"`, `">"`,
 *   `"'"`, and `'"'` recreated from their character references
 * @function
 * @see {@link module:Utilities.escapeHTML escapeHTML()}
 */
export const unescapeHTML = ( text = '' ) =>
    text.replaceAll( '&#039;', "'" )
        .replaceAll( '&quot;', '"' )
        .replaceAll( '&gt;', '>' )
        .replaceAll( '&lt;', '<' )
        .replaceAll( '&amp;', '&' )

/**
 * The following function takes as input an string containing HTML code and
 * removes from it all script tags, so that the code can be used safely within
 * the app itself, knowing that no malicious code will be executed.
 * 
 * @param {string} html - the HTML code from which to remove script tags
 * @returns {string} the same HTML code, but with all script tags removed
 * @function
 */
export const removeScriptTags = html => {
    const regex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
    return html.replace( regex, '' )
}

/**
 * This function makes it easy to construct two-column tables of HTML content,
 * which is something that several types of {@link module:Atoms.Atom Atoms} will
 * want to do.  The arguments to the function are the rows of the table, and
 * they are treated as follows.
 * 
 *  * Any string is treated as the content for a row of the table spanning both
 *    columns (using `colspan`) and in bold font.
 *  * An array of strings containing just one entry is treated the same as a
 *    single string.
 *  * An array of two strings is treated as the contents of the two cells in
 *    the row.
 *  * An array of three strings is treated as two rows, first a two-cell row,
 *    and then an optional error row (only if the third entry is not falsy) that
 *    places the error message in red font in the second cell.
 * 
 * Example use:
 * 
 * ```js
 * simpleHTMLTable(
 *     'Here is the information you entered:',
 *     [ 'Your name:', 'Frederick the Great' ],
 *     [ 'Your age:', '42' ],
 *     [ 'Your favorite color:', color,
 *       !isColor(color) && 'That is not a valid color.' ]
 * )
 * ```
 * 
 * @param  {...any} rows - the data representing the rows of the table to construct
 * @returns {string} the HTML code for the table
 * @function
 */
export const simpleHTMLTable = ( ...rows ) => {
    let result = '<table><colgroup><col><col></colgroup>'
    const row = inside => `<tr>${removeScriptTags( inside )}</tr>`
    const cell = inside => `<td>${removeScriptTags( inside )}</td>`
    const bigCell = inside =>
        `<td colspan='2'><b>${removeScriptTags( inside )}</b></td>`
    const error = inside =>
        `<td><font color=red>${removeScriptTags( inside )}</font></td>`
    rows.forEach( rowData => {
        if ( typeof( rowData ) == 'string' ) {
            result += row( bigCell( rowData ) )
        } else if ( rowData.length == 1 ) {
            result += row( bigCell( rowData[0] ) )
        } else if ( rowData.length == 2 ) {
            result += row( cell( rowData[0] ) + cell( rowData[1] ) )
        } else if ( rowData.length == 3 ) {
            result += row( cell( rowData[0] ) + cell( rowData[1] ) )
            if ( rowData[2] ) result += row( cell( '' ) + error( rowData[2] ) )
        }
    } )
    result += '</table>'
    return result
}

/**
 * Given an ordered set of HTML Nodes in an array, and a node in the same
 * document, return just the subset of `nodes` that appear before `point`.
 * Because the given set of nodes are in order, this subset will always be an
 * initial segment of the given array.  It can be empty (if none precede `point`)
 * and it can be the whole array (if all preceded `point`).
 * 
 * While this could be done with a simple array filter, that could be slow on
 * larger arrays; this uses a binary search.  Furthermore, node comparisons are
 * a tedious process that uses an enum, so this function is simpler.
 * 
 * @param {Node[]} nodes - ordered array of Nodes to filter
 * @param {Node} point - the node that will determine which subset of `nodes`
 *   gets rerturned
 * @returns {Node[]} some initial segment of `nodes`, including precisely those
 *   that appear before `point`
 * @function
 */
export const onlyBefore = ( nodes, point ) => {
    const lt = ( a, b ) => {
        const comparison = a.compareDocumentPosition( b )
        if ( ( comparison & Node.DOCUMENT_POSITION_FOLLOWING ) // b follows a
          || ( comparison & Node.DOCUMENT_POSITION_CONTAINED_BY ) ) // a contains b
            return true
        if ( ( comparison & Node.DOCUMENT_POSITION_PRECEDING ) // b precedes a
          || ( comparison & Node.DOCUMENT_POSITION_CONTAINS ) // b contains a
          || ( comparison == 0 ) ) // a is the same node as b
            return false
        throw new Error( 'Cannot compare document positions' )
    }
    try {
        if ( nodes.length == 0 || !lt( nodes[0], point ) ) return [ ]
        if ( lt( nodes[nodes.length-1], point ) ) return nodes
        let indexLT = 0
        let indexGE = nodes.length - 1
        while ( indexLT < indexGE - 1 ) {
            const midIndex = Math.floor( ( indexLT + indexGE ) / 2 )
            if ( lt( nodes[midIndex], point ) ) indexLT = midIndex
            else indexGE = midIndex
        }
        return Array.from( nodes ).slice( 0, indexGE )
    } catch ( e ) {
        console.log( 'DEBUG:', e )
        return nodes
    }
}

/**
 * Given a DOM Node, find the TinyMCE editor containing it.
 * 
 * @param {Node} node - HTML node for which to find the editor
 * @returns {tinymce.Editor} the editor whose document contains the given node
 * @function
 */
export const editorForNode = node => {
    const allEditors = tinymce.get()
    for ( let i = 0 ; i < allEditors.length ; i++ )
        if ( allEditors[i].getDoc() == node.ownerDocument )
            return allEditors[i]
    return null
}

/**
 * Call a function on each element in an array, just like `array.forEach()`
 * would do, except use a zero-second timeout between each call.  Returns a
 * Promise object that resolves when all calls have completed.
 * 
 * @param {Function} func - the function to call for each element
 * @param {any[]} array - the array to iterate over
 * @param {number} [timeout=0] - the number of milliseconds to wait between calls
 * @function
 */
Array.prototype.forEachWithTimeout = function( func, timeout = 0 ) {
    return new Promise( ( resolve, _ ) => {
        const recur = array => {
            if ( array.length == 0 ) resolve()
            else {
                func( array[0] )
                setTimeout( () => recur( array.slice( 1 ) ), timeout )
            }
        }
        recur( this )
    } )
}

/**
 * TinyMCE sometimes stores elements off screen, but still part of the document,
 * so if we search for elements by selector, we will find them, even though they
 * are invisible and should not be taken into account as part of the user's
 * document content.  This function checks to see if a given DOM node is really
 * a visible, relevant part of the document or not.  It does so by ensuring that
 * no ancestor of the given node has the special TinyMCE class for off-screen
 * copies of the user's selection, `mce-offscreen-selection`.
 * 
 * @param {Node} node - the node to test
 * @returns {boolean} true if the node is on screen
 */
export const isOnScreen = node => (
    !node.classList ||
    !node.classList.contains( 'mce-offscreen-selection' )
) && (
    !node.parentNode ||
    isOnScreen( node.parentNode )
)

/**
 * This function tries to run the built-in browser `URL` constructor on the
 * given text.  If an error is thrown, it returns false.  Otherwise it returns
 * true.
 * 
 * @param {string} text - the text that may or may not be a URL, to be tested
 * @returns {boolean} whether the text contains a valid URL
 */
export const isValidURL = text => {
    try {
        new URL( text ) // will throw an error if the text is not a valid URL
        return true
    } catch ( e ) {
        return false
    }
}

/**
 * This function inspects a string and finds the largest prefix of whitespace on
 * each line, then removes that prefix from each line, unindenting the text
 * maximally.  Blank lines are ignored.  The resulting string is returned.
 * 
 * @param {string} text - the text to un-indent as described above
 * @returns {string} the unindented text
 */
export const fullUnindent = text => {
    let shortestIndent = Infinity
    const lines = text.split( '\n' )
    for ( let i = 0 ; i < lines.length ; i++ ) {
        if ( lines[i].trim() != '' ) {
            const indentSize = /^\s*/.exec( lines[i] )[0].length
            shortestIndent = Math.min( shortestIndent, indentSize )
        }
    }
    for ( let i = 0 ; i < lines.length ; i++ )
        if ( lines[i].trim() != '' )
            lines[i] = lines[i].slice( shortestIndent )
    return lines.join( '\n' )
}

/**
 * Determine whether the application is in an iframe inside another window.
 * It does this by checking to see if the window containing the application is
 * the top-level window in the browser or not.
 * 
 * One can also force the app to behave like an embedded version by passing
 * `actAsEmbed=true` in the query string.  This function respects that as well,
 * and classifies an app with that in its query string as embedded.
 * 
 * @returns {boolean} true iff the application is not the top-level window and
 *   `actAsEmbed` was not set to true in the query string
 */
export const isEmbedded = () =>
    window.top !== window || window.location.search.includes( 'actAsEmbed=true' )

/**
 * This makes a call to
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write
 * the `Clipboard` API's `write()` function}, constructing the necessary
 * parameters and MIME types for HTML, to write the given HTML to the clipboard.
 * It happens asynchronously, so this function returns a promise that resolves
 * when the operation is complete, or rejects if the operation is not allowed at
 * the time the function is called.  See the documentation linked to above for
 * more details on how the API works.
 * 
 * @param {string} html - the HTML code to copy to the clipboard
 * @returns {Promise} a promise that resolves when the operation completes
 */
export const copyHTMLToClipboard = html =>
    navigator.clipboard.write( [
        new ClipboardItem( {
            [ 'text/html' ] : new Blob( [ html ], { type : 'text/html' } )
        } )
    ] )


/**
 * Remove one or more context panels from the editable document inside a
 * TinyMCE editor instance.
 *
 * This function searches the editor's content body for elements matching
 * the given CSS selector (default: `#context`) and removes them from the
 * live DOM.  It does not modify editor metadata, serializer configuration,
 * or saved file contents—only the current in-memory document.
 *
 * This is typically used immediately after loading a document that may
 * have persisted a transient UI element such as a context panel.
 *
 * @param {tinymce.Editor} editor - The TinyMCE editor instance.
 * @param {string} [selector='#context'] - CSS selector identifying elements
 *   to remove from the editable body.
 * @returns {number} The number of elements removed.
 */
export const removeContextDiv = (editor, selector = '#context') => {
  const body = editor.getBody?.()
  if (!body) return 0

  const nodes = body.querySelectorAll(selector)
  nodes.forEach(n => n.remove())
  return nodes.length
}

/**
 * Reset the editor caret to a collapsed position at the start of the
 * editable document.
 *
 * This function clears any existing native selection ranges (which may
 * reference nodes that were just removed from the DOM), then creates and
 * applies a new collapsed selection at the beginning of the editor body.
 * It forces TinyMCE to recompute selection geometry and scroll the caret
 * into view.
 *
 * This is useful after programmatic DOM surgery (such as removing a
 * transient element) that may leave the caret visually oversized or
 * anchored to a stale range.
 *
 * The editor must already contain loaded content.
 *
 * @param {tinymce.Editor} editor - The TinyMCE editor instance.
 * @returns {boolean} `true` if the caret was reset, `false` if no body
 *   was available.
 */
export const resetCaretToStart = editor => {
  const body = editor.getBody?.()
  if (!body) return false

  // Drop any stale native ranges (may reference removed nodes)
  editor.getWin?.()?.getSelection?.()?.removeAllRanges?.()

  const rng = editor.dom.createRng()
  rng.setStart(body, 0)
  rng.collapse(true)

  editor.focus()
  editor.selection.setRng(rng)
  editor.selection.scrollIntoView()
  editor.nodeChanged()
  return true
}

/**
 * Remove transient context elements from the editor and reset the caret.
 *
 * This is a convenience routine that combines {@link removeContextDiv}
 * and {@link resetCaretToStart}.  It removes any elements matching the
 * given selector (default: `#context`) from the editable document body,
 * and if any were removed, forces a fresh collapsed caret position at the
 * beginning of the document.
 *
 * This is typically used immediately after loading document content that
 * may contain a saved context panel or other transient UI artifact.
 * It prevents stale selection ranges from referencing removed nodes and
 * avoids visual caret mis-sizing.
 *
 * The editor should already have finished setting its content (e.g.,
 * inside a `SetContent` event handler or equivalent).
 *
 * @param {tinymce.Editor} editor - The TinyMCE editor instance.
 * @param {string} [selector='#context'] - CSS selector identifying
 *   elements to remove before resetting the caret.
 * @returns {number} The number of elements removed.
 */
export const cleanContextAndResetCaret = (editor, selector = '#context') => {
  const removed = removeContextDiv(editor, selector)
  if (removed > 0) resetCaretToStart(editor)
  return removed
}