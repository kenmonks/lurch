
import { Atom, className as atomClassName } from './atoms.js'
import { Shell } from './shells.js'
import { getHeader } from './header-editor.js'
import { Environment } from './lde-cdn.js'
import { isOnScreen } from './utilities.js'
import { lookup } from './document-settings.js'
import { tokenize } from '../lde/src/experimental/parsers/tokenizer.js'

// Internal use only
// Maps a Shell's `type` metadata (i.e., the name under which its subclass
// was registered with Atom.registerSubclass()) to the Lurch Notation
// keyword that, placed before a `{ ... }` environment, reproduces the same
// meaning that shell's finalize() gives it (see shells.js).  A value of
// `null` means a plain, unmarked environment is enough.  Shell types absent
// from this table (e.g. Recall, Preview) have no Lurch Notation keyword; see
// shellFallbackPutdown() below for how those are handled instead.
const shellKeywords = {
    shell : null,
    subproof : null,
    premise : ':',
    proof : 'proof:',
    rule : 'rule:',
    definition : 'definition:',
    axiom : 'axiom:',
    theorem : 'theorem:',
    lemma : 'lemma:',
    corollary : 'corollary:'
}

// Internal use only
// A minimal echo of the recursive shell/atom-array walk in
// Message.document()'s documentLC(), but building plain LogicConcept
// children (no IDs, no feedback messages) instead, for use only by
// shellFallbackPutdown() below, when a shell has no Lurch Notation keyword
// and so must be rendered as raw putdown instead.
const buildFallbackChildren = ( array, context ) => {
    while ( array.length > 0 ) {
        const head = array.shift()
        if ( !( head instanceof Shell ) ) {
            let LCs
            try { LCs = head.toLCs() } catch ( e ) { LCs = [ ] }
            LCs.forEach( LC => context.pushChild( LC ) )
            continue
        }
        const after = array.findIndex( entry => !head.element.contains( entry.element ) )
        const inside = after == -1 ? array.splice( 0 ) : array.splice( 0, after )
        const headLCs = head.toLCs()
        if ( headLCs.length != 1 ) continue
        const innerContext = headLCs[0]
        buildFallbackChildren( inside, innerContext )
        head.finalize( innerContext )
        context.pushChild( innerContext )
    }
}

// Internal use only
// Compute the putdown notation for a shell (and its contents) that has no
// Lurch Notation keyword of its own, for embedding via the grammar's
// «...» raw-putdown escape.  See buildFallbackChildren() above.
const shellFallbackPutdown = ( head, inside ) => {
    const headLCs = head.toLCs()
    if ( headLCs.length != 1 )
        throw new Error( `${head.getMetadata( 'type' )} must represent exactly one LC` )
    const shellLC = headLCs[0]
    buildFallbackChildren( inside, shellLC )
    head.finalize( shellLC )
    return shellLC.toPutdown()
}

// Internal use only
// The Lurch Notation for one non-shell atom, or the empty string if the
// atom has no meaning of its own (e.g., expository text) or fails to parse
// (in which case it is silently omitted, just as Message.document() omits
// unparsable atoms from the putdown it builds).  Atom notation is written
// by the user in "set mode" (enableSets:true), under which `{...}` always
// means a set or set-builder expression; pre-tokenizing it here, before it
// is spliced into the reassembled document text (which is meant to be
// parsed in the default mode), rewrites any such `{`/`}` into the
// fullwidth `｛`/`｝` the grammar also accepts for sets in every mode, so the
// meaning survives being tokenized again, in the default mode, later.
const lurchNotationForAtom = head => {
    let LCs
    try { LCs = head.toLCs() } catch ( e ) { return '' }
    if ( LCs.length == 0 ) return ''
    const raw = head.getMetadata( 'lurchNotation' )
    return typeof raw == 'string' ? tokenize( raw, { enableSets : true } ) : ''
}

// Internal use only
// Indent every line of the given text by one more level (two spaces), so
// that nesting an already-indented block inside another environment just
// means indenting the whole block again - no depth bookkeeping needed.
const indent = text => text.split( '\n' ).map( line => `  ${line}` ).join( '\n' )

