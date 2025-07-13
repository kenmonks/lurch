
import { metavariable, metavariableNamesIn } from './metavariables.js'
import { Symbol as LurchSymbol } from '../symbol.js'
import { LogicConcept } from '../logic-concept.js'
import { Expression } from '../expression.js'
import { Constraint } from './constraint.js'
import { encodeExpression, decodeExpression } from './de-bruijn.js'

/**
 * A substitution is a metavariable-expression pair $(m,e)$ that can be used for
 * substitution in other expressions.  (See also the definitions of
 * {@link module:Metavariables.metavariable metavariable} and
 * {@link Expression Expression}.)
 * 
 * For example, if $x$ is a metavariable and $(x,2k-1)$ is a substitution, then
 * if we consider the expression $x^2+px$, applying the substitution would yield
 * the expression $(2k-1)^2+p(2k-1)$.
 */
export class Substitution {

    /**
     * Constructs a new Substitution instance from a variety of types of inputs.
     * See the documentation at the top of this class for the explanation of how
     * a Substitution instance is a metavariable-expression pair $(m,e)$.
     * 
     *  * If two inputs are given, a metavariable $m$ and an expression $e$,
     *    construct a Substitution from the pair $(m,e)$.
     *  * If one input is given, a {@link Constraint Constraint}, and that
     *    constraint passes the
     *    {@link Constraint#isAnInstantiation isAnInstantiation()} test, then it
     *    can be interpreted as a Substitution.  The constraint $(p,e)$ is such
     *    that $p$ is a metavariable, and thus if we let $m=p$, we have a
     *    substitution $(m,e)$.
     *  * In all other cases, throw an error, because the cases above are the
     *    only supported cases.
     * 
     * @see {@link Substitution#metavariable metavariable getter}
     * @see {@link Substitution#expression expression getter}
     */
    constructor ( ...args ) {
        // Case 1: a single Constraint that can be applied
        if ( args.length == 1 && ( args[0] instanceof Constraint )
                              && args[0].isAnInstantiation() ) {
            this._metavariable = args[0].pattern
            this._expression = args[0].expression
        // Case 2: a metavariable-expression pair
        } else if ( args.length == 2 && ( args[0] instanceof LurchSymbol )
                                     && args[0].isA( metavariable )
                                     && ( args[1] instanceof Expression ) ) {
            this._metavariable = args[0]
            this._expression = args[1]
        // No other cases are supported
        } else {
            throw 'Invalid parameters to Substitution constructor'
        }
    }

    /**
     * Getter for the metavariable provided at construction time.  This function is
     * useful for making the metavariable member act as a read-only member, even
     * though no member is really read-only in JavaScript.
     * 
     * @returns {Symbol} the metavariable given at construction time
     */
    get metavariable () { return this._metavariable }

    /**
     * Getter for the expression provided at construction time.  This function
     * is useful for making the expression member act as a read-only member,
     * even though no member is really read-only in JavaScript.
     * 
     * @returns {Expression} the expression given at construction time
     */
    get expression () { return this._expression }

    /**
     * Get the set of names of metavariables that appear anywhere in the
     * expression of this substitution.  Caches the result so that once it is
     * computed, this is fast to compute again.
     * 
     * @returns {Set} a Set of strings, equal to the names of all metavariables
     *   appearing in the expression of this substitution
     */
    metavariableNames () {
        if ( !this.hasOwnProperty( '_metavariableNames' ) )
            this._metavariableNames = metavariableNamesIn( this._expression )
        return this._metavariableNames
    }

    /**
     * Creates a deep copy of this Substitution, that is, its metavariable and
     * expression are copies of the ones in this object.
     * 
     * @returns {Substitution} a deep copy of this Substitution
     */
    copy () {
        const result = new Substitution( this._metavariable.copy(),
                                         this._expression.copy() )
        if ( this.hasOwnProperty( '_metavariableNames' ) )
            result._metavariableNames = new Set( this._metavariableNames )
        return result
    }

    /**
     * Two Substitutions are equal if they have the same metavariable and the
     * same expression.  Comparison of metavariables and expressions is done
     * using the {@link MathConcept#equals equals()} member of the
     * {@link MathConcept MathConcept} class.
     * 
     * @param {Substitution} other another instance of this class, to be
     *   compared with this one for equality
     * @returns {boolean} whether the two instances are structurally equal
     */
    equals ( other ) {
        return this._metavariable.equals( other._metavariable )
            && this._expression.equals( other._expression )
    }

    /**
     * Apply this Substitution to the given `target`, in place.
     * 
     *  * If the `target` is a {@link LogicConcept LogicConcept}, find all
     *    subexpressions of it that are
     *    {@link MathConcept#equals structurally equal} to the metavariable of
     *    this Substitution, and replace all of them simultaneously with the
     *    expression of this Substitution.  (All the documentation after this
     *    bulleted list is for this case.)
     *  * If the `target` is any other type of object that has a `substitute`
     *    method, call that method, passing this Substitution object as an
     *    argument, and let the `target` handle the details.  In particular,
     *    this class itself
     *    {@link Substitution#substitute implements a substitute() method}, so
     *    Substitutions can be applied to one another.
     *  * No other cases are supported, and will throw errors.
     * 
     * The word "simultaneously" is important because if the expression that is
     * inserted as part of the replacement contains any metavariables, they will
     * not be considered for substitution.
     * 
     * Note that there is one case in which this may fail to produce the desired
     * results:  If the `target` is itself a copy of this Substitution's
     * metavariable, and has no parent, then it cannot be replaced in-place, due
     * to the nature of the {@link MathConcept MathConcept} replacement API.  If
     * such a case may occur, you may prefer to use the
     * {@link Substitution#appliedTo appliedTo()} function instead.
     * 
     * @param target the target to which we should apply this Substitution, in
     *   place
     * 
     * @see {@link Substitution#appliedTo appliedTo()}
     * @see {@link Substitution#substitute substitute()}
     */
    applyTo ( target ) {
        if ( target instanceof LogicConcept ) {
            // Compute the list of metavariables to replace:
            const toReplace = target.descendantsSatisfying(
                d => d.equals( this._metavariable ) )
            // Replace them all:
            toReplace.forEach( d => d.replaceWith( this._expression.copy() ) )
            return
        }
        if ( 'substitute' in target )
            return target.substitute( this )
        throw new Error( 'Target of applyTo() must be a LogicConcept '
                        + 'or have a substitute() method' )
    }

    /**
     * Apply this Substitution to the given `target`, returning the result as a
     * new instance (not altering the original).
     * 
     * If the target is a {@link LogicConcept LogicConcept}, this is identical
     * to {@link MathConcept#copy making a copy of `target`} and then calling
     * {@link Substitution#applyTo applyTo()} on it, except for one case:  If
     * the `target` is equal to the metavariable of this Substitution, and has
     * no parent, then {@link Substitution#applyTo applyTo()} will have no
     * effect, but this routine will return a copy of the Substitution's
     * expression, as expected.
     * 
     * If the target is not a {@link LogicConcept LogicConcept}, but it
     * implements the `afterSubstituting()` method, then that method is called
     * with this Substitution as argument, and its result returned.  In
     * particular, this class itself
     * {@link Substitution#afterSubstituting implements an afterSubstituting() method},
     * so one can apply Substitutions to other Substitutions.
     * 
     * No other options are supported, and will return an error.
     * 
     * @param target the object to which we should apply this Substitution,
     *   resulting in a copy
     * @returns {any} a new copy of the `target` with the application of this
     *   Substitution having been done
     * 
     * @see {@link Substitution#applyTo applyTo()}
     * @see {@link MathConcept#copy copy()}
     */
    appliedTo ( target ) {
        if ( target instanceof LogicConcept ) {
            // Handle the corner case that applyTo() cannot handle:
            if ( target.equals( this._metavariable ) && target.isA( metavariable ) )
                return this._expression.copy()
            // Otherwise, just use applyTo() on a copy:
            const copy = target.copy()
            this.applyTo( copy )
            return copy
        }
        if ( 'afterSubstituting' in target )
            return target.afterSubstituting( this )
        throw new Error( 'Target of appliedTo() must be a LogicConcept '
                       + 'or have an afterSubstituting() method' )
    }

