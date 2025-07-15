
import { Symbol as LurchSymbol } from '../symbol.js'
import { Application } from '../application.js'
import { LogicConcept } from '../logic-concept.js'
import { metavariable, containsAMetavariable } from './metavariables.js'
import { isAnEFA } from './expression-functions.js'
import {
    equal as deBruijnEquals, encodeExpression, decodeExpression,
    numberOfOccurrences
} from './de-bruijn.js'

// If an EFA constraint has one or more of its arguments containing a
// metavariable, its complexity is unknown, because it is contingent upon the
// (as yet undetermined) value of that metavariable.  So we need some constant
// to use as a reasonable estimate for the complexity of (that part of) the
// constraint in such a case, for triaging constraints.  The following constant
// is used for that purpose, and can be tweaked through experimentation and
// profiling to find the best value for the efficiency of the matching
// algorithm.
const EFAComplexityEstimate = 2

/**
 * A Constraint is a pattern-expression pair often written $(p,e)$ and used to
 * express the idea that the expression $e$ matches the pattern $p$.  The $e$
 * will be an instance of {@link Expression Expression} and the $p$ will be as
 * well, but it may contain metavariables, as defined
 * {@link module:Metavariables.metavariable here}.  For more information on how
 * Constraints fit into the work of matching in general, see
 * {@link module:Matching the documentation for the matching module}.
 * 
 * Note that a Constraint need not be true or satisfiable.  Here are three
 * examples using ordinary mathematical notation.  For the purposes of these
 * examples, let us assume that capital letter symbols stand for metavariables,
 * and no other symbols are metavariables.
 * 
 *  * The constraint $(3-t,3-t)$ is clearly satisfiable, because its expression
 *    already exactly matches its pattern, with no metavariables even coming
 *    into play at all.
 *  * The constraint $(A+B,3x+y^2)$ is satisfiable, because we could instantiate
 *    the metavariables with $A\mapsto 3x,B\mapsto y^2$ to demonstrate that $e$
 *    is of the form expressed by $p$.
 *  * The constraint $(3,\forall x.P(x))$ is not satisfiable, because $p\neq e$
 *    and $p$ contains no metavariables that we might instantiate to change $p$.
 *  * The constraint $(A+B,\forall x.P(x))$ is not satisfiable, because no
 *    possible instantiations of the metavariables $A,B$ can make the summation
 *    in $p$ into the universal quantifier in $e$.
 * 
 * Typically Constraints are arranged into sets, and there are algorithms for
 * solving sets of Constraints.  See the {@link Problem Problem class} for more
 * details.
 */
export class Constraint {

    /**
     * Constructs a new Constraint with the given pattern and expression.
     * Throws an error if `expression` satisfies
     * {@link module:Metavariables.containsAMetavariable containsAMetavariable()}.
     * 
     * Constraints are to be treated as immutable.  Do not later alter the
     * pattern or expression of this constraint.  If you need a different
     * constraint, simply construct a new one.
     * 
     * @param {Expression} pattern any {@link Expression Expression} instance,
     *   but typically one containing metavariables, to be used as the pattern
     *   for this Constraint, as documented at the top of this page
     * @param {Expression} expression any {@link Expression Expression} instance
     *   that contains no instance of a metavariable, so that it can be used as
     *   the expression for this Constraint
     * 
     * @see {@link Constraint#pattern pattern getter}
     * @see {@link Constraint#expression expression getter}
     */
    constructor ( pattern, expression ) {
        if ( containsAMetavariable( expression ) )
            throw new Error(
                'The expression in a constraint may not contain metavariables' )
        if ( pattern.hasDescendantSatisfying(
                d => d.isA( metavariable ) && !d.isFree( pattern ) ) )
            throw new Error( 'The pattern may not contain bound metavariables' )
        this._pattern = pattern
        this._expression = expression
    }