// Internal use only
// Wrap the given (already fully-assembled) inner text in a `{ }`
// environment, on its own lines and indented, with the given keyword (if
// any) in front - or just `{ }` if the inner text is empty.
const wrapEnvironment = ( keyword, innerText ) => {
    const prefix = keyword ? `${keyword} ` : ''
    return innerText ? `${prefix}{\n${indent( innerText )}\n}` : `${prefix}{ }`
}

// Internal use only
// The recursive heart of Message.documentInLurchNotation(); see its
// documentation for the overall approach.  Consumes (shift()s/splice()s)
// the array passed to it, just as documentLC() does in Message.document().
const lurchNotationFor = array => {
    const pieces = [ ]
    while ( array.length > 0 ) {
        const head = array.shift()
        if ( !( head instanceof Shell ) ) {
            const text = lurchNotationForAtom( head )
            if ( text ) pieces.push( text )
            continue
        }
        const after = array.findIndex( entry => !head.element.contains( entry.element ) )
        const inside = after == -1 ? array.splice( 0 ) : array.splice( 0, after )
        const type = head.getMetadata( 'type' )
        // Previews are read-only display copies of a dependency's content;
        // they have no meaning of their own, so they contribute nothing.
        if ( type == 'preview' ) continue
        const keyword = shellKeywords[type]
        if ( keyword !== undefined ) {
            pieces.push( wrapEnvironment( keyword, lurchNotationFor( inside ) ) )
        } else {
            // No Lurch Notation keyword reproduces this shell's meaning
            // (e.g., Recall), or it is a shell type this function does not
            // recognize; fall back to embedding its putdown form directly.
            try {
                pieces.push( `«${shellFallbackPutdown( head, inside )}»` )
            } catch ( e ) {
                pieces.push( `// [Could not export ${type || 'this'} environment: ${e.message}]` )
            }
        }
    }
    // A bare newline is not always a safe separator: the grammar's
    // precedence climbing for chains and n-ary arithmetic operators (+, -,
    // ...) does not stop at atom boundaries, only at tokens it cannot
    // extend a parse with.  E.g. two sibling atoms "x+(-x)=0" and
    // "-x+x=0" would otherwise be reparsed as one continued chain,
    // silently merging two separate claims into one.  A `//` comment is
    // dropped by the printer (see ast-to-putdown.js's 'linecomment' case)
    // and so is invisible in the result, but still forces the grammar to
    // end the previous LC, so it is inserted between every pair of
    // sibling pieces to prevent that - EXCEPT when the preceding piece
    // ends in a comma, since a comma is how the user spreads one
    // Given/Let/ForSome list (e.g. "Suppose A, B, C") or one transitive
    // chain across several atoms for readability, each atom on its own
    // being an incomplete fragment (see processShorthands()'s `<comma`
    // and `given>` handling in parsing.js); a `//` there would prevent
    // the grammar from reassembling that list at all.
    return pieces.reduce( ( text, piece, i ) => {
        if ( i == 0 ) return piece
        const continues = pieces[i - 1].trimEnd().endsWith( ',' )
        return text + ( continues ? '\n' : '\n//\n' ) + piece
    }, '' )
}

/**
 * This class simplifies communication between the main thread and worker
 * threads by encapsulating their communication protocol into a single class
 * that can be used on both ends of the channel.
 * 
 * To send a message to a worker, create an instance of this class and then call
 * `message.send( worker )`.  To send a message from a worker, create an
 * instance and call `message.send()` (which therefore just goes "out").  In the
 * message event handler on either end, you can construct a new `Message`
 * instance from the event itself, and its data will be extracted appropriately.
 * For example, the {@link module:ValidationWorker validation worker} has code
 * something like this:
 * 
 * ```js
 * addEventListener( 'message', event => {
 *     const message = new Message( event )
 *     if ( message.is( 'putdown' ) ) { // check type
 *         const putdown = message.get( 'putdown' ) // read message content
 *         // validate document sent in putdown format
 *     } else {
 *         // send error message because we expected putdown
 *     }
 * } )
 * ```
 * 
 * Having one class that's imported into both the main thread and the worker
 * means not dividing the communication protocol code over multiple files, and
 * thus improving consistency and reducing chances of logic errors.
 * 
 * There are also some static members that make certain message-sending
 * operations more concise and readable; see below.
 */
