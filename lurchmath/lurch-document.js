
import { appURL, isValidURL } from './utilities.js'
import { appSettings } from './settings-install.js'
import {
    SettingsMetadata, SettingsCategoryMetadata, CategorySettingMetadata,
    TextSettingMetadata, LongTextSettingMetadata, BoolSettingMetadata
} from './settings-metadata.js'
import { Dependency } from './dependencies.js'
import { Dialog } from './dialog.js'
import { Atom } from './atoms.js'

// Load the app settings if we're in the browser, where we can do that, so that
// when we later try to use it, it actually contains the user's preferences.
if ( typeof localStorage !== 'undefined' ) appSettings.load()

/**
 * A Lurch document will have several parts, including at least the following.
 * 
 *  * The document content as the user sees it in the editor (HTML)
 *  * Any per-document settings stored in the document as metadata (JSON)
 *  * Information about dependencies on which the document depents (the form of
 *    which has not yet been decided)
 * 
 * When stored in a filesystem, the document must contain all three of these
 * parts, but when displayed in the editor, it should show only the first of
 * them, keeping the rest somewhere outside of the user's view.  And yet those
 * other parts will be editable by the user, through a UI not yet developed.
 * And so when the document is saved, the latest versions of all three parts of
 * the document must be saved, not just the part visible in the editor.
 * 
 * This class provides a clean API for moving documents between any filesystem
 * and the editor.  It is an ephemeral/disposable class, in the sense that you
 * will often create an instance just for use in one command, and then let it be
 * garbage collected.  Examples:
 * 
 * ```js
 * // Clear out the editor, as in response to File > New:
 * new LurchDocument( editor ).newDocument()
 * // Get the document from the editor, in a form ready to save
 * // (that is, including all of its parts, not just what's visible in the UI):
 * const doc = new LurchDocument( editor ).getDocument()
 * // Load into the editor a document retrieved from a filesystem, which will
 * // have all 3 parts described above, only one of which should be shown:
 * new LurchDocument( editor ).setDocument( doc )
 * ```
 */
export class LurchDocument {

    /**
     * Construct a new instance for reading and/or writing data and metadata
     * to and/or from the given editor.  Also, if the editor does not already
     * have a LurchDocument instance stored in its `lurchDocument` property,
     * place this new instance there.
     * 
     * @param {tinymce.editor} editor the editor with which this object will
     *   interface
     */
    constructor ( editor ) {
        this.editor = editor
        if ( !this.editor.lurchMetadata ) this.clearMetadata()
        if ( !this.editor.lurchDocument ) this.editor.lurchDocument = this
    }

    // Internal use only.  Clears out the editor's content.
    clearDocument () {
        this.editor.setContent( '' )
    }
    // Internal use only.  Sets up empty/new metadata structure.
    clearMetadata () {
        this.editor.lurchMetadata = this.editor.dom.doc.createElement( 'div' )
        this.editor.lurchMetadata.setAttribute( 'id', 'metadata' )
        this.editor.lurchMetadata.style.display = 'none'
        this.updateBodyClasses()
    }
    // Internal use only.  Ensure the editor has an element for showing a filename.
    getFilenameElement () {
        let filenameDisplay = document.getElementById( 'lurch-filename-display' )
        if ( !filenameDisplay ) {
            const menubar = document.querySelector( '.tox-menubar' )
            if ( !menubar )
                throw new Error( 'No TinyMCE menubar found in DOM' )
            filenameDisplay = document.createElement( 'div' )
            filenameDisplay.id = 'lurch-filename-display'
            filenameDisplay.classList.add( 'tox-mbtn' )
            filenameDisplay.style.color = '#aaaaaa'
            filenameDisplay.style.paddingLeft = '1rem'
            menubar.appendChild( filenameDisplay )
        }
        return filenameDisplay
    }

