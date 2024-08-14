/**
 *  #### Global polynomial time n-compact Validation
 *
 *  This file contains the code for the Global n-compact validation algorithm
 *  itself, along with tools designed to work with it.  The main purpose of this
 *  module is to define the `validate()` function, which can be called with
 *  different options set in the `LurchOptions` object.
 *
 * @module GlobalValidation
 */
 
//  TODOs: 
//  * For each attribute we use, decide whether it should be stored cached as a
//    permanent LC attribute or a normal js object attribute before moving to
//    the repo.  One challenge with this is that LC attributes are the only ones
//    that get copied when using .copy(), so that limits where you can put an
//    attribute depending on if you do/do not want to .copy() it when making
//    copies.
//  * Optimizations: for a rule like symmetry of equality, it will ALWAYS be
//    instantiated twice for every equation in the user's doc.  Figure some way
//    to improve that situation in general.
//  * Eliminate, replace, or improve on BIHs. 
//    * Add "Consider" options that are force-matched to lone metavariable and
//      EFAs.
//    * When an EFA has a parameter that is partially instantiated, leverage
//      that by allowing it to match expressions that contain the partial
//      instantiations.
//    * Along these lines, one 'strategy' is to consider 'BIH-makers', namely
//      what kinds of natural, minimal things can a user enter when doing, say,
//      substitution, that would be a tiny enough hint that Lurch could
//      construct an entire BIH from it?
//  * Consider speeding up matching in several ways.
//    * Allow an option to eliminate the constant lambda expression as a
//      solution.
//    * Allow an option to efficiently solve 'Weeny' matching problems. e.g.,
//      if (@ P c) where P is a metavar and c is a constant is matched to e, and
//      e does not contain c, return the constant solution (or none if the
//      previous option is enabled).  If e only has one instance of c, there's
//      only one solution, so return that without recursing.  If it has two
//      instances there are four solutions, so return those.  Three have eight.
//      That should cover about 99% of the cases.
//  * Design a generic way to use multiple validation tools in the same document
//    so they work well together.  For example, to have a CAS rule work with
//    this 501 validation tool we might insert a placeholder formula like `:{
//    CASRule }` and when an expression is supposed to be validated by the CAS
//    rule it can put 'instantiations' after that formula to make a valid CAS
//    expression validate propositionally.
//  * The following algorithm makes several passes through the entire document
//    to process each step/phase separately for testing and experimenting. It
//    might be more efficient to make one pass through the entire document,
//    modifying everything as you go. Update: initial benchmarks seem to
//    indicate that ALL of the computation time is coming from finding all of
//    the instantiations, so this probably doesn't matter.  Furthermore, initial
//    tests seem to indicate that that in an interactive UI almost everything
//    this algorithm does will be almost instantaneous.  So optimization would
//    mainly only affect batch mode instantiation of a large document from
//    scratch.
//  * Sometimes an instantiation will instantiate the variable in a Let with a
//    constant, either directly or indirectly, e.g. `Let 0'`. This doesn't seem
//    to hurt anything but it makes for stupid instantiations, and might speed
//    things up if we eliminate it.
//  * For rules like transitivity, e.g. :{ :x=y y=z x=z }, if used successfully
//    they get instantiated six times, once for each pair of metavariables, but
//    produce the same instantiation, plus a lot more.  However, these rules do
//    not have a forbidden expression like the metavar W or (@ P x), so they
//    don't automatically require a BIH.  But it is clearly nice to have such
//    rules.  So add an attribute marking it as 'inefficient', and treat Rule or
//    Part containing only a forbidden W or (@ P x) as a special case of
//    'inefficient' so that in every case a BIH is required.
//  * Make a substitution tool that does the following. 
//    - find any expressions of the form A~B (i.e., (~ A B)) where ~ is a
//      reflexive relation like =. ≤ etc, and A and B are expressions.
//    - compute the expression diff() between A and B, and see if there is a
//      nontrivial possible substitution, e.g. X=Y, that when applied to A~A
//      would produce A~B via substitution.
//    - add the instantiations
//
//         :{ A~A }           (of the reflexive rule for ~)
//
//      and
//
//         :{ :X=Y :A~A A~B } (of the substitution rule for =)
//
//    - do this for all expressions of the form A~B in the document.  This gives
//      us the main logic behind substitution by skipping the annoying
//      substitution BIHs for propositional expressions of this form. 
//
//    - make a similar tool for other common propositions to specify
//      substitutions, e.g. 
//
//        `Substituting x=y in ∀z,f(x,y)<z yeilds ∀z,f(y,y)<z`
//
//    - we may want to then add a special way to declare reflexive operators
//      rather than just inserting the various reflexive rules, e.g.,
//      reflexive_operator(=.≤,⊆)
//
//  * When the user enters a rule, it might be the case that they have used a
//    metavariable as both the function name in an EFA (like the P in 𝜆P(x))
//    and also as a non-EFA metavar (as in just P(z) instead of 𝜆P(z)).  We
//    probably should check that it doesn't do that.
//  * Along similar lines, we should check that instantiations don't create, e.g. 
//    Insts that have a bound constant or other idiosyncracies.
//

// import Algebrite
import Algebrite from '../../dependencies/algebrite.js'
const compute = Algebrite.run
// import LDE tools
// import { LogicConcept } from '../logic-concept.js'
// import { Expression } from '../expression.js'
// import { Symbol as LurchSymbol } from '../symbol.js'
// import { isAnEFA } from '../matching/expression-functions.js'
// import { Declaration } from '../declaration.js'
// import { Environment } from '../environment.js'
// import { Problem } from "../matching/problem.js"
import CNF from '../validation/conjunctive-normal-form.js'
// import Formula from '../formula.js'
// import Scoping from '../scoping.js'
// import Validation from '../validation.js'
import {
  LogicConcept, Expression, Declaration, Environment, LurchSymbol,
  Matching, Formula, Scoping, Validation, Application
} from '../index.js'
import { isArithmetic, arithmeticToCAS } from './parsing.js'

const Problem = Matching.Problem
const isAnEFA = Matching.isAnEFA

// import experimental tools
import Interpret from './interpret.js'
const { markDeclaredSymbols, renameBindings, assignProperNames, interpret } = Interpret
// import experimental utilities
import Utils from './utils.js'
const commonInitialSlice = Utils.commonInitialSlice
// import the LDE options
import { LurchOptions } from './lurch-options.js'

/////////////////////////////////////////////////////////////////////////////
//
// Convenience Utilities
//
const instantiation = 'LDE CI'
const metavariable  = 'LDE MV'

// Debug is a global boolean
const time = (description) => { if (Debug) console.time(description) }
const timeEnd = (description) => { if (Debug) console.timeEnd(description) }
////////////////////////////////////////////////////////////////////////////////

/**
 *
 * ## Validate!
 *
 * This is the main routine! It requires that doc is an LC environment that has
 * already been interpreted, so if it has not, then it runs interpret() first.
 * It then runs all available validation tools that are compatible with
 * n-compact global validation. Finally, it runs global validation algorithm
 * itself, and returns the modified document with feedback stored in the various
 * locations.
 *
 * The optional second argument specifies which inference in the document should
 * be validated, and defaults to checking the entire document.  The optional
 * third argument determines if it should additionally check for preemies and
 * defaults to true. It defaults to the entire document.
 *
 * This function can be called with various different options set.  But rather
 * than trying to pass the options object along the chain of computation as an
 * optional argument, we just set a global `LurchOptions` object.  This allows
 *
 * The current validation tools available are the BIH tool, the Equations tool,
 * the Cases tool, and Scoping tool. These can be toggled or customized via the
 * settings object. In general, this routine provides the hook for installing
 * new n-compact global validation compatible tools in the future.  Validation
 * tools can add validation feedback and add additional complete instantiations
 * to the document, and can be run before or after instantiation, but should not
 * add new `Rules`.
 *
 * @see {@link LurchOptions LurchOptions}
 * 
 * @param {Environment} doc - the user's document as an LC environment
 * @param {Environment} target - the inference to validate
 */
