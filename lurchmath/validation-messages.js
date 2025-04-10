
import { Atom, className as atomClassName } from './atoms.js'
import { Shell } from './shells.js'
import { getHeader } from './header-editor.js'
import { Environment } from './lde-cdn.js'
import { isOnScreen } from './utilities.js'
import { lookup } from './document-settings.js'

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
            if ( data.hasOwnProperty( 'undeclared' ) ) {
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
