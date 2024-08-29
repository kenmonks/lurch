
/**
 * This module provides an `install()` function for use in the editor's setup
 * routine, to add this module's validation functionality to the editor.  The
 * install routine does all the work of this module; there are no module-level
 * variables.  Each call to `install()` creates a new background Web Worker
 * that will do validation, installs a new set of event handlers for it, etc.
 * See {@link module:Validation.install install()} for details.
 *
 * This module creates a Web Worker to use for doing validation outside of the
 * UI thread.  It loads into that worker the code in
 * {@link module:ValidationWorker the validation worker module}, and then
 * provides related tools to clients.
 * 
 * First, you can send a document to the worker for validation by calling the
 * {@link module:Validation.run run()} function.
 * 
 * Both this module and the {@link module:ValidationWorker validation worker
 * module} make use of the {@link Message} class for communication, and any
 * client who listens to the events from this module will receive instances of
 * that class as well.
 * 
 * @module Validation
 */

import { Message } from './validation-messages.js'
import { Atom } from './atoms.js'
import { Dialog } from './dialog.js'
import { isOnScreen } from './utilities.js'
import { LurchDocument } from './lurch-document.js'

/**
 * This function should be called in the editor's setup routine.  It installs
 * two menu items into the editor:
 * 
 *  * one for running validation on the editor's current contents, and showing
 *    the results in the editor by placing suffixes on each atom that could be
 *    validated
 *  * one for removing all such validation suffixes from the editor's current
 *    contents
 * 
 * In order to support the functionality of those two menu items, the
 * `install()` function also constructs a web worker that will do the validation
 * in the background, and that web worker loads the tools in the
 * {@link module:ValidationWorker validation worker module}.  This function also
 * installs event handlers on the worker and on this window so that
 * {@link Message Message instances} sent from the worker or from this window
 * during parsing can be handled and used to create validation feedback in the
 * editor.
 * 
 * @param {tinymce.Editor} editor - the editor in which to install the features
 *   described above
 * @function
 */
export const install = editor => {

    // Object for storing the progress notification we show during validation
    let progressNotification = null

    // Define utility function used below:
    // Remove all validation markers from all atoms and shells in the editor
    const clearAll = () => {
        Atom.allIn( editor ).forEach( atom =>
            atom.setValidationResult( null ) )
    }

    // Global(ish) variable used by the function below
    let clearIsPending = false
    // Same as previous utility function, but this one queues them up, so that
    // (a) they don't happen immediately and (b) multiple calls can get
    // compressed into a single result, for efficiency.
    const queueClearAll = () => {
        if ( clearIsPending ) return
        clearIsPending = true
        setTimeout( () => {
            clearAll( editor )
            clearIsPending = false
        } )
    }

    // Install that validation clearing function as the event handler for any
    // change made to the internal data of an atom or shell (or the creation of
    // an atom or shell).
    Atom.prototype.dataChanged = function () {
        if ( this.editor == editor && isOnScreen( this.element )
          && editor.dom.doc.body.contains( this.element ) )
            queueClearAll()
    }

    // Same as above, but now for the removal of an atom or shell.
    // In this case, don't bother checking if it's on screen.
    Atom.prototype.wasDeleted = function () {
        if ( this.editor == editor ) queueClearAll()
    }

    // How to install event handlers so that we can decorate the document
    // correctly upon receiving validation feedback.  We will install these on
    // both the worker and this window, because when parsing errors happen, we
    // send feedback about them from this window itself before even sending
    // anything to the worker.
    const installEventHandlers = context =>
        context.addEventListener( 'message', event => {
            const message = new Message( event )
            // console.log( JSON.stringify( message.content, null, 4 ) )
            if ( message.is( 'feedback' ) || message.is( 'error' ) ) {
                if ( message.element ) {
                    // console.log( message.element )
                    if ( Atom.isAtomElement( message.element ) ) {
                        Atom.from( message.element, editor )
                            .applyValidationMessage( message )
                    } else {
                        console.log( 'Warning: feedback message received for unusable element' )
                        // console.log( JSON.stringify( message.content, null, 4 ) )
                    }
                } else if ( message.content.id == 'documentEnvironment' ) {
                    // feedback about whole document; ignore for now
                } else {
                    console.log( 'Warning: feedback message received with no target element' )
                    console.log( JSON.stringify( message.content, null, 4 ) )
                }
            } else if ( message.is( 'progress' ) ) {
                progressNotification.progressBar.value( message.get( 'complete' ) )
            } else if ( message.is( 'done' ) ) {
                progressNotification.close()
                Dialog.notify( editor, 'success', 'Validation complete', 2000 )
                progressNotification = null
                editor.dispatch( 'validationFinished' )
            } else if ( message.content?.type?.startsWith( 'mathlive#' ) ) {
                // Ignore messages MathLive is sending to itself
            } else if ( event.data['lurch-embed'] ) {
                // Ignore messages that initialize embedded Lurch instances
            } else {
                console.log( 'Warning: unrecognized message type' )
                // console.log( JSON.stringify( message.content, null, 4 ) )
            }
        } )
    installEventHandlers( window )

    // Load the ValidationWorker module code so it can talk to us.
    const newValidationWorker = () => {
        const result = new Worker(
            `${editor.appOptions.appRoot}/validation-worker.js`,
            { type : 'module' } )
        installEventHandlers( result )
        return result
    }
    let worker = newValidationWorker()

    // Add menu item for toggling validation
    editor.ui.registry.addMenuItem( 'validate', {
        text : 'Show/Hide validity ✔︎',
        icon : 'preview',
        tooltip : 'Run Lurch\'s checking algorithm on the document',
        shortcut : 'meta+0',
        onAction : () => {
            // If there is validation in progress, terminate it and say so.
            if ( progressNotification ) {
                progressNotification.close()
                progressNotification = null
                worker.terminate()
                worker = newValidationWorker()
                Dialog.notify( editor, 'warning', 'Validation stopped', 2000 )
                editor.dispatch( 'validationFinished' )
                return
            }
            // If there are validation results in the document, then clear them
            // out and be done.
            if ( Array.from(
                editor.getBody().querySelectorAll( '[class^=feedback-marker]' )
            ).some( feedback => isOnScreen( feedback ) ) ) {
                clearAll()
                return
            }
            // Otherwise the user wants us to start validation now; do so.
            // Clear old results just to be safe.
            clearAll()
            // Start progress bar in UI
            progressNotification = editor.notificationManager.open( {
                text : 'Validating...',
                type : 'info',
                progressBar : true
            } )
            // Send the document to the worker to initiate background validation
            Message.document( editor, 'putdown' ).send( worker )
        }
    } )

    // Add menu item for clearing validation results
    editor.ui.registry.addMenuItem( 'clearvalidation', {
        text : 'Clear feedback',
        tooltip : 'Remove all feedback marks from the document',
        shortcut : 'Meta+Shift+X',
        onAction : () => clearAll()
    } )
    
    // Add developer menu item for debugging document meaning
    editor.ui.registry.addMenuItem( 'downloaddocumentcode', {
        text : 'Download document code',
        icon : 'sourcecode',
        tooltip : 'Download the putdown code for the document',
        shortcut : 'Meta+Shift+D',
        onAction : () => {
            const code = Message.document( editor, 'putdown' ).content.code
            const link = document.createElement( 'a' )
            link.setAttribute( 'target', '_blank' )
            const blob = new Blob( [ code ], { type: "text/plain" } )
            link.href = URL.createObjectURL( blob )
            const fileID = new LurchDocument( editor ).getFileID() ||
                'lurch-document'
            link.download = fileID
            link.click()
        }
    } )

    // Add developer menu item for debugging document meaning
    editor.ui.registry.addMenuItem( 'viewdocumentcode', {
        text : 'View document code',
        icon : 'sourcecode',
        tooltip : 'View the putdown code for the document in a new tab',
        onAction : () => {
            const code = Message.document( editor, 'putdown' ).content.code
            const link = document.createElement( 'a' )
            link.setAttribute( 'target', '_blank' )
            const blob = new Blob( [ code ], { type: "text/plain" } )
            link.href = URL.createObjectURL( blob )
            link.click()
        }
    } )
}

export default { install }