    /**
     * Getter for the pattern provided at construction time.  This function is
     * useful for making the pattern member act as a read-only member, even
     * though no member is really read-only in JavaScript.
     * 
     * @returns {LogicConcept} the pattern given at construction time
     */
    get pattern () { return this._pattern }

    /**
     * Getter for the expression provided at construction time.  This function
     * is useful for making the expression member act as a read-only member,
     * even though no member is really read-only in JavaScript.
     * 
     * @returns {LogicConcept} the expression given at construction time
     */
    get expression () { return this._expression }

    /**
     * Creates a copy of this Constraint.  It is a shallow copy, in the sense
     * that it shares the same pattern and expression instances with this
     * Constraint, but that should be irrelevant, because Constraints are
     * immutable.  That is, they never alter their own patterns or expressions,
     * and the client is instructed not to alter them either, as per the
     * documentation in {@link Constraint the constructor}.
     * 
     * @returns {Constraint} a copy of this Constraint
     */
    copy () { return new Constraint( this._pattern, this._expression ) }

    /**
     * Two Constraints are equal if they have the same pattern and the same
     * expression.  Comparison of patterns and expressions is done using the
     * {@link MathConcept#equals equals()} member of the
     * {@link MathConcept MathConcept} class.
     * 
     * @param {Constraint} other another instance of this class, to be compared
     *   with this one for equality
     * @returns {boolean} whether the two instances are structurally equal
     */
    equals ( other ) {
        return this._pattern.equals( other._pattern )
            && this._expression.equals( other._expression )
    }

    /**
     * Create a copy of this Constraint, except with the given list of
     * {@link Substitution Substitutions} applied to it, in the order given.
     * Because Constraint expressions cannot contain metavariables, it is
     * necessary to apply the {@link Substitution Substitutions} only to the
     * pattern portion of the Constraint.  The same expression can be reused.
     * 
     * @param  {...Substitution} subs the list of
     *   {@link Substitution Substitutions} to apply
     * @returns {Constraint} a copy of this Constraint, but with the given
     *   {@link Substitution Substitutions} applied to its pattern
     */
    afterSubstituting ( ...subs ) {
        let newPattern = this.pattern
        subs.forEach( sub => newPattern = sub.appliedTo( newPattern ) )
        return new Constraint( newPattern, this.expression )
    }

    /**
     * If a Constraint's pattern is a single metavariable, then that Constraint
     * can be used as a tool for substitution.  For instance, the Constraint
     * $(A,2)$ can be applied to the expression $A-\frac{A}{B}$ to yield
     * $2-\frac{2}{B}$.  A Constraint is only useful for application if its
     * pattern is a single metavariable.  This function tests whether that is
     * the case.
     * 
     * @returns {boolean} true if and only if this Constraint can be applied
     *   like a function (that is, whether its pattern is just a single
     *   metavariable)
     * 
     * @see {@link Constraint#applyTo applyTo()}
     * @see {@link Constraint#appliedTo appliedTo()}
     */
    isAnInstantiation () {
        return this.pattern instanceof LurchSymbol
            && this.pattern.isA( metavariable )
    }

    /**
     * Apply the {@link module:deBruijn.encodeExpression de Bruijn encoding} to
     * the pattern and the expression in this Constraint, in place.
     * 
     * This function should be applied only once to any given Constraint,
     * because even though it is possible to do it more than once, one should
     * think of the set of ordinary {@link MathConcept MathConcepts} as distinct
     * from the set of de Bruijn-encoded ones, and this function maps the former
     * set to the latter, but does not map the latter anywhere.
     * 
     * @see {@link Constraint#deBruijnDecode deBruijnDecode()}
     */
    deBruijnEncode () {
        this._pattern = encodeExpression( this._pattern )
        this._expression = encodeExpression( this._expression )
    }
    
    /**
     * Apply the {@link module:deBruijn.decodeExpression de Bruijn decoding} to
     * the pattern and the expression in this Constraint, in place.
     * 
     * This function should be applied only to a Constraint that has been de
     * Bruijn encoded first, because even though it is possible to call this
     * function on any Consraint, one should think of the set of ordinary
     * {@link MathConcept MathConcepts} as distinct from the set of de
     * Bruijn-encoded ones, and this function maps the latter set to the former,
     * but does not map the former anywhere.
     * 
     * @see {@link Constraint#deBruijnEncode deBruijnEncode()}
     */
    deBruijnDecode () {
        this._pattern = decodeExpression( this._pattern )
        this._expression = decodeExpression( this._expression )
    }

    /**
     * Compute and return the complexity of this Constraint.  The return value
     * is cached, so that future calls to this function do not recompute it.
     * The cache is never invalidated, because Constraints are viewed as
     * immutable.  Complexities include:
     * 
     *  * 0, or "failure": any constraint not matching any of the categories
     *    listed below, and therefore impossible to reconcile into a solution
     *  * 1, or "success": any constraint $(p,e)$ for which $p=e$ (and thus $p$
     *    contains no metavariables)
     *  * 2, or "instantiation": any constraint $(p,e)$ for which $p$ is a lone
     *    metavariable, so that the clear unique solution is $p\mapsto e$
     *  * 3, or "children": any constraint $(p,e)$ where $p$ and $e$ are both
     *    compound expressions with the same structure, so that the appropriate
     *    next step en route to a solution is to pair up their corresponding
     *    children and see if a solution exists to that Constraint set
     *  * 4 and up, or "EFA": any constraint $(p,e)$ where $p$ is an Expression
     *    Function Application, as defined in the documentation for the
     *    {@link ExpressionFunctions ExpressionFunctions} namespace
     * 
     * This value can be used to sort Constraints so that constraints with lower
     * complexity are processed first in algorithms, for the sake of efficiency.
     * For example, the {@link Problem Problem} class has algorithms that make
     * use of this function.
     * 
     * @returns {integer} the complexity of this Constraint, ranked on a scale
     *   beginning with zero (trivial) and counting upwards towards more
     *   complex constraints
     * @see {@link Constraint#complexityName complexityName()}
     */
    complexity () {
        // If the answer is cached, use that:
        if ( this.hasOwnProperty( '_complexity' ) )
            return this._complexity
        // First 3 cases are easy:
        if ( this.isAnInstantiation() ) // instantiation type
            return this._complexity = 2
        if ( isAnEFA( this.pattern ) ) { // EFA type
            // The complexity of the EFA P(x) is determined by the number of
            // copies of x appearing in the expression.  More copies implies
            // greater complexity.  We sum the complexity of all arguments in
            // the non-unary case, which is logical, given that they are
            // actually exponents in running time, and higher arity multiplies
            // running times.  If the x contains a metavariable, we cannot do
            // such a computation, but just use the estimate documented at the
            // top of this file instead.
            this._argumentCopyCount = [ ]
            this._argumentContainsMetavariable = [ ]
            this._argumentComplexity = [ ]
            for ( let i = 2 ; i < this.pattern.numChildren() ; i++ ) {
                const arg = this.pattern.child( i )
                const copyCount = numberOfOccurrences( arg, this.expression )
                const hasMetavariable = containsAMetavariable( arg )
                this._argumentCopyCount.push( copyCount )
                this._argumentContainsMetavariable.push( hasMetavariable )
                this._argumentComplexity.push(
                    hasMetavariable ? EFAComplexityEstimate : copyCount )
            }
            return this._complexity = 4
                 + this._argumentComplexity.reduce( (a,b)=>a+b, 0 )
        }
        if ( !containsAMetavariable( this.pattern ) ) // success/failure
            return this._complexity =
                deBruijnEquals( this.pattern, this.expression ) ? 1 : 0
        // Now we know the pattern is nonatomic, because it contains no
        // metavariables, but is also not a lone metavariable.
        // Since it is not an EFA, and we have converted all bindings to
        // Applications, it is an Application.  We therefore just check to see
        // if the # children match, and return children or failure.
        return this._complexity = this.pattern.numChildren()
                               == this.expression.numChildren() ? 3 : 0
    }

