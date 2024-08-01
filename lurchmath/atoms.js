
/**
 * In a Lurch document, certain sections will be marked as "atoms."  These may
 * be an inline section represented by an HTML span or a block section
 * represented by an HTML div.  Atoms have the following properties.
 * 
 *  1. The user cannot *directly* edit their content.  Rather, the application
 *     determines how the atom appears in the document.  (There are also
 *     meaningful sections of the document that are not indivisible in this way;
 *     see {@link module:Shells the Shells module}.)
 *  2. The user can *indirectly* edit the atom's content by clicking on it and
 *     interacting with whatever dialog the application pops up in response.
 *  3. There can be many different types of atoms.  For example, one atom may be
 *     a mathematical equation while another atom adds an attribute to the
 *     document that contains it; these are two different types, and there will
 *     be other types as well.  The type is stored as an attribute of the atom's
 *     HTML element.
 *  4. Each atom will typically have some meaning that will be important when
 *     the document is processed in a mathematical way.
 * 
 * Atoms are represented in the document by spans and divs with a certain class
 * attached to mark them as atoms, and they are also have their
 * `contenteditable` property set to false, which TinyMCE respects so that the
 * user cannot edit their content (though they can cut, copy, paste, or delete
 * them).
 * 
 * This module contains tools for working with atoms, including the
 * {@link module:Atoms.className class name} we use to distinguish them, the
 * {@link module:Atoms.install function} we use to install their event handlers,
 * and most importantly, the {@link module:Atoms.Atom class} we use to create an
 * API for working with individual atoms.
 *
 * @module Atoms
 * @see {@link module:Shells the Shells module}
 */

import { removeScriptTags, isOnScreen, editorForNode } from './utilities.js'
import { getConverter } from './math-live.js'

/**
 * Class name used to distinguish HTML elements representing atoms.  (For an
 * explanation of what an atom is, see the documentation for
 * {@link module:Atoms the module itself}.)
 */
export const className = 'lurch-atom'

// Internal use only: simplify consistent use of class and attribute names
const metadataKey = key => `metadata_${key}`
const isMetadataKey = key => key.startsWith( 'metadata_' )
const innerMetadataKey = key => key.substring( 9 )
const childClass = type => `${className}-${type}`
const childSelector = type => '.' + childClass( type )

/**
 * For information about the concept of atoms in Lurch in general, see the
 * documentation of {@link module:Atoms the Atoms module}.  Because atoms are HTML
 * elements, their API is that provided by the browser for all HTML elements,
 * and is not specific to their role as atoms.  To provide an API that makes it
 * easier to deal with atoms in a Lurch document, we create this class.
 * 
 * One simply constructs an instance of this class, passing the corresponding
 * HTML element from within the editor, along with the editor itself, and the
 * resulting object provides an extensive API (documented below) for interfacing
 * with the atom in a variety of ways useful for the Lurch app.
 * 
 * This is analogous to how we deal with shells in the editor, using the
 * {@link Shells} class.
 */
export class Atom {

    // Internal use only: Stores a mapping from subclass names to subclasses of
    // the Atom class.  Public use of this data should be done through the
    // registerSubclass() function below; clients do not need to read this data.
    static subclasses = new Map()

    /**
     * This class tracks its collection of subclasses so that elements in the
     * editor can have an appropriate Atom subclass wrapper created around them
     * as needed, for custom event handling.  To register a subclass, call this
     * function.  To create an atom that has the right subclass, see
     * {@link module:Atoms.Atom#from from()}.
     * 
     * Example:
     * 
     * ```js
     * class Example extends Atom { ... }
     * Atom.registerSubclass( 'Example', Example )
     * ```
     * 
     * @param {string} name - the name of the subclass to register
     * @param {Object} subclass - the subclass itself
     */
    static registerSubclass ( name, subclass ) {
        Atom.subclasses.set( name, subclass )
        return name
    }

    /**
     * Construct a new instance of this class corresponding to the atom
     * represented by the given `HTMLElement`.  Recall that the purpose of this
     * class, as documented above, is to provide an API for consistent and
     * convenient use of atoms, an API that is not part of the `HTMLElement`
     * API.  Thus to use that API, you use this constructor and then call
     * functions on the resulting object.  The intent is for such instances to
     * be ephemeral, in the sense that you can create one, use it, and let it be
     * garbage collected immediately thereafter, with little performance cost.
     * 
     * @param {HTMLElement} element - the element in the editor (a span or div)
     *   representing the atom
     * @param {tinymce.Editor} editor - the editor in which the element sits
     */
    constructor ( element, editor ) {
        if ( !Atom.isAtomElement( element ) )
            throw new Error( 'This is not an atom element: ' + element )
        this.element = element
        this.editor = editor
    }

    /**
     * This function is a handler for whenever the metadata stored in this atom
     * changes.  Its default implementation is to do nothing, but having it here
     * allows {@link module:Validation the validation module} to replace this
     * handler with one that clears all validation feedback.  We do it this way,
     * rather than importing the validation module and calling its "clear"
     * function ourselves, because it prevents a circular dependency.
     * 
     * @see {@link Atom#wasDeleted wasDeleted()}
     */
    dataChanged () { }

    /**
     * This function is a handler for whenever an atom has just been deleted
     * from the document.  Its default implementation is to do nothing, but
     * having it here allows {@link module:Validation the validation module} to
     * replace this handler with one that clears all validation feedback.  We do
     * it this way, rather than importing the validation module and calling its
     * "clear" function ourselves, because it prevents a circular dependency.
     * 
     * @see {@link Atom#dataChanged dataChanged()}
     */
    wasDeleted () { }

    /**
     * Get the HTML representation of this atom, as it currently sits in the
     * document.  There is no corresponding `setHTML()` function; instead, see
     * {@link module:Atoms.Atom#fillChild fillChild()}.
     * 
     * @returns {string} the HTML representation of this atom
     * @see {@link module:Shells.Shell#getHTML getHTML()}
     */
    getHTML () { return this.element.outerHTML }

