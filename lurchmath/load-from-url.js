
/**
 * This file defines several tools for loading Lurch documents from URLs on the
 * web, specified in a dialog box or specified in the query string of the app on
 * launch.
 * 
 * @module ImportFromURL
 */

import { LurchDocument } from './lurch-document.js'
import { appURL, isValidURL, makeAbsoluteURL, cleanContextAndResetCaret } from './utilities.js'
import { Dialog } from './dialog.js'

// Internal use only
// A few routines for making a tiny, mock filesystem inside localStorage
// Note that this functions very much like what's implemented in the
// BrowserFileSystem class, except those are async, and these are synchronous.
const prefix = 'lurch-temp-file-'
const allFileNames = () => {
    let result = [ ]
    for ( let i = 0 ; i < window.localStorage.length ; i++ )
        if ( window.localStorage.key( i ).startsWith( prefix ) )
            result.push( window.localStorage.key( i ).substring( prefix.length ) )
    return result
}
const fileExists = name => allFileNames().includes( name )
const readFile = name => window.localStorage.getItem( prefix + name )
const writeFile = ( name, content ) =>
    window.localStorage.setItem( prefix + name, content )
const deleteFile = name => window.localStorage.removeItem( prefix + name )

/**
 * Download a file from the web asynchronously, returning a Promise that
 * resolves when the download completes (passing the content of the file as a
 * string) or rejects if the download fails.  Note that many servers have
 * cross-origin restrictions that will prevent this, but servers whose purpose
 * is to share files publicly (e.g., GitHub) do not have this problem.  So this
 * may fail not only because the URL is invalid or the network is unreachable,
 * but also because the server may reject the request.
 * 
 * @param {string} url - URL from which to load data
 * @returns {Promise} a Promise that resolves if the file downloaded correctly
 *   and rejects if an error occurred or a response with status other than 200
 *   was returned
 * @see {@link module:ImportFromURL.loadFromQueryString loadFromQueryString()}
 */
export const loadFromURL = url => new Promise( ( resolve, reject ) => {
    const request = new XMLHttpRequest()
    request.addEventListener( 'load', event => {
        if ( event.target.status != 200 )
            reject( event.currentTarget.responseText )
        else
            resolve( event.currentTarget.responseText )
    } )
    request.addEventListener( 'error', reject )
    request.open( 'GET', url )
    request.setRequestHeader( 'Cache-Control', 'max-age=0' )
    request.send()
} )

/**
 * Check to see if the query string for the current page contains an instruction
 * for loading a file.  This can be in one of two formats.
 * 
 * If the query string contains a "load=..." parameter, treat its value as
 * either an URL (and try to load a Lurch document from that URL) or a filename
 * in the browser's local storage (and try to load a Lurch document from there).
 * Place the document in the given editor on success, and report an error with a
 * notification on failure.  The priority for how to treat the parameter is as
 * follows.
 * 
 *  1. If it is a file in the user's browser's local storage, load it and stop.
 *  1. If it is a valid URL, load it and stop.
 *  1. Try treating it as a relative URL and use the current page's URL as the
 *     base from which to make it into an absolute URL.  If that produced a
 *     valid absolute URL, load it and stop.
 *  1. Give up with an error notification.
 * 
 * If the query string contains a "data=..." parameter, treat its value as the
 * base-64 encoding of a document.  Decode it into a string containing HTML, and
 * load that document into the given editor.
 * 
 * If the query string has both parameters (which it should not), the "load=..."
 * parameter takes precedence and the "data=..." parameter is ignored.
 * 
 * @param {tinymce.Editor} editor - the TinyMCE editor instance into which to
 *   load the document specified in the query string, if there is one
 * @function
 * @see {@link module:ImportFromURL.loadFromURL loadFromURL()}
 * @see {@link module:ImportFromURL.autoOpenLink autoOpenLink()}
 */
export const loadFromQueryString = editor => {
    const params = new URL( window.location ).searchParams
    // Handle the load=... case:
    if ( params.has( 'load' ) ) {
        let source = params.get( 'load' )
        if ( fileExists( source ) ) {
            new LurchDocument( editor ).setDocument( readFile( source ) )
            if ( params.has( 'delete' ) && params.get( 'delete' ) == 'true' )
                deleteFile( source )
            // window.history.replaceState( null, null, appURL() )
            return
        }
        // If it's not a full URL, it might be a relative URL; try that.
        if ( !isValidURL( source ) )
            source = makeAbsoluteURL( source )
        // If reinterpreteing as a relative URL failed, give up now.
        if ( !isValidURL( source ) ) {
            Dialog.notify( editor, 'error', 'Not a valid file source: ' + source )
            return
        }
        // It's a valid URL, so let's try to load from it.
        loadFromURL( source )
        .then( content => {
            const LD = new LurchDocument( editor )

            // Remove any context panel that may have been saved in the file
            editor.once('SetContent', () => {
              requestAnimationFrame(() => {
                 cleanContextAndResetCaret(editor)
              })
            })

            LD.setDocument( content )
            LD.setFileID( source )
        } ).catch( () =>
            Dialog.notify( editor, 'error',
                `Unable to import document from ${source}` )
            // Not all servers permit downloads from other domains.
        )
        // window.history.replaceState( null, null, appURL() )
        return
    }
    // Handle the data=... case:
    if ( params.has( 'data' ) ) {
        try {
            const content = atob( decodeURIComponent( params.get( 'data' ) ) )
            new LurchDocument( editor ).setDocument( content )
            // window.history.replaceState( null, null, appURL() )
        } catch ( _ ) {
            Dialog.notify( editor, 'error', 'Could not load the encoded document.' )
        }
    }
}

/**
 * Open a new browser tab, and in that tab load another copy of the Lurch
 * application, and have that copy load into its editor the document whose
 * content is given as argument.  This is done by saving that content to a
 * temporary file in the browser's local storage, and using the query string of
 * the new tab to direct it to that temporary file, which that new tab will also
 * delete once it has read it.
 * 
 * @param {string} content - the contents of a document to display in a new
 *   window
 */
export const openFileInNewWindow = content => {
    let i = 0
    while ( fileExists( `temp_file_${i}` ) ) i++
    writeFile( `temp_file_${i}`, content )
    window.open( autoOpenLink( `temp_file_${i}`, true ), '_blank' )
}

/**
 * Create a URL that will load the Lurch app and then import a document from a
 * given source immediately.
 * 
 * @param {string} source - the URL or local filename referring to the document
 *   that should be opened ("local filename" means in the browser's local storage)
 * @param {boolean} [andDelete=false] - whether to delete the file after opening
 *   it (which makes sense only for local files, not URLs)
 * @returns {string} a URL that points to this Lurch app, but with the given
 *   source embedded in the query string, as an instruction to open it
 * @function
 * @see {@link module:ImportFromURL.loadFromQueryString loadFromQueryString()}
 * @see {@link module:Utilities.appURL appURL()}
 */
export const autoOpenLink = ( source, andDelete = false ) =>
    appURL() + '?load=' + encodeURIComponent( source )
             + ( andDelete ? '&delete=true' : '' )

export default { loadFromQueryString, loadFromURL }
