
/**
 * This module loads scripts from the MathLive library (from
 * https://cortexjs.io/mathlive/), and then creates from it several different
 * tools useful in the Lurch application.
 * 
 * First, it creates the {@link MathItem} class, which can be added to
 * {@link Dialog} instances as an input component containing an equation editor.
 * (Note that I say "equation editor" here because that is common parlance, but
 * of course one can use it for many types of mathematical expressions, not just
 * equations.)
 * 
 * Second, it creates a function for converting among various math notation
 * formats.  See {@link module:MathLive.getConverter getConverter()} for
 * details.
 * 
 * @module MathLive
 */

import { loadScript } from './utilities.js'
import { lurchToLatex, latexToLurch, lurchToPutdown } from './parsers/index.js'

// Internal use only.
// Ensures the MathLive scripts are loaded, so you can do whatever you want with
// the stuff they install in the global (window) object thereafter.
const loadMathFieldClass = () => new Promise( ( resolve, reject ) => {
    // loadScript( 'https://unpkg.com/mathlive@0.100.0' ).then( () => {
    //     loadScript( 'https://unpkg.com/@cortex-js/compute-engine@0.24.1' ).then( () => {
    loadScript( '../lde/dependencies/mathlive/mathlive.min.js' ).then( () => {
        loadScript( '../lde/dependencies/mathlive/compute-engine.min.js' ).then( () => {
            const tryToResolve = () => {
                if ( window.MathfieldElement ) {
                    resolve()
                } else {
                    setTimeout( tryToResolve, 100 )
                }
            }
            tryToResolve()
        } )
    } )
} )

/**
 * We store here the URL to the MathLive CSS stylesheet, so that we can define
 * it in only one location and others can reference it from here.
 * 
 * @type {string}
 */
export const stylesheet = '../lde/dependencies/mathlive/mathlive-static.css'

/**
 * An item that can be used in a {@link Dialog} and shows up as an equation
 * editor powered by a MathLive math editing component.
 */
export class MathItem {

    /**
     * Construct a MathLive editing component.
     * 
     * Once the component has been shown on screen and a MathLiveEditor instance
     * placed into it, the member function `finishSetup()` will be called.  If
     * you have particular setup code that should be done at that point, feel
     * free to override that method in any instance you create.  At that time,
     * the MathLiveEditor instance will be in the field `this.mathLiveEditor`.
     * 
     * @param {string} name - the name of the control in the dialog, used for
     *   querying its value when the dialog closes, or providing an initial
     *   value when the dialog opens
     * @param {string} label - the label to show next to the math ediitor in the
     *   user interface
     */
    constructor ( name, label ) {
        this.name = name
        this.label = label
        this.setupInitiated = false
        this.mathLiveEditor = null
        this.mathValue = null
        this.focusWhenShown = false
    }

    /**
     * Whether to focus this item once it has loaded.  Defaults to `false`, so
     * as to not interfere with the usual focus mechanics of the {@link Dialog}
     * class.  However, because this component is a unique one, the normal focus
     * mechanics will not work for it, so you should call this function to
     * override them if you want this item to receive focus once it has been
     * installed into the dialog.
     * 
     * @param {boolean} value - whether to focus this item once it appears
     */
    setFocusWhenShown ( value ) { this.focusWhenShown = value }

    // internal use only; creates the JSON to represent this object to TinyMCE
    // (actually, it creates an HTML element that will LATER be populated
    // programmatically with a MathLive editor)
    json () {
        return [
            {
                type : 'htmlpanel',
                html : `
                    <label class='tox-label'>${this.label}</label>
                    <div id='math-${this.name}'>Loading editor...</div>
                `
            }
        ]
    }

    // Internal use only.
    // Stores the current value of the MathLive editor, as a LaTeX string,
    // because once the editor is closed, you can't get this value back.  So we
    // need to store it somewhere for retrieval even after the editor closes.
    saveValue () {
        if ( this.mathValue != this.mathLiveEditor?.value ) {
            this.mathValue = this.mathLiveEditor?.value
            this.dialog.onChange?.( this.dialog, this )
        }
    }
    // Internal use only; how to fetch the value stored by saveValue().
    savedValue () { return this.mathValue }

    /**
     * Set the current contents of the editor to the expression represented in
     * the given LaTeX content.
     * 
     * @param {string} value - LaTeX content to be put into the MathLive editor
     */
    setValue ( value ) {
        this.mathLiveEditor.value = value
        this.saveValue()
    }

    // Called whenever the dialog is shown (or, if this item is inside a tab,
    // whenever that tab is shown).  This is what initializes the MathLive
    // editor into the DIV created by the `json()` method, and installs an
    // event handler that calls saveValue() whenever an edit takes place.
    onShow () {
        if ( this.setupInitiated ) return
        this.setupInitiated = true
        loadMathFieldClass().then( () => {
            document.body.style.setProperty( '--keyboard-zindex', '2000' )
            this.mathLiveEditor = new MathfieldElement()
            this.mathLiveEditor.value = this.dialog.json.initialData[this.name] || ''
            this.mathLiveEditor.style.width = '100%'
            this.mathLiveEditor.style.border = 'solid 1px #cccccc'
            const insertHere = document.getElementById( `math-${this.name}` )
            while ( insertHere.firstChild )
                insertHere.removeChild( insertHere.firstChild )
            insertHere.appendChild( this.mathLiveEditor )
            delete this.mathLiveEditor.shadowRoot.querySelector(
                '.ML__virtual-keyboard-toggle' ).dataset['ml__tooltip']
            this.saveValue()
            this.mathLiveEditor.addEventListener( 'input',
                () => this.saveValue() )
            if ( this.focusWhenShown )
                this.mathLiveEditor.focus()
            this.finishSetup?.()
        } )
    }

    /**
     * Get the saved value of the equation editor, as a LaTeX string.
     * 
     * @param {string} key - the key whose value should be looked up
     * @returns {string?} the value associated with the given key, if the key
     *   is the one that this item is in charge of editing, or undefined
     *   otherwise
     */
    get ( key ) { if ( key == this.name ) return this.savedValue() }

}

// Internal use only.
// MathJSON is a format invented by the author of MathLive, and documented here:
// https://cortexjs.io/math-json/
// 
// This function converts the given MathJSON structure to putdown notation.
// It is not exported by this module.  Instead, to be able to use it, you should
// asynchronously construct a converter object using getConverter(), below.
const mathJSONToPutdown = json => {
    // MathJSON numbers come in 3 formats:
    // 1. plain numbers
    if ( !isNaN( json ) ) return `${json}`
    // 2. object literals with a "num" field
    if ( json.num ) return `${json.num}`
    // 3. a string starting with +, -, or a digit 0-9
    if ( ( typeof( json ) == 'string' ) && '+-0123456789'.includes( json[0] ) )
        return json
    // MathJSON strings come in 2 formats:
    // 1. a string with a leading and trailing apostrophe
    if ( ( typeof( json ) == 'string' )
      && ( json[0] == '\'' ) && ( json[json.length - 1] == '\'' ) )
        return JSON.stringify( json.slice( 1, -1 ).replace( /\\'/g, "'" ) )
    // 2. object literals with a "str" field
    if ( json.str ) return JSON.stringify( json.str )
    // MathJSON symbols come in 2 formats:
    // 1. a string that doesn't match the format for strings given above
    if ( typeof( json ) == 'string' ) return json
    // 2. an object literal with a "sym" field
    if ( json.sym ) return json.sym
    // MathJSON function applications come in 3 formats:
    // 1. a JavaScript array
    if ( json instanceof Array )
        return '(' + json.map( mathJSONToPutdown ).join( ' ' ) + ')'
    // 2. object literals with a "fn" field
    if ( json.fn )
        return '(' + json.fn.map( mathJSONToPutdown ).join( ' ' ) + ')'
    // MathJSON also supports dictionaries, but putdown does not.
    // So every other kind of MathJSON object just gets called "unsupported":
    return `(unsupported_MathJSON ${JSON.stringify( json )})`
}

/**
 * An array of names of all the input formats known by the converter defined in
 * {@link module:MathLive.getConverter getConverter()}.
 */
export const inputFormats = [ 'latex', 'mathjson', 'lurch' ]

/**
 * An array of names of all the output formats known by the converter defined in
 * {@link module:MathLive.getConverter getConverter()}.
 */
export const outputFormats = [ 'html', 'putdown', ...inputFormats ]

// Internal use only
// LaTeX commands not parseable by MathLive, but that we need to have parsed.
// This string is used later to convert all such commands in to plain \text{...}
// blocks, so that they go through the MathLive parser, and we can manipulate
// them after the JSON/putdown/LC form has been created.
const unsupportedLatexCommands = `forall exists`

// Internal use only
// Clean up LaTeX to make it suitable for MathLive, which is limited.
const prepLatexForMathLive = latex => {
    // Handle unnecessary brackets around symbols:
    // (These can cause spacing problems in some cases.)
    latex = latex.replace( /[{](\w)[}]/g, ' $1 ' )
    // Replace bbbold font with MathLive-specific symbols for special sets:
    latex = latex.replace( /\\mathbb\s+Q/g, '\\Q' )
                 .replace( /\\mathbb\s+R/g, '\\R' )
                 .replace( /\\mathbb\s+C/g, '\\C' )
                 .replace( /\\mathbb\s+Z/g, '\\Z' )
                 .replace( /\\mathbb\s+N/g, '\\N' )
    // Remove matched \\left. ... \\right. pairs, which MathLive doesn't like:
    let original = latex
    latex = ''
    while ( original.length > 0 ) {
        const pos = original.indexOf( '\\left.' )
        if ( pos == -1 ) {
            latex += original
            original = ''
        } else {
            const partner = original.indexOf( '\\right', pos )
            if ( partner == -1 ) {
                latex += original
                original = ''
            } else if ( original.slice( partner, partner + 7 ) == '\\right.' ) {
                latex += original.slice( 0, pos )
                         + original.slice( pos + 6, partner )
                original = original.slice( partner + 7 )
            } else {
                latex += original.slice( 0, pos + 6 )
                original = original.slice( pos + 6 )
            }
        }
    }
    // Done
    return latex
}

/**
 * A converter is a function with the following signature:
 * `convert( data, 'input format', 'output format' )`.
 * For example, to convert some $\LaTeX$ code to putdown, you might do the
 * following.
 * 
 * ```js
 * getConverter().then( convert => {
 *     const putdown = convert( someLaTeXString, 'latex', 'putdown' )
 *     console.log( putdown )
 * } )
 * ```
 * 
 * Thre are five formats that this function knows about.  Two are output-only
 * formats: `'html'` and `'putdown'`.  You cannot convert from these formats
 * into any other format.  The other three are storage formats: `'latex'`,
 * `'mathjson'`, and `'lurch'`.  The formats are case-insensitive, so you
 * can write `'LaTeX'` or `'MathJSON'` instead if you like.  All of the three
 * storage formats can be converted into one another, and into any of the
 * output formats.  So the only constraint is that the output format cannot be
 * `'html'` or `'putdown'`.
 * 
 * The reason that this function is asynchronous is because some of those
 * conversion functions can be run only once MathLive has been loaded, and so
 * this function ensures that has happened before returning to you a converter
 * instance.  That way, the instance you receive is guaranteed to work
 * immediately, and all of its methods can be synchronous.  Note that many of
 * the conversion functions are built into MathLive, and I'm simply making them
 * available here and connecting them in all the transitive ways the user might
 * need them.
 * 
 * @returns {Promise} a promise that resolves to a function that behaves as above
 * @function
 */
export const getConverter = () => loadMathFieldClass().then( () => {
    // Define the function here that we will return, so that we have a name to
    // us inside of it for recursive calls.
    const convert = ( data, inputFormat, outputFormat ) => {
        // Ensure that .json doesn't convert 1/2 to "Half"
        MathfieldElement.computeEngine.jsonSerializationOptions.exclude = [ 'Half' ]
        window.MathfieldElement = MathfieldElement
        // (Tried to put that code outside the function but it was too soon; not sure why.)
        inputFormat = inputFormat.toLowerCase()
        outputFormat = outputFormat.toLowerCase()
        if ( !inputFormats.includes( inputFormat ) )
            throw new Error( `Invalid input format: ${inputFormat}` )
        if ( !outputFormats.includes( outputFormat ) )
            throw new Error( `Invalid output format: ${outputFormat}` )
        // handle trivial case
        if ( inputFormat == outputFormat )
            return data
        // handle all other cases
        switch ( `${inputFormat} ${outputFormat}` ) {
            case 'latex putdown':
                return convert( convert( data, 'latex', 'lurch' ),
                    'lurch', 'putdown' )
            case 'latex html':
                return MathLive.convertLatexToMarkup( data )
            case 'latex mathjson':
                unsupportedLatexCommands.trim().split( /\s+/ )
                .forEach( latexCommand =>
                    data = data.replace(
                        RegExp( '\\\\'+latexCommand+'\\b', 'g' ),
                        `\\text{${latexCommand}}` ) )
                data = prepLatexForMathLive( data )
                return MathfieldElement.computeEngine.parse(
                    data, { canonical: false } ).json
            case 'latex lurch':
                return latexToLurch( data )
            case 'mathjson latex':
                return MathLive.serializeMathJsonToLatex( data )
            case 'mathjson html':
                return convert( convert( data, 'mathjson', 'latex' ),
                    'latex', 'putdown' )
            case 'mathjson putdown':
                return mathJSONToPutdown( data )
            case 'mathjson lurch':
                return convert( convert( data, 'mathjson', 'latex' ),
                    'latex', 'lurch' )
            case 'lurch latex':
                return lurchToLatex( data )
            case 'lurch html':
                return convert( convert( data, 'lurch', 'latex' ),
                    'latex', 'html' )
            case 'lurch putdown':
                return lurchToPutdown( data )
            case 'lurch mathjson':
                return convert( convert( data, 'lurch', 'latex' ),
                    'latex', 'mathjson' )
            default: throw new Error(
                `Unsupported conversion: ${inputFormat} -> ${outputFormat}` )
        }
    }
    // Return the function we just built.
    return convert
} )