const validate = ( doc, target = doc , scopingMethod = Scoping.declareWhenSeen ) => {
  
  // if the target is the full document, check if the document contains anything
  // marked with attribute 'target:true', and if so make the first occurrence of
  // that thing the target
  if (target===doc) {
    const proof = doc.descendantsSatisfyingIterator(x=>x.getAttribute('target'))
                         .next().value
    if (proof) {
      target=proof
      doc.targetproof=proof
    }                
  } 

  // interpret it if it hasn't been already (the interpret routine checks)
  interpret( doc )

  // process the domains (if they aren't already)
  processDomains(doc)

  //\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\
  // Here is the location to install new validation tools that are compatible
  // with global validation in the future.
  
  ///////////////////////////////////
  // BIHs
  processBIHs(doc)
    
  ///////////////////////////////////
  // Proof by Cases
  processCases(doc)
  
  // while this idea works in general for any forbidden Weeny formula, it's not
  // efficent because there are way more ways to match something like f(x+1,y-2)
  // to 𝜆P(y) than to a single metavar U processCases(doc,'Substitution').  But
  // it can work for single metavariable weeny, since that only creates one
  // instantiation.
  
  ///////////////////////////////////
  // CAS
  //
  // we currently are using Algebrite for the CAS but this tool will work with
  // any CAS.  This is not used by default, but we keep it for future reference.
  // See Algebra and Arithmetic tools below.
  // processCAS(doc)
  
  ///////////////////////////////////////////////////////////////////////////
  //                               'Rule' Tools
  //
  // The following tools all become available iff the appropriate specialized
  // Rule is in the document context.
  ///////////////////////////////////////////////////////////////////////////

  ///////////////////////////////////
  // Equations
  //
  // Rule: { EquationsRule }
  processEquations(doc)

  ///////////////////////////////////
  // Arithmetic
  //
  // Rule: { ArithmeticRule(x) }       where x ∈ { ℕ, ℤ, ℚ, ℝ, ℂ }. 
  //
  // Reason: 'by arithmetic in x' 
  //   If the reson is truncated to just 'by arithmetic' it uses the first 
  //   arithmetic rule in the document. 
  //
  // Determines if Algebrite thinks a statement of arithmetic is valid in the
  // given number system. 
  //
  // Arithmetic in ℕ: +,⋅,^,!,=,<,≤.
  // Arithmetic in ℤ: +,⋅,^,=,<,≤,- and second arg of ^ nonnegative.
  // Arithmetic in ℚ: +,⋅,^,=,<,≤.-,/ and denominators nonzero.
  // Arithmetic in ℝ (or ℂ): for now just uses the Algebra rule. 
  //
  processArithmetic(doc)

  ///////////////////////////////////
  // Algebra
  //
  // Rule: { AlgebraRule }      
  // 
  // Reason: 'by algebra' 
  // 
  // Currently only evaluates algebraic identities. An equation of the form
  // LHS=RHS is valid by asking Algebrite if (LHS)-(RHS) evaluates to zero.
  processAlgebra(doc)

  //\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\
  
  // instantiate with the user content (if it isn't already) this also caches
  // the list of user propositions and the document catalog.  This must be done
  // after the tools above in case they instantiate a 'Part' that then is used
  // for further instantiation (e.g. as with the Cases tool)
  instantiate(doc)
  
  ///////////////
  // Scoping
  Scoping.validate(doc, scopingMethod )
  
  ///////////////
  // Caching
  //
  // cache the let-scopes in the root (if the aren't)
  if (!doc.letScopes) doc.letScopes = doc.scopes()
  // cache the catalog in the root
  if (!doc.cat) doc.cat = doc.catalog()
  
  // when its all complete mark the declared symbols again (this is fast, so no
  // need to do it too carefully)
  markDeclaredSymbols(doc)

  ///////////////
  // Prop Check
  if (LurchOptions.validateall) {
    doc._validateall( target )
    if (LurchOptions.checkPreemies) doc._validateall( target , true ) 
  } else { 
    doc._validate( target )
    if (LurchOptions.checkPreemies) doc._validate( target , true ) 
  }

  // For debugging purposes, before leaving, rename all of the ProperNames to
  // something human-readable. 
  // TODO: maybe improve or eliminate this in the future
  tidyProperNames(doc)
  // re-cache the catalog, since these are new prop names
  doc.cat = doc.catalog()

  return doc   
}


/**
 * 
 *                  Cache all Domains 
 * 
 * For efficiency, mark all of the expressions in formulas with their domains
 * (the set of metavariable text names) for easy lookup.  This assumes that the
 * metavariables have been marked during interpretation.  We also mark the formula
 * with its maximally Weeny expressions, and its domain size while we are
 * caching stuff for easy access later.
 * 
 * This routine applies `cacheFormulaDomainInfo` to all formulas in the document.
 */
// TODO: 
// * maybe the above information should be saved with the Library itself so it
//   only has to be computed once.  But that may not help much because partial
//   instantiations still need to have it computed. Check how much of 
//   the processing time is being used for this.
const processDomains = doc => {
  // make it idempotent
  if (doc.domainsProcessed) { return }

  doc.formulas().forEach(f => {
    cacheFormulaDomainInfo(f)
    // If there are no metavariables in this formula, instantiate it so it is
    // available for validation.
    if (f.domain.size === 0) {
      // let inst=f.copy()
      // assignProperNames(inst)
      f.unmakeIntoA('Rule')
      f.makeIntoA('Inst')
      f.makeIntoA(instantiation)
    }
    // and mark the document as having been processed so we don't call this more
    // than once
  })
  doc.domainsProcessed = true 
}

/**
 * Cache the domain information for a formula. This is called by
 * `processDomains` to apply it to the entire document.
 */
const cacheFormulaDomainInfo = f => {
  let max = 0
  f.propositions().forEach(p => {
    if (!forbiddenWeeny(p)) {
      p.domain = Formula.domain(p)
      max = Math.max(max, p.domain.size)
    } else {
      p.domain = undefined
    }
  })
  // the js Set of text names of the metavariables
  f.domain = Formula.domain(f)
  // if it has no metavariables, or the only remaining metavariables are
  // forbidden, it can't be instantiated, so mark it finished.  
  // Note that max===0 is not the same as f.domain.size===0 because of
  // forbidden lone metavariables
  if (max === 0) f.finished = true
  // boolean that is true iff f is Weeny
  f.isWeeny = (f.domain.size === max && max > 0)
  // the array of maximally Weeny expressions in this formula (whether or not
  // it is Weeny).  Don't add any when max===0 or you can match already
  // partially instantiated expressions with the same expression when
  // forbidden metavars are still present but max===0.
  f.weenies = f.propositions().filter(p =>
    max > 0 && p.domain && (p.domain.size === max))  
}

/**
 * Check if an expression is forbidden as a Weeny. Currently we don't try to
 * match user expressions to a pattern that is a single metavariable or EFA that
 * is not partially instantiated because they match everything. This causes some
 * rules, like or- or substitution, to require another validation tool like BIH,
 * Cases, or Equations.
 *
 * Note that for EFA's it is ok if the expression is partially instantiated, so
 * that it's not enough just for it to be an EFA.  For example, in the
 * substitution rule, both the premise and conclusion is of the form @P(x) where
 * bot P and x are metaviarables.  But if the premise that is the equation is
 * instantiated first to create a partial instantiation of the rule, then the x
 * will be replaced by an expression not containing any metavariables which is
 * MUCH more efficient for matching.  For example, in an expression like 
 *                  `(-(z*y)+z*x)+z*y = z*y+(-(z*y)+z*x)`
 * (an actual example) trying to match that expression to @P(x) where x and P
 * are metavars produces a whopping 191 matches.  But trying to match it to 
 * e.g. @P(z*y), only produces 16 matches... much more manageable.
 *
 * The LurchOptions.avoidLoneMetavars and LurchOptions.avoidLoneEFAs options can
 * be used to change the behavior of this function in the corresponding manner.
 * They are both true by default.
 */
const forbiddenWeeny = L => 
  // if we are told to not forbid anything either as an attribute or option
  // then return false
  !(L.root().getAttribute('instantiateEverything') ||
    LurchOptions.instantiateEverything
   ) &&
  // otherwise check each case 
  (
    // it's an Environment
    ( L instanceof Environment ) || 
    // or we are avoiding lone metavars and it is one
    ( LurchOptions.avoidLoneMetavars && 
      (L instanceof LurchSymbol)
    ) || 
    // or we are avoiding LoneEFAs except for the subsitutition rule when the
    // conclusion is partially instantiated, and in that case only the conclusion
    // is checked against a user proposition that is flagged 'by substitution' for
    // efficiency, since that will determine P for the premise.
    ( LurchOptions.avoidLoneEFAs && 
      isAnEFA(L) && 
      ( !L.isA('Subs') || 
        !L.children().slice(1).some(kid =>
          kid.hasDescendantSatisfying( x => 
            (x instanceof LurchSymbol) && !x.isA(metavariable)
          )
        ) 
      )
    ) ||
    // don't match x∈A when A is a metavariable because almost every
    // statment in a typical Set Theory proof has this form and will match
    ( LurchOptions.avoidLoneElementOfs && 
      L instanceof Application && L.child(0) instanceof LurchSymbol &&
      L.child(0).text()==='∈'  && L.child(2) instanceof LurchSymbol && 
      L.child(2).isA(metavariable)
    )
  )
