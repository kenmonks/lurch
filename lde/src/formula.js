
/**
 * A formula is a {@link LogicConcept LogicConcept} that includes symbols
 * intended to be used for substitution, that is, what
 * {@link module:Matching the Matching module} calls
 * {@link module:Matching.metavariable metavariables}.  This namespace
 * provides functions for dealing with formulas, including
 * {@link Formula.from converting} a {@link LogicConcept LogicConcept} into a
 * formula, computing the {@link Formula.domain domain} of a formula, and
 * {@link Formula.instantiate instantiating} a formula.
 * 
 * Import this namespace with code such as
 * `import Formula from './formula.js'` and then make calls such as
 * `Formula.domain( myLC )`.
 * 
 * @namespace Formula
 */

import { MathConcept } from './math-concept.js'
import { LogicConcept } from './logic-concept.js'
import { BindingEnvironment } from './binding-environment.js'
import { BindingExpression } from './binding-expression.js'
import { Declaration } from './declaration.js'
import { Expression } from './expression.js'
import { Environment } from './environment.js'
import { Symbol as LurchSymbol } from './symbol.js'
import Matching from './matching.js'
import Parsing from './experimental/parsing.js'

/**
 * A {@link LogicConcept LogicConcept} can be converted into a formula by
 * replacing any subset of its {@link Symbol Symbols} with metavariables.
 * Recall that a metavariable can be any symbol, but with
 * {@link module:Matching.metavariable a specific attribute} set to "true."
 * 
 * Which {@link Symbol Symbols} should be converted into metavariables?  Any
 * one that is not in the scope of a {@link Declaration Declaration} of that
 * same {@link Symbol}.  For example, if we consider the {@link LogicConcept}
 * indicated by the {@link LogicConcept.fromPutdown putdown notation}
 * `{ :(= a b) (= b a) }` and we assume it is in the scope of a
 * {@link Declaration} of the `=` {@link Symbol}, but not of the `a` or `b`
 * {@link Symbol Symbols}, then converting `{ :(= a b) (= b a) }` to a formula
 * would produce a copy in which each instance of `a` and `b` have had their
 * metavariable attribute set to "true" (via a call to the
 * {@link MathConcept#makeIntoA makeIntoA()} member).
 * 
 * The exception is that bound variables are never marked as metavariables.
 * 
 * @param {LogicConcept} LC - the {@link LogicConcept LogicConcept} to convert
 *   into a formula
 * @param {boolean} [inPlace] - if `true`, the metavariables will be attributed in
 * `LC` itself, and the resulting modified `LC` is returned.  If `false`, it will
 * attribute and return a separate copy of `LC`, leaving the original unchanged.  
 * @returns {LogicConcept} a structural copy of `LC`, except with the relevant
 *   {@link Symbol Symbol} atoms converted into
 *   {@link module:Matching.metavariable metavariables}
 * @memberof Formula
 * @alias Formula.from
 */
const from = (LC, inPlace=false) => {
    // what symbol names were already declared?
    const declared = new Set( LC.accessibles().filter(
        a => a instanceof Declaration
    ).map( d => d.symbols() ).flat().map( s => s.text() ) )
    // add to that the special symbol for empty declaration bodies
    declared.add( Declaration.emptyBody().text() )
    // and what were bound outside of the LC?
    const bound = new Set( LC.ancestors().filter(
        a => a != LC && ( a instanceof BindingEnvironment )
    ).map( be => be.boundSymbolNames() ).flat() )
    // make a copy and change all of its undeclared symbols into metavariables
    const result = (inPlace) ? LC : LC.copy()
    // in addition to these, we also have to avoid natural number constants
    result.descendantsSatisfying( d => d instanceof LurchSymbol )
          .filter( s => !declared.has( s.text() ) && !bound.has( s.text() )
                                                  && !Parsing.isNaturalNumber( s )
                                                  && s.isFree() )
          .forEach( s => s.makeIntoA( Matching.metavariable ) )
    // return it
    return result
}

/**
 * Once a {@link LogicConcept LogicConcept} has been {@link Formula.from
 * converted into a formula}, it will have zero or more metavariables.  This
 * function returns the set of names of those metavariables.  If the formula
 * has no metavariables, or if a non-formula {@link LogicConcept LogicConcept}
 * was passed as input, this function will return the empty set.
 * 
 * @param {LogicConcept} formula - the {@link LogicConcept LogicConcept} to
 *   view as a formula, and whose metavariables should be investigated to
 *   compute this function's result
 * @returns {Set} the set of names of {@link Symbol Symbols} in the given
 *   `formula` that appear as a metavariable therein
 * @memberof Formula
 * @alias Formula.domain
 */