    /**
     * Set (or clear) the hover text on this atom.  Hover text is what's shown
     * in a small popup when the user hovers over the atom in the editor.
     * 
     * @param {string?} text - the text to set as the hover text for this atom's
     *   HTMLElement, or `null` to remove the hover text
     */
    setHoverText ( text ) {
        if ( text )
            this.element.setAttribute( 'title', text )
        else
            this.element.removeAttribute( 'title' )
    }

    /**
     * An atom has the following three or four internal parts, called children.
     * If the atom is inline (a span) then each of the children is represented
     * as an inner span, but if the atom is a block (a div) then each of the
     * children is an inner div.
     * 
     *  1. The "metadata" child, which exists only in block-type atoms, and can
     *     contain arbitrarily large HTML metadata, none of which is displayed
     *     in the document for the user to see.  Clients should not read from or
     *     write to this HTML metadata storage directly, but should instead use
     *     the functions in this class designed for that purpose, including
     *     {@link module:Atoms.Atom#getHTMLMetadata getHTMLMetadata()} and
     *     {@link module:Atoms.Atom#setHTMLMetadata setHTMLMetadata()}.  The
     *     reason that this exists only in block-type atoms is because one
     *     cannot put arbitrary HTML inside a span, as one can with a div.
     *  2. The "prefix" child, which is the first child that is visible to the
     *     user in the document.  This may be omitted or empty, but in those
     *     situations where the atom should have some decoration on its left
     *     side (for inline atoms) or its top (for block atoms), such content
     *     can be placed in the prefix.  The client rarely needs to write to the
     *     prefix directly, but can instead use the
     *     {@link module:Atoms.Atom#fillChild fillChild()} function to do so.
     *     You can use this function to read from the prefix when needed.
     *  3. The "body" child, which is where the main content of the atom should
     *     go.  For example, if the atom represents a mathematical equation, the
     *     typeset version of that equation can go here.  Again, to specify the
     *     body content, use {@link module:Atoms.Atom#fillChild fillChild()}.
     *  4. The "suffix" child, which functions just like the prefix, except
     *     appears at the end (right side for inline atoms, bottom for block
     *     atoms).  Again, to specify the suffix content, use
     *     {@link module:Atoms.Atom#fillChild fillChild()}.
     * 
     * When you call this function, both parameters are optional.  If you do not
     * specify the type of child, it defaults to the body, and if the child you
     * request does not exist, it defaults to creating it for you.  (In a brand
     * new atom, there are no children; it is empty.)  If you do not wish the
     * child to be created, but rather receive `undefined` as the result if it
     * does not exist, set the second parameter to `false`.
     * 
     * @param {string} type - which type of child to fetch, must be one of
     *   `"metadata"`, `"prefix"`, `"body"`, or `"suffix"` (default is `"body"`)
     * @param {boolean} createIfNeeded - whether to create the child in question
     *   if it does not already exist (default is `true`)
     * @returns {HTMLElement} the child of the given type inside this atom
     * @see {@link module:Atoms.Atom#fillChild fillChild()}
     * @see {@link module:Atoms.Atom#removeChild removeChild()}
     */
    getChild ( type = 'body', createIfNeeded = true ) {
        // determine whether the type is valid and where it should be placed
        const sequence = [ 'metadata', 'prefix', 'body', 'suffix' ]
        const index = sequence.indexOf( type )
        if ( index == -1 ) // we also use this index further below
            throw new Error( 'Invalid child type: ' + type )
        if ( type == 'metadata' && this.element.tagName == 'SPAN' )
            throw new Error( 'Inline atoms cannot have a metadata child' )
        // return an existing child if there is one with the requested type
        const result = Array.from( this.element.childNodes ).find(
            child => child.matches?.( childSelector( type ) ) )
        if ( result ) return result
        // if we are not allowed to create a new child, stop here
        if ( !createIfNeeded ) return undefined
        // create a new child of the given type
        const newChild = this.element.ownerDocument.createElement(
            this.element.tagName )
        newChild.classList.add( childClass( type ) )
        if ( type == 'metadata' ) newChild.style.display = 'none'
        // place it where it belongs in the sequence declared above
        for ( let i = index + 1 ; i < sequence.length ; i++ ) {
            const next = this.getChild( sequence[i], false )
            if ( next ) {
                this.element.insertBefore( newChild, next )
                break
            }
        }
        if ( newChild.parentNode != this.element )
            this.element.appendChild( newChild )
        // if TinyMCE added a random placeholder, that can now be removed
        Array.from( this.element.childNodes ).find( element =>
            element.tagName == 'BR' && element.dataset.mceBogus )?.remove()
        // return the newly created child
        return newChild
    }

    /**
     * Fill the child of the specified type with the given HTML content.  If the
     * child does not yet exist, create it before populating it.  See the
     * documentation for {@link module:Atoms.Atom#getChild getChild()} for an
     * explanation of the children of atoms.
     * 
     * @param {string} type - which type of child to write to; see the
     *   documentation for {@link module:Atoms.Atom#getChild getChild()} for a
     *   list of the valid children types
     * @param {string} html - the HTML code to use to fill the child
     * @see {@link module:Atoms.Atom#getChild getChild()}
     * @see {@link module:Atoms.Atom#removeChild removeChild()}
     */
    fillChild ( type, html ) { this.getChild( type ).innerHTML = html }

    /**
     * Remove the child with the specified type (or do nothing if there is no
     * such child).  See the documentation for {@link module:Atoms.Atom#getChild
     * getChild()} for an explanation of the children of atoms.
     * 
     * @param {string} type - which type of child to write to; see the
     *   documentation for {@link module:Atoms.Atom#getChild getChild()} for a
     *   list of the valid children types
     * @see {@link module:Atoms.Atom#getChild getChild()}
     * @see {@link module:Atoms.Atom#fillChild fillChild()}
     */
    removeChild ( type ) { this.getChild( type, false )?.remove() }