/** 
 * Process BIHs
 * 
 * Go through and create the appropriate instantiations from the Blatant Hints
 * in document `L`, mark each as BIH-valid or not, and insert the relevant 
 * instantiation when they are BIH-valid.  Note that we are keeping track of
 * the distinction between being propositionally valid, and being BIH-valid.
 * Namely, a particular environment, marked as a `BIH`, could be propositionally
 * valid in the user's document, but not a `BIH`. e.g. `{ :P (⇒ P P)} <<` would be
 * propositionally valid in a document that depends on Prop lib but not an 
 * instatiation of the `⇒+` rule.
 */
const processBIHs = doc => {
  // check LurchOptions
  if (!LurchOptions.processBIHs) return

  // since this is a separate tool, we don't care if a formula has been
  // .finished for prop instantiation, so we pass the argument true.
  const formulas = doc.formulas(true)
  const BIH = [...doc.descendantsSatisfyingIterator(x => x.isA('BIH'))]
  BIH.forEach(b => {
    let found = false
    formulas.forEach(f => {
      const toggle = matchGivens(f, b);
      try {
        ;[...Formula.allPossibleInstantiations(f, b)].forEach(s => {
          found = true
          const inst = Formula.instantiate(f, s)
          assignProperNames(inst)
          if (toggle) inst.toggleGiven()
          inst.unmakeIntoA('Rule')
          inst.unmakeIntoA('Part')
          inst.makeIntoA('Inst')
          if (!f.creators) f.creators = []
          // A BIH should not be made from a Part but we do this for consistency
          // for now
          inst.rule = f.rule || f
          inst.part = f  
          inst.creators = [ ...f.creators, b ]
          Formula.addCachedInstantiation(f, inst)
        })
      } catch { }
      if (toggle) { f.toggleGiven() }
    })
    // if it's not a BIH, mark it as such with .badBIH
    // TODO: remove this eventually when we make the switch
    if (!found) { b.badBIH = true }
    // TODO: switch over to this
    b.setResult('BIH',(found)?'valid':'invalid')
  })
  return doc
}

/**
 * Match Givens.
 * 
 * Since Matching won't match an environment to a formula that has a different
 * given status, check if LCs `a` and `b` are both givens or both claims and if
 * not, toggle the given status of `a`. Return `true` if it was toggled and
 * `false` it it wasn't.  This is just a utility used by processBIHs.
 * 
 */
// TODO: when this is made permanent, just upgrade Matching to make this hoop
//       jumping unneccesary.
const matchGivens = (a, b) => {
  let toggle = false
  if (a.isA('given') && !b.isA('given')) {
    toggle = true
    a.unmakeIntoA('given')
  } else if (!a.isA('given') && b.isA('given')) {
    toggle = true
    a.makeIntoA('given')
  }
  return toggle
}

/**
 * Check if the doc contains the Rule `:{ EquationsRule }`.  If not, just split
 * the equation chains.  
 * 
 * Otherwise after splitting get the diffs of all equations, and add the
 * instantiation `:{ :x=y f(x)=f(y) }` after the above `Rule`. For an arbitrary
 * equation `A=B` the values of `x,y` are computed with `diff(A,B)`. Note that this
 * assumes `=` is reflexive, because the normal way to say this would be to say
 * that `A=A` by reflexive and then `:{ :x=y :A=A A=B }` by substitution. 
 * 
 * For each equation `a=b=c=d` that is split, also include the instantiation `:{
 * :a=b :b=c :c=d a=d }` after the above rule.  This assumes transitivity of
 * equality.
 * 
 * Finally, to assume symmetry we allow both `x=y` and `y=x` versions of the above
 * rules. So including the Transitive Chain Rule is assuming reflexive,
 * symmetric, transitive, and substitution properties for equality.
 * 
 */
// TODO: 
// * generalize this to other reflexive operators with a special kind of
//   Declare, e.g. Reflexive = ≤ ⊆ ⇔
// * generalize this to transitive chains of operators, e.g. a = b < c = d ≤ e
//   implies that a<e
// * make it more efficient.  For example, don't process reflexive equations,
//   carefully check exactly when you need to insert symmetry or a Consider
//   rather than brute force blanketing everything.  Do we need all of the
//   symmetric equivalences?  Is there a cleaner more efficient way to
//   accomplish the same thing?
const processEquations = doc => {
  // check options 
  if (!LurchOptions.processEquations) return

  // split equation chains. This also marks all conclusion equations, including
  // those split from chains, with .equation=true
  splitEquations(doc)
  
  // check if the EquationsRule is around, if not, we're done
  const rule=doc.find(
    x=>(x.isA('Rule') || x.isA('Inst')) && x.numChildren()==1 && 
       x.child(0) instanceof LurchSymbol && x.child(0).text()==='EquationsRule',
    x=>!(x.isA('Rule') || x===doc))
  // if there is no Equations Rule loaded we are done
  if (!rule) return

  // First, we add symmetric equivalences.  For these we don't restrict to just
  // conclusion equations.  This way it knows every equation is 
  doc.equations().forEach( eq => insertSymmetricEquivalences( eq , rule ))

  // the Equations Rule has been found, so get all of the .equations that are
  // conclusions or produced from a conclusion equation chain by splitEquations
  const eqs=[...doc.descendantsSatisfyingIterator(
    x => x.equation , 
    x => x instanceof Application && !x.isOutermost())]
  
    // for each equation, A=B,
  eqs.forEach( eq => {

    // get the LHS and RHS
    const A = eq.child(1).copy(), B=eq.child(2).copy()
    // get the diff.  The optional third argument tells it to check for the
    // smallest single substutition that will work.  Thus, for now, the user
    // must only do one substitution at a time.
    //
    // TODO: consider generalizing or upgrading
    const delta = diff(A,B,true)
    // for now we only allow a single substutition at a time, so check if
    // there's a diff, and that it is not vacuous (e.g., the equation isn't x=x).
    // The argument 'true' to diff above guarantees there will only be one diff,
    // if any. 
    //
    // TODO: maybe generalize later
    if (delta && delta[0].length>0) {
      // the substititution might also be for a common ancestor of the diff
      // locations, so we consider them all
      const n = delta[0].length
      for (let i=1;i<=n;i++) {
        // get x,y such that replacing x with y in A produces B
        let x = A.child(...(delta[0].slice(0,i))).copy(), 
            y = B.child(...(delta[0].slice(0,i))).copy()
        // construct the instantiation :{ :x=y A=B }
        
        // build it
        let inst = new Environment( 
          new Application( new LurchSymbol('=') , x , y).asA('given') , 
          new Application( new LurchSymbol('=') , A.copy() , B.copy() ) 
        )
        // and insert it
        insertInstantiation( inst , rule , eq )
        
        // additionally add x=y to the list of things that should be considered
        // as user propositions for further instantiation when prop validating.
        const x_eq_y = inst.child(0).copy()
        
        // and insert it
        insertInstantiation( x_eq_y , rule , eq )
        
        // Also make the reverse diff equation as a Consider to impose symmetry
        // const y_eq_x = new Application(new LurchSymbol('='),y.copy(),x.copy())
        const y_eq_x = reverseEquation(x_eq_y)
        
        // and insert it
        insertInstantiation( y_eq_x , rule , eq )

        // and insert the symmetric equivalences for them (only need to do it for
        // one of them)
        insertSymmetricEquivalences( x_eq_y , rule )
      }
    // and in the case where there's no substitution possible, also add the
    // reverse of the equation to impose symmetry (its symmetric equivalences are inserted above)
    } else {
      // Make the reverse equation as a Consider
      // const y_eq_x = new Application(new LurchSymbol('=') , B.copy() , A.copy())
      const y_eq_x = reverseEquation(eq)
      
      // and insert it
      insertInstantiation( y_eq_x , rule , eq )
    } 

  })
  // Finally add the transitivity conclusion.  This assumes transitivity, of course.
  instantiateTransitives(doc,rule)
}

/**
 * Transitivity Instantiations
 * 
 * Go through and fetch all of the user's equations (i.e., only equations that
 * are conclusions) which have more than two arguments and create and insert
 * them after the EquationsRule rule.  For example, `a=b=c=d=e` would produce
 * and insert the instantiation `:{ :a=b :b=c :c=d :d=e a=e }`
 * 
 * This is a helper utility called by `processEquations()`.
 */