    /**
     * Clear out the contents of the editor given at construction time.  This
     * includes clearing out its content as well as any metdata, including
     * document settings and dependencies.  It also clears the editor's dirty
     * flag.
     */
    newDocument () {
        this.clearDocument()
        this.clearMetadata()
        this.clearFileID()
        this.editor.undoManager.clear()
        this.editor.setDirty( false )
    }

    /**
     * If the application loaded a file from a given filename, or a given online
     * storage location, it may want to save a unique ID (such as the filename
     * or a pointer to the online storage location) so that the user can later
     * just choose "Save" and have the file instantly stored back in the same
     * location.  To facilitate this, we allow the storing of an arbitrary ID
     * associated with the given file.  This ID is cleared out whenever
     * {@link LurchDocument#newDocument newDocument()} is called.
     * 
     * @param {any} id - the ID to store
     * @see {@link LurchDocument#getFileID getFileID()}
     * @see {@link LurchDocument#clearFileID clearFileID()}
     */
    setFileID ( id ) {
        this.editor.lastLurchFileID = id
        // The rest of this code is for showing the filename in the UI
        if ( id.filename ) id = id.filename
        if ( isValidURL( id ) ) id = id.split( '/' ).pop()
        id = id.replace( /\.lurch$/, '' )
        this.getFilenameElement().textContent = id
    }

    /**
     * See the description of {@link LurchDocument#setFileID setFileID()} for an
     * explanation of file IDs.  This function returns the current file ID if
     * there is one, or undefined otherwise.
     * 
     * @see {@link LurchDocument#setFileID setFileID()}
     * @see {@link LurchDocument#clearFileID clearFileID()}
     */
    getFileID () { return this.editor.lastLurchFileID }

    /**
     * See the description of {@link LurchDocument#setFileID setFileID()} for an
     * explanation of file IDs.  This function removes any file ID from this
     * document.  This function is called whenever
     * {@link LurchDocument#newDocument newDocument()} is called.
     * 
     * @see {@link LurchDocument#setFileID setFileID()}
     */
    clearFileID () {
        delete this.editor.lastLurchFileID
        this.getFilenameElement().textContent = ''
    }

    /**
     * A Lurch document has two main parts, a DIV storing the metadata followed
     * by a DIV storing the actual document content.  This function takes a
     * string containing the HTML for a Lurch document and extracts those two
     * components from it, returning each one as a fully constructed
     * `HTMLDivElement`.
     * 
     * Note that a Lurch document's HTML text also begins with a brief script to
     * create the link to open the document in the Lurch app, but that portion
     * of the input string is ignored, because it is not part of the document,
     * nor its metadata.
     * 
     * @param {string} document - the document as it was retrieved from a
     *   filesystem, ready to be loaded into this editor
     * @returns {Object} an object with `"metadata"` and `"document"` fields, as
     *   documented above
     * @see {@link LurchDocument#isDocumentHTML isDocumentHTML()}
     */
    static documentParts ( document ) {
        const temp = window.document.createElement( 'div' )
        temp.innerHTML = document
        const toSearch = Array.from( temp.childNodes )
        return {
            metadata : toSearch.find( child => child.matches?.( '#metadata' ) ),
            document : toSearch.find( child => child.matches?.( '#document' ) )
        }
    }

    /**
     * Is the given text a valid Lurch document?  This is checked by applying
     * the {@link LurchDocument#documentParts documentParts()} function to it,
     * and ensuring that it has at least a `document` member, even if it does
     * not also have a `metadata` member.
     * 
     * @param {string} document - the document in HTML form
     * @returns {boolean} true if the document is a valid Lurch document, false
     *   otherwise
     * @see {@link LurchDocument#documentParts documentParts()}
     */
    static isDocumentHTML ( document ) {
        return LurchDocument.documentParts( document ).document !== undefined
    }

