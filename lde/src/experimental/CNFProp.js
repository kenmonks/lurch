////////////////////////////////////////////////////////////
//
//  CNFProp (for Global n-compact Validation)
//

// Imports
import CNF from '../validation/conjunctive-normal-form.js'
import { LogicConcept } from '../logic-concept.js'
import { Environment } from '../environment.js'
import  Utilities from './utils.js'
const { tab, indent, subscript } = Utilities

/**
 * Represents the Propositional Form of any LC and the utilities to convert that
 * to cnf form required by satSolve.  It is needed because the PropositionalForm
 * class does not support LCs, only sequents.
 */
export class CNFProp {
  
/**
 * Create a new CNFProp object.
 *
 * @param {'and'|'or'} op - The operator of the CNFProp. Either 'and' or 'or'.
 * @param {...(CNFProp|integer)} kids - The children of the CNFProp that the operator applies to. An array of CNFProps or integers.
 * @returns {CNFProp} - The newly created CNFProp object.
 */
 constructor ( op, ...kids ) {
    this.op      = op || 'and'               // 'and' or 'or'
    this.kids    = kids || [ ]               // Array of CNFProps or integers
    this.negated = false                     // negated or not
  }

  /**
   * Make a CNFProp from an LC - this is the main purpose of this class.
   * 
   * @param {LogicConcept} L 
   * @param {string[]} catalog 
   * @param {LogicConcept} target 
   * @param {boolean} checkPreemies 
   * @returns {CNFProp}
   */
  static fromLC ( L , catalog = L.cat, target = L , checkPreemies = false) {
        
    catalog = catalog || L.catalog()

    const negated = (L.isA('given') || L.isAccessibleTo(target)) 
    const sign = negated ? -1 : 1

    // TODO: for now, simply use two separate routines for checkPreemies vs not, and
    //       optionally merge them later
    if (checkPreemies) {
      // Lets to ignore for this target
      const ignores = target.letAncestors()
      
      // Propositions have atomic prop form. ForSome declarations have an atomic
      // propositional form with constants renamed by the body.  A copy of the
      // body is added afterwards, and treated like any other LC in the
      // document. Note that .isAProposition ignores anything that is marked
      // .ignore or in the array ignores.
      if ( L.isAProposition( ignores ) ) { 

        // propositions accessible to the target (nonreflexive) are treated as
        // given when the target is present.
        // let sign = (L.isA('given') || L.isAccessibleTo(target)) ? -1 : 1
        return sign*L.lookup( catalog , ignores )  

      // if it's an environment process the relevant children, skipping over
      // anything irrelevant to the target and Declare's which have no prop form.
      } else if (L instanceof Environment) {
        let kids = L.children()
        // remove trailing givens and anything irrelevantTo the target
        while ( kids.length>0 && 
                ( kids.last().isA('given') || 
                  kids.last().irrelevantTo( target )
                )
              ) 
        kids.pop()
        // make the environment's CNFProp     
        let env = new CNFProp()
        // givens and claims accessible to the target other than itself, should be
        // negated.  Thus we don't pass the second argument to isAccessibleTo to
        // say it should be reflexive.
        env.negated = negated // L.isA(`given`) || L.isAccessibleTo(target)
        while ( kids.length > 0 ) {
           let A = kids.pop()
           // skip it if it's a Declare
           if (A.isA('Declare')) continue
           // skip it if it's a Comment or anything with .ignore.  This eliminates
           // entire subenvironments and everything inside them because of this
           // recursion is top-down.
           if (A.ignore) continue
           // since we are doing the preemie check, skip all of the Lets on the
           // ignores list
           if (ignores.includes(A)) continue
           // otherwise get it's prop form  
           let Aprop = CNFProp.fromLC(A,catalog,target,checkPreemies)
           if ( Aprop === null ) continue 
           // cache if it's given or accessible to the target
           const isNegated = A.isA(`given`) || A.isAccessibleTo(target)
           // check if we have to change the op based on this latest child
           let newop = isNegated ? `or` : `and`
           // if we do, and there's more than one kid, wrap the kids w/ previous
           // op
           if ( newop!==env.op && env.kids.length>1 ) {
              env.kids = [ new CNFProp( env.op , ...env.kids ) ]
           }
           env.op = newop
           // if the new guy has the same op and is not negated, unshift its
           // children, otherwise just unshift the whole thing
           if ( Aprop.op===env.op && !isNegated ) {
             env.kids.unshift(...Aprop.kids)
           } else {
             env.kids.unshift(Aprop)
           }
        }
        // console.log(`returning ${env.toAlgebraic()}`)
        return env
      }

    // check propositionally
    } else {

      // Propositions have atomic prop form. ForSome declarations have an atomic
      // propositional form with constants renamed by the body.  A copy of the
      // body is added afterwards, and treated like any other LC in the document.
      // Note that .isAProposition ignores anything that is marked .ignore.
      if ( L.isAProposition() ) { 
        // propositions accessible to the target (nonreflexive) are treated as
        // given when the target is present.
        // let sign = (L.isA('given') || L.isAccessibleTo(target)) ? -1 : 1
        return sign*L.lookup(catalog)  
      // if it's an environment process the relevant children, skipping over
      // anything irrelevant to the target and Declare's which have no prop form.
      } else if (L instanceof Environment) {
        let kids = L.children()
        // remove trailing givens and anything irrelevantTo the target
        while ( kids.length > 0 && 
                ( kids.last().isA('given') || 
                  kids.last().irrelevantTo(target)
                )
              ) 
          kids.pop()
        // make the environment's CNFProp     
        let env = new CNFProp()
        // givens and claims accessible to the target other than itself, should be
        // negated.  Thus we don't pass the second argument to isAccessibleTo to
        // say it should be reflexive.
        env.negated = negated // L.isA(`given`) || L.isAccessibleTo(target)
        while ( kids.length > 0 ) {
          let A = kids.pop()
          // skip it if it's a Declare
          if (A.isA('Declare')) continue
          // skip it if it's a Comment or anything with .ignore.  This eliminates
          // entire subenvironments and everything inside them because of this
          // recursion is top-down.
          if (A.ignore) continue
          // otherwise get it's prop form  
          let Aprop = CNFProp.fromLC(A,catalog,target)
          if ( Aprop === null ) continue 
          // cache if it's given or accessible to the target
          const isNegated = A.isA(`given`) || A.isAccessibleTo(target)
          // check if we have to change the op based on this latest child
          let newop = isNegated ? `or` : `and`
          // if we do, and there's more than one kid, wrap the kids w/ previous
          // op
          if ( newop!==env.op && env.kids.length>1 ) {
             env.kids = [ new CNFProp( env.op , ...env.kids ) ]
          }
          env.op = newop
          // if the new guy has the same op and is not negated, unshift its
          // children, otherwise just unshift the whole thing
          if ( Aprop.op===env.op && !isNegated ) {
            env.kids.unshift(...Aprop.kids)
          } else {
            env.kids.unshift(Aprop)
          }
        }
        // console.log(`returning ${env.toAlgebraic()}`)
        return env
      }

    }
  }
    