    /**
     * Look up a metadata entry in this atom using the given key.  Atoms can
     * contain metadata mapping any string key to any JSONable value.  Thus this
     * function will return a JSONable object, as extracted from the given key,
     * if that key indeed appears in this atom's metadata.
     * 
     * This type of metadata is stored in the `dataset` property of the
     * `HTMLElement` representing the atom.  This is a natural way to store
     * small amounts of data about the atom.  For larger amounts of data, you
     * may wish to use {@link module:Atoms.Atom#getHTMLMetadata
     * getHTMLMetadata()} instead.
     * 
     * @param {string} key - the key whose value should be looked up
     * @returns {any} the data associated with the given key, or undefined if
     *   the key is not in the metadata
     * @see {@link module:Atoms.Atom#setMetadata setMetadata()}
     * @see {@link module:Atoms.Atom#removeMetadata removeMetadata()}
     * @see {@link module:Atoms.Atom#getMetadataKeys getMetadataKeys()}
     * @see {@link module:Atoms.Atom#getHTMLMetadata getHTMLMetadata()}
     */
    getMetadata ( key ) {
        const json = this.element.dataset[metadataKey( key )]
        return json ? JSON.parse( json ) : json
    }

    /**
     * Store a metadata entry in this atom under the given key.  Atoms can
     * contain metadata mapping any string key to any JSONable value, so you
     * should provide a value that is amenable to JSON encoding.  It will be
     * stored using its JSON encoding, as a string.
     * 
     * If the caller omits the `value` parameter, or sets it to undefined, this
     * function does nothing.
     * 
     * @param {string} key - the key under which to store the value
     * @param {any} value - the value to store
     * @see {@link module:Atoms.Atom#getMetadata getMetadata()}
     * @see {@link module:Atoms.Atom#removeMetadata removeMetadata()}
     * @see {@link module:Atoms.Atom#getMetadataKeys getMetadataKeys()}
     * @see {@link module:Atoms.Atom#setHTMLMetadata setHTMLMetadata()}
     */
    setMetadata ( key, value ) {
        if ( value === undefined ) return
        this.element.dataset[metadataKey( key )] = JSON.stringify( value )
        this.dataChanged()
    }

    /**
     * Remove a metadata entry from this atom, with the given key.
     * 
     * @param {string} key - the key that (together with its value) should be
     *   removed
     * @see {@link module:Atoms.Atom#getMetadata getMetadata()}
     * @see {@link module:Atoms.Atom#setMetadata setMetadata()}
     * @see {@link module:Atoms.Atom#getMetadataKeys getMetadataKeys()}
     * @see {@link module:Atoms.Atom#removeHTMLMetadata removeHTMLMetadata()}
     */
    removeMetadata ( key ) {
        delete this.element.dataset[metadataKey( key )]
        this.dataChanged()
    }

    /**
     * Look up the keys for all metadata entries stored in this atom.  Atoms can
     * contain metadata mapping any string key to any JSONable value.  This
     * function returns only the keys, as an array.
     * 
     * @returns {string[]} all keys under which metadata has been stored in this
     *   atom
     * @see {@link module:Atoms.Atom#getMetadata getMetadata()}
     * @see {@link module:Atoms.Atom#setMetadata setMetadata()}
     * @see {@link module:Atoms.Atom#removeMetadata removeMetadata()}
     * @see {@link module:Atoms.Atom#getHTMLMetadataKeys getHTMLMetadataKeys()}
     */
    getMetadataKeys () {
        return Object.keys( this.element.dataset )
            .filter( isMetadataKey ).map( innerMetadataKey )
    }

    // For internal use by the functions below
    metadataElements () {
        const metadataChild = this.getChild( 'metadata', false )
        return metadataChild ? Array.from( metadataChild.childNodes ).filter(
            element => element.tagName == 'DIV' ) : [ ]
    }
    // For internal use by the functions below
    findMetadataElement ( key ) {
        return this.metadataElements().find( element =>
            element.dataset.key == key )
    }

    /**
     * Look up an HTML metadata entry in this atom using the given key.  In
     * addition to the JSONable metadata that can be stored in any atom (as
     * documented in {@link module:Atoms.Atom#getMetadata getMetadata()}), you
     * can also store arbitrarily large amounts of HTML in block-type atoms (not
     * inline ones).  This is useful, for example, when storing an entire
     * dependency's HTML inside the atom that has imported it; the data can be
     * stored as DOM nodes rather than as a JSON-encoded HTML string.  This
     * makes it easier to use when doing computations that depend on the meaning
     * of the dependency's content.
     * 
     * This type of metadata is stored inside the `"metadata"` child of the
     * block-type atom, as documented {@link module:Atoms.Atom#getChild here}.
     * The return value for this function will be an `HTMLDivElement` that sits
     * inside that `"metadata"` child, and serves as a wrapper containing any
     * number of HTML elements (or any large amount of text).  While the return
     * value is a single element, it is a wrapper that should be ignored,
     * because its child node list is the actual value of the metadata that was
     * looked up.
     * 
     * @param {string} key - the key whose HTML should be looked up
     * @returns {HTMLDivElement} the element wrapping the corresponding value
     * @see {@link module:Atoms.Atom#setHTMLMetadata setHTMLMetadata()}
     * @see {@link module:Atoms.Atom#removeHTMLMetadata removeHTMLMetadata()}
     * @see {@link module:Atoms.Atom#getHTMLMetadataKeys getHTMLMetadataKeys()}
     * @see {@link module:Atoms.Atom#getMetadata getMetadata()}
     */
    getHTMLMetadata ( key ) { return this.findMetadataElement( key ) }

    /**
     * Store an HTML metadata entry in this atom under the given key.
     * Block-type atoms can contain metadata mapping any string key to any
     * amount of HTML content, as documented
     * {@link module:Atoms.Atom#getHTMLMetadata here}.  This function stores a
     * new entry in that metadata storage area.
     * 
     * Note that only block-type atoms can contain HTML metadata, and so calling
     * this function on an inline atom will throw an error.
     * 
     * Any HTML element passed as the value will not be used directly, but will
     * be copied (i.e., its HTML code will be written to the `.innerHTML`
     * property of the appropriate metadata element), in case the element in
     * question is not from the same document.  The value may instead be the
     * HTML code itself, as a string.
     * 
     * @param {string} key - the key under which to store the value
     * @param {HTMLElement|string} value - the value to store, either as an
     *   HTMLElement or a string
     * @see {@link module:Atoms.Atom#getHTMLMetadata getHTMLMetadata()}
     * @see {@link module:Atoms.Atom#removeHTMLMetadata removeHTMLMetadata()}
     * @see {@link module:Atoms.Atom#getHTMLMetadataKeys getHTMLMetadataKeys()}
     * @see {@link module:Atoms.Atom#setMetadata setMetadata()}
     */
    setHTMLMetadata ( key, value ) {
        if ( this.element.tagName != 'DIV' )
            throw new Error( 'Inline atoms cannot have HTML metadata' )
        const child = this.findMetadataElement( key )
        if ( child ) {
            if ( !value )
                child.remove()
            else
                child.innerHTML = removeScriptTags( value.innerHTML || value )
        } else {
            if ( !value ) return
            const newDatum = this.element.ownerDocument.createElement( 'div' )
            newDatum.dataset.key = key
            newDatum.innerHTML = removeScriptTags( value.innerHTML || value )
            this.getChild( 'metadata', true ).appendChild( newDatum )
        }
        this.dataChanged()
    }

    /**
     * Remove an HTML metadata entry from this atom, with the given key.
     * 
     * @param {string} key - the key that (together with its value) should be
     *   removed
     * @see {@link module:Atoms.Atom#getHTMLMetadata getHTMLMetadata()}
     * @see {@link module:Atoms.Atom#setHTMLMetadata setHTMLMetadata()}
     * @see {@link module:Atoms.Atom#getHTMLMetadataKeys getHTMLMetadataKeys()}
     * @see {@link module:Atoms.Atom#removeMetadata removeMetadata()}
     */
    removeHTMLMetadata ( key ) {
        this.findMetadataElement( key )?.remove()
        this.dataChanged()
    }

    /**
     * Look up the keys for all HTML metadata entries stored in this atom.  For
     * information on the difference between basic atom metadata and HTML
     * metadata, see the documentation {@link module:Atoms.Atom#getHTMLMetadata
     * here}.
     * 
     * @returns {string[]} all keys under which HTML metadata has been stored in
     *   this atom
     * @see {@link module:Atoms.Atom#getHTMLMetadata getHTMLMetadata()}
     * @see {@link module:Atoms.Atom#setHTMLMetadata setHTMLMetadata()}
     * @see {@link module:Atoms.Atom#removeHTMLMetadata removeHTMLMetadata()}
     * @see {@link module:Atoms.Atom#getMetadataKeys getMetadataKeys()}
     */
    getHTMLMetadataKeys () {
        return this.metadataElements().map( element => element.dataset.key )
    }

    /**
     * This is a placeholder implementation of this method, to be sure that all
     * Atom instances have one.  In subclasses, the function should pop up an
     * editor for the user to edit this atom, and return a promise that resolves
     * to true if the user saves their edits, and false if they cancel.  The
     * user's edits should already be saved into the atom when the promise
     * resolves to true.  This placeholder implementation returns a promise that
     * false immediately, as if the user canceled their edits instantaneously.
     * 
     * @returns {Promise} a promise that resolves to `false`
     */
    edit () {
        return Promise.resolve( false )
    }

    /**
     * Atoms are always editable, unless they sit inside some DOM node that is
     * marked as `contenteditable=false`.  This function checks to see if that
     * is the case, and returns true iff no ancestor DOM node has that property.
     */
    isEditable () {
        for ( let walk = this.element?.parentNode ; walk ; walk = walk.parentNode )
            if ( walk.getAttribute?.( 'contenteditable' ) == 'false' )
                return false
        return true
    }

    /**
     * The standard way to insert a new atom into the editor is to create it off
     * screen, open up an editing dialog for that atom, and then if the user
     * saves their edits, insert the new atom into the document, in the final
     * state that represents the user's edits.  If, however, the user cancels
     * their edit of the atom, don't insert anything into the document.
     * 
     * This function does exactly that, when called on an offscreen atom,
     * passing the editor into which to insert the atom as the first parameter.
     * 
     * @see {@link module:Atoms.Atom.edit edit()}
     * @see {@link module:Shells.Shell.editThenInsert editThenInsert()}
     */
    editThenInsert () {
        // The following line marks where this atom will/ eventually go in the
        // document, in case the editor is contingent upon the location of the
        // atom with respect to earlier definitions.
        this.futureLocation = this.editor.selection.getNode()
        // Now do the edit:
        this.edit().then( userSaved => {
            if ( userSaved ) {
                this.editor.insertContent( this.getHTML() )
                this.dataChanged()
            }
        } ).finally( () => {
            // And clean up the data we stored earlier; no longer needed.
            delete this.futureLocation
        } )
    }