export class Message {

    /**
     * Construct a new message instance with the given content.  The `content`
     * may be any of the following:
     * 
     *  * An `Event` instance, as shown in the example at the top of this class
     *    documentation.  In that case, the `data` attribute of the event will
     *    be stored as the `content` attribute of the new `Message` instance,
     *    because `event.data` is where user-specific information is stored for
     *    message events.
     *  * A string, which will be interpreted as the text of the message, and
     *    thus the newly created instance will have as its `content` field an
     *    object with just a `text` field, this string.
     *  * An object, which will be used directly as the newly created instance's
     *    `content` field.
     * 
     * Any other kind of `content` throws an error.
     * 
     * @param {Object|string} content - the content of the message, as described
     *   above
     */
    constructor ( content ) {
        this.content = content instanceof Event ? content.data : content
        if ( content instanceof Event ) {
            this.content = content.data
        } else if ( typeof( content ) == 'string' ) {
            this.content = { text : content }
        } else if ( content instanceof Object ) {
            this.content = content
        } else {
            throw new Error( `Cannot create a Message from this: ${content}` )
        }
        if ( this.is( 'feedback' ) || this.is( 'error' ) ) {
            const id = this.content.id || this.content.ancestorID
            if ( id && Message.idToElement.has( id ) )
                this.element = Message.idToElement.get( id )
        }
    }

    /**
     * The content of a message, given at construction time, may include a
     * `type` field, which should be a string, if present.  It can indicate
     * whether the message is a piece of feedback, an error, or some other type
     * of message.  Any string is permitted; there is no official list.  A
     * message is not required to have a `type` field.
     * 
     * This function tests whether this instance has the given type.  It simply
     * compares the parameter passed to the `type` field in the instance's
     * `content` field (which is undefined if absent).
     * 
     * @param {string} type - the type to test this instance against
     * @returns {boolean} whether this instance is of that type
     */
    is ( type ) { return this.content.type == type }

    /**
     * Because a message's `content` field is an object, it can be used like a
     * dictionary of key-value pairs.  This function looks up the given key in
     * the `content` member.  It is just a more readable/convenient version of
     * `message.content["key"]`.
     * 
     * There is no corresponding setter function because messages are intended
     * to be lightweight, short-lived objects.  You provide their content when
     * instantiating them, then you send them somewhere or react to them, and
     * then let them be garbage collected.
     * 
     * @param {string} key - the key whose value should be looked up
     * @returns {*} the corresponding value (or undefined if the key is absent)
     */
    get ( key ) { return this.content[key] }

    /**
     * Send this message to a worker or to the main thread.  If you provide a
     * target, we will attempt to send the message there, so if you are using a
     * Message in the main thread and want to send it to a worker, call
     * `message.send( worker )`.  If you do not provide a target, we will
     * attempt to send the message to the main thread.  So workers can just call
     * `message.send()`.
     * 
     * Note that there are also static members of this class for sending common
     * types of messages that let you write slightly more compact and readable
     * code than constructing and sending a message in one line of code.
     * 
     * @param {Worker?} target - the worker to which to send the message, if any
     */
    send ( target ) {
        if ( target ) {
            target.postMessage( this.content )
        } else {
            postMessage( this.content )
        }
    }