    /**
     * Load the given document into the editor instance that was given at
     * construction time.  This will replace what's visible in the UI with the
     * visible portion of the given document, and will also replace the
     * invisible document settings and dependencies with those of the given
     * document.  It also clears the editor's dirty flag and modifies the body
     * element of the editor with the classes necessitated by the settings of
     * the given document.
     * 
     * @param {string} document - the document as it was retrieved from a
     *   filesystem (or another source), ready to be loaded into this editor
     * @see {@link LurchDocument#getDocument getDocument()}
     */
    setDocument ( document ) {
        const parts = LurchDocument.documentParts( document )
        // There should be a metadata element; use it directly if so.
        if ( parts.metadata )
            this.editor.lurchMetadata = parts.metadata
        else
            this.clearMetadata()
        // There should be a document element; use its HTML content if so.
        if ( parts.document )
            this.editor.setContent( parts.document.innerHTML )
        else
            this.clearDocument()
        this.editor.undoManager.clear()
        this.editor.setDirty( false )
        // Respect settings in the document that necessitate classes on DOM body
        this.updateBodyClasses()
        // refresh any URL-based dependencies marked as "auto-refresh"
        Dependency.refreshAllIn( this.editor.lurchMetadata, true ).catch( error =>
            Dialog.notify( this.editor, 'error',
                `When auto-refreshing dependencies in header: ${error}` ) )
        Dependency.refreshAllIn( this.editor.getBody(), true ).catch( error =>
            Dialog.notify( this.editor, 'error',
                `When auto-refreshing dependencies in document: ${error}` ) )
        // If there are preview atoms in the document, remove them on load
        const existingPreviews = Atom.allIn( this.editor ).filter(
            atom => atom.getMetadata( 'type' ) == 'preview' )
        if ( existingPreviews.length > 0 ) {
            existingPreviews.forEach( preview => preview.element.remove() )
            this.editor.selection.setCursorLocation( this.editor.getBody(), 0 )
        }
    }
    
    /**
     * Return the document being edited by the editor that was given at
     * construction time.  This includes its visible content as well as its
     * metdata, which includes document settings and dependencies.  It may also
     * include a link at the top of the document, which allows the reader to
     * open the document in the live app from which it was saved.  That link can
     * be customized using the parameter.
     * 
     * @param {string|Function} openLink - the HTML content to use at the top of
     *   the document, to provide a link for opening the document in the live
     *   Lurch app.  If not provided, a sensible default is used, which is a DIV
     *   containing just one link, whose URL is supplied by a small script that
     *   runs at page load time and reads the document URL.  You can remove this
     *   link entirely by setting this value to the empty string.  If this is a
     *   function instead of a string, it will be called on the document content
     *   *without* the open link, and should return an open link to be used as a
     *   prefix.
     * @returns {string} the document in string form, ready to be stored in a
     *   filesystem
     * @see {@link LurchDocument#setDocument setDocument()}
     */
    getDocument ( openLink = LurchDocument.openLinkUsingURL ) {
        // Get the metadata and document as HTML strings
        const metadataHTML = this.editor.lurchMetadata.outerHTML
        const documentHTML = this.editor.getContent()
        // Use those to build the result
        const body = `
            ${metadataHTML}
            <div id="document">${documentHTML}</div>
        `
        // Prefix the open link and return the result
        return typeof( openLink ) == 'function' ? openLink( body ) + body :
               typeof( openLink ) == 'string' ? openLink + body : body
    }

    // Internal use only.  Default parameter value for getDocument().
    // Creates an open link that assumes the file is stored online somewhere,
    // and uses its current URL to construct the link.
    static openLinkUsingURL () {
        return `
            <div id="loadlink">
                <p><a>Open this file in the Lurch web app</a></p>
                <script language="javascript">
                    const link = document.querySelector( '#loadlink > p > a' )
                    const thisURL = encodeURIComponent( window.location.href )
                    link?.setAttribute( 'href', '${appURL()}?load=' + thisURL )
                </script>
            </div>
        `
    }