  /**
   * Converts an integer $x$ to a variable. If the optional argument $n$ is present,
   * return a switch variable if $n<\left|x\right|$.
   *
   * @param {number} x The integer to be converted.
   * @param {number} [n] An optional argument that indicates the value after
   * which a switch variables should be returned.
   * @returns {string} The variable name corresponding to the integer $x$.
   */
  static toVar ( x , n = Infinity ) {
    const A = 'A'.charCodeAt(0)
    let prefix = (x<0) ? ':' : ''
    x = Math.abs(x)
    let name = (n<x)  ? `𝒵${subscript(x-n)}` :
               (x<27) ? String.fromCharCode(x+A-1) :
               (x<53) ? String.fromCharCode(x+A+5) : `𝒳${subscript(x)}` 
    return prefix+name
  }
  
  /**
   * Convert a CNFProp to algebraic form. The optional argument `n` tells it the
   * lower bound for switch variables. See the [Propositional Form tutorial]{@tutorial
   * Propositional Form} for details.
   */
  toAlgebraic ( n = Infinity ) {
    const A = 'A'.charCodeAt(0)
    let ans = this.kids.map( x => {
      // convert nonzero integers to variables 
      if ( Number.isInteger(x) ) { return CNFProp.toVar(x,n)
      // x must be a CNFProp  
      } else { return x.toAlgebraic(n) } 
    } )
    let joint = (this.op === 'and') ? '+' : ''
    ans = ans.join(joint)
    return (this.negated) ? `:(${ans})` : 
           (this.op==='and') ? `(${ans})` : ans
  }
  
  /** 
   * Convert this CNFProp to human readable form using the supplied catalog. 
   * See the [Propositional Form tutorial]{@tutorial Propositional Form} for details.
  */
  toEnglish (catalog) {
    let ans = this.kids.map( x => {
      // lookup nonzero integers in the catalog
      if ( Number.isInteger(x) ) { return ((x<0)?'¬':'')+catalog[Math.abs(x)-1]
      // x must be a CNFProp
    } else { return x.toEnglish(catalog) } 
    } )
    let joint = (this.op === 'and') ? ' and ' : ' or '
    ans = ans.join(joint)
    return (this.negated) ? `¬(${ans})` : 
           (this.op==='and') ? `(${ans})` : ans
  }
  