    /**
     * Set the suffix of the atom to reflect its validation result.
     * 
     * The first argument must be one of `"valid"`, `"invalid"`, `"error"`, or
     * `"indeterminate"`.  No error is thrown if you use another value, but it
     * will not display any meaningful feedback icon.  To clear all validation
     * feedback, omit both arguments, or call `setValidationResult(null)`.  The
     * meanings of these indicators are as follows.
     * 
     *  * `"valid"`: the atom represents correct mathematical work
     *  * `"invalid"`: the atom represents incorrect mathematical work
     *  * `"indeterminate"`: the atom cannot be clearly classified as valid or
     *    invalid (e.g., the user has provided something vague, and their
     *    settings specify that such things should not be aggressively marked
     *    wrong, but just indeterminate, to request more specificity)
     *  * `"error"`: the software encountered an internal error while attempting
     *    to validate the atom.  (Obviously this is to be avoided!  It is
     *    available to use if an internal error occurs, so that the user gets
     *    truthful feedback in such a case, and can report the bug so that we
     *    can set about trying to fix it.  But of course we strive to write
     *    software does not encounter errors, and thus in which this type of
     *    feedback is never actually seen by a user.)
     * 
     * The second argument should be the text to be shown when the user hovers
     * their mouse over the atom.  You can omit this if you do not want any
     * such text, but it is recommended to always have such text, for the user's
     * benefit.  Note that browsers do not support HTML tags in such hover text
     * panels, but they do support newline characters (`"\n"`).
     * 
     * @param {string?} result - the validation result, one of `"valid"`,
     *   `"invalid"`, `"error"`, or `"indeterminate"`; can be omitted in order
     *   to clear all validation feedback
     * @param {string?} reason - the reason for the validation result, as text to
     *   be displayed when the user hovers their mouse over the atom
     * @see {@link module:Shells.Shell#setValidationResult setValidationResult()}
     * @see {@link module:Atoms.Atom#applyValidationMessage applyValidationMessage()}
     */
    setValidationResult ( result, reason ) {
        if ( !result ) {
            this.removeChild( 'suffix' )
            this.setHoverText( null )
        } else {
            // if it already has a result, just add the relevant class to the 
            // existing classlist so we can give more nuanced feedback
            const suffix = this.getChild( 'suffix' )
                               .querySelector( '[class^=feedback-marker]' )
            if ( suffix ) {
                suffix.classList.add( `feedback-marker-${result}` )
                // TODO: a quick fix for now, but we should make this better
                // when we upgrade the entire transitive chains feature. For
                // now, just remove the hover text in this situation since it
                // can be misleading.
                this.setHoverText( '' )
            } else {                  
                this.fillChild( 'suffix',
                    `<span class="feedback-marker-${result}">&nbsp;</span>` )
                this.setHoverText( reason )
            }
        }
    }

    /**
     * Return the array of all validation results in this Atom.
     * 
     * @see {@link module:Atoms.Atom#setValidationResult setValidationResult()} to
     */
    getValidationResults ( ) {
        // inline atoms use a suffix span to store validation feedback while
        // shells use an attribute, so we get both

        let ans = []
        // first get the suffix element of this Atom. If it doesn't have one,
        // just return the empty array.
        const suffix=this.getChild('suffix',false)
        if (suffix) {
            ans = Array.from(suffix
                .querySelectorAll( '[class^=feedback-marker]' ))
                .map( s => Array.from(s.classList).filter( x => 
                      x.startsWith('feedback-marker') ))
                          .flat().map( x => x.slice(16)) // remove prefixes
        }
        // now check if the result is an attribute
        const attr = this.element.dataset['validation_result']
        // add it to the end if both are present (they shouldn't be)
        if (attr) ans.push(attr)
        // return the array of results
        return ans      
    }
    
    /**
     * This function inspects the given {@link Message}, which the caller wants
     * applied to this Atom.  It determines which of its feedback contents, if
     * any, should be displayed to the user.  It then makes a call to
     * {@link module:Atoms.Atom#setValidationResult setValidationResult()} to
     * display that feedback.
     * 
     * The default implementation is to just extract the first piece of feedback
     * from the message *other than a message about an undeclared variable* and
     * use it, or if there is no such feedback in the message, erase the
     * feedback shown on this Atom.  However, subclasses can override this
     * default behavior if they have specific types of feedback that they want
     * to prioritize, or they need to combine multiple types of feedback.
     * 
     * @param {Message} message - the message whose validation data should be
     *   used to decorate this Atom
     * @see {@link module:Atoms.Atom#setValidationResult setValidationResult()}
     */
    applyValidationMessage ( message ) {
        const possibilities = message.getAllFeedback()
        // If it has only an undeclared variable error don't change the validation
        // result as there might have been a prior result that we need to keep.
        if ( possibilities.length == 1 && 
             possibilities[0].code == 'undeclared variable' ) return
        // Drop scoping errors about undeclared variables
        const applicable = possibilities.filter(
            item => item.code != 'undeclared variable' )
        // Apply first remaining result
        this.setValidationResult( applicable[0]?.result, applicable[0]?.reason )
    }

    /**
     * One can construct an instance of the Atom class to interface with an
     * element in the editor only if that element actually represents an atom,
     * as defined in {@link module:Atoms the documentation for the Atoms
     * module}.  This function checks to see if the element in question does.
     * To create elements that do represent atoms, see
     * {@link module:Atoms.Atom.createElement createElement()}.
     * 
     * @param {HTMLElement} element - the element to check
     * @returns {boolean} whether the element represents an atom
     * @see {@link module:Atoms.Atom.createElement createElement()}
     * @see {@link module:Atoms.Atom.findAbove findAbove()}
     */
    static isAtomElement ( element ) {
        return ( element.tagName == 'DIV' || element.tagName == 'SPAN' )
            && element.classList.contains( className )
    }

    /**
     * When a mouse event takes place in the document, it is useful to be able
     * to check whether it happened inside an element representing an atom.  So
     * this function can take any DOM node and walk up its ancestor chain and
     * find whether any element in that chain represents an atom.  If so, it
     * returns the corresponding Atom instance.  If not, it returns null.
     * 
     * @param {Node} node - the DOM node from which to begin searching
     * @param {tinymce.Editor} editor - the editor in which the node sits
     * @returns {Atom?} the nearest Atom enclosing the given `node`
     * @see {@link module:Atoms.Atom.isAtomElement isAtomElement()}
     */
    static findAbove ( node, editor ) {
        for ( let walk = node ; walk ; walk = walk.parentNode )
            if ( Atom.isAtomElement( walk ) )
                return Atom.from( walk, editor )
        return null
    }