    // Internal use only.  Creates an open link that assumes the file is small
    // enough to be base-64 encoded into the URL query string.
    static openLinkUsingBase64 ( body ) {
        const data = encodeURIComponent( btoa( body ) )
        return `
            <div id="loadlink">
                <p><a>Open this file in the Lurch web app</a></p>
                <script language="javascript">
                    const link = document.querySelector( '#loadlink > p > a' )
                    const thisURL = encodeURIComponent( window.location.href )
                    link?.setAttribute( 'href', '${appURL()}?data=${data}' )
                </script>
            </div>
        `
    }

    // Internal use only.  Gets all HTML elements that store metadata.
    metadataElements () {
        return Array.from( this.editor.lurchMetadata.childNodes )
            .filter( element => element.tagName == 'DIV' )
    }
    // Internal use only.  Gets metadata element for a given key, if any.
    findMetadataElement ( category, key ) {
        return this.metadataElements().find( element =>
            element.dataset.category == category
         && element.dataset.key == key )
    }

    /**
     * Store a new piece of metadata in this object, or update an old one.
     * Pieces of metadata are indexed by a category-key pair, facilitating
     * "namespaces" within the metadata.  This is useful so that we can
     * partition the metadata into things like document-level settings, the
     * document's list of dependencies, data cached by algorithms in the app,
     * and any other categories that arise.
     * 
     * Values can be either JSON data (which includes strings, integers, and
     * booleans, in addition to the more complex types of JSON data) or HTML
     * in string form (for example, if you wish to store an entire dependency).
     * 
     * Also, some pieces of metadata, when stored, require placing attributes or
     * classes in the editor's DOM, and this function will take that action as
     * well, if needed.
     * 
     * @param {string} category - the category for this piece of metadata
     * @param {string} key - the key for this piece of metadata
     * @param {string} valueType - either "json" or "html" to specify the format
     *   for the value
     * @param {string|Object} value - a string of HTML if `valueType` is "html"
     *   or an object we can pass to `JSON.stringify()` if `valueType` is "json"
     * @see {@link LurchDocument#getMetadata getMetadata()}
     */
    setMetadata ( category, key, valueType, value ) {
        // Ensure correct value type
        if ( ![ 'json', 'html' ].includes( valueType.toLowerCase() ) )
            throw new Error( 'Invalid setting value type: ' + valueType )
        // Store the value
        const element = this.findMetadataElement( category, key )
        if ( element ) {
            element.dataset['valueType'] = valueType
            element.innerHTML = valueType == 'json' ? JSON.stringify( value ) : value
        } else {
            const newElement = this.editor.dom.doc.createElement( 'div' )
            newElement.dataset['category'] = category
            newElement.dataset['key'] = key
            newElement.dataset['valueType'] = valueType
            newElement.innerHTML = valueType == 'json' ? JSON.stringify( value ) : value
            this.editor.lurchMetadata.appendChild( newElement )
        }
        // Tweak editor DOM if needed
        this.updateBodyClasses()
    }

    /**
     * Pieces of metadata are indexed by a category-key pair, facilitating
     * "namespaces" within the metadata.  See {@link LurchDocument#setMetadata
     * setMetadata()} for more information on why.  This function looks up the
     * value that corresponds to the given category and key.
     * 
     * If the value is stored in JSON form, then the corresponding object will
     * be returned (as produced by `JSON.parse()`).  If the value is stored in
     * HTML form, then an `HTMLDivElement` instance will be returned, the
     * contents of which are the value of the metadata item.  The element
     * returned is a copy of the one stored internally, so the caller cannot
     * alter the internal value by modifying the returned element.
     * 
     * @param {string} category - the category for the piece of metadata to look
     *   up
     * @param {string} key - the key for the piece of metadata to look up
     * @returns {string|number|bool|Object|HTMLDivElement|undefined} the value
     *   stored in the metadata, or undefined if there is no such metadata
     * @see {@link LurchDocument#setMetadata setMetadata()}
     * @see {@link LurchDocument#getMetadataCategories getMetadataCategories()}
     * @see {@link LurchDocument#getMetadataKeys getMetadataKeys()}
     */
    getMetadata ( category, key ) {
        const element = this.findMetadataElement( category, key )
        const defaultValue = category == 'settings' ?
            LurchDocument.settingsMetadata.metadataFor( key )?.defaultValue :
            undefined
        return !element ? defaultValue :
               element.dataset.valueType == 'html' ? element.cloneNode( true ) :
               JSON.parse( element.innerHTML )
    }
    