    /**
     * A message may contain two types of feedback that need to be displayed to
     * the user: either explicit feedback generated by the deductive engine or
     * an error message indicating that something went wrong internally, which
     * will explain to the user why they didn't get any other feedback.  This
     * function returns all the feedback messages in this object, if any,
     * including treating an error as a single feedback message.
     * 
     * Each entry in the resulting array is created by passing primitive
     * feedback that the LDE generated through the function
     * {@link Message.makeFeedbackPresentable makeFeedbackPresentable()}.  See
     * the documentation for that function to see what the format will be.
     * 
     * @returns {Object[]} array of data for validation feedback, as defined
     *   above
     * @see {@link Message.makeFeedbackPresentable makeFeedbackPresentable()}
     */
    getAllFeedback () {
        if ( this.is( 'error' ) )
            return [ Message.makeFeedbackPresentable( {
                type : 'error',
                result : 'error',
                reason : this.get( 'reason' )
            } ) ]
        if ( this.is( 'feedback' ) )
            return this.get( 'results' ).map( Message.makeFeedbackPresentable )
        return [ ]
    }

    /**
     * This function is intended for use in workers, to communicate back to the
     * main thread.  It constructs a message instance, gives it the type
     * `"feedback"`, also includes all of the fields in the parameter provided,
     * and sends that message back to the main thread.
     * 
     * This can be done in one line of code without this convenience function,
     * but using this method makes the code more concise and readable.
     * 
     * @param {Object} data - any type of data to include in the feedback
     *   message
     */
    static feedback ( data ) {
        new Message( { type : 'feedback', ...data } ).send()
    }

    /**
     * This function is intended for use in workers, to communicate back to the
     * main thread.  It constructs a message instance, gives it the type
     * `"progress"`, and says what percentage of the total progress of
     * validation has been accomplished, as an integer in the set
     * $\{0,1,...,99,100\}$.
     * 
     * This can be done in one line of code without this convenience function,
     * but using this method makes the code more concise and readable.
     * 
     * @param {integer} complete - the progress value, from 0 to 100 inclusive
     */
    static progress ( complete ) {
        new Message( { type : 'progress', complete } ).send()
    }

    /**
     * This function is intended for use in workers, to communicate back to the
     * main thread.  It constructs a message instance, gives it the type
     * `"done"`, and sends that message back to the main thread.
     * 
     * This can be done in one line of code without this convenience function,
     * but using this method makes the code more concise and readable.
     */
    static done () {
        new Message( { type : 'done' } ).send()
    }

    /**
     * This function is intended for use in workers, to communicate back to the
     * main thread.  It constructs a message instance, gives it the type
     * `"error"`, sets its text field to the parameter given, and sends that
     * message back to the main thread.  If the second parameter is provided,
     * all of its fields are also included in the message's content.
     * 
     * This can be done in one line of code without this convenience function,
     * but using this method makes the code more concise and readable.
     * 
     * @param {string} text - the contents of the error message
     * @param {Object?} more - any other key-value pairs to be included in the
     *   message's content (optional)
     */
    static error ( text, more = { } ) {
        new Message( { type : 'error', text, ...more } ).send()
    }

    // Internal use only
    // Mapping for the most recent call to Message.document(), mapping IDs
    // generated by that call to the in-editor elements they were attached to.
    static idToElement = new Map()