const instantiateTransitives = (doc,rule) => {
  // fetch the conclusion equations (argument = true)
  doc.equations(true).forEach( eq => {
    
    // let n be the number of arguments to =
    let n = eq.numChildren()

    // if there are more than two args, create the relevant instantiation
    if (n>3) { 

      // build it
      const inst = new Environment()
      for (let k=1;k<n-1;k++) {
        let newpair = eq.slice(k,k+2)
        newpair.unshiftChild( eq.child(0).copy() )
        inst.pushChild(newpair.asA('given'))
      }
      inst.pushChild(
        new Application(
          eq.child(0).copy(), 
          eq.child(1).copy(),
          eq.lastChild().copy()
        )
      )
      
      // and insert it
      insertInstantiation( inst, rule, eq )

      // We also want the conclusion of that instantiation to be a Consider so
      // it can instantiate other rules as if the user had stated it explicitly
      // (since they stated it implicitly by constructing this transitive chain
      // in the first place).  Note that insertInstantiation() automatically
      // marks it as a Consider because it's an equation, not an environment.
      const conc = inst.lastChild().copy()
      insertInstantiation( conc , rule , eq )
      // and insert its symmetric equivalence
      insertSymmetricEquivalences( conc , rule )
      // and Consider its reverse
      insertInstantiation( reverseEquation(conc) , rule)

    }
  })
}


/**
 * If we want to give users symmetry of = for free, it is more efficient to just
 * manually instantiate the symmetry rule for all equations than to insert the
 * rule and let matching do it. 
 *
 * @param {Expression} eqn - must be a binary equation, and is the 'creator' of
 * the equivalence. 
 *
 * @param {Environment} rule - the name of the rule to insert these equivalences after and that is stored as their `.rule` attribute  
 */
const insertSymmetricEquivalences = ( eqn , rule ) => {
  
  // insert :{ :x=y y=x }      
  let inst = new Environment( copyEquation(eqn).asA('given') , reverseEquation(eqn) )
  insertInstantiation( inst , rule , eqn )
  
  // insert :{ :y=x x=y }      
  inst = new Environment( reverseEquation(eqn).asA('given') , copyEquation(eqn) )
  insertInstantiation( inst , rule , eqn )
 
}


/**
 * Given an equation `x=y`, return the equation `y=x` using copies of `x` and `y`. It
 * does not copy the LC attributes of the original equation.
 */
const reverseEquation = eq => {
  return new Application(
             new LurchSymbol('='),
             eq.child(2).copy(),
             eq.child(1).copy()
  )
}
/**
 * The same routine as `reverseEquation`, but doesn't reverse the equation. This
 * differs from eq.copy() in that it doesn't copy attributes
 */
const copyEquation = eq => {
  return new Application(
             new LurchSymbol('='),
             eq.child(1).copy(),
             eq.child(2).copy()
  )
}


/**
 * Go through and fetch all of the user's equations (i.e., only equations that
 * are conclusions).  If they have more than two arguments split them into
 * binary pairs and insert them in the document.
 */
const splitEquations = doc => {
  // fetch the conclusion equations (argument = true)
  doc.equations(true).forEach( eq => {
    // let n be the number of arguments to =
    let n = eq.numChildren()
    // if there are two args, its an equation, so mark it as such
    if (n===3) { 
      eq.equation = true 
    } else if (n>3) {
    // if there are more than two args, split it
      let last = eq
      for (let k=1;k<n-1;k++) {
        // instead of building a new equation from a pair of arguments, we copy
        // the original equation and delete children that are not needed in order
        // to preserve any LC attributes that might be stored on the original
        // equation.  Note .slice for LCs makes an LC copy, not a 'shallow' copy.
        let newpair = eq.slice(k,k+2)
        newpair.unshiftChild(eq.child(0).copy())
        newpair.equation = true 
        newpair.insertAfter(last)
        last=newpair
      }
      eq.ignore = true
    }
  })
}

/**
 * Expression Diff
 * 
 * Given two Application LC's which differ only at one node, return the address
 * of that node (or undefined if no such node exists). This is useful in
 * transitive chains for determining when a substitution occurs within a
 * compound expression.  
 * 
 * For example, in `(x+1)+(x^2+x)=(x+1)+(x⋅x+x)` we want to know that the LHS can
 * be obtained from the RHS by substituting `x^2=x⋅x`. 
 * 
 * If they differ at more than one location, return the array of all of the
 * addresses where they differ. If the optional argument 'intersect' is true
 * return the highest address containing all of the diffs.  For example, 
 * ```
 *   diff( f(g(a,b) , f(g(c,d)) ) returns [[1,1],[1,2]]
 * ```
 * but
 * ```
 *   diff( f(g(a,b) , f(g(c,d)) , true ) returns [[1]]
 * ```
 * so in the latter case we know that the second expression can be obtained from
 * the first via the single substitution `g(a,b)=g(c,d)`, whereas the former would
 * require two substitutions, `a=c` and `b=d`.
 * 
 * @param {Expression} LHS - The first expression
 * @param {Expression} RHS - The second expression
 * @param {boolean} [intersect=false] - If true, return the highest initial segment that the resulting addresses have in common.
 */
// TODO: This could also work for Environments.  Is there a use for that?
const diff = (LHS , RHS , intersect=false ) => {
  let ans=[]
  // a Symbol doesn't match an Application.
  if ( 
    ((LHS instanceof LurchSymbol) && (RHS instanceof Application)) ||
    ((LHS instanceof Application) && (RHS instanceof LurchSymbol)) 
  ) return [[]]
  // two Symbols match iff they are .equal
  if ((LHS instanceof LurchSymbol) && (RHS instanceof LurchSymbol))  
    return (LHS.equals(RHS))?undefined:[[]]
  // two Applications  
  if ((LHS instanceof Application) && (RHS instanceof Application)) {
    // they don't match if they don't have the same number of children
    if (LHS.numChildren()!==RHS.numChildren()) return [[]]
    // check the children one at a time
    const n = LHS.numChildren()
    for (let k=0 ; k<n ; k++) {
      let nodeans = diff(LHS.child(k),RHS.child(k))
      // if an array is returned, it should be an array of arrays containing the
      // relative address inside the node of the various discrepancies, so
      // unshift each of them with the index of this node
      if (Array.isArray(nodeans)) {
        nodeans.forEach(node=>node.unshift(k)) 
        ans.push(...nodeans)
      }
    }
    // check if we want to intersect them to find the smalled single substitution that will work
    if ( intersect && ans.length ) {
      ans = [commonInitialSlice(...ans)]
    }

    // it should only return undefined if they match
    return (ans.length) ? ans : undefined
  }
  // or if you try to match a Declaration or Environment or something
  return undefined
}


/**
 * Process the Proof by Cases tool.
 * 
 * Find the first Rule in the document flagged with `.label='cases'`. If found,
 * instantiate its last child using each user conclusion that has `.by='cases'`,
 * insert the (usually partial) instantiations after the `Rule`, leaving the `Rule`
 * available for further instantation by the global Prop tool (i.e. don't mark
 * it `.finished`).
 * 
 * Then check of `LurchOptions.autoCases` is true.  If it is find every rule that has
 * 
 *   a) its last conclusion is a metavariable 
 * 
 *   b) every occurrence of that metavariable in the rule is an outermost
 *      expression. 
 * 
 * Create the instantiation of every such rule by matching the metavariable
 * conclusion to every one of the user's conclusions.
 */