    // For use only by the Problem class.  If a constraint's complexity is
    // exactly 4, that means that it is an EFA and all of its arguments are
    // expressions (not patterns) but none of them appear in the expression of
    // the constraint, meaning that the EFA metavariable can be instantiated
    // only with a constant function.  This can prune branches of recursion.
    canBeOnlyConstantEFA () { return this._complexity == 4 }
    // For use only by the Problem class.  There are certain circumstances in
    // which it's easy to tell that an EFA constraint can't be a projection
    // function (on a given argument index).  In particular, if the argument at
    // that index is an expression (not a pattern) that appears exactly once in
    // the constraint's expression, then a projection function might work, but
    // if either of those conditions is false, then it cannot, and we can skip
    // even constructing the projection EFA in that case.
    canBeAProjectionEFA ( index ) {
        return this._argumentCopyCount[index] == 1
            || this._argumentContainsMetavariable[index]
    }

    /**
     * This function returns a single-word description of the
     * {@link Constraint#complexity complexity()} of this Constraint.  It is
     * mostly useful in debugging.  The names listed after each integer in the
     * documentation for the {@link Constraint#complexity complexity()} function
     * are the names returned by this function.
     * 
     * @returns {string} a description of this Constraint's complexity
     * 
     * @see {@link Constraint#complexity complexity()}
     */
    complexityName () {
        return [
            'failure', 'success', 'instantiation', 'children', 'EFA'
        ][Math.min( this.complexity(), 4 )]
    }

    /**
     * If a Constraint has {@link Constraint#complexity complexity()} = 3,
     * and thus {@link Constraint#complexityName complexityName()} = "children",
     * then the pattern and expression are both {@link Application Applications}
     * and have the same number of children.  It is therefore useful when
     * solving this constraint to pair up the corresponding children into new
     * Constraint instances.  This function does so, returning them as an array.
     * 
     * For example, if we have a pattern $p=(a~b~c~d)$ and an expression
     * $e=(w~x~y~z)$ then the Constraint $(p,e)$ has complexity 3, and we can
     * call this function on it, yielding three new Constraints, $(a,w)$,
     * $(b,x)$, $(c,y)$ and $(d,z)$.
     * 
     * @returns {...Constraint} all child constraints computed from this
     *   Constraint, as a JavaScript array, in the same order that the children
     *   appear in the pattern (and expression) of this constraint
     * 
     * @see {@link Constraint#complexity complexity()}
     */
    children () {
        if ( this.complexity() != 3 ) // if it's not children type
            throw 'Cannot compute children for this type of Constraint'
        return this.pattern.children().map( ( child, index ) =>
            new Constraint( child, this.expression.child( index ) ) )
    }

    /**
     * The string representation of a Constraint $(p,e)$ is simply the string
     * "(P,E)" where P is the {@link LogicConcept#toPutdown putdown}
     * representation of $p$ and E is the {@link LogicConcept#toPutdown putdown}
     * representation of $e$.
     *
     * It also replaces the overly wordy JSON notation for
     * {@link module:Metavariables.metavariable metavariables} with a
     * double-underscore, just to increase brevity and clarity when debugging.
     * 
     * @returns {string} a string representation of the Constraint, useful in
     *   debugging
     */
    toString () {
        return `(${this.pattern.toPutdown()},${this.expression.toPutdown()})`
            .replace( / \+\{"LDE DB":[^\n]+\}\n/g, '' )
            .replace( /"\[\\"LDE DB\\"\,\\"(.*?)\\"\]"/g, '.$1' )
            .replace( /"\[\\"LDE DB\\"\,(.*?)\]"/g, '($1)' )
            .replace( /"LDE DB"/g, 'DB' )
            .replace( /\n      /g, '' )
            .replace( / \+\{"_type_Metavar":true\}\n/g, '__' )
            .replace( /"LDE EFA"/g, '@' )
            .replace( /"LDE lambda"/g, '𝝺' )
    }

}