    /**
     * Pieces of metadata are indexed by a category-key pair, facilitating
     * "namespaces" within the metadata.  See {@link LurchDocument#setMetadata
     * setMetadata()} for more information on why.  This function returns all
     * categories that appear in the document's metadata.  There is no defined
     * order to the result, but no category is repeated.  The list may be empty
     * if this document has no metadata stored in it.
     * 
     * @returns {string[]} an array containing all strings that appear as
     *   categories in this document's metadata
     * @see {@link LurchDocument#getMetadata getMetadata()}
     * @see {@link LurchDocument#getMetadataKeys getMetadataKeys()}
     */
    getMetadataCategories () {
        const result = [ ]
        this.metadataElements().forEach( element => {
            if ( !result.includes( element.dataset.category ) )
                result.push( element.dataset.category )
        } )
        return result
    }

    /**
     * Pieces of metadata are indexed by a category-key pair, facilitating
     * "namespaces" within the metadata.  See {@link LurchDocument#setMetadata
     * setMetadata()} for more information on why.  This function returns all
     * keys that appear in the document's metadata under a given category.
     * There is no defined order to the result, but no key is repeated.  The
     * list may be empty if this document has no metadata stored in it under the
     * given category.
     * 
     * @param {string} category - the category whose keys should be listed
     * @returns {string[]} the keys corresponding to the given category
     * @see {@link LurchDocument#getMetadata getMetadata()}
     * @see {@link LurchDocument#getMetadataCategories getMetadataCategories()}
     */
    getMetadataKeys ( category ) {
        const result = [ ]
        this.metadataElements().forEach( element => {
            if ( element.dataset.category == category
              && !result.includes( element.dataset.key ) )
                result.push( element.dataset.key )
        } )
        return result
    }

    /**
     * Pieces of metadata are indexed by a category-key pair, facilitating
     * "namespaces" within the metadata.  See {@link LurchDocument#setMetadata
     * setMetadata()} for more information on why.  This function deletes the
     * unique metadata item stored under the given category-key pair if there is
     * one, and does nothing otherwise.
     * 
     * Also, some pieces of metadata, when deleted, require placing attributes
     * or classes in the editor's DOM, and this function will take that action
     * as well, if needed.
     * 
     * @param {string} category - the category for the piece of metadata to
     *   delete
     * @param {string} key - the key for the piece of metadata to delete
     * @see {@link LurchDocument#getMetadata getMetadata()}
     * @see {@link LurchDocument#setMetadata setMetadata()}
     */
    deleteMetadata ( category, key ) {
        // Delete metadata
        const element = this.findMetadataElement( category, key )
        if ( element ) element.remove()
        // Tweak editor DOM if needed
        this.updateBodyClasses()
    }