// TODO: design this second idea much more carefully.  Here's why.  A typical
// large document without using this latter feature has, on average, about 2-3
// Insts for each conclusion in the user's document.  (Aside: that's kind of
// amazing and illustrates how instantiating non-forbidden Weenies is a very
// efficient way to find exactly those instantiations needed for a given user
// statement.)
//
// But the number of Insts (or Parts) created with this feature is equal to the
// number of conclusions, which is a substantial increase in both the number of
// Insts and size of the document but also the time it takes to produce them all.
// For example the time it takes for the current testing suite to complete
// doubles with this feature enabled.  So for now we will make the default to
// turn this off and still use the annoyng 'by cases' speedup.
//
// In the future, however, there are better more subtle ways to approach this.
// One idea is the following.
//
// * Split this routine into two separate routines, and run the first have that
//   processes cases> and 'by cases' BEFORE the main propositional instantiation
//   is done.
// * Then AFTER instantiating with the main loop, only instantiate the Parts (or
//   Rules, but more likely Parts) which have no other metavariables in them
//   besides the forbidden one. That will at least eliminate creating Parts up
//   front that then never turn into Insts afterwards.
//
const processCases = doc => {
   // check options
   if (!LurchOptions.processCases) return

  // check if some rule is a 'Cases'
  const rule=doc.find( x => x.isA('Cases') )
  if (rule) {
    // The conclusion of a 'cases' rule must be what is matched.
    const p = rule.lastChild()
    // get all the things the user wants to checked as a conclusion by cases
    const usercases = [...doc.descendantsSatisfyingIterator(
      x => typeof x.by === 'string' && x.by.toLowerCase()==='cases')]
    // for each one construct the relevant partial instantiation
    usercases.forEach( c => {
      try {
        ;[...Formula.allPossibleInstantiations(p, c)].forEach(s => {
          
          // for each solution (there should only be one) instantiate the rule
          const inst = Formula.instantiate(rule, s)
          
          // process and insert it
          insertInstantiation( inst, rule, c )

        })
      } catch { }
    })
    rule.finished = true
  // also check if the autoCases option is true. If so, match every user conclusion
  // to every caselike rule. 
  } else if (LurchOptions.autoCases) {
    const rules = getCaselikeRules(doc)
    getUserPropositions(doc)
      .filter( e => e instanceof Expression && e.isAConclusionIn(doc))
      .forEach( e =>{  
      rules.forEach( r => {
        try {
          ;[...Formula.allPossibleInstantiations(r.lastChild(), e)].forEach(s => {
            const inst = Formula.instantiate(r, s)
            // do the usual prepping
            assignProperNames(inst)
            cacheFormulaDomainInfo(inst)
            // the inst is no longer a Rule
            inst.unmakeIntoA('Rule')
            // decide whether it's a Part or an Inst
            if (inst.domain.size===0) {
              inst.unmakeIntoA('Part')
              inst.makeIntoA('Inst')
            } else {
              inst.makeIntoA('Part')
              inst.ignore = true
            }
            // store the rule and part it came from and add e to the list of
            // creators.
            inst.rule = r.rule || r
            inst.part = r
            if (!r.creators) r.creators = []
            inst.creators = [ ...r.creators, e ]
            // also rename the bindings to match what the user would have
            // for the same expressions in his document
            // time('Rename bindings')
            inst.statements().forEach(x => renameBindings(x))
            // then insert this instantiation after its formula
            Formula.addCachedInstantiation(r, inst)
            // finally mark the declared symbols in the instantiation
            markDeclaredSymbols(doc, inst)
          })
        } catch { }
      })
    })
  } 
  return doc
}

/**
 * Find all of the Rules that have a conclusion that is a single metavariable and only appears in the Rule as a single metavariable outermost expression (i.e., not contained in any other expression).  This is called a _caselike_ rule. 
 */
