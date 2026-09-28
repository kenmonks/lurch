
/**
 * The CNF namespace includes tools for constructing nested JavaScript arrays
 * suitable for use in the satisfiability solver stored in the `dependencies`
 * folder in this repository.  (Credits to the author of that tool appear in
 * the documentation for {@link CNF.isSatisfiable isSatisfiable()}, below.)
 * 
 * The format used by that tool is as follows.  Assume that we have a number
 * for every propositional variable, so that we might refer to them as
 * $p_1,p_2,p_3,\ldots$.  Then an expression such as
 * 
 * $$ (p_1\vee p_2)\wedge(\neg p_2\vee p_3\vee\neg p_4) $$
 * 
 * gets encoded as follows.
 * 
 * `[ [ 1, 2 ], [ -2, 3, 4 ] ]`
 * 
 * The inner arrays are disjunctions, the outer array is conjunction (as is
 * the definition of CNF), and the integers represent propositions, or the
 * negations of them, depending on the sign of the integer.
 * 
 * Tools in this namespace let you construct CNFs for atomic propositions,
 * including:
 * 
 *  * {@link CNF.constantTrue the constant true}
 *  * {@link CNF.constantFalse the constant false}
 *  * {@link CNF.proposition any atomic proposition or its negation}
 * 
 * and non-atomic propositional expressions as well, including:
 * 
 *  * {@link CNF.and the conjunction of two CNFs}
 *  * {@link CNF.or the disjunction of two CNFs}
 * 
 * You can then check satisfiability of any constructed CNF with
 * {@link CNF.isSatisfiable isSatisfiable()}.
 * 
 * @namespace CNF
 */

import { satSolve } from '../../dependencies/LSAT.js'

/**
 * The conjunctive normal form (CNF) for the constant true is simply the empty
 * array, because CNF means "all these things must be true," and so an empty
 * list is vacuously true.
 * 
 * @function
 * @return {Array} the conjunctive normal form representing the constant "true"
 * @memberOf CNF
 */
const constantTrue = () => [ ]

/**
 * The conjunctive normal form (CNF) for the constant true is an array
 * containing exactly one entry, itself an empty array.  The reason for this
 * is that a CNF is a conjunction of disjunctions, so the inner array
 * represents an empty disjunction, which is vacuously false.  Consequently,
 * the outer conjunction is also false.
 * 
 * @function
 * @return {Array} the conjunctive normal form representing the constant "false"
 * @memberOf CNF
 */
const constantFalse = () => [ [ ] ]

/**
 * The conjunctive normal form (CNF) for a single propositional letter $p_i$
 * is an array containing exactly one entry, itself also an array containing
 * exactly one entry, the index $i$ of the propositional letter.  The reason
 * for this is that a CNF is a conjunction of disjunctions, so the inner array
 * represents a degenerate disjunction that is equivalent to $p_i$, and thus
 * the outer conjunction represents the exact same thing.
 * 
 * To express the negation of a propositional letter, $\neg p_i$, simply use
 * the negation of its integer index, $-i$.  That is, the CNF for $\neg p_i$
 * can be computed with `CNF.proposition( -i )`.
 * 
 * @function
 * @param {Number} index the index of the propositional letter whose CNF
 *   should be returned (must be a positive integer) or the negation of such
 *   an index if you wish to represent the propositional letter's negation
 * @return {Array} the conjunctive normal form representing the propositional
 *   letter with the given index (or its negation, respectively)
 * @memberOf CNF
 */
const proposition = ( index ) => [ [ index ] ]

/**
 * The conjunctive normal form (CNF) for the conjunction of the inputs.
 * Each input must itself be a CNF, and consequently they can be conjoined
 * just by concatenating the arrays (which is the same as flattening the
 * argument list by one level).
 * 
 * @function
 * @param {Array[]} args two or more CNFs to conjoin
 * @return {Array} if the args contain $a_1,\ldots,a_n$, the result is a
 *   conjunctive normal form representing "$a_1$ and $\cdots$ and $a_n$"
 * @memberOf CNF
 */
const and = ( ...CNFs ) => CNFs.flat( 1 )