const domain = formula =>
    new Set( formula.descendantsSatisfying(
        d => ( d instanceof LurchSymbol ) && d.isA( Matching.metavariable )
    ).map( metavar => metavar.text() ) )

/**
 * Instantiating a formula means making a copy of that formula and then
 * replacing each metavariable in it with another {@link LogicConcept
 * LogicConcept}, according to some predetermined mapping of metavariable
 * names to {@link LogicConcept LogicConcepts}, called the "instantiation."
 * This function performs exactly that operation, with two exceptions.
 * 
 * First, this function does not check to ensure that the domain of the given
 * `instantiation` matches the {@link Formula.domain domain} of the given
 * `formula`.  If that is important to the caller, they should verify that
 * themselves in advance, using an {@link Set#equals equality check} between
 * the two sets.
 * 
 * Second, this function also applies {@link module:Matching.fullBetaReduce
 * beta reduction} to the result before returning it (if necessary) because
 * the instantiation may have introduced an explicit expression function in a
 * position where it should be applied to its arguments.  Note the warnings in
 * the beta reduction documentation about infinite loops.
 * 
 * @param {LogicConcept} formula - the {@link LogicConcept LogicConcept} to
 *   instantiate with the given `instantiation`
 * @param {Substitution|Solution|Object|Map} instantiation - either a
 *   {@link Substitution Substitution} instance (which describes a single
 *   metavariable's replacement) or a {@link Solution Solution} instance
 *   (which describes the substitution of zero or more metavariables) or a
 *   JavaScript Object or Map (which should map metavariable names to the
 *   desired instantiations) to be used as the function to apply to each
 *   metavariable in the `formula`
 * @param {String[]} preserve - the list of attributes to preserve while doing
 *   the instantiation.  Any metavariable having these attributes will have the
 *   values of those attributes copied over to its instantiation.  All other
 *   attributes of the metavariable (including, typically, the fact that it is a
 *   metavariable) will be lost during the instantiation.  This defaults to the
 *   list containing just one entry, the "given" type attribute flag.
 * @memberof Formula
 * @alias Formula.instantiate
 */
const instantiate = (
    formula, instantiation,
    preserve = [ MathConcept.typeAttributeKey( 'given' ) ]
) => {
    // handle the atomic case, where .replaceWith() would fail, and where we
    // don't need to check any restrictions on the parent, because there is no
    // parent in this case (since we're making a copy).  Furthermore, in this
    // case, we cannot possibly have created a case of
    // ("LDE EFA" ("LDE lambda" ...) ...), so we do not beta-reduce.
    if ( ( formula instanceof LurchSymbol )
      && formula.isA( Matching.metavariable ) ) {
        const result = lookup( instantiation, formula )
        preserve.forEach( attrKey => {
            if ( formula.hasAttribute( attrKey ) )
                result.setAttribute( attrKey,
                    JSON.copy( formula.getAttribute( attrKey ) ) )
        } )
        return result
    }
    // handle the usual case, where we may have multiple substitutions to make
    // and since each one is inside a parent, that may bring restrictions.
    const result = formula.copy()
    result.descendantsSatisfying(
        d => ( d instanceof LurchSymbol ) && d.isA( Matching.metavariable )
    ).forEach( metavar =>
        replaceIfPossible( metavar, lookup( instantiation, metavar ), preserve )
    )
    // if there are any expression function applications, try beta reducing.
    if ( result instanceof Expression )
        return betaIfNeeded( result )
    result.descendantsSatisfying(
        d => ( d instanceof Expression ) && d.isOutermost()
    ).forEach( d => d.replaceWith( betaIfNeeded( d ) ) )
    return result
}

/**
 * The concept of variable capture in a quantifier (or, more generically, in a
 * {@link BindingExpression}) is a well-known one, and is also documented
 * in functions such as {@link MathConcept#isFree this one}.  But
 * {@link Declaration Declarations} function similarly to bindings, except their
 * scope spans multiple expressions in the same (or inner) environments.  So we
 * can consider a secondary type of symbol capture, one in which we substitute
 * into an expression $E$ in the scope of a declaration $D$, and doing so
 * inserts an instance of a symbol $s$ that is free in $E$ but is declared by
 * $D$.  This function checks to see whether that would happen if we applied an
 * instantiation to a formula.
 * 
 * For example, if we create a formula from the putdown notation
 * `{ :[x] (+ a 1) }`, with both `x` and `a` as metavariables, we could imagine
 * an instantiation of `a` with the expression `(* x 2)`.  No capture would
 * occur from the point of view of binding expressions, but capture would occur
 * from the point of view of the declaration of `x` at the start of the
 * environment, which functions conceptually like a binding.  This function
 * would return true in such a case, because capture of this type would occur.
 * 
 * Note that this function does *not* report on capture of the *other* type.
 * That is, it may be the case that, for some expression `E` inside the formula,
 * if we asked `E.isFreeToReplace(a,b)` where `b` is `(* x 2)`, we would get
 * false, but this function returns true, because it's not checking for capture
 * inside of expressions by a {@link BindingExpression}, but rather it is
 * checking only for capture that happens due to a declaration.
 * @memberof Formula
 * @alias Formula.hasDeclarationCapture
 */