    /**
     * Convert the document inside the given editor into a serialized form and
     * encapsulate it into a single Message instance, for transmitting to the
     * {@link module:ValidationWorker validation worker}.  Such a message, when
     * received by the worker, is viewed as a command to begin validating the
     * document, and sending feedback messages for all of its parts that are
     * amenable to validation.
     * 
     * The primary client of this function is the {@link module:Validation.run
     * run()} function in the {@link module:Validation validation module}.  You
     * probably do not need to call this function if you are using that one.
     * 
     * @param {tinymce.editor} editor - the editor containing the document to be
     *   converted
     * @param {string} encoding - the name of the encoding to use (currently
     *   supporting only "putdown" and "json" options)
     * @returns {Message} - the message that can be sent to the {@link
     *   module:ValidationWorker validation worker} to transmit the entire
     *   document, in serialized form
     */
    static document ( editor, encoding = 'json' ) {
        // Ensure that the encoding is one of the valid ones; error if not.
        encoding = encoding.toLowerCase()
        if ( ![ 'putdown', 'json' ].includes( encoding ) )
            throw new Error( `Invalid document encoding: ${encoding}` )
        let counter = 1 // makes it easy to use || to check if valid
        // Clear out the idToElement map and create a function to repopulate it.
        Message.idToElement.clear()
        const assignID = ( LC, element ) => {
            LC.setID( counter )
            Message.idToElement.set( `${counter}`, element )
            counter++
        }
        // Convert an array of Atom or Shell instances into an LC representing
        // the document.  They must appear in the same order that their elements
        // do in the document.
        const documentLC = ( array, context = new Environment() ) => {
            // ensure the document has an ID, to distinguish feedback about it
            if ( !context.ID() ) context.setID( 'documentEnvironment' )
            // no children? we're done.
            if ( array.length == 0 ) return context
            // first child is an atom? have it serialize itself, add IDs to all
            // the results, and then recur on the rest of the children.
            const head = array.shift()
            if ( !( head instanceof Shell ) ) {
                let LCs
                try {
                    LCs = head.toLCs()
                } catch ( e ) {
                    const tmp = new Environment() // any LC is fine
                    assignID( tmp, head.element )
                    setTimeout( () => Message.error( e.message, {
                        id : tmp.ID(),
                        errorType : 'parsing error',
                        reason : 'Could not parse this notation',
                        valid : false
                    } ) )
                    LCs = [ ]
                }
                LCs.forEach( LC => {
                    assignID( LC, head.element )
                    // we pass the lurchNotation as an attribute, but remove the
                    // \n newlines from its value because they cause invalid
                    // putdown JSON attributes
                    LC.setAttribute( 'lurchNotation', 
                        `${head.getMetadata('lurchNotation').replace(/\n/g,' ')}`)
                    context.pushChild( LC )
                } )
                return documentLC( array, context )
            }
            // first child is a shell, so first let's figure out which of the
            // subsequent children are inside vs. outside it.
            const after = array.findIndex( entry =>
                !head.element.contains( entry.element ) )
            const inside = after == -1 ? array : array.slice( 0, after )
            const outside = after == -1 ? [ ] : array.slice( after )
            // now let's convert the shell to an LC, then recur on the inside,
            // then recur on the outside.
            const headLCs = head.toLCs()
            if ( headLCs.length != 1 ) {
                setTimeout( () => Message.error(
                    `${head.className} must represent exactly one LC`,
                    {
                        id : head.ID(),
                        errorType : 'parsing error',
                        reason : `${head.className} must represent exactly one LC`,
                        valid : false
                    }
                ) )
                return documentLC( outside, context )
            }
            const innerContext = headLCs[0]
            assignID( innerContext, head.element )
            const nextEnvironment = documentLC( inside, innerContext )
            head.finalize( nextEnvironment )
            context.pushChild( nextEnvironment )
            return documentLC( outside, context )
        }
        // Run the documentLC function on all the elements in the document that
        // represent atoms, including any that appear in the header.
        // Note that, because dependencies are just hidden parts of the DOM,
        // this will capture their contents just the same as it does any other
        // document content.
        const selector = `.${atomClassName}:not(#context):not(#context .${atomClassName})`
        let LC = documentLC(
            [
                ...( getHeader( editor )?.querySelectorAll( selector ) || [ ] ),
                ...editor.dom.doc.querySelectorAll( selector )
            ].filter( isOnScreen ).map(
                element => Atom.from( element, editor )
            )
        )
        
        // add LDE attributes obtained from document settings to the document LC
        // that is passed to the LDE.
        LC.setAttribute( 'instantiateEverything', lookup( editor, 'instantiateEverything' ) )

        // Create a message that could be sent to the validation worker, including
        // the encoding produced above of the document's atoms and shells.
        return new Message( {
            type : 'document',
            encoding : encoding,
            code : encoding == 'json' ? LC.toJSON() :
                   encoding == 'putdown' ? LC.toPutdown() :
                   undefined // should not happen; see check above
        } )
    }