const getCaselikeRules = doc => {
  return doc.Rules().filter( rule => {
    const U = rule.lastChild() 
    if (!U.isA(metavariable)) return false
    const others = rule.descendantsSatisfying( x => x.equals(U) )
    // we return only rules that have more than one U to avoid
    // matching rules like :{ :EquationsRule } propositionally.
    // Note that a rule like :{ →← U } will match however.
    return others.length>1 && others.every( u => u.isOutermost() ) 
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// This is a prototype of the CAS Tool designed and built at the AIM Workshop
const processCAS = doc => {
  // check options 
  if (!LurchOptions.processCAS) return
  
  // get all the things the user wants to checked as a conclusion by CAS
  const userCASs = [...doc.descendantsSatisfyingIterator( x => typeof x.by === 'object' && typeof x.by?.CAS ==='string')]
  
  userCASs.forEach( c => { 
    // get the command
    const command = c.by.CAS
    // if the CAS evaluates to truthy, mark the proposition as valid
    const ans = (compute(command)==='1') ? 'valid' : 'invalid'
    c.setResult('CAS', ans , 'CAS')
  })
}

// This is a prototype of the Arithmetic Tool for naturals, integers, and rationals
const processArithmetic = doc => {
  // check options
  if (!LurchOptions.processArithmetic) return
  
  // check if the ArithmeticRule(x) is around and use the first one found
  // even if there are multiple such rules
  // TODO: eventually upgrade to allow more than one per document
  const rule=doc.find(
    x=>(x.isA('Rule') || x.isA('Inst')) && x.numChildren()==1 && 
       x.child(0) instanceof Application &&
       x.child(0).numChildren()==2 &&
       x.child(0,0).matches('Arithmetic') &&
       x.child(0,1).matches('ℕ|ℤ|ℚ'),
    x=>!(x.isA('Rule') || x.isA('Inst') || x===doc))
  // if there is no Arithmetic Rule loaded we are done
  if (!rule) return

  // get all the things the user wants to checked as a conclusion by CAS
  const userArithmetics = [...doc.descendantsSatisfyingIterator( x => 
    typeof x.by === 'string' && x.by ==='arithmetic')]

  // we found one so get the ring
  const ring = rule.child(0,1).text()
  
  // check each expression that is by arithmetic
  userArithmetics.forEach( c => { 
    // if it's not allowed arithmetic it's not 'invalid', it's 'not applicable'
    // (but you can't have a space in a class name)
    if (!isArithmetic[ring](c)) {
      c.setResult('arithmetic', 'inapplicable', 'CAS')
      return
    }
    // if the CAS evaluates to '1', mark the proposition as valid
    const ans = (compute(arithmeticToCAS(c))==='1') ? 'valid' : 'invalid'
    c.setResult('arithmetic', ans , 'CAS')
    if (ans === 'valid')
      insertInstantiation( new Environment(c.copy()) , rule, c)

  })
}

// This is a prototype of the Algebra Tool based on the CAS tool
const processAlgebra = doc => {
  // check options
  if (!LurchOptions.processAlgebra) return

  // check if the AlgebraRule is around, if not, we're done
  const rule=doc.find(
    x=>(x.isA('Rule') || x.isA('Inst')) && x.numChildren()==1 && 
       x.child(0).matches('AlgebraRule'),
    x=>!(x.isA('Rule') || x.isA('Inst') || x===doc))
  // if there is no Algebra Rule loaded we are done
  if (!rule) return
  // console.log(`found`)
  // console.log(rule)
  // get all the things the user wants to checked as a conclusion by CAS
  const userAlgebras = [...doc.descendantsSatisfyingIterator( x => 
    typeof x.by === 'string' && x.by ==='algebra' )]

  userAlgebras.forEach( c => { 
    // get the lurch notation for the expression
    let lurchmath = c.getAttribute('lurchNotation')
    // if the user included 'by algebra' in the same Atom as the identity, truncate it
    const match=lurchmath.match(/\s*by \s*algebra/)
    if (match) lurchmath=lurchmath.slice(0,match.index)
    // a regex for an equation
    const eqn = /^([^=]+)=([^=]+)$/
    // if it's not a simple equation we're done
    if (!eqn.test(lurchmath)) return
    // otherwise get the LHS and RHS
    const [LHS,RHS]=lurchmath.match(eqn).slice(-2)
    const command = `simplify((${LHS})-(${RHS}))`
    // if the CAS evaluates to 0, mark the proposition as valid
    const ans = (compute(command)==='0') ? 'valid' : 'invalid'
    c.setResult('algebra', ans , 'CAS')
    if (ans === 'valid')
      insertInstantiation( new Environment(c.copy()) , rule, c)
  })
}

/**
 * This is the meat of the algorithm for $n$-compact validation. It takes a
 * document as an argument.
 *   1. Get the set of propositions, `E`, in the user's document.
 *   2. Get the set, `F`, of all unfinished formulas with any max weenies.
 *   3. For each `f` in `F`, 
 *      a. Match each maximally weeny `p` in `f` to each `e` in `E`. 
 *      b. Every time a match is found. 
 *         i. Insert the relevant instantiation, and store `e` in its 
 *            `.creators` js attribute (it can have more than one) along 
 *            with other info. 
 *         ii. Cache its domain and update its weenies.
 *   4. Mark `f` as `.finished`.  It cannot be instantiated again on future
 *      passes because while the number of available formulas can go up on each
 *      pass, the set of user expressions `E` cannot.
 *   5. Iterate until every instantiation attempt has been exhausted.
 */
const instantiate = doc => {
  // make it idempotent
  if (doc.instantiated) { return }
  let formulas = doc.formulas()
  if (formulas.length === 0) { return }
  // there are some formulas, so get the user's Propositions to match
  const E = getUserPropositions(doc)
  // the pass number that will be stored in each Part and Inst for later
  // investigation
  let n = 1
  // loop until there's nothing left to instantiate
  while ( formulas.length>0 ) {

    //////////////////////////////////////////////////////////////////////////
    // when calling from a UI we might want a progress meter to show how far 
    // along validation is.  Since the major time is spent in this routine we 
    // provide a hook for that.
    let totalnum = E.length*formulas.reduce((tot, f) => {
      return tot + f.weenies.length; }, 0)
    let counter = 0
    const freq = LurchOptions.updateFreq 
    let update = Math.max(Math.floor(totalnum/freq),1)
    // console.log(`Starting pass ${n}. Matching ${totalnum} expressions.`)
    /////////////////////////////////////////////////////////////////////////

    // now loop through all of the formulas, check if they are finished and if
    // not, match all of their maximally Weeny propositions to all of the
    // elements of E to find instantiations and partial instantiations
    formulas.forEach(f => {
      // we can only instantiate formulas that have a non-forbidden weeny.
      // get this formula's maximally weeny patterns (must be cached)   
      f.weenies.forEach(p => {
        // try to match this pattern p to every user proposition e
        E.forEach(e => {
          // if it's a Subs EFA and e isn't .by substitution skip it
          if ((p.isA('Subs') && e.by!=='substitution')) return 
          // get all valid solutions 
          // declarations with body are a special case
          let solns = []
          try { solns = matchPropositions(p, e) } catch { }
          // for each solution, try to make a valid instantiation of f
          solns.forEach(s => {
            let inst
            try { inst = Formula.instantiate(f, s) } catch { return }
            
            // if we made it here, we have a valid instantation. 
            // Note that .pass is the current pass number. 
            // Cache some reporting info.
            //
            // TODO: 
            //  * we might want to upgrade .bodyOf to an LC attribute since
            //    Formula.instantiate doesn't copy that attribute

            inst.pass = n
            inst.numsolns = solns.length
            
            // insert this instantiation
            insertInstantiation( inst, f, e )
          })

          ////////////////////////////////////////////////////////////////
          // increment the progress bar
          counter++
          // number of times it reports during one computation
          if (counter % update === 0) {
            // console.log(`${Math.ceil(counter/totalnum*100)}% complete`)
            LurchOptions.updateProgress(n,totalnum,Math.ceil(counter/totalnum*100))
          }
          //////////////////////////////////////////////////////////////////

        })
      })
      // we've matched every user proposition to every weeny pattern in
      // this formula, and don't want to do it again on future passes, so
      // mark it as finished.
      f.finished = true
    })
    // increment the pass number
    n++
    // finally, get any unfinished formulas for the next pass
    formulas = doc.formulas()
  }
  doc.instantiated = true
}

/**
 * Get all of the user proposition in the document, but don't include any
 * duplicates, i.e., no two expressions should have the same prop form. 
 * This should be run BEFORE instantiating so the expressions in instantiations
 * aren't counted as a user expression.
 */
const getUserPropositions = doc => {
  // We cache these for multiple pass n-compact validation
  if (doc.userPropositions) return doc.userPropositions
  // if not cached, fetch them   
  const allE = [...doc.descendantsSatisfyingIterator(
    // include these
    x => x.isAProposition() || x.isA('Consider'), 
    // exclude anything inside of these
    x => x.isA('Rule') || x.isA('Part') || x.isA('Inst')  
  )]
  // filter out duplicates so we don't make multiple copies of the same
  // instantiation
  const E = []
  const dups = new Set()
  allE.forEach(e => {
    const eprop = e.prop().replace(/^[:]/, '')
    if (!dups.has(eprop) || e.by) {
      dups.add(eprop)
      E.push(e)
    }
  })
  // cache it
  doc.userPropositions = E
  return E
}

/**
 * Matching Propositions. 
 * 
 * Since we consider Lets and ForSomes to be proposition, we want to be able to
 * try to match any proposition to any other proposition.  The Problem class
 * currently can't handle this, so we add a utility here to make it possible.
 * 
 * This routine returns an array of solutions. 
 */ 
 // Aside: Crude Attribute and matching documentation for quick reference
 // 
 // We have the following situation regarding attributes in matching:
 // 1) For atomic expressions, attributes matter.  That is, x with color=purple
 //    is not the same as x with color=orange.
 // 2) For non-atomic expressions, attributes do not matter, and matching is
 //    defined only in terms of their children.  I could change this without too
 //    much trouble if you prefer that it be changed for consistency.
 // 3) When using the Formula namespace to match a formula against a possible
 //    instance, then given vs. not given matters for both environments and
 //    outermost expressions. No other attributes other than "given" are checked
 //    when converting a formula-and-possible-instance pair into a matching
 //    problem, but once it has been converted into one, then rules 1) and 2)
 //    apply.
 // 4) Although this should be 100% invisible to any user of the matching
 //    package, and therefore 100% irrelevant, I will state it for completeness's
 //    sake:  There are some de Bruijn attributes used internally by the matching
 //    package to record the original symbol names, and those are (necessarily
 //    and correctly) ignored during matching.
 // 
 //
 // TODO: Add to Problem class and Matching as needed. We assume the bodies of
 //       ForSomes are expressions for now.
const matchPropositions = (p, e) => {
  // if they are both Expressions proceed as usual.
  if (p instanceof Expression && e instanceof Expression) {
    return Array.from(new Problem(p, e).solutions())
    // if they are declarations that declare the same number of symbols ...
  } else if (p instanceof Declaration && e instanceof Declaration &&
    p.symbols().length === e.symbols().length) {
    // ... and neither has a body, just match their symbols
    const esymbols = e.symbols()
    let merged = p.symbols().map((x, k) => [x, esymbols[k]]).flat()
    if (!p.body() && !e.body()) {
      return Array.from(new Problem(...merged).solutions())
      // ... but if both have bodies, include them in the problem  
    } else if (p.body() && e.body()) {
      return Array.from(new Problem(...merged, p.body(), e.body()).solutions())
    }
  }
  // if we made it to here it's not going to match      
  return []
}


/**
 * Many of the tools that work with $n$-compact validation (including the
 * $n$-compact tool itself) require creating and inserting instantiations and
 * marking them in various ways.  This utility makes that process more coherent.
 * It also allows us to check for 'bad' instantiations that e.g. instantiate a
 * metavariable that is inside (declared by) a declaration with a constant, or
 * instantiate both $x$ and $y$ with the same thing in an declaration like 
 * `[ x y ]`.
 *
 * @param {LogicConcept} inst - the instantiation to insert. If it is an
 *        environment it will be inserted either as a `Part` or an `Inst`. If it
 *        is an expression it will be inserted as a Consider.
 *
 * @param {Environment} formula - the `Rule` or `Part` that this is an
 *        instantiation of. It is inserted after this formula.
 *
 * @param {LogicConcept} creator - an optional LC that caused this to be created
 *        and added to the `.creators` list of the instantiation.
 */
const insertInstantiation = ( inst, formula, creator ) => {

    // Currently expressions are marked as Consider's, 
    // If inst is an Expression we need to wrap it in an Environment so that any
    // free variables it contains are not implicitly declared by it and
    // inadvertently invalidate declarations of the same symbol later in the
    // document.
    const consider = inst instanceof Expression
    if (consider) {
      inst.makeIntoA('Consider')
      inst.unmakeIntoA('given')
      // Consider's don't have prop form
      inst.ignore = true
      // wrap it in an environment
      inst = new Environment(inst)
      // and it can be ignored as well
      inst.ignore=true
      // inst.makeIntoA('Inst')  // do we need this?
    }

    // it might contain a Let which was instantiated by some other
    // statment, so we might have to add the tickmarks.
    //
    // Note: we had to check that in a rule like :{:{:Let(x) (@ P
    //       x)} (@ P y)} that it doesn't instantiate (@ P y) first
    //       with a constant lambda expression like 𝜆y,Q(z) which
    //       has z free and then instantiate the metavar x with z,
    //       since then 'the free z becomes bound' in a sense.
    //       Otherwise you could conclude, e.g. ∀y,Q(z) from {
    //       :Let(z) Q(z) } instead of just ∀y,Q(y). 
    //
    // TODO: does this have to be done before inserting it?
    assignProperNames(inst)

    // insert it after the formula, the order doesn't matter
    inst.insertAfter(formula)

    // and mark the declared constants in the instantiation
    markDeclaredSymbols(inst.root(), inst)

    // check if this instantiation should be rejected because it contains a
    // declaration that is declaring a constant or a declaration declaring more than
    // one symbol that are instantiated with the same thing.
    if (isBadInstantiation(inst)) { 
      // if so, remove it
      inst.remove()
      return 
    }

    // save the rule (whether formula is a Part or Rule)
    inst.rule = formula.rule || formula
    // save the Part (whether or not it is the same as the Rule)
    inst.part = formula
    // if a creator is specified, push it onto the list
    if (creator) {
      // If the inst is for a Part it might already have creators, if so, keep
      // them. It is also possible that it is the first time it is being
      // instantiated and was created directly from putdown rather than though
      // the rule> shorthand, and so doesn't have a creators array, in which
      // case we initialize it
      if (!formula.creators) formula.creators = []
      inst.creators = [ ...formula.creators, creator ]
    }
    // mark it as a cached instantiation for the Formula package.
    // TODO: is this really needed?
    inst.makeIntoA(instantiation)
    // all instantiations are givens, even Considers
    inst.makeIntoA('given')
    // also rename the bindings to match what the user would have
    // for the same expressions in his document
    inst.statements().forEach(x => renameBindings(x))
    
    // if it's an expression, it's a Consider
    // if (inst instanceof Expression) {
    //   inst.makeIntoA('Consider')
    //   inst.makeIntoA('Inst')
    //   // Consider's don't have prop form
    //   inst.ignore = true
    // }

    // if it's an environment, check if the inst has metavars, and mark it appropriately
    if ( inst instanceof Environment && !consider ) {
      cacheFormulaDomainInfo(inst)
      if (inst.domain.size === 0) {
        inst.unmakeIntoA('Rule')
        inst.unmakeIntoA('Part')
        inst.makeIntoA('Inst')
      } else {
        inst.unmakeIntoA('Rule')
        inst.makeIntoA('Part')
        // since it still has metavariables, ignore it for prop form
        inst.ignore = true
      }
    }

}

/**
 * Check a proposed instantiation for bad declarations.
 *
 *  * If it declares a constant, it's bad.
 *  * If it declares more than one symbol that are instantiated with the same
 *    thing, it's bad.
 *
 */
const isBadInstantiation = ( inst ) => {
  // get the declarations in this instantiation
  const decs=inst.declarations()
  // check each one to see if it declares a constant
  for (let k = 0; k < decs.length; k++) {
    // get the array of symbols in this declaration
    const symbols = decs[k].symbols()
    // check each one to see if it declares a constant
    if (symbols.findIndex(s=>{return s.constant})!==-1) {
      // return true if it does
      return true
    }
    // check each one to see if it declares more than one symbol the same way
    const names = new Set(symbols.map(s=>s.text())) 
    if (names.size < symbols.length) {
      // return true if it does
      return true 
    }
  }

  // return false if it doesn't have anything bad
  return false
}

////////////////////////////////////////////////////////////////////////////////
// Validate helper utility.  This is the way the original validation tool worked
// but is now an internal helper utility to the `validate()` method, so we don't
// document this with jsdoc..
//
// Validate the target of this LC, store the result, and return true or false.
//
// This routine currently can use one or both of two validation modes: the
// propositional checker and the preemie checker.  The second and third optional
// arguments are booleans which specify whether it should be prop checked and
// preemie checked respectively.  This is useful for calling this efficiently
// from ._validateall.  If both are false, it does nothing and returns
// undefined.)
//
// With both modes, in order for this to provide more localized information
// about what is wrong with a proof, everything that is accessible to the target
// is temporarily treated as a Given, so that the propositional validity of a
// target is not dependent on the propositional validity of the things
// accessible to it.  
//
// We assume that every instantiation that will be required for computing the
// prop form and propositional validation has already been added to the
// document.  Thus, other Validation Tools, like BIH, and CAS, which might
// create instantiations, need to be run on the entire document before this
// final step as part of the instantiation phase.
//
// There are also some validation checks that may not need to instantiate
// anything, like checking that Let-environments don't violate the 'preemie'
// restriction by validating them without the initial Let() and making sure they
// are still valid and ignoring all tick marks on non-constant variables in
// instantiations or that are in the scope of a deleted Let. This check only
// makes sense when a target is propositionally valid, but should not be valid
// because of violating the preemie condition. So we only need to check for
// preemies only after doing propositional validation, and then only check the
// valid inferences in the scope of a Let or containing a Let.
//
// Just as for propositional checking, when checking to see if the target is a
// preemie, we do not care if anything accessible to it is a preemie. Keep in
// mind that by ignoring Lets, some of the things accessible to it might have a
// different propositional form (no tick marks on some variables in addition to
// being givens), but since they are temporarily treated as givens, even if they
// are preemies themselves, they will not be flagged as such.
//
// For targets which are Expressions or ForSomes we only check the target to see
// if it is a preemie, regardless of whether there might be other preemies in
// the LC.  But when the target is an environment, we only check if it is a
// preemie by ignoring the Lets it is in the scope of and its own Let if it is a
// Let-env. Thus, this routine assumes that all descendant Let-environments of
// this environment have already been preemie-checked (which will be the case
// when ._validateall has been called).  Thus, this routine will tell you if the
// target is, itself, a preemie, but not if contains any preemies if you don't
// check for those first.  So it could return 'valid' for an environment, which
// is useful for ._validateall, but might be misleading if you don't interpret
// it correctly.
//
// Moral: use only for targets that do not contain any descendant
//        Let-environments, or just call ._validateall for environments that do.
//
LogicConcept.prototype._validate = function (target = this,
  checkPreemies = false) {

  // store the answer and result here
  let ans, result
  const checkProps = !checkPreemies

  // TODO: to get it into form that CNF.isSatisfiable accepts we have to
  //       temporarily negate this, then toggle it back afterwards.  Modify
  //       CNF.isSatisfiable to make this unnecessary.

  // to prevent this routine from exiting while this LC is still negated we wrap
  // up the negation and un-negation with the CNF.isSatisfiable call
  const satCheck = (doc, target, checkPreemies = false) => {
    let answer
    // negate this
    doc.negate()
    try {
      answer = !CNF.isSatisfiable(this.cnf(target, checkPreemies))
    } catch (e) {
      doc.negate()
      console.log(`\nError validating the following for ${(checkPreemies) ? 'preemies' : 'prop'}:\n`)
      console.log(target)
      console.log(`at address: ${target.address()}`)
    }
    // un-negate this
    doc.negate()
    return answer
  }

  // if we have to check props or we have to check preemies but it hasn't
  // already been prop checked, prop check it
  if (checkProps) {
    // say(`Checking prop`)
    // if it is already validated, just return that
    if (Validation.result(target) &&
      Validation.result(target).reason === 'n-compact') {
      // say(`Already validated by n-compact, so returning that`)
      ans = Validation.result(target).result === 'valid'
    } else {
      // say(`Not already validated by n-compact.. checking`)
      ans = satCheck(this, target)
      // determine the appropriate feedback
      result = (ans)
        ? { result: 'valid', reason: 'n-compact' }
        : { result: LurchOptions.badResultMsg, reason: 'n-compact' }
      Validation.setResult(target, result)
    }
  }

  // if we have to check preemies, check them
  if (checkPreemies) {
    // say(`Checking preemie`)
    // if it's already a preemie return the same thing
    if (Validation.result(target) &&
      Validation.result(target).reason === 'preemie') {
      // say(`Already a preemie`)
      ans = false
      // otherwise 
    } else {
      // if it's not already validated propositionally, validate it
      if (!(Validation.result(target) &&
        Validation.result(target).reason === 'n-compact')) {
        // say(`Not already validated, so doing it`)
        ans = this._validate(target)
        result = (ans)
          ? { result: 'valid', reason: 'n-compact' }
          : { result: LurchOptions.badResultMsg, reason: 'n-compact' }
        Validation.setResult(target, result)
      }
      // if it is propositionally valid, check it for preemies           
      if (Validation.result(target).result === 'valid') {
        // say(`Prop valid, so checking for preemies`)
        // say(`this is currently a given ${this.isA('given')}`)
        ans = satCheck(this, target, true)
        // determine the appropriate feedback
        result = (ans)
          ? { result: 'valid', reason: 'n-compact' }
          : { result: 'invalid', reason: 'preemie' }
        Validation.setResult(target, result)
        // finally, it is invalid propositionally, so just return that
      } else {
        ans = false
      }
    }
  }

  return ans

}

////////////////////////////////////////////////////////////////////////////////
// Validate All
//
// Validate every claim in this LC, store the result, and return true or false.
// The optional second argument, if false tells it to do an ordinary
// propositional check but not check for preemies. This may be all that is
// needed in the case where the library or document doesn't contain any Lets and
// thus doesn't have to check for preemies.
//
// We do the propositional check efficiently as follows. First, check the entire
// document. If it's valid we are done and can mark everything valid. If not,
// frequently it will be the case that previous proofs were already valid, but
// the one we are working on isn't. So check the children of the document. The
// ones that are valid, mark everything inside them as valid. Then recurse in
// the children of any invalid proof until we reach just the individual
// conclusions that are invalid.
//
// If checkPreemies is true, we have to additionally check if any
// propositionally valid inferences were preemies or valid because they contain
// preemies.  This must only be checked after propositional validation is
// complete since it relies on those results to know what to check.
//
// We do the preemie check efficiently as follows.
// * If the target is not valid, we don't have to do anything.
// * If the target is valid and not an environment, we just call ._validate on
//   the target with checkPreemies=true. Update the validation result of the
//   target and its valid ancestors if it is a preemie. 
// * If the target is a valid environment we do the following.  
//   - Get all top level Let-env descendants of X (those not nested inside
//     another Let-env descendant of X).  
//   - If any exist, call ._validateall(-,true) on each of those recursively
//     until we reach one that has no Let-env descendants.
//   - for the base case of the recursion, when a Let environment is reached
//     that does not contain any Let-environment descendants, validate it with
//     checkPreemies=true, and follow the same algorithm as for the
//     Propositional check above (if it's preemie-valid we're done because
//     everything is already prop valid, and if any of the conclusions were
//     preemies the whole thing would be invalid. So if it's not preemie valid,
//     recurse into the environment tree to locate the individual preemies it
//     contains as for prop checking).
//   - when the recursion is complete, do the same check on the ancestor
//     Let-env, by omitting just it's own Let and the Let's it is in the scope
//     of, but not the ones that are descendants.  This will detect any
//     additional preemies that are descendants but not inside descendant
//     Let-envs. If any new ones are found or if one of the recursive checks
//     found a preemie, in either case mark them and the parent being checked as
//     invalid for reason 'contains preemie'.
//
// This routine does not return anything, it just marks the document.
Environment.prototype._validateall = function ( target = this, 
                                               checkPreemies = false  ) {
  const checkProps = !checkPreemies

  // Props
  if (checkProps) {

    // validate this environment (which saves the result in the target)
    const result = this._validate(target)

    // if the target is an Environment, recurse
    if (target instanceof Environment) {

      // if it was prop valid, so are all of its inferences
      if (checkProps) {

        if (result) {
          // mark all of the target's inferences propositionally valid 
          target.inferences().forEach(C => {
            Validation.setResult(C, { result: 'valid', reason: 'n-compact' })
          })

          // otherwise ._validateall the inference children of this target
        } else {
          target.children().forEach(kid => {
            // skip givens and things marked .ignore, e.g. Comments
            if (kid.isA('given') || kid.ignore) return
            this._validateall(kid, false)
          })
        }

      }
    }
  }

  // if we are supposed to check for preemies.  This assumes we've already
  // validated propositionally.  This should only be called once on the entire
  // document (i.e. it's not recursive) and it will mark all of the preemies in
  // one pass.
  //
  // TODO: it probably makes more sense to separate the prop and preemie parts
  // of this routine into two separate functions since they are dissimilar.
  if (checkPreemies) {

    // get the set of all Lets in inference let environments of this environment
    // unless their parent has no conclusions or if the let is inside a proof
    // marked with attribute 'target:true'. 
    let lets = this.lets().filter( x => {
      const doc=target.root()
      if ( doc.targetproof ) {
         return x.ancestors().includes(doc.targetproof)
      } else {
        return !x.parent().ancestors().some( y => y.isA('given') ) 
      }
    } )

    // sort them by the number of lets in their scope so we can check them from
    // the inside out (this modifies the lets array)
    lets.sort((a, b) => a.letsInScope().length - b.letsInScope().length)

    // validate each of the lets in order
    lets.forEach(L => {

      // see if this Let environment is a preemie (it should delete it's own let)
      let preemie = !this._validate(L.parent(), true)

      // if it is a preemie, mark it, and then narrow down which of it's
      // children is the offender
      if (preemie) {

        // mark it and all of it's ancestors as a preemie
        L.parent().ancestors().forEach(a => {
          Validation.setResult(a, { result: 'invalid', reason: 'preemie' })
        })

        // narrow it down to the specific preemies causing this let-environment
        // to be a preemie
        //
        // TODO: for now we're just brute force checking all of the valid conclusions
        // of the offending preemie let-environment.  Upgrade this to do the
        // recursive descent like we do for the prop check above.
        L.parent().conclusions()
         .filter( x => !x.ignore && Validation.result(x).result==='valid')         .forEach( conc => {
          let result = this._validate(conc,true)
          if (!result) {
            conc.ancestors().forEach( a => {
              Validation.setResult( a , { result:'invalid' , reason:'preemie'})
            })  
          }
        })
      }
    })
  }
}

/**
 * We say an LC in an environment L is irrelevant to the inference 'target' if
 * no ancestor of it is accessible to the target.  Note that this is the
 * 501-level definition, so we keep the instantiations of formulas that are
 * created by expressions that appear in the user's document that come after the
 * target.
 */
LogicConcept.prototype.irrelevantTo = function (target) {
  // it's not an ancestor of the target and has an ancestor that is not
  // accessible to the target
  return target.ancestors().indexOf(this) < 0 &&
    !this.hasAncestorSatisfying(z => { return z.isAccessibleTo(target, true) })
}

/**
 * Rename `ProperNames` from declarations with body to something easier to read by
 * changing, e.g. `c#(= (+ (+ m n) p) (+ m (+ n p))` to `c#13` by putting them
 * all in a list and using the list number instead of the body name.  This isn't
 * necessary for the algorithm to work, but it's easier to debug and read.
 */ 
 // TODO: maybe improve or eliminate this in the future
 const tidyProperNames = doc => {
  // make an lookup array
  const lookup = []
  // get all the ProperNames with # proper names
  const allProps = doc.descendantsSatisfying( x => x instanceof LurchSymbol && 
    x.getAttribute('ProperName')?.includes('#'))
  // store a copy on the lookup table (no dups)  
  allProps.forEach( s => { 
    const pname = s.getAttribute('ProperName') 
    if (!lookup.includes(pname)) lookup.push(pname) 
  })
  // rename them with their index in the lookup array
  allProps.forEach( s => { 
    const pname = s.getAttribute('ProperName')
    const tick = (pname.endsWith("'")) ? "'" : ''
    s.setAttribute('ProperName', 
      pname.replace(/([^#]+)#(.+)/,`$1#${lookup.indexOf(pname)}`+tick))
  })
}

// Here are some incomplete or orphaned utilities that we keep for future reference.
// TODO: maybe improve or eliminate these in the future.

////////////////////////////////////////////////////////////////////////////////
// Declaration contexts
//
// Utiltities for adding the declaration contexts to all of the statements and
// declarations in the document.  This is no longer needed, but potentially
// gives nice feedback so we keep it for now.
//////////////////////////////////////////////////////////////

// Mark Declaration contexts
//
// the context attribute key, just for modularity
const context = 'context'

// Add the symbol names (as strings) to this expressions context If the context
// doesn't exit, create it, even if no args are supplied. If it already has one
// add the symbol names to the end, whether or not they are duplicates.  We will
// let scope checking worry about that.
LogicConcept.prototype.addToContext = function (...names) {
  if (!this.hasAttribute(context)) { this.setAttribute(context, []) }
  this.getAttribute(context).push(...names)
}

// Mark all of the declaration contexts
//
// TODO: this is no longer needed, but perhaps will be useful, so we keep it for
//       now.
const markDeclarationContexts = doc => {
  doc.declarations().filter(d => !d.isA('Declare'))
    .forEach(decl => {
      const syms = decl.symbols().map(x => x.text())
      decl.scope(false).filter(x => x.isAStatement() || x.isADeclaration())
        .forEach(s => { s.addToContext(...syms) })
    })
}

///////////////////////////////////////////////////////////////////////////////
// Debottlenecker
//
// In order to see where the bottlenecks are in the code, we build here a crude
// custom code profiler/timer. It works as follows. Calling Benchmark(f,name)
// times the execution of function f and stores the time it took under the name
// 'name', which should be a string, in a global object called Report with a key
// for each name.  The value of each key is an object of the form { calls:n ,
// time:t } where n is the number of times the routine was called, and t was the
// total time it took for those calls.
//
// TODO:
// * finish this
let Stats = {}
const Benchmark = function (f, name) {
  const start = Date.now()
  f()
  const t = Date.now() - start
  if (!Report[name]) {
    Report[name] = { calls: 1, time: t }
  } else {
    Report[name].calls++
    Report[name].time += t
  }
}

export default {
  validate, getUserPropositions, instantiate, markDeclarationContexts,
  processBIHs, processEquations, splitEquations, processDomains, diff,
  cacheFormulaDomainInfo, Benchmark, getCaselikeRules, LurchOptions, Stats,
  matchPropositions, LogicConcept, Formula, Scoping, Validation
}
///////////////////////////////////////////////////////////////////////////////