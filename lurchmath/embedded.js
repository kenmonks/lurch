
/**
 * This script is separate from the Lurch app and is not imported anywhere in
 * the Lurch app's code.  It is intended to be used in pages that want to embed
 * within themselves small copies of the Lurch app, for example, to show small
 * proofs or other small documents, such as in Lurch's documentation or in
 * mathematical lessons on proofs.
 * [Its source can be found here.](./embedded.js.html)
 * 
 * The intent of this script is that any page on the web can import this script
 * and it will find all elements in the page of the form
 * `<div class='lurch-embed'>...</div>` and will transform each into an iframe
 * containing the Lurch app, then pass the HTML form of the div to that app as a
 * string using `postMessage()`.  The app is then free to load the content of
 * the div, as a document, and respect any attributes the user has attached to
 * that div, as part of that process.
 * 
 * That DIV may have any of the following attributes.
 * 
 *  - `appURL` - the URL of the Lurch app to use.  If not provided, this
 *    defaults to the copy of the app hosted on the Lurch website,
 *    `lurchmath.github.io/lurchmath`.
 *  - `validate` - if set to true, the embedded copy of the Lurch app will not
 *    only load the document defined inside the DIV tag, but will then also
 *    run validation on it
 *  - Any other attributes specified will be copied to the iframe that replaces
 *    the DIV and is used to load the Lurch app.  For example, you may want to
 *    specify height, width, border style, etc.
 * 
 * To see how you can format the contents of the DIV so that they will be
 * understood by the embedded app, see {@link module:EmbedListener the
 * EmbedListener module}.
 * 
 * @module EmbedScript
 */

// Split text of the form '<json data>\n\n<anything else>' into a pair [A,B],
// where A is the parsed JSON and B is the rest of the text.  If the text is
// not of that form, just return [null,text].
const splitJSONHeader = text => {
    const splitPoint = text.indexOf( '\n\n' )
    if ( splitPoint == -1 )
        return [ null, text ]
    try {
        return [
            JSON.parse( text.substring( 0, splitPoint ) ),
            text.substring( splitPoint + 2 )
        ]
    } catch ( _ ) {
        return [ null, text ]
    }
}

// Where the main app is stored, but this can be overridden by setting the
// corresponding value in the window object, or on a case-by-case basis in each
// div, using the appURL attribute.
const defaultAppURL = window.defaultAppURL
    // || '/student'
    || 'https://lurch.plus/student'

// List of all iframes we've processed
const iframes = [ ]
// Add data to the list
const saveIframeData = ( iframe, htmlContent ) =>
    iframes.push( { iframe, htmlContent } )
// Find data based on its contentWindow
const dataForWindow = window =>
    iframes.find( entry => entry.iframe.contentWindow === window )

// Convert a given div into an embedded instance of the Lurch app
const convertToEmbeddedLurch = div => {
    // Create a new iframe with all the div's attributes
    // (except appURL, which is used only below instead)
    const iframe = document.createElement( 'iframe' )
    Array.from( div.attributes ).forEach( pair => {
        if ( pair.name != 'appURL' )
            iframe.setAttribute( pair.name, pair.value )
    } )
    // See if the div has a JSON header
    const [ header, remainder ] = splitJSONHeader( div.innerHTML )
    if ( header != null ) div.innerHTML = remainder
    // Record this iframe so later events can find it
    saveIframeData( iframe, div.outerHTML )
    // Put the app in the iframe and the iframe in the document
    const appURL = div.getAttribute( 'appURL' ) || defaultAppURL
    if ( header == null ) {
        // If there's no JSON header, the default createApp() call is fine.
        iframe.setAttribute( 'src', appURL )
    } else {
        // If there is a JSON header, then tell the page not to call createApp()
        // until it hears from us, then send a message with the header, to be
        // used as part of the createApp() call.
        iframe.addEventListener( 'load', () => {
            iframe.contentWindow.postMessage( { 'lurch-app-create' : header }, '*' )
        } )
        iframe.setAttribute( 'src', appURL + '?delayLoad=true' )
    }
    iframe.style.border = 'none'
    div.replaceWith( iframe )
}

// When any iframe hears from the app, send its div's contents to it
window.addEventListener( 'message', event => {
    if ( event.data == 'ready-for-embed' ) {
        const data = dataForWindow( event.source )
        event.source.postMessage( { 'lurch-embed' : data.htmlContent }, '*' )
    }
}, false )

// Run the above function on all relevant divs in the document
window.addEventListener( 'load', () => {
    Array.from( document.querySelectorAll( 'div.lurch-embed' ) ).forEach( div => {
        // Here we test if it's still in the document, in case someone illegally
        // embedded one Lurch embed inside another, and we removed it in a
        // previous iteration of this loop.
        if ( document.contains( div ) ) convertToEmbeddedLurch( div )
    } )
} )