/**
 * The conjunctive normal form (CNF) for the disjunction of the two inputs,
 * although this is not quite true.  It is extremely inefficient to compute
 * actual disjunction of two CNFs, and thus we adopt here a method that does
 * not create the actual disjunction, but rather a CNF that is
 * *equisatisfiable* with the actual disjunction.  Since our purpose here is
 * only for creating CNFs for use in satisfiability checking, that shortcut is
 * good enough.
 * 
 * The third parameter is a callback function that will be used to generate a
 * new, unused symbol (that is, an integer not appearing in $P$ or $Q$ or
 * anywhere else in the larger problem into which these may fit) if one is
 * needed as a so-called "switch variable."  If this function is not provided,
 * we will simply use the smallest positive integer not appearing (as itself
 * or its negation) in $P$ or $Q$.  This fallback may not be what the caller
 * wants; it is only a fallback.
 * 
 * @function
 * @param {Array} P the first CNF of the two to conjoin
 * @param {Array} Q the second CNF of the two to conjoin
 * @param {Function} [getNewSymbol] the callback for generating new symbols
 *   (which must take no inputs and return a positive integer if called, and
 *   which may have side effects, such as recording that integer as "used").
 * @return {Array} the conjunctive normal form representing an expression
 *   equisatisfiable with "$P$ or $Q$"
 * @memberOf CNF
 */
const or = ( P, Q, getNewSymbol ) => {
    if ( P.length == 1 ) return Q.map( unionWith( P[0] ) )
    if ( Q.length == 1 ) return P.map( unionWith( Q[0] ) )
    if ( P.length == 2 && Q.length == 2 )
        return [ arrayUnion( P[0], Q[0] ), arrayUnion( P[0], Q[1] ),
                 arrayUnion( P[1], Q[0] ), arrayUnion( P[1], Q[1] ) ]
    const newSymbol = getNewSymbol ? getNewSymbol() :
        Math.max( firstUnmentioned( P ), firstUnmentioned( Q ) )
    return [ ...P.map( unionWith( [  newSymbol ] ) ),
             ...Q.map( unionWith( [ -newSymbol ] ) ) ]
}
// Avoid spreading literals into a call: large CNFs can exceed argument limits.
const highestMentioned = CNF => CNF.reduce( ( highest, clause ) =>
    clause.reduce( ( maximum, literal ) =>
        Math.max( maximum, Math.abs( literal ) ), highest ), 0 )
const firstUnmentioned = CNF => highestMentioned( CNF ) + 1

// Utility function for the union of two arrays of integers, treating the
// arrays as if they were sets.
const arrayUnion = ( a1, a2 ) => [ ...new Set( [ ...a1, ...a2 ] ) ]
// Utility for binding the previous function to an argument, i.e., currying.
const unionWith = a1 => a2 => arrayUnion( a1, a2 )

/**
 * Checking the satisfiability of a propositional logic expression is an
 * NP-hard problem.  We use, internally, a tool built by Gregory Duck that has
 * many efficiencies built in, though of course, in the worst-case scenario,
 * it still runs in exponential time.  But in practice, it is very fast.
 * 
 * The CNF provided should be one in the form described at the top of this
 * page (an array of arrays of integers, with the meaning documented there).
 * Such CNFs can be built using the other functions in this module.
 * 
 * Professor Duck's satisfiability checker has a
 * [website here](http://www.comp.nus.edu.sg/~gregory/sat/)
 * and a [GitHub repository here](https://github.com/GJDuck/SAT.js).
 * 
 * @function
 * @param {Array[]} CNF the conjunctive normal form whose satisfiability
 *   should be tested
 * @param {integer} [maxVariableIndex] the highest index variable mentioned in
 *   the CNF (which will be computed if not provided, but providing it saves a
 *   little time)
 * @returns {boolean} whether the given expression is satisfiable
 * @memberOf CNF
 */
const isSatisfiable = ( CNF, maxVariableIndex ) => {
    if ( !Number.isInteger( maxVariableIndex ) )
        maxVariableIndex = highestMentioned( CNF )
    return satSolve( Math.max( maxVariableIndex, 1 ), CNF )
}

export default {
    constantTrue, constantFalse, proposition, and, or, isSatisfiable
}