const hasDeclarationCapture = ( formula, instantiation ) => {
    const dbg = foo => foo.toPutdown().replace( / \+\{"_type_Metavar"\:true\}\n/g, '_' )
    // console.log( 'Formula: ' + dbg( formula ) )
    // console.log( 'Instantiation:' )
    // Object.keys( instantiation ).map( key =>
    //     console.log( `\t${key} => ${dbg(instantiation[key])}` ) )
    const whatMightGetCaptured = subIntoThis => {
        const result = [ ...new Set( subIntoThis.descendantsSatisfying(
            d => ( d instanceof LurchSymbol ) && d.isA( Matching.metavariable )
        ) ) ].map( mv => {
            const image = lookup( instantiation, mv )
            return image == mv ? [ ] :
                image.freeSymbolNames().map( sym => [ mv.text(), sym ] )
        } ).flat()
        // console.log( 'In ' + dbg(subIntoThis) + ', possible captures are: '
        //     + result.join( ' ; ' ) )
        return result
    }
    const expressionsIn = target =>
        target instanceof Expression ? [ target ] :
        target instanceof Array ? target.map( expressionsIn ).flat() :
        expressionsIn( target.children() )
    const expressionScope = target =>
        expressionsIn( target.scope().filter( LC =>
            ( LC instanceof Expression ) && LC.isOutermost() ) )
    return formula.descendantsSatisfying(
        d => d instanceof Declaration
    ).some( d => {
        const declaredNames = d.symbols().map( s => s.text() )
        const declaredImages = d.symbols().map(
            s => lookup( instantiation, s ).text() )
        // console.log( 'Ignore: ' + declaredNames )
        // console.log( 'Seek:   ' + declaredImages )
        return expressionScope( d ).some( expr =>
            whatMightGetCaptured( expr ).some( data =>
                !declaredNames.includes( data[0] )
             && declaredImages.includes( data[1] ) ) )
    } )
}

// Helper function:  Look up a given metavariable in a given instantiation,
// whether that instantiation is a Solution, a Substitution, a Map, or an
// Object, and return a copy of the image, if there is one.
const lookup = ( instantiation, metavar ) => {
    if ( instantiation instanceof Matching.Substitution )
        return instantiation.metavariable.equals( metavar ) ?
            instantiation.expression.copy() : metavar
    if ( instantiation instanceof Matching.Solution ) {
        const mapsTo = instantiation.get( metavar )
        return mapsTo ? mapsTo.copy() : metavar
    }
    if ( instantiation instanceof Map ) {
        if ( !instantiation.has( metavar.text() ) ) return metavar
        const mapsTo = instantiation.get( metavar.text() )
        return mapsTo instanceof LogicConcept ? mapsTo.copy() : metavar
    }
    if ( instantiation instanceof Object ) {
        if ( !instantiation.hasOwnProperty( metavar.text() ) ) return metavar
        const mapsTo = instantiation[metavar.text()]
        return mapsTo instanceof LogicConcept ? mapsTo.copy() : metavar
    }
    throw new Error( `Invalid instantiation: ${instantiation}` )
}

// Helper function:  Check whether it's acceptable to call x.replaceWith( y ),
// in the sense that the resulting LogicConcept hierarchy would still be valid
// (only symbols are bound, no environments inside expressions, etc.).
// The "preserve" attribute is documented above, in instantiate().
const replaceIfPossible = ( target, replacement, preserve ) => {
    const parent = target.parent()
    // bound symbols must be symbols, not anything else
    if ( ( ( parent instanceof BindingEnvironment )
        || ( parent instanceof BindingExpression ) )
      && !( replacement instanceof LurchSymbol )
      && ( target != parent.body() ) )
        throw new Error( 'Cannot replace a bound symbol with a non-symbol' )
    // declared symbols must be symbols, not anything else
    if ( ( parent instanceof Declaration )
      && !( replacement instanceof LurchSymbol )
      && parent.symbols().includes( target ) )
        throw new Error( 'Cannot replace a delcared symbol with a non-symbol' )
    // expressions can contain only other expressions
    if ( ( parent instanceof Expression )
      && !( replacement instanceof Expression ) )
        throw new Error( 'Cannot place a non-expression inside an expression' )
    // no restrictions forbid us, so proceed
    // but note: replacing a declaration's body requires special care
    target.replaceWith( replacement )
    preserve.forEach( attrKey => {
        if ( target.hasAttribute( attrKey ) )
            replacement.setAttribute( attrKey,
                JSON.copy( target.getAttribute( attrKey ) ) )
    } )
}

/**
 * What are all instantiations of the given formula that produce the given
 * candidate?
 * 
 * On the one hand, it may seem like this is a simple application of
 * {@link module:Matching the Matching module}, and this is somewhat true.  The
 * only additional feature provided here is that the formula and its candidate
 * instantiation need not be {@link Expression Expressions}.  If they are not,
 * then they must have isomorphic structure except for any {@link Expression
 * Expressions} inside the two, which will be paired up to construct a matching
 * problem, whose solutions will be returned.
 * 
 * In other words, this function extends matching to support a single pair of
 * inputs that do not need to be {@link Expression Expressions}, and it does
 * exactly what you'd expect in that case.
 * 
 * This function is a generator that yields zero or more ways to instantiation
 * `formula` to produce `candidate`; all possible ways will be enumerated,
 * though it may be that there are no such ways, in which case the enumeration
 * will be empty.
 * 
 * @param {LogicConcept} formula a {@link LogicConcept} that has had
 *   metavariables added to it using {@link Formula.from}
 * @param {LogicConcept} candidate a {@link LogicConcept} that may or may not
 *   be an instantiation of the given `formula`
 * @alias Formula.allPossibleInstantiations
 */
function *allPossibleInstantiations ( formula, candidate ) {
    const problem = problemFromExpressionsWithin( formula, candidate )
    if ( !problem ) return // no isomorphism == no results
    yield* problem.solutions()
}

// Helper function used by allPossibleInstantiations(), above.
// Given two LogicConcepts that are not necessarily expressions, this ensures
// that they have the same structure outside of all expressions, and if so, it
// pairs up the corresponding expressions to produce a matching problem, which
// it then returns.  Otherwise, it returns null (no such pairing possible).
// Third argument is for internal use only; clients provide just the first two.
const problemFromExpressionsWithin = ( formula, candidate, result = null ) => {
    // create a problem if we were not passed one
    if ( result == null ) result = new Matching.Problem()
    // Case 1: The formula is an expression
    if ( formula instanceof Expression ) {
        if ( ( candidate instanceof Expression )
          && ( formula.isA( 'given' ) == candidate.isA( 'given' ) ) ) {
            // If the candidate is, they pair up in the matching problem
            result.add( formula.copy().unmakeIntoA( 'given' ),
                        candidate.copy().unmakeIntoA( 'given' ) )
            return result
        } else {
            return null // otherwise there can be no possible instantiation
        }
    } else { // Case 2: the formula is not an expression
        if ( ( candidate instanceof Expression )
          || ( formula.constructor.className
            != candidate.constructor.className )
          || ( formula.numChildren() != candidate.numChildren() )
          || ( formula.isA( 'given' ) != candidate.isA( 'given' ) ) ) {
            return null // candidate has diff. structure; no pairing possible
        } else {
            // Candidate has the same shape; proceed recursively
            for ( let i = 0 ; i < formula.numChildren() ; i++ ) {
                result = problemFromExpressionsWithin(
                    formula.child( i ), candidate.child( i ), result )
                if ( !result ) return null // if any child fails, all fails
            }
            return result // return the recursively-produced result
        }
    }
}

// Helper function:  Beta reduce an Expression only if necessary.
const betaIfNeeded = expr => Matching.fullBetaReduce( expr, false )

/**
 * To facilitate marking some {@link LogicConcept LogicConcepts} as cached
 * instantiations of formulas, we declare a string constant that can be used
 * with the {@link MathConcept#isA isA()} and {@link MathConcept#asA asA()} and
 * {@link MathConcept#makeIntoA makeIntoA()} functions in the
 * {@link MathConcept MathConcept} class.
 * 
 * This is used when we have a formula `F` and the inferences done in the scope
 * of that formula cite the formula and create instantiations of it.  Some of
 * our algorithms then insert those instantiations as next siblings following
 * `F` so that they are accessible at any location at which `F` is accessible.
 * But in order to distinguish those algorithmically-created instantiations
 * from content that was authored by the user, we mark algorithmically-created
 * instantiations with an attribute.  Specifically, for such an instantiation
 * `I`, we would call `I.makeIntoA( cachedInstantiation )`, and can then test
 * that later with `I.isA( cachedInstantiation )`.
 * 
 * @see {@link Formula.addCachedInstantiation addCachedInstantiation()}
 * @see {@link Formula.allCachedInstantiations allCachedInstantiations()}
 * @see {@link Formula.clearCachedInstantiations clearCachedInstantiations()}
 * @alias Formula.cachedInstantiation
 */
const cachedInstantiation = 'LDE CI'

/**
 * As described in {@link Formula.cachedInstantiation this documentation}, we
 * can insert after any formula instantiations of it.  This function adds a new
 * instantiation to that cache.  It does not first check to be sure that the
 * given instantiation is actually an instantiation of the given formula; the
 * client is in charge of ensuring that.  This function inserts the given
 * instantiation at the end of the given formula's instantiation cache and also
 * marks it with {@link Formula.cachedInstantiation the appropriate attribute}
 * so that it can be clearly identified as part of the cache.
 * 
 * If the formula has no parent, it can have no siblings, and thus this
 * function cannot do its job and will instead throw an error.
 * 
 * @param {LogicConcept} formula add a cached instantiation of this formula
 * @param {LogicConcept} instantiation the instantiation to add to the cache
 * @see {@link Formula.allCachedInstantiations allCachedInstantiations()}
 * @see {@link Formula.clearCachedInstantiations clearCachedInstantiations()}
 * @alias Formula.addCachedInstantiation
 */
const addCachedInstantiation = ( formula, instantiation ) => {
    if ( !formula.parent() )
        throw new Error(
            'Cannot insert cached instantiation: formula has no parent' )
    const existing = allCachedInstantiations( formula )
    const insertAfter = existing.length > 0 ? existing.last() : formula
    insertAfter.parent().insertChild(
        instantiation, insertAfter.indexInParent() + 1 )
    instantiation.makeIntoA( cachedInstantiation )
}

/**
 * As described in {@link Formula.cachedInstantiation this documentation}, we
 * can insert after any formula instantiations of it.  The sequence of next
 * siblings after a formula that have been marked as instantiations of it
 * (using {@link Formula.cachedInstantiation this constant}) are that formula's
 * instantiation cache.  This function returns that cache as a JavaScript
 * array, in the same order that the siblings appear following the formula.  It
 * may have zero or more entries, but will always be an array.
 * 
 * If the given formula has no parent, it will have no siblings and thus no
 * instantiation cache, and this function will return an empty array.
 * 
 * @param {LogicConcept} formula the formula whose cache should be computed
 * @returns {LogicConcept[]} the array of instantiations cached for the given
 *   formula
 * @see {@link Formula.addCachedInstantiation addCachedInstantiation()}
 * @see {@link Formula.clearCachedInstantiations clearCachedInstantiations()}
 * @alias Formula.allCachedInstantiations
 */
const allCachedInstantiations = formula => {
    const parent = formula.parent()
    if ( !parent ) return [ ]
    const result = [ ]
    const children = parent.children()
    let i = formula.indexInParent() + 1
    while ( i < children.length && children[i].isA( cachedInstantiation ) )
        result.push( children[i++] )
    return result
}

/**
 * As described in {@link Formula.cachedInstantiation this documentation}, we
 * can insert after any formula instantiations of it.  This function removes
 * all entries from that cache.  Because the cache is defined to be the
 * sequence of siblings following the formula that have the {@link
 * Formula.cachedInstantiation appropriate attribute}, this function actually
 * removes those {@link LogicConcept LogicConcepts} from their parent (which is
 * also the parent of the given formula).
 * 
 * If the given formula has no parent, it will have no instantiation cache, and
 * so this function will do nothing.
 * 
 * @param {LogicConcept} formula add a cached instantiation of this formula
 * @param {LogicConcept} instantiation the instantiation to add to the cache
 * @see {@link Formula.allCachedInstantiations allCachedInstantiations()}
 * @see {@link Formula.addCachedInstantiation addCachedInstantiation()}
 * @alias Formula.clearCachedInstantiations
 */
const clearCachedInstantiations = formula => {
    allCachedInstantiations( formula ).forEach(
        instantiation => instantiation.remove() )
}

// Helper function used by possibleSufficientInstantiations(), below.
// Traverses any given LogicConcept and returns an object of the form
// { positives : [ ... ], negatives : [ ... ] }, where the two arrays are full
// of the outermost expressions in the given LogicConcept, in the same order
// they appear in the tree, but classified by parity.  There is also a "both"
// member in the result, which just concatenates the two arrays.
const classifyByParity = ( LC, parity = 1 ) => {
    // Base case: this is an Expression; classify by the given parity
    if ( LC instanceof Expression ) {
        const claim = LC.copy().unmakeIntoA( 'given' )
        claim.original = LC
        return parity == 1 ?
            { positives : [ claim ], negatives : [ ], both : [ claim ] }
          : { positives : [ ], negatives : [ claim ], both : [ claim ] }
    }
    // Other base case: some type of LC we cannot handle; don't classify it
    const result = { positives : [ ], negatives : [ ], both : [ ] }
    if ( !( LC instanceof Environment ) ) return result
    // Inductive case: recur on children, gather their results, in order
    LC.children().forEach( child => {
        const childResult = classifyByParity( child,
            parity * ( child.isA( 'given' ) ? -1 : 1 ) )
        result.positives = result.positives.concat( childResult.positives )
        result.negatives = result.negatives.concat( childResult.negatives )
        result.both = result.both.concat( childResult.both )
    } )
    return result
}

// Utility function used by possibleSufficientInstantiations(), below.
// Takes a list [ LC_1, ..., LC_n ] of LCs and returns a sublist such that no
// two entries are .equals() with one another.
const duplicateLCsRemoved = listOfLCs => {
    const result = [ ]
    listOfLCs.forEach( LC => {
        if ( !result.some( earlierLC => earlierLC.equals( LC ) ) )
            result.push( LC )
    } )
    return result
}

// Utility function used by possibleSufficientInstantiations(), below.
// Takes a pattern list [ p_1, ..., p_n ] and a list of lists of candidate
// matches, [ L_1, ..., L_n ] (each L_i being a list of LCs) and an index of
// the first optional match.
// Modifies the first two arguments in place and returns a new index of the
// first optional match, ensuring that no p_i.equals( p_j ), but all constraints
// on the same pattern have been united into one list of candidate matches.
const removeDuplicatePatterns = (
    patterns, candidateLists, firstOptionalIndex
) => {
    // Drop any optional patterns that are also required patterns (and thus
    // appearing earlier in the patterns list, as a requirement).
    const requiredPatterns = patterns.slice( 0, firstOptionalIndex )
    for ( let i = patterns.length - 1 ; i >= firstOptionalIndex ; i-- ) {
        if ( requiredPatterns.some(
                required => required.equals( patterns[i] ) ) ) {
            patterns.splice( i, 1 )
            candidateLists.splice( i, 1 )
        }
    }
    // For any two requirements that share the same pattern, merge it into a
    // single requirement for that pattern, with the candidate list being the
    // intersection of the original two candidate lists (since both must match).
    const LCListIntersection = ( LCList1, LCList2 ) =>
        LCList1.filter( LC1 => LCList2.some( LC2 => LC1.equals( LC2 ) ) )
    for ( let i = firstOptionalIndex - 1 ; i >= 0 ; i-- ) {
        const earlierIndex = patterns.slice( 0, i ).findIndex(
            earlierPattern => earlierPattern.equals( patterns[i] ) )
        if ( earlierIndex > -1 ) {
            candidateLists[earlierIndex] = LCListIntersection(
                candidateLists[earlierIndex], candidateLists[i] )
            patterns.splice( i, 1 )
            candidateLists.splice( i, 1 )
            firstOptionalIndex-- // because we removed a required pattern
        }
    }
    // Now do the same thing for optional patterns as well.
    for ( let i = patterns.length - 1 ; i >= firstOptionalIndex ; i-- ) {
        const earlierIndex = patterns.slice( firstOptionalIndex, i ).findIndex(
            earlierPattern => earlierPattern.equals( patterns[i] ) )
        if ( earlierIndex > -1 ) {
            candidateLists[earlierIndex] = LCListIntersection(
                candidateLists[earlierIndex], candidateLists[i] )
            patterns.splice( i, 1 )
            candidateLists.splice( i, 1 )
        }
    }
    // Done--return new firstOptionalIndex
    return firstOptionalIndex
}

// Utility function used by possibleSufficientInstantiations(), below.
// Given a pattern P and a list L of possible instantiations of the pattern,
// this function returns a (typically smaller) list L' that contains only those
// entries from L that have the same top-level signature as P.
// P and Q have the same top-level signature iff:
// - P is a single metavariable, meaning it could match anything, or
// - P is a compound expression whose operator and number of operands match
//   those of Q
const filterBySignature = ( P, L ) => {
    // a single metavariable matches anything
    if ( P.isAtomic() ) return L
    // filter first by number of children
    L = L.filter( entry => entry.numChildren() == P.numChildren() )
    // filter next by operator, unless that operator is a metavariable
    const operator = P.firstChild()
    if ( !operator.isA( Matching.metavariable ) )
        L = L.filter( entry => entry.firstChild().equals( operator ) )
    return L
}

/**
 * Given a sequent and a formula, is there an instantiation of the formula that,
 * if added as another premise to the sequent, would make the sequent true?  The
 * answer to that question depends upon which deductive system is providing the
 * meaning of "true" for sequents, but in any reasonable case, finding exactly
 * the set of instantiations that would make a sequent true will typically be at
 * least as difficult as validating the instantiated sequent, perhaps moreso.
 * Consequently, this function does not attempt to find the exact correct answer
 * to that question, but rather finds a superset of the answer, guaranteeing
 * that any instantiation that would make the sequent hold will be among the
 * results.  Those results can be filtered further, if desired, by the client,
 * by running them through the validation algorithm for the deductive system in
 * play.
 * 
 * The default is to search for instantiations that will make the sequent true
 * when validated by {@link ValidationTools.classicalPropositionalValidator
 * classical propositional logic}.  However, if the client will be using
 * {@link ValidationTools.intuitionisticPropositionalValidator intuitionistic
 * propositional logic} instead, the results can be filterted further; simply
 * set `intuitionistic: true` in the options object.  This will not only return
 * fewer results, but also speed up the search for those results.
 * 
 * The default is to search for instantiations that will make the sequent true
 * even if the formula itself is only an intermediate step in a larger chain of
 * inferences.  However, it is often the case that the client wants the formula
 * to be the final step that achieves the sequent's conclusion (say, if a
 * student should be expected to cite a formula directly relevant to the
 * statement they're justifying).  This will significantly narrow the search
 * space and the result set and will consequently speed up the search.  Simply
 * set `direct: true` in the options object.
 * 
 * The default is to do the work silently, not generating any debugging output.
 * But if debugging a complex problem, it may help to see the inner workings of
 * this function.  Set `debug: true` in the options object to print copious
 * debugging output to the console.
 * 
 * This function is a generator that yields a sequence of objects in the same
 * format as those returned by {@link module:Matching.allInstantiations
 * allInstantiations()}; see its documentation for details.
 * 
 * @param {Sequent} sequent the sequent whose conclusion the client hopes to
 *   justify by instantiating the formula
 * @param {Formula} formula the formula whose possible instantiations are to be
 *   explored
 * @param {Object} options a dictionary of options, which default to
 *   `{ direct: false, intuitionistic: false, debug: false }` and whose meaning
 *   is given above
 * @alias Formula.possibleSufficientInstantiations
 */