    /**
     * This metadata object can be used to create a {@link Settings} instance
     * for any given document, which can then present a UI to the user for
     * editing the document's settings (using
     * {@link Settings#userEdit its userEdit() function}).  We use it for this
     * purpose in the menu item we create in the
     * {@link module:DocumentSettings.install install()} function, among other
     * places.  Instances of this class also use it to return the appropriate
     * defaults for settings the user may query about a document.
     * 
     * This metadata can be used to edit document-level settings, which are
     * distinct from the application-level settings defined in
     * {@link module:SettingsInstaller the Settings Installer module}.
     */
    static settingsMetadata = new SettingsMetadata(
        new SettingsCategoryMetadata(
            'Document metadata',
            new TextSettingMetadata( 'title', 'Title', '' ),
            new TextSettingMetadata( 'author', 'Author', '' ),
            new TextSettingMetadata( 'date', 'Date', '' ),
            new LongTextSettingMetadata( 'abstract', 'Abstract', '' )
        ),
        new SettingsCategoryMetadata(
            'Math content',
            new CategorySettingMetadata(
                'notation',
                'Default notation to use for new expressions',
                [ 'Lurch notation', 'LaTeX' ],
                appSettings.get( 'notation' )
            ),
            new CategorySettingMetadata(
                'shell style',
                'Style for displaying environments',
                [ 'boxed', 'minimal' ],
                appSettings.get( 'default shell style' )
            )
        ),
        new SettingsCategoryMetadata(
          'Validation options',
          new BoolSettingMetadata( 'instantiateEverything', 'Try harder to validate (can be much slower)', false ),
          new BoolSettingMetadata( 'hideShellNames', 'Hide marginal shell annotations in semantic view', false )
       )
    )

    /**
     * This is a truncated version of {@link settingsMetadata} to keep users
     * away from advanced, confusing, or no longer functional settings.
     */
    static shortSettingsMetadata = new SettingsMetadata(
        new SettingsCategoryMetadata(
            'Document metadata',
            new TextSettingMetadata( 'title', 'Title', '' ),
            new TextSettingMetadata( 'author', 'Author', '' ),
            new TextSettingMetadata( 'date', 'Date', '' ),
            new LongTextSettingMetadata( 'abstract', 'Abstract', '' )
        ),
        new SettingsCategoryMetadata(
          'Validation options',
          new BoolSettingMetadata( 'instantiateEverything', 'Try harder to validate (can be much slower)', false ) 
          // ,
          // We temporarily hide the following since it doesn't work yet. 
          // new BoolSettingMetadata( 'hideShellNames', 'Hide marginal shell annotations in semantic view', false )
        )  
    )


    /**
     * This array lists those settings that should be marked as classes on the
     * body element of the editor's document.  This exposes them to CSS rules
     * in the editor, so that they can be used to style the document content.
     * 
     * In general, a setting with key "example one" and value "foo bar" will be
     * marked on the body element with a class of "example-one-foo-bar".
     * 
     * @see {@link LurchDocument#updateBodyClasses updateBodyClasses()}
     */
    static bodySettings = [ 'shell style' ]

    /**
     * For each setting mentioned in {@link LurchDocument#bodySettings
     * bodySettings}, this function ensures that there is precisely one CSS
     * class on the body of the document beginning with that setting's key,
     * and that is the class that ends with that setting's value.
     * 
     * As documented in {@link LurchDocument#bodySettings bodySettings}, spaces
     * are replaced with dashes, so that a setting with key "number of tacos"
     * and value "not enough" would become a CSS class
     * "number-of-tacos-not-enough".
     * 
     * @see {@link LurchDocument#bodySettings bodySettings}
     */
    updateBodyClasses () {
        LurchDocument.bodySettings.forEach( settingKey => {
            const prefix = settingKey.replace( ' ', '-' ) + '-'
            const value = this.getMetadata( 'settings', settingKey )
            const newClass = prefix + value.replace( ' ', '-' )
            const oldClasses = Array.from( this.editor.dom.doc.body.classList )
            oldClasses.forEach( oldClass => {
                if ( oldClass.startsWith( prefix ) && oldClass != newClass )
                    this.editor.dom.doc.body.classList.remove( oldClass )
            } )
            if ( !oldClasses.includes( newClass ) )
                this.editor.dom.doc.body.classList.add( newClass )
        } )
    }

}