    /**
     * If this atom is contained inside another atom, then the innermost such
     * atom is this one's "parent."  This function returns that parent, if any,
     * and null otherwise.
     * 
     * @returns {Atom?} the Atom that is the parent of this Atom, if any
     */
    parent () {
        if ( !this.element.parentNode ) return null
        return Atom.findAbove( this.element.parentNode, this.editor )
    }

    /**
     * Create an HTMLElement that can be placed into the given `editor` and that
     * represents an inline or block-type atom, as specified by the second
     * parameter.  The element will be given an HTML/CSS class that marks it as
     * representing an atom, and will be marked uneditable so that TinyMCE will
     * not allow the user to alter it directly.
     * 
     * @param {tinymce.Editor} editor - the TinyMCE editor in which to create
     *   the element
     * @param {string} tagName - the tag to use, `"span"` for inline atoms or
     *   `"div"` for block-type atoms (which is the default)
     * @returns {HTMLElement} the element constructed
     * @see {@link module:Atoms.Atom.create create()}
     * @see {@link module:Atoms.Atom.newInline newInline()}
     * @see {@link module:Atoms.Atom.newBlock newBlock()}
     */
    static createElement ( editor, tagName = 'div' ) {
        if ( tagName.toLowerCase() != 'div' && tagName.toLowerCase() != 'span' )
            throw new Error( 'Invalid tag name for atom element: ' + tagName )
        const result = editor.contentDocument.createElement( tagName )
        result.classList.add( className )
        result.setAttribute( 'contenteditable', false )
        return result
    }

    /**
     * Create a new atom element, as in {@link module:Atoms.Atom.createElement
     * createElement()}, then fill its body with the given content, optionally
     * set one or more metadata key-value pairs, and return an Atom instance
     * corresponding to the new element.  Note that this does not insert the
     * element anywhere into the editor.
     * 
     * @param {tinymce.Editor} editor - the TinyMCE editor in which to create
     *   the element
     * @param {string} tagName - the tag to use, `"span"` for inline atoms or
     *   `"div"` for block-type atoms (which is the default)
     * @param {string} content - the HTML code to use for filling the body of
     *   the newly created atom
     * @param {Object} metadata - a dictionary of key-value pairs to store in
     *   the metadata of the newly created atom (defaults to the empty object
     *   `{ }`, meaning not to add any metadata)
     * @returns {Atom} the Atom instance corresponding to the newly created
     *   atom element
     * @see {@link module:Atoms.Atom.createElement createElement()}
     * @see {@link module:Atoms.Atom.newInline newInline()}
     * @see {@link module:Atoms.Atom.newBlock newBlock()}
     */
    static create ( editor, tagName, content, metadata = { } ) {
        // Create a plain atom so we can manipulate it
        const result = new Atom( Atom.createElement( editor, tagName ), editor )
        result.fillChild( 'body', content )
        Object.keys( metadata ).forEach( key =>
            result.setMetadata( key, metadata[key] ) )
        // Now in case its type changed, recreate with the right subclass
        return Atom.from( result.element, editor )
    }

    /**
     * A convenience function that calls {@link module:Atoms.Atom.create
     * create()} for you, but uses the tag `"span"` to make an inline element.
     * This makes the client's code more clear, because it specifies that we are
     * creating a new *inline* atom.
     * 
     * @param {tinymce.Editor} editor - same as in
     *   {@link module:Atoms.Atom.create create()}
     * @param {string} content - same as in
     *   {@link module:Atoms.Atom.create create()}
     * @param {Object} metadata - same as in
     *   {@link module:Atoms.Atom.create create()}
     * @returns {Atom} same as in {@link module:Atoms.Atom.create create()}
     * @see {@link module:Atoms.Atom.create create()}
     * @see {@link module:Atoms.Atom.createElement createElement()}
     * @see {@link module:Atoms.Atom.newBlock newBlock()}
     */
    static newInline ( editor, content, metadata = { } ) {
        return Atom.create( editor, 'span', content, metadata )
    }

    /**
     * A convenience function that calls {@link module:Atoms.Atom.create
     * create()} for you, but uses the tag `"div"` to make an inline element.
     * This makes the client's code more clear, because it specifies that we are
     * creating a new *block-type* atom.
     * 
     * @param {tinymce.Editor} editor - same as in
     *   {@link module:Atoms.Atom.create create()}
     * @param {string} content - same as in
     *   {@link module:Atoms.Atom.create create()}
     * @param {Object} metadata - same as in
     *   {@link module:Atoms.Atom.create create()}
     * @returns {Atom} same as in {@link module:Atoms.Atom.create create()}
     * @see {@link module:Atoms.Atom.create create()}
     * @see {@link module:Atoms.Atom.createElement createElement()}
     * @see {@link module:Atoms.Atom.newInline newInline()}
     */
    static newBlock ( editor, content, metadata = { } ) {
        return Atom.create( editor, 'div', content, metadata )
    }

    /**
     * Find all elements in the given TinyMCE editor that represent atoms, and
     * return each one in the order they appear in the document.
     * 
     * @param {tinymce.Editor} editor - the editor in which to search
     * @returns {HTMLElement[]} the array of atom elements in the editor's document
     * @see {@link module:Atoms.Atom.allIn allIn()}
     */
    static allElementsIn ( editor ) {
        return Array.from( editor.dom.doc.querySelectorAll( `.${className}` ) )
            .filter( isOnScreen )
            .filter( element => editor.dom.doc.body.contains( element ) )
    }

    /**
     * Find all elements in the given TinyMCE editor that represent atoms, and
     * return each one, transformed into an instance of the Atom class.  They
     * are returned in the order they appear in the document.
     * 
     * @param {tinymce.Editor} editor - the editor in which to search
     * @returns {Atom[]} the array of atom in the editor's document
     * @see {@link module:Atoms.Atom.allElementsIn allElementsIn()}
     */
    static allIn ( editor ) {
        return Atom.allElementsIn( editor ).map( element =>
            Atom.from( element, editor ) )
    }

    /**
     * Instead of the Atom constructor, use this function to convert an element
     * in the document into a functioning Atom instance.  The reason you should
     * use this function is because the Atom constructor always creates an Atom
     * instance, but this function may create an instance of an Atom subclass,
     * if that's what the element represents.  Thus the resulting object will
     * have more specialized functionality suitable to the type of atom in
     * question.  This behavior is powered by the registration of Atom
     * subclasses using {@link module:Atoms.Atom.registerSubclass
     * registerSubclass()}.
     * 
     * @param {HTMLElement} element - an element that has passed the check in
     *   {@link module:Atoms.Atom.isAtomElement isAtomElement()}
     * @param {tinymce.Editor} editor - the editor in which the element sits
     * @returns {Atom} the atom represented by the element
     */
    static from ( element, editor ) {
        const className = element.dataset['metadata_type']
        const classObject = className ?
            Atom.subclasses.get( JSON.parse( className ) ) : Atom
        if ( !classObject )
            throw new Error( 'Unknown atom type: ' + className )
        return new classObject( element, editor )
    }

    /**
     * This is a placeholder implementation of this method, to be sure that all
     * Atom instances have one.  In subclasses, the function should return an
     * array of LogicConcepts that represent the meaning of this atom.  If the
     * atom has no meaning in terms of LogicConcepts, simply return an empty
     * array.  That is the default implementation.
     * 
     * @returns {LogicConcept[]} an empty array of LogicConcepts, in this
     *   default implementation
     */
    toLCs () { return [ ] }

    /**
     * This is a placeholder implementation of this method, to be sure that all
     * Atom instances have one.  In subclasses, the function should update the
     * visible representation of the atom in the document based on the attributes
     * stored in its metadata.  The default implementation does nothing.
     */
    update () { }

    /**
     * The default context menu for an atom is just the context menu for its
     * parent atom, if any, or the empty array otherwise.  This makes it easy to
     * include the context menu for all ancestor atoms in any atom, by just
     * starting with the context menu of the superclass and then adding items.
     * 
     * @param {Atom} forThis - the atom that received the right-click action that
     *   led to the creation of the context menu
     */
    contextMenu ( forThis ) {
        return this.parent()?.contextMenu( forThis ) || [ ]
    }

    /**
     * When embedding a copy of the Lurch app in a larger page, users will want
     * to write simple HTML describing a Lurch document, then have a script
     * create a copy of the Lurch app and put that document into it.  This
     * function can convert any HTML, including HTML that has atom elements in
     * it, into that simplified HTML that is more human-readable, yet still
     * describes a Lurch document.
     * 
     * @returns {string} the representation of the atom as a `lurch` element
     */
    static simplifiedHTML ( node ) {
        const editor = editorForNode( node )
        if ( Atom.isAtomElement( node ) ) {
            const atom = Atom.from( node, editor )
            return atom.toEmbed()
        }
        if ( !node.outerHTML ) return node.textContent
        if ( node.childNodes.length == 0 ) return node.outerHTML
        const copy = node.cloneNode( true )
        copy.innerHTML = ''
        const bothTags = copy.outerHTML
        const startOfClose = bothTags.indexOf( '><' ) + 1
        const openTag = bothTags.substring( 0, startOfClose )
        const closeTag = bothTags.substring( startOfClose )
        return openTag
            + Array.from( node.childNodes ).map(
                child => Atom.simplifiedHTML( child ) ).join( '' )
            + closeTag
    }

    /**
     * Traverse a DOM tree and convert any simplified HTML elements in it into
     * HTML elements that represent atoms (or shells).  For example, an HTML
     * element of the form `<latex>...</latex>` will be replaced with the full
     * HTML code for a {@link ExpositorMath} atom as it sits in a Lurch
     * application's document.
     * 
     * @param {Node} node - the DOM node to use as the root of the traversal;
     *   it is modified in-place
     * @param {tinymce.Editor} editor - the editor in which the modified DOM
     *   will eventually be placed or copied
     */
    static unsimplifyDOM ( node, editor ) {
        // base case 1: no tag to handle, no children to recur on
        if ( node.childNodes.length == 0 || !node.tagName ) return
        // base case 2: expository math atom
        if ( node.tagName == 'LATEX' ) {
            const atom = Atom.newInline( editor, '', {
                type : 'expositorymath',
                latex : node.textContent
            } )
            atom.update()
            node.replaceWith( atom.element )
        }
        // base case 3: expression math atom
        if ( node.tagName == 'LURCH' ) {
            const atom = Atom.newInline( editor, '', {
                type : 'expression',
                lurchNotation : node.textContent
            } )
            atom.update()
            node.replaceWith( atom.element )
        }
        // recursive case 1: tag indicates a proper subclass of Shell
        const tag = node.tagName.toLowerCase()
        if ( Atom.subclasses.has( tag ) ) {
            const subclass = Atom.subclasses.get( tag )
            const shellClass = Atom.subclasses.get( 'shell' )
            if ( subclass != shellClass
              && ( subclass.prototype instanceof shellClass ) ) {
                const shell = Atom.from( shellClass.createElement( editor, tag ) )
                // if the content we'll add is block-type, then delete all
                // existing content (including the default <p> element) and add it
                if ( Array.from( node.childNodes ).some( child =>
                  tinymce.html.Schema().getBlockElements()[child.tagName] ) ) {
                    shell.element.innerHTML = ''
                    while ( node.firstChild )
                        shell.element.appendChild( node.firstChild )
                // if we're adding another kind of content, just put it inside
                // the pre-existing <p> element inside the shell
                } else if ( node.firstChild ) {
                    shell.element.firstChild.innerHTML = ''
                    while ( node.firstChild )
                        shell.element.firstChild.appendChild( node.firstChild )
                } // Otherwise, leave the default <p> element alone
                Array.from( shell.element.childNodes ).forEach(
                    child => Atom.unsimplifyDOM( child, editor ) )
                node.replaceWith( shell.element )
            }
        }
        // recursive case 2: no special tag; just recur on children
        Array.from( node.childNodes ).forEach(
            child => Atom.unsimplifyDOM( child, editor ) )
    }

    /**
     * All atoms must be able to represent themselves in LaTeX form, so that the
     * document (or a portion of it) can be exporeted for use in a LaTeX editor,
     * such as Overleaf.  The default implementation, defined here in the Atom
     * class, is to return a string of the form `"(Lurch X)"`, where `X` is the
     * type of the atom.  For example, `"(Lurch expression)"`.  Subclasses are
     * likely to override this with something more suitable and useful in a
     * LaTeX document.
     * 
     * @returns {string} default LaTeX representation of the atom
     */
    toLatex () { return `(Lurch ${this.getMetadata( 'type' )})` }

}

/**
 * This function should be called in the editor's setup routine.  It installs a
 * single mouse event handler into the editor that can watch for click events to
 * any atom, and route control flow to the event handler for that atom's type.
 * It also installs a keydown event handler that watches for the Enter key
 * being pressed on an atom, and routes control flow to the event handler for
 * that atom's type.
 * 
 * Second, it installs an event handler that calls every atom's update handler
 * whenever the editor's content changes.  This could be slow if there are many
 * atoms in the document, and therefore we use the
 * {@link module:Utilities.forEachWithTimeout forEachWithTimeout()} function to
 * let these handlers run only when the UI is idle.  We have found this to be
 * necessary, because some atoms (especially those whose representation is
 * generated from MathLive) are not always typeset correctly the first time that
 * their HTML is placed into the atom.  For some reason, the stylesheet does not
 * seem to apply correctly until the *second* insertion of the typeset HTML.
 * 
 * Finally, it installs a context menu function that may create a custom context
 * menu if the user right-clicks on an atom in the document.
 * 
 * @param {tinymce.Editor} editor - the editor in which to install the event
 *   handlers
 * @function
 */
export const install = editor => {
    // Expose this class publicly through the editor, for use in debugging at
    // the console, and for use in the CLI through Puppeteer.
    editor.Atom = Atom
    // Install click handler to edit the atom that was clicked
    editor.on( 'init', () =>
        editor.dom.doc.body.addEventListener( 'click', event =>
            setTimeout( () => {
                const toEdit = Atom.findAbove( event.target, editor )
                if ( toEdit?.isEditable() ) toEdit.edit()
            } ) ) )
    // Install Enter key handler for same purpose
    editor.on( 'keydown', event => {
        if ( event.key != 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey )
            return
        const selected = editor.selection.getNode()
        if ( Atom.isAtomElement( selected ) )
            setTimeout( () => {
                const toEdit = Atom.from( selected, editor )
                if ( toEdit?.isEditable() ) toEdit.edit()
            } )
    } )
    // Whenever anything changes, check to see which atoms appeared and which
    // disappeared.  New ones need to have their appearance updated, and both
    // new and deleted ones should trigger a clearing of validation feedback.
    let lastAtomElementList = [ ]
    editor.on( 'input NodeChange Paste Change Undo Redo', () => {
        // New ones need updating and trigger validation clearing, but we can't
        // do that unless MathLive has been loaded, so first ensure that:
        getConverter().then( () => {
            const thisAtomElementList = Atom.allElementsIn( editor )
            // Record which atoms were deleted and which changed but stayed
            const atomsThatWereDeleted = lastAtomElementList.filter(
                element => !thisAtomElementList.includes( element )
            ).map( element => Atom.from( element, editor ) )
            const atomsThatChanged = thisAtomElementList.filter(
                element => !lastAtomElementList.includes( element )
            ).map( element => Atom.from( element, editor ) )
            // Those that stayed should be updated, and then only after that
            // full (asynchronous) task has completed do we emit the various
            // signals for changed/deleted atoms that the validation module
            // might be listening for, to clear validation feedback
            atomsThatChanged.forEachWithTimeout(
                atom => {
                    try {
                        atom.update()
                    } catch ( e ) {
                        console.log( 'Error when updating atom', atom )
                        console.log( e )
                    }
                }
            ).then( () => {
                // Now we can notify people which atoms changed, or were deleted.
                // We do this here, not at any earlier point, so that the message
                // is sent once, not multiple times.
                atomsThatChanged.forEach( atom => atom.dataChanged() )
                atomsThatWereDeleted.forEach( atom => atom.wasDeleted() )
                // We then also indicate that atom updating has finished.
                editor.dispatch( 'atomUpdateFinished' )
            } )
            lastAtomElementList = thisAtomElementList
        } )
    } )
    // Custom context menu creator
    editor.ui.registry.addContextMenu( 'atoms', {
        update : element => {
            const atom = Atom.findAbove( element, editor )
            const items = atom ? atom.contextMenu( atom ) : [ ]
            items.forEach( item => {
                const original = item.onAction
                item.onAction = () => {
                    original()
                    editor.focus()
                }
            } )
            return items
        }
    } )
    // TinyMCE does not show cursor selection well on atoms.
    // The following code tries to rectify that by putting a special class on
    // atoms that are within the current cursor selection, so that they can be
    // styled in a way that makes it clear that they are selected.
    editor.on( 'SelectionChange', () => {
        const range = editor.selection.getRng()
        const nodeIsSelected = node => {
            const nodeRange = document.createRange()
            nodeRange.selectNode( node )
            return range.compareBoundaryPoints( Range.START_TO_START, nodeRange ) < 1
                && range.compareBoundaryPoints( Range.END_TO_END, nodeRange ) > -1
        }
        Atom.allElementsIn( editor ).forEach( element => {
            if ( nodeIsSelected( element ) )
                element.classList.add( 'atom-is-selected' )
            else
                element.classList.remove( 'atom-is-selected' )
        } )
    } )
}

export default { className, Atom, install }
