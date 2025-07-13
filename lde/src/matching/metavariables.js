
import { Symbol as LurchSymbol } from '../symbol.js'

/**
 * This module defines a constant and function that formalize the concept of a
 * "metavariable."  See the documentation for
 * {@link module:Matching the Matching module} for a definition of
 * metavariables and how they relate to the concept of matching.
 * 
 * @see {@link module:Metavariables.metavariable metavariable} - for marking
 *   certain symbols as metavariables
 * @see {@link module:Metavariables.containsAMetavariable containsAMetavariable()} - for
 *   testing whether expressions contain metavariables
 * @see {@link module:Metavariables.metavariablesIn metavariablesIn()} - for
 *   computing an array of all metavariables within a given expression
 * @see {@link module:Metavariables.metavariableNamesIn metavariableNamesIn()} - for
 *   computing a set of all names of metavariables within a given expression
 * 
 * @module Metavariables
 */

/**
 * To facilitate marking some {@link Symbol Symbols} as metavariables (in
 * contrast to any {@link Symbol Symbol} not so marked), we declare a string
 * constant that can be used with the
 * {@link MathConcept#isA isA()} and {@link MathConcept#asA asA()} and
 * {@link MathConcept#makeIntoA makeIntoA()} functions in the
 * {@link MathConcept MathConcept} class.
 * 
 * For example, to mark a symbol `A` as a metavariable, one can import this
 * module (call it `M`) and then call `A.makeIntoA( M.metavariable )`.  You
 * can later test to see if `A` is a metavariable with
 * `A.isA( M.metavariable )`.
 * 
 * Note, however, that only {@link Symbol Symbol} instances can be used as
 * metavariables by {@link module:Matching the matching module}.  Although you
 * can mark any {@link LogicConcept LogicConcept} as a metavariable this way,
 * it is useless to do so, and other functions in this module will not
 * recognize non-{@link Symbol Symbols} as metavariables.
 * 
 * @see {@link module:Metavariables.containsAMetavariable containsAMetavariable()}
 * @see {@link module:Metavariables.metavariablesIn metavariablesIn()}
 * @see {@link module:Metavariables.metavariableNamesIn metavariableNamesIn()}
 */
export const metavariable = 'Metavar'

/**
 * A *pattern* is an {@link Expression Expression} that *may* contain a
 * metavariable.  Hence *all* {@link Expression Expressions} are
 * patterns, though an {@link Expression Expression} without any
 * metavariables is a pattern only in a degenerate sense.  But sometimes we
 * need to know we are working with an {@link Expression Expression} that
 * does *not* contain a metavariable, that is, a non-pattern expression.
 * This function is useful for detecting that case.
 * 
 * Recall that a metavariable is any {@link Symbol Symbol} that has been
 * marked as a metavariable as described in the documentation for
 * {@link module:Metavariables.metavariable metavariable}.
 * 
 * @function
 * @param {LogicConcept} LC the {@link LogicConcept LogicConcept} to test
 *   for whether it contains any metavariables
 * @returns {boolean} true if and only if `LC` contains no metavariables
 */
export const containsAMetavariable = LC =>
    LC.hasDescendantSatisfying( d =>
        ( d instanceof LurchSymbol ) && d.isA( metavariable ) )

/**
 * Find the ordered list of all descendants of the given
 * {@link LogicConcept LogicConcept} that are metavariables.
 * In contrast to
 * {@link module:Metavariables.metavariableNamesIn metavariableNamesIn()},
 * this function returns the actual {@link Symbol Symbol} instances, not just
 * their string names, and thus this list might be longer than what
 * {@link module:Metavariables.metavariableNamesIn metavariableNamesIn()}
 * would return on the same input.
 * 
 * @function
 * @param {LogicConcept} LC where to search for metavariables
 * @returns {Array} a JavaScript array of all {@link Symbol Symbol} instances
 *   that are descendants of the given `LC` and that pass the
 *   `s.isA( metavariable )` test.  Note that a
 *   {@link LogicConcept LogicConcept} is considered a descendant of itself.
 *   The results appear in tree traversal order.
 * 
 * @see {@link module:Metavariables.metavariableNamesIn metavariableNamesIn()}
 */
export const metavariablesIn = LC =>
    LC.descendantsSatisfying( d =>
        ( d instanceof LurchSymbol ) && d.isA( metavariable ) )

/**
 * Find the collection of metavariables appearing in the given
 * {@link LogicConcept LogicConcept}, considering only their names as strings,
 * not distinguishing one instance of, say, $x$, from another.
 * Thus the result of this function will be a set that may have fewer elements
 * than the array that would be returned by
 * {@link module:Metavariables.metavariablesIn metavariablesIn()} if it were
 * called on the same input.
 * 
 * @function
 * @param {LogicConcept} LC where to search for metavariable names
 * @returns {Set} a JavaScript set of strings, each of which is the name of a
 *   metavariable appearing in the given `LC`
 */
export const metavariableNamesIn = LC =>
    new Set( metavariablesIn( LC ).map( mv => mv.text() ) )