function *possibleSufficientInstantiations (
    sequent, formula, options = { }
) {
    // Assign default options
    options = Object.assign( {
        direct : false, intuitionistic : false, debug : false
    }, options )
    if ( options.debug ) {
        console.log( 'Sequent: ' + sequent.toPutdown() )
        console.log( 'Formula: ' + formula.toPutdown() )
    }
    // Compute and classify the outermost expressions in the sequent.
    const sequentOEs = classifyByParity( sequent )
    // Now view the formula as a set of formulas, one for each of its
    // conclusions.  The conditionalForm() function is ideal for this.
    for ( let innerFormula of formula.conditionalForm() ) {

        // Compute outermost expres in the formula; classifying not used here.
        const classified = classifyByParity( innerFormula )
        let patterns = classified.both.slice()
        patterns.unshift( patterns.pop() )
        // Candidates to match with each are all outermost expressions of the
        // sequent, so we make many copies of that for use below.
        let candidates = Array( patterns.length ).fill( sequentOEs.both )

        // Now process the options object.
        let numRequired = 0
        if ( options.direct ) {
            // If direct = true, then the final conclusion of the formula must
            // match the final conclusion of the sequent, so we can simplify:
            candidates[0] = [ sequentOEs.both.last() ]
            numRequired = 1
        } else if ( options.intuitionistic ) {
            // If direct = false, but intuitionistics = true, the formula
            // conclusion must still match something in positive position.
            candidates[0] = sequentOEs.positives
            numRequired = 1
        }
        // If intuitionistics = true, we can also require any formulaOE that is
        // the last child of a top-level premise to match a negative sequentOE.
        if ( options.intuitionistic ) {
            const isLastChildOfTopLevelPremise = x => x.parent() && ( (
                // either :{ ... x } is a child of the innerFormula but not the last:
                x == x.parent().lastChild()
             && x.parent().parent() == innerFormula
             && x.parent() != innerFormula.lastChild()
            ) || (
                // or :x is a child of the innerFormula but not the last:
                x.parent() == innerFormula
             && x != innerFormula.lastChild()
            ) )
            const toMatchNegatives = patterns.slice( 1 ).filter(
                x => isLastChildOfTopLevelPremise( x.original ) )
            const toMatchAnything = patterns.slice( 1 ).filter(
                x => !isLastChildOfTopLevelPremise( x.original ) )
            patterns = [ patterns[0], ...toMatchNegatives, ...toMatchAnything ]
            candidates = [ candidates[0],
                ...Array( toMatchNegatives.length ).fill( sequentOEs.negatives ),
                ...Array( toMatchAnything.length ).fill( sequentOEs.both ) ]
            numRequired = 1 + toMatchNegatives.length
        }

        if ( options.debug ) {
            console.log( `Calling Matching w/j=${numRequired} and:` )
            for ( let i = 0 ; i < patterns.length ; i++ ) {
                console.log( 'Pair '+i+':' )
                console.log( patterns[i].toPutdown() )
                for ( let j = 0 ; j < candidates[i].length ; j++ )
                    console.log( '\t' + candidates[i][j].toPutdown() )
            }
        }

        // Now yield all instantiations for this innerFormula
        // But fix their expression indices to match the tree order, because
        // the way we've permuted them will not make sense to the caller.
        const origPatternIndex = pattern => classified.both.indexOf( pattern )
        const unpermute = anyArray => {
            const result = Array( anyArray ).fill( 0 )
            for ( let i = 0 ; i < anyArray.length ; i++ )
                result[origPatternIndex( patterns[i] )] = anyArray[i]
            return result
        }
        // Make the optional multi-matching problem we're about to run as
        // efficient as possible, by removing duplicate candidates, combining
        // constraints where possible, and applying signature filtering.
        candidates = candidates.map( duplicateLCsRemoved )
        numRequired = removeDuplicatePatterns(
            patterns, candidates, numRequired )
        for ( let i = 0 ; i < patterns.length ; i++ )
            candidates[i] = filterBySignature( patterns[i], candidates[i] )
        // Now prepare to run the optional multi-matching algorithm.
        if ( options.debug ) {
            console.log( 'Patterns:   [ '
                       + patterns.map( x => x.toPutdown() ).join( ', ' ) + ' ]' )
            console.log( 'Candidates: [ '
                       + candidates.map( x => '[ '
                       + x.map( y => y.toPutdown() ).join( ', ' ) + ' ]' ) + ' ]' )
            console.log( 'Classified: [ '
                       + classified.both.map( x => x.toPutdown() ).join( ', ' )
                       + ' ]' )
            console.log( 'sequentOEs: [ '
                       + sequentOEs.both.map( x => x.toPutdown() ).join( ', ' )
                       + ' ]' )
        }
        const generator = Matching.allOptionalInstantiations(
            patterns, candidates, numRequired )
        // Before returning its results, convert the expression indices back to
        // ones the client will expect, since we have permuted the client's
        // inputs as needed for matching purposes.
        for ( let solObj of generator ) {
            if ( options.debug )
                console.log( 'Before: '
                           + JSON.stringify( solObj.expressionIndices ) + ' '
                           + solObj.solution.toString() )
            solObj.expressionIndices =
                solObj.expressionIndices.map(
                    ( exprInd, patInd ) => sequentOEs.both.findIndex(
                        x => candidates[patInd][exprInd]
                          && x.original == candidates[patInd][exprInd].original ) )
            if ( options.debug )
                console.log( 'Half:   '
                           + JSON.stringify( solObj.expressionIndices ) + ' '
                           + solObj.solution.toString() )
            solObj.expressionIndices = unpermute(
                solObj.expressionIndices )
            if ( options.debug )
                console.log( 'After:  '
                           + JSON.stringify( solObj.expressionIndices ) + ' '
                           + solObj.solution.toString() )
            yield solObj
        }
    }
}

export default {
    from, domain, instantiate,
    allPossibleInstantiations, possibleSufficientInstantiations,
    cachedInstantiation, addCachedInstantiation,
    allCachedInstantiations, clearCachedInstantiations,
    hasDeclarationCapture
}