    /**
     * Apply a sequence of Substitution instances, in the order given, to the
     * expression of this Substitution instance, in place.
     * 
     * For example, if `S1` is a Substitution mapping the metavariable $M$ to
     * the expression $f(x,Y)$, where $Y$ was another metavariable, and `S2` is
     * the substitution mapping $Y$ to $5$, then `S1.substitute(S2)` would
     * alter `S1` in place so that it mapped $M$ to $f(x,5)$.
     * 
     * `S.substitute(X1,...,Xn)` is equivalent to `S.substitute(X1)` and then
     * `S.substitute(X2)` and so forth, in that order.  It is also equivalent
     * to `X1.applyTo(S)` and then `X2.applyTo(S)` and so forth, in that order.
     * 
     * @param  {...Substitution} subs the list of Substitutions to apply to
     *   this Substitution's expression, in the order given
     * 
     * @see {@link Substitute#applyTo applyTo()}
     * @see {@link Substitute#afterSubstituting afterSubstituting()}
     */
    substitute ( ...subs ) {
        subs.forEach( sub => {
            if ( !this.metavariableNames().has( sub.metavariable.text() ) )
                return
            this._expression = sub.appliedTo( this._expression )
            this._metavariableNames.delete( sub.metavariable.text() )
            sub.metavariableNames().forEach( mv =>
                this._metavariableNames.add( mv ) )
        } )
    }

    /**
     * This function operates just as
     * {@link Substitution#substitute substitute()} does, but rather than
     * altering this object in place, it makes a copy, alters the copy, and
     * returns that copy.
     * 
     * @param  {...Substitution} subs the list of Substitutions to apply to
     *   this Substitution's expression, in the order given
     * @returns {Substitution} a copy of this Substitution, but with the
     *   replacements made
     * 
     * @see {@link Substitute#substitute substitute()}
     */
    afterSubstituting ( ...subs ) {
        const result = this.copy()
        result.substitute( ...subs )
        return result
    }

    /**
     * Apply the {@link module:deBruijn.encodeExpression de Bruijn encoding} to
     * the expression in this Substitution, in place.  This function is
     * analogous to {@link Constraint#deBruijnEncode the Constraint class's
     * deBruijnEncode() function}; see there for more details.
     * 
     * @see {@link Substitution#deBruijnDecode deBruijnDecode()}
     */
    deBruijnEncode () {
        this._expression = encodeExpression( this._expression )
    }
    
    /**
     * Apply the {@link module:deBruijn.decodeExpression de Bruijn decoding} to
     * the expression in this Substitution, in place.  This function is
     * analogous to {@link Constraint#deBruijnDecode the Constraint class's
     * deBruijnDecode() function}; see there for more details.
     * 
     * @see {@link Substitution#deBruijnEncode deBruijnEncode()}
     */
    deBruijnDecode () {
        this._expression = decodeExpression( this._expression )
    }

    /**
     * The string representation of a Substitution $(m,e)$ is simply the string
     * "(M,E)" where M is the {@link LogicConcept#toPutdown putdown}
     * representation of $m$ and E is the {@link LogicConcept#toPutdown putdown}
     * representation of $e$.
     *
     * This function also improves brevity and clarity when debugging by making
     * a few text replacements, as follows:
     * 
     *  * The JSON notation for the metavariable attribute is replaced with a
     *    double underscore, so rather than seeing `'P +{"_type_Metavar":true}'`,
     *    you will see simply `P__`.
     *  * The binder for expression functions, `"LDE lambda"`, is replaced with
     *    the more compact and intuitive `𝝺`.
     *  * The symbol for expression function application, `"LDE EFA"`, is
     *    replaced with the more compact `@`, which can be read as shorthand for
     *    "apply."
     * 
     * @returns {string} a string representation of the Substitution, useful in
     *   debugging
     */
    toString () {
        return `(${this._metavariable.toPutdown()},${this._expression.toPutdown()})`
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
