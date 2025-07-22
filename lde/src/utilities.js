
/**
 * A JSON stringification that is predictable.  The standard `JSON.stringify()`
 * can produce different outputs unpredictably, because there is no required
 * ordering on the key-value pairs.  This one requires keys to be output in
 * increasing string order, so it is predictable.
 * 
 * @param {*} obj - Any JavaScript value that is amenable to JSON encoding
 * @return {string} A JSON encoding that has the keys in the same order (that
 *   is, sorted in increasing alphabetical order) every time
 */
export const predictableStringify = ( obj ) => {
    // arrays
    if ( obj instanceof Array ) {
        return `[${obj.map( predictableStringify ).join( ',' )}]`
    }
    // atomics
    if ( !( obj instanceof Object ) ) {
        return JSON.stringify( obj )
    }
    // objects
    const keys = Object.keys( obj )
    keys.sort()
    const pair = ( key ) =>
        `${JSON.stringify( key )}:${predictableStringify( obj[key] )}`
    return `{${keys.map( pair ).join( ',' )}}`
}

/**
 * The functions documented below extend the built-in JSON functionality of
 * Node and/or the browser.
 * 
 * @namespace JSON
 */

/**
 * Whether two objects that are amenable to JSON encoding are structurally
 * equal.
 * 
 * @param {*} x - The first of the two objects; this must be amenable to JSON
 *   encoding
 * @param {*} y - The second of the two objects; this must be amenable to JSON
 *   encoding
 * @return {boolean} Whether the two objects are structurally equal
 */
JSON.equals = ( x, y ) => {
    // easy case
    if ( x === y ) return true
    // array case
    if ( ( x instanceof Array ) != ( y instanceof Array ) ) return false
    if ( x instanceof Array ) {
        if ( x.length != y.length ) return false
        for ( let i = 0 ; i < x.length ; i++ ) {
            if ( !JSON.equals( x[i], y[i] ) ) return false
        }
        return true
    }
    // atomic case
    if ( ( x instanceof Object ) != ( y instanceof Object ) ) return false
    if ( !( x instanceof Object ) ) return x === y
    // object case
    const xKeys = Object.keys( x )
    const yKeys = Object.keys( y )
    xKeys.sort()
    yKeys.sort()
    if ( !JSON.equals( xKeys, yKeys ) ) return false
    for ( let i = 0 ; i < xKeys.length ; i++ ) {
        if ( !JSON.equals( x[xKeys[i]], y[xKeys[i]] ) ) return false
    }
    return true
}

/**
 * A deep copy of a JSON structure, as another JSON structure.
 * 
 * Right now this is implemented in the easiest way; we simply serialize
 * and then deserialize using the built-in methods of `JSON.stringify()`
 * and `JSON.parse()`.  This is, however, not a very efficient
 * implementation, and could be improved later if needed.
 * 
 * @param {*} json - the structure to copy, which must be amenable to JSON
 *   encoding using `JSON.stringify()`
 * @return {*} if the input is an object, this is a deep copy; if the input
 *   was atomic, this is the same atomic
 */
JSON.copy = json => JSON.parse( JSON.stringify( json ) )

/**
 * The function below extends the built-in EventTarget class with new
 * functionality.
 * 
 * @class EventTarget
 */

/**
 * Extend the EventTarget prototype with a convenience method for emitting new
 * events.  Mimics the function of the same name from node.js, but here in the
 * browser.
 * 
 * @param {string} type - The type of event being emitted, as a string name
 * @param {object} details - Any additional fields to copy into the Event object
 */
EventTarget.prototype.emit = function ( type, details = { } ) {
    this.dispatchEvent( Object.assign( new Event( type ), details ) )
}

/**
 * The function below extends the built-in Map class with new functionality.
 * 
 * @class Map
 */

/**
 * Extend the built-in JavaScript `Map` class with a deep copy method.  This
 * works only for Maps whose keys and values are all JSON-encodable.
 * 
 * @return {Map} A new map that is a deep copy of the original.
 */
Map.prototype.deepCopy = function () {
    return new Map( JSON.copy( [ ...this ] ) )
}

/**
 * The functions below extend the built-in Array class with new functionality.
 * 
 * @class Array
 */

/**
 * Return a shallow copy of the array, but without one (specified) element.
 * 
 * If the given index is not a valid index into the array, then a shallow copy
 * of the array is returned with *no* change to its elements (all included).
 * 
 * @param {number} index - Which entry to remove, as a zero-based index
 * @return {Array} A shallow copy of the array, but without the element whose
 *   index was given
 */
Array.prototype.without = function ( index ) {
    if ( typeof( index ) != 'number' || (index|0) != index ) return this.slice()
    if ( index < 0 || index >= this.length ) return this.slice()
    return this.slice( 0, index ).concat( this.slice( index + 1 ) )
}

/**
 * The last element of the array, equivalent to `A[A.length-1]` (if the array is
 * named `A`)
 * 
 * @return {*} The last element of the array, or undefined if the array is
 *   empty
 */
Array.prototype.last = function () { return this[this.length-1] }

/**
 * An array containing a finite arithmetic sequence of integers. 
 * - `Array.range()` returns `[ ]`.
 * - `Array.range(n)` returns `[0,1,2,...,n-1]`.
 * - `Array.range(a,b)` returns `[a,a+1,...,b]`. 
 * - `Array.range(a,b,d)` returns the finite arithmetic sequence `[a,a+d,...,a+k*d]` where $\left|a+kd\right|\leq \left|b\right| < \left|a+(k+1)d\right|$.
 * @returns {array} 
 */
Array.range = function ( ...args ) { 
   const n = args.length
   // if one argument return [0..n-1] immediately for efficiency
   if (n === 1) return [ ...Array(args[0]).keys() ]
   // if no arguments return [ ]
   if (n === 0) return []
   // at least two arguments
   const start = args[0]
   const stop  = args[1]
   // if exactly two arguments, step = 1, otherwise the third arg
   const step =  (n === 2) ? 1 : args[2]
   // do the general case.  Note step=0 returns an empty array
   return ((stop>start && step>0) || (stop<start && step<0) ||
           (stop===start && step!==0)) ?
          [ ...Array(Math.floor(Math.abs((stop-start)/step))+1) ].map((_,k)=>start+step*k) : [ ]
 }

 /**
  * An array containing the finite arithmetic sequence,
  * $\left[f(a),f(a+1),\ldots,f(b)\right]$. 
  * @example
  * `Array.seq(n=>2*n,3,5)` returns `[6,8,10]`
  * @param {function} f a univariate function
  * @param {integer} a the lower index
  * @param {integer} b the upper index
  * @returns {array} 
  */
 Array.seq = function ( f, a, b) { 
    if (b<a) return []
    return [ ...Array(b-a+1) ].map( (_,k)=>f(a+k) )
  }

/**
 * The functions below extend the built-in Set class with new functionality.
 * 
 * @class Set
 */

/**
 * In mathematics, two sets $A$ and $B$ are equal if and only if
 * $\forall x,(x\in A\text{ iff }x\in B)$.  That is, they have exactly the same
 * members.  This function implements that definition.
 * 
 * @param {Set} other the set to compare with this one for equality
 * @returns {boolean} whether the two sets have exactly the same elements
 */
Set.prototype.equals = function ( other ) {
    return this.size == other.size && this.isSubset( other )
}

/**
 * The usual set-theoretic union of two sets, this one and any other, passed as
 * the first parameter.
 * 
 * @param {Set} other the set with which to union this one
 * @returns {Set} the union of this set with the other
 * 
 * @see {@link Set#intersection intersection()}
 * @see {@link Set#difference difference()}
 * @see {@link Set#symmetricDifference symmetricDifference()}
 */
Set.prototype.union = function ( other ) {
    return new Set( [ ...this, ...other ] )
}

/**
 * Construct a subset of this set, using precisely those elements that pass the
 * given predicate.  This is analogous to taking a set $S$ and forming a subset
 * as we do with the mathematical notation $\\\{x\in S\mid P(x)\\\}$.
 * 
 * NOTE:  This is *not* the "is a subset of" relation!  This is a tool for
 * *computing* subsets.  If you'd like to check whether one set is a subset of
 * another, see {@link Set#isSubset isSubset()}.
 * 
 * @param {function} predicate the predicate that elements must pass in order to
 *   be included in the subset; it will be evaluated on every element of this
 *   set and should return a boolean
 * @returns {Set} the subset of this set containing just those elements that
 *   satisfy the given predicate
 * 
 * @see {@link Set#isSubset isSubset()}
 * @see {@link Set#isSuperset isSuperset()}
 */
Set.prototype.subset = function ( predicate ) {
    return new Set( [ ...this ].filter( predicate ) )
}

/**
 * The usual set-theoretic intersection of two sets, this one and any other,
 * passed as the first parameter.
 * 
 * @param {Set} other the set with which to intersect this one
 * @returns {Set} the intersection of this set with the other
 * 
 * @see {@link Set#union union()}
 * @see {@link Set#difference difference()}
 * @see {@link Set#symmetricDifference symmetricDifference()}
 */
Set.prototype.intersection = function ( other ) {
    return this.subset( x => other.has( x ) )
}

/**
 * The usual set-theoretic difference of two sets, this one minus the other set
 * passed as the first parameter.
 * 
 * @param {Set} other the set to subtract from this one
 * @returns {Set} the difference, this set minus the other
 * 
 * @see {@link Set#union union()}
 * @see {@link Set#intersection intersection()}
 * @see {@link Set#symmetricDifference symmetricDifference()}
 */
Set.prototype.difference = function ( other ) {
    return this.subset( x => !other.has( x ) )
}

/**
 * The usual set-theoretic symmetric difference of two sets, this one and any
 * other, passed as the first parameter.  The symmetric difference of sets $A$
 * and $B$, in usual mathematical notation, is $(A-B)\cup(B-A)$.
 * 
 * @param {Set} other the set with which to compute the symmetric difference
 *   with this one
 * @returns {Set} the symmetric difference of this set with the other
 * 
 * @see {@link Set#union union()}
 * @see {@link Set#intersection intersection()}
 * @see {@link Set#difference difference()}
 */
Set.prototype.symmetricDifference = function ( other ) {
    return new Set( [ ...this.difference( other ),
                      ...other.difference( this ) ] )
}

/**
 * The usual $\subseteq$ relation from mathematics.  Test whether this set is a
 * subset of the `other` passed as a parameter, returning true/false.
 * 
 * @param {Set} other the set to be tested for whether this set is a subset of
 *   it
 * @returns {boolean} whether this set is a subset of `other`
 * 
 * @see {@link Set#subset subset()} (for constructing subsets)
 * @see {@link Set#isSuperset isSuperset()}
 */
Set.prototype.isSubset = function ( other ) {
  for (let elt of this) {
    if (!other.has(elt)) return false
  }
  return true
}

/**
 * The usual $\supseteq$ relation from mathematics.  Test whether this set is a
 * superset of the `other` passed as a parameter, returning true/false.
 * 
 * @param {Set} other the set to be tested for whether this set is a superset of
 *   it
 * @returns {boolean} whether this set is a superset of `other`
 * 
 * @see {@link Set#isSubset isSubset()}
 */
Set.prototype.isSuperset = function ( other ) {
    return other.isSubset( this )
}
