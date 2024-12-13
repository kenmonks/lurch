
/**
 * This module runs in a background thread, not the browser's main (UI) thread.
 * It grades documents submitted to it in serialized form, and transmits
 * feedback messages about their contents back to the main thread.  It is not
 * yet at the level of sophistication we eventually plan for, but it can already
 * do a lot.  It imports all the validation tools from
 * {@link https://lurchmath.github.io/lde our deductive engine repository} and
 * uses them to validate documents.
 * 
 * None of the functions in this module are called by any external client, and
 * hence none are documented here.  Rather, this script is loaded into Web
 * Worker instances, and messages are passed to it as documented above, and
 * messages are received back from it as documented in
 * {@link module:Validation the validation module}.
 * 
 * @module ValidationWorker
 */

import { Message } from './validation-messages.js'
import { LDE } from './lde-cdn.js'

const LogicConcept = LDE.LogicConcept

// Internal use only
// Sets up an event handler for progress notifications from the LDE, to pass
// them back to the main thread using the Message.progress() static method.
// Because progress messages from the LDE come in the form of (p,n,r), where
// p is a pass number (any positive integer), n is the total amount of work to
// be done in that pass (any nonnegative integer), and r is the percentage of
// the work of the pass complete (an integer from 0 to 100 inclusive), we
// transform (p,n,r) into (1 - 2^(-p+1) + 2^(-p) * r) to get the value to send
// to the main thread.  This makes pass 1 take up the first half of the progress
// bar, pass 2 half of what remains, pass 3 half of what remains, and so on.
LDE.LurchOptions.updateProgress = ( passIndex, _, percentComplete ) => {
    const proportion = percentComplete / 100
    const transformed = 1 - Math.pow( 2, -passIndex+1 )
                          + Math.pow( 2, -passIndex ) * proportion
    Message.progress( ( transformed * 100 ) | 0 )
}
LDE.LurchOptions.updateFreq = 100

// Listen for messages from the main thread, which should send putdown notation
// for a document to validate.  When it does, we run our one (temporary
// placeholder) validation routine, which will send "feedback" and "done"
// messages, as appropriate.  Any non-putdown messages we receive generate error
// feedback instead.
addEventListener( 'message', event => {
    const message = new Message( event )
    if ( !message.is( 'document' ) )
        return Message.error( 'Not a document message' )
    const encoding = message.get( 'encoding' )
    const code = message.get( 'code' )
    try {
        if ( encoding == 'putdown' ) {
            const LCs = LogicConcept.fromPutdown( code )
            if ( LCs.length != 1 )
                throw new Error( 'Incorrect number of LCs: ' + LCs.length )
            validateDocument( LCs[0] )
        } else if ( encoding == 'json' ) {
            validateDocument( LogicConcept.fromJSON( code ) )
        } else {
            throw new Error( `Not a valid document encoding: ${encoding}` )
        }
    } catch ( error ) {
        Message.error( `Error decoding document: ${error.message || error}` )
        Message.done()
    }
} )

// Find the highest-priority validation result, or undefined if the given LC
// has no validation result attached to it.  This unites all the different ways
// we've invented to attach feedback to something, which are kind of a mess that
// this routine cleans up.  We should clean it up ourselves later, but for now,
// this routine is our solution.
const getValidationResults = LC => {
    const results = [ ]
    // Scope errors are highest priority
    const scopeErrors = LDE.Scoping.scopeErrors( LC )
    if ( scopeErrors && scopeErrors.redeclared )
        results.push( {
            type : 'scoping',
            result : 'invalid',
            reason : `Trying to re-declare ${scopeErrors.redeclared.join(", ")}`,
            redeclared : scopeErrors.redeclared
        } )
    if ( scopeErrors && scopeErrors.undeclared )
        results.push( {
            type : 'scoping',
            result : 'invalid',
            reason : `Using ${scopeErrors.undeclared.join(", ")} undeclared`,
            undeclared : scopeErrors.undeclared
        } )
    // Find any type of validation feedback that was produced before prop
    // validation, such as instantiation hint structure
    const otherFeedback = LC.getAttribute( 'validation results' )
    Object.keys( otherFeedback || { } ).forEach( type =>
        results.push( { type, ...otherFeedback[type] } ) )
    // Final result is the prop validation result, if any
    const propResult = LDE.Validation.result( LC )
    if ( propResult )
        if (propResult.reason=='preemie') {
          results.push( { type : 'propositional', result: 'indeterminate', reason: 'preemie' } )
        } else {  
          results.push( { type : 'propositional', ...propResult } )
        } 
    return results
}

// Validate using the imported Lurch Deductive Engine (LDE) module
const validateDocument = LC => {
    // First run validation, so that the LC contains feedback to send back:
    // console.log( LC.toPutdown() )
    try {
        LDE.validate( LC )
    } catch ( error ) {
        // console.log( error.stack )
        Message.error( `Error running LDE validation: ${error.message}` )
        return
    }
    // Define a post-order tree traversal recursion that will find all the
    // feedback the validation generated, and send feedback messages about each:
    const queuedFeedback = { }
    const postOrderTraversal = descendant => {
        // We're doing a post-order tree traversal, so do the children first:
        descendant.children().forEach( postOrderTraversal )
        // Now that we've done the recursion on children, handle this LC:
        const results = getValidationResults( descendant )
        if ( results.length == 0 ) return
        try {
            // Find the first ancestor that has an ID
            let walk
            for ( walk = descendant ; walk ; walk = walk.parent() )
                if ( walk.ID() ) break
            // Create the feedback object we'll be sending
            const feedbackObject = {
                id : descendant.ID(),
                ancestorID : walk ? walk.ID() : undefined,
                // address : descendant.address( LC ),
                // putdown : descendant.toPutdown(),
                results : results
            }
            // If it has an ID, send feedback about it, but first check to see if
            // any descendant of it has feedback waiting to be combined with its
            if ( feedbackObject.id ) {
                if ( queuedFeedback.hasOwnProperty( feedbackObject.id ) ) {
                    feedbackObject.results = feedbackObject.results.concat(
                        queuedFeedback[feedbackObject.id] )
                    delete queuedFeedback[feedbackObject.id]
                }
                Message.feedback( feedbackObject )
            // Otherwise, we need to queue up its feedback to be added to that
            // of an ancestor.  We do so like this:
            } else {
                queuedFeedback[feedbackObject.ancestorID] =
                    ( queuedFeedback[feedbackObject.ancestorID] || [ ] ).concat(
                        feedbackObject.results )
            }
        } catch ( error ) {
            Message.error( `Error generating feedback: ${error.message}` )
        }
    }
    // Apply the above recursive function to the LC, then be done:
    // console.log( LC.toPutdown() )
    postOrderTraversal( LC )
    Message.done()
}