    /**
     * Convert the document inside the given editor into the Lurch Notation
     * that, if pasted into Lode (or fed back through the Lurch Notation
     * parser), reproduces the document's meaning.  Unlike {@link
     * Message.document document()}, this does not produce putdown; it
     * reassembles the actual Lurch Notation the user typed into each
     * expression atom, adding only the environment brackets and keywords
     * (`Rule:`, `Theorem:`, etc.) that the user's shells imply but do not
     * themselves contain, since a shell in the document is just a styled
     * `<div>`, not typed notation.
     *
     * Two wrinkles, both handled internally:
     *
     *  1. Atom content is parsed in "set mode" (`enableSets:true`), under
     *     which `{...}` always means a finite set or set-builder
     *     expression.  The reassembled document, however, is meant to be
     *     parsed in the default mode, under which `{...}` means an
     *     environment.  So each atom's notation is pre-tokenized with
     *     `enableSets:true` before being spliced in; this rewrites any
     *     literal `{`/`}` the user typed for a set into the fullwidth
     *     `｛`/`｝` the grammar also recognizes as set brackets regardless
     *     of mode, so the meaning survives being re-tokenized in the
     *     default mode later.
     *  2. Some shell types (e.g. {@link Recall}, {@link Preview}) have no
     *     Lurch Notation keyword that reproduces their meaning.  For those,
     *     this function falls back to computing that shell's putdown
     *     directly and embedding it verbatim using the grammar's `«...»`
     *     raw-putdown escape.  A `Preview` shell is skipped entirely,
     *     since it has no meaning of its own (it is a read-only display of
     *     a dependency's content).
     *
     * The returned text wraps the whole document in one `{ }` environment
     * (the document itself, as a single environment), and indents every
     * line two spaces per level of environment nesting.
     *
     * @param {tinymce.Editor} editor - the editor containing the document to
     *   be converted
     * @returns {string} the Lurch Notation for the document
     */
    static documentInLurchNotation ( editor ) {
        const selector = `.${atomClassName}:not(#context):not(#context .${atomClassName})`
        const atoms = [
            ...( getHeader( editor )?.querySelectorAll( selector ) || [ ] ),
            ...editor.dom.doc.querySelectorAll( selector )
        ].filter( isOnScreen ).map( element => Atom.from( element, editor ) )
        return wrapEnvironment( '', lurchNotationFor( atoms ) )
    }

    /**
     * Feedback data from the Lurch Deductive Engine does not always come in
     * human-readable form.  This is partly because we want to keep the data
     * small, and partly because we're still developing the LDE and thus its
     * messages are not well-organized yet.  This function converts any feedback
     * object in JSON form from the LDE into something presentable, for use in
     * the UI, as feedback to a human user.
     * 
     * The result is guaranteed to have these three fields, and possibly more:
     * 
     *  - `type` - a human-readable string categorizing the feedback into one of
     *    these possible types:
     *     - `'inference'`, meaning the logical inferences from earlier
     *       expressions and environments to this expression
     *     - `'scoping'`, meaning the scopes of variables, including
     *       declarations and the lack thereof
     *     - `'instantiation'`, or what the LDE calls "basic instantiation
     *       hints" (BIHs)
     *     - `'error'`, meaning an internal error took place in the LDE or the
     *       communication with the LDE
     *  - `result` - a human-readable string that is one of three possible
     *    values: `'valid'`, `'invalid'`, or `'indeterminate'`, meaning,
     *    respectively, correct work, incorrect work, and work that may or may
     *    not be correct, but the LDE doesn't have enough information; these
     *    correspond to the types of icons shown in the UI, respectively, green,
     *    red, and yellow
     *  - `reason` - a human-readable string that is short enough to show in a
     *    pop-up message when hovering over the validation icon in the UI.  In
     *    fact, this string is not only human-readable, but written in a simple
     *    and informal style that we aim to be natural and simple for students
     *    to read.
     *  - `code` - a brief, English summary of the feedback, from which most of
     *    the rest of the data could be deduced.  Examples include:
     *     - `'undeclared variable'` (or more than one undeclared variables)
     *     - `'redeclared variable'` (or more than one redeclared variables)
     *     - `'valid inference'`
     *     - `'indeterminate inference'`
     *     - `'invalid inference'`
     *     - `'valid instantiation'`
     *     - `'invalid instantiation'` (for now, there are no indeterminate
     *       instantiations)
     *     - `'error'` (for now, all errors are lumped into one category)
     * 
     * @param {Object} data - the feedback data from the deductive engine, in
     *   JSON form
     */
    static makeFeedbackPresentable ( data ) {
        const listify = names => names.length == 1 ? names[0] :
            names.length == 2 ? names.join( ' and ' ) :
            names.slice( 0, -1 ).join( ', ' ) + ', and ' + names[names.length - 1]
        if ( data.type == 'scoping' ) {
            if ( data.hasOwnProperty( 'unnecessary' ) ||
                 data.hasOwnProperty( 'unsupported' ) ) {
                // an unnecessary declaration (a Rule or Theorem may not begin
                // with a Let) or an unsupported one (a declaration body may
                // not contain another declaration); if the same declaration
                // also redeclares variables, mention both errors in the one
                // message shown.  These get the 'inapplicable' marker, like
                // syntax the CAS does not support.
                return {
                    type : 'scoping',
                    result : 'inapplicable',
                    reason : ( data.hasOwnProperty( 'unnecessary' ) ?
                          'This declaration is unnecessary' :
                          'Lurch does not support a declaration inside the body of another declaration' ) +
                        ( data.hasOwnProperty( 'redeclared' ) ?
                          `, and you have already used ${listify(data.redeclared)}.` :
                          '.' ),
                    code : data.hasOwnProperty( 'unnecessary' ) ?
                        'unnecessary declaration' : 'unsupported declaration'
                }
            } else if ( data.hasOwnProperty( 'undeclared' ) ) {
                const verb = data.undeclared.length > 1 ? 'are' : 'is'
                return {
                    type : 'scoping',
                    result : 'invalid',
                    reason : `What ${verb} ${listify(data.undeclared)} here?`,
                    code : 'undeclared variable'
                }
            } else if ( data.hasOwnProperty( 'redeclared' ) ) {
                return {
                    type : 'scoping',
                    result : 'invalid',
                    reason : `But you have already used ${listify(data.redeclared)}.`,
                    code : 'redeclared variable'
                }
            }
        } else if ( data.type == 'BIH' ) {
            return {
                type : 'instantiation',
                result : data.result,
                reason : data.result == 'valid' ?
                    'Yes, you substituted correctly.' :
                    'No, you did not substitute correctly here.',
                code : data.result == 'valid' ?
                    'correct instantiation' : 'incorrect instantiation'
            }
        } else if ( data.type == 'propositional' ) {
            return {
                type : 'inference',
                result : data.result,
                reason : data.result == 'valid' ? 'Good work!' :
                    data.result == 'invalid' ?
                    'Based on what you have above, this cannot be true.' :
                    'You have not yet convinced me of this.',
                code : `${data.result} inference`
            }
        } else if ( data.type == 'algebra' ) {
            return {
                type : 'algebra',
                result : data.result,
                reason : data.result == 'valid' ? 'Nice algebra!' :
                    'As far as I can tell, this is not algebraically correct.',
                code : `algebraically ${data.result}`
            }
        } else if ( data.type == 'arithmetic' ) {
            return {
                type : 'arithmetic',
                result : data.result,
                reason : data.result == 'valid' ? 'Nice arithmetic!' :
                    data.result == 'inapplicable' ? 'Arithmetic in the number system specified by the rule does not apply here.' :
                    'As far as I can tell, this is not correct by arithmetic.',
                code : `arithmetically ${data.result}`
            }
        } else if ( data.type == 'error' ) {
            return {
                type : 'error',
                result : 'invalid',
                reason : 'So sorry, Lurch is broken!  Not your fault.',
                message : data.reason,
                code : 'error'
            }
        }
    }

}