  // convert this CNFProp to a legible human readable form using the supplied catalog
  toNice (catalog, level = 0) {
    // get the array of nice kids, indented by level+1
    let ans = this.kids.map( x => {
      // lookup nonzero integers in the catalog
      if ( Number.isInteger(x) ) { // +`${Math.abs(x)}`
        return indent(((x<0)?':':'')+catalog[Math.abs(x)-1],(level+1)*2) 
      // x must be a CNFProp
      } else { return x.toNice(catalog, level+1) } 
    } )
    // join them with newlines
    ans = ans.join('\n')
    // wrap the whole thing appropriately
    // say(`This is negated? ${this.negated}`)
    return (this.negated) ? tab(level*2)+`:{\n${ans}}` :  
           (this.op==='and') ? tab(level*2)+`{\n${ans}}` : tab(level*2)+`{\n${ans}}`  
  }
  
  /**
   * Represents the symbol used for displaying switch variables in Algebraic
   * form. The switch variable symbol is currently '𝒵', which is represented by
   * the unicode \u{1D4B5}.
   */
  static get switchVarSymbol () { return '𝒵'}

/**
 * Check if the logical expression is in Conjunctive Normal Form (CNF).
 * 
 * @returns {boolean} True if the expression is in CNF, false otherwise.
 */
hasCNFform() {
  // Check if the expression is not negated, has 'and' operator,
  // and all subexpressions are instances of CNFProp
  // with 'or' operator and contain only integer values.
  return !this.negated && 
    this.op === 'and' && 
    this.kids.every(x => {
      return (x instanceof this.constructor) && 
              x.kids.every(Number.isInteger) && 
             (x.op === 'or')
    })
}

  /** 
   *  Distribute all negatives by DeMorgan's law, and cancel double negatives
   *  that result on this CNFProp. See the 
   *  [Propositional Form tutorial]{@tutorial Propositional Form} for details.
  */
  simplify ( toggle ) {
    let ans = new CNFProp()
    // distribute the nots
    if ( (this.negated && !toggle) || (!this.negated && toggle) ) {
      ans.op = (this.op==='and') ? 'or' : 'and'
      ans.kids = this.kids.map( x => {
       return ( Number.isInteger(x) ) ? -x : x.simplify(true)  
      } )
    } else {
      ans.op = this.op
      ans.kids = this.kids.map( x => {
        return ( Number.isInteger(x) ) ? x : x.simplify( )
      } )
    }  
    return ans   
  }
  
  /**
   * Convert this CNFProp to CNF form. `Lprop` should be a simplified CNFProp.
   * `switchvar` is an object containing the value to use for the next switch
   * var with key `num`, e.g. a typical use might be
   *
   *    `CNFProp.toCNF(CNFProp.fromLC(L),{num:L.catalog().length})`
   *
   * @param {CNFProp} Lprop - Simplified CNFProp
   * @param {number} switchvar - Object with key `num` whose values if the value
   * to use for the next switchvar
   * @returns {CNFProp} - CNF form of this CNFProp
   */
  static toCNF ( Lprop , switchvar ) {
    if (Number.isInteger(Lprop)) { return [[Lprop]] }
    if (Lprop.kids.length===0) { return (Lprop.op==='and') ? [] : [[]] }
    if (Lprop.kids.length===1) { return CNFProp.toCNF(Lprop.kids[0]) }
    // it's compound
    if (Lprop.op==='and') { 
      return CNF.and(...Lprop.kids.map(x=>CNFProp.toCNF(x,switchvar))) 
    }
    // the only remaining case is Lprop === 'or'
    let kids = [...Lprop.kids]
    let ans = CNFProp.toCNF(kids.pop(),switchvar)
    while (kids.length>0) {
      let P=CNFProp.toCNF(kids.pop(),switchvar)
      ans = CNF.or( P, ans, () => {
        ++switchvar.num 
        return switchvar.num 
      } )
    }
    return ans
  }
  
  /** 
   * Convert this CNFProp to an array of integers. 
  */
  toArray () {
    let unsigned = this.kids.map( x => ( Number.isInteger(x) ) ? x : x.toArray() )
    return (this.negated) ? ['-',unsigned] : unsigned
  }
  
  // Convert a numerical CNF to an algebraic form with switch vars after n
  // Don't really need this, but is good for debugging
  static cnf2Algebraic ( C , n ) {
    let ans = C.map( x => x.map( y => CNFProp.toVar(y,n)).join('') )
    return ans.join('+')
  }

// end CNFProp class
}