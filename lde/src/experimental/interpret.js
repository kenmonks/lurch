/**
 * #### Prepare an LC for Global $n$-compact Validation 
 *
 *  In the current implementation of global n-compact validation we currently
 *  make many simplifying assumptions about the nature of a document.  But they
 *  are hard to keep track of when just defined, but not codified.  So we
 *  include here routines for the phase of processing that moves things around
 *  and computes js attributes that are required for validation.
 *
 *  Interpret an LC as a document. It does the following, in order.
 *  - addSystemDeclarations(doc)
 *  - processShorthands(doc)
 *  - processAliases(doc)
 *  - moveDeclaresToTop(doc)
 *  - processTheorems(doc)
 *  - processDeclarationBodies(doc)
 *  - processLetEnvironments(doc)
 *  - processBindings(doc)
 *  - processRules(doc)
 *  - assignProperNames(doc)
 *  - markDeclaredSymbols(doc) 
 * 
 *  Note: Global $n$-compact validation assumes a document
 *    has been interpreted before trying to validate and will interpret it first
 *    if you try to validate it and it hasn't been already.
 *
 * @module Interpretation
 */
//////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////
//
// Imports
//
// import { Application } from '../application.js'
// import { Environment } from '../environment.js'
// import { Declaration } from '../declaration.js'
// import { Symbol as LurchSymbol } from '../symbol.js'
// import { Formula } from '../formula.js'
// import { BindingExpression } from '../binding-expression.js'
import {
  Environment, Expression, Application, Declaration, LurchSymbol,
  BindingExpression, Formula
} from '../index.js'

import { addIndex } from './index-definitions.js'
import { processShorthands } from './parsing.js'
import Utilities from './utils.js'
const { subscript } = Utilities
const instantiation = 'LDE CI'
const MCE ='multi-conclusion-environments'

// import the LDE options
import { LurchOptions } from './lurch-options.js'
// the parser table-derived auto-declared constants (the big-operator heads)
import { autoDeclaredConstants, invisibleHeads } from './parsers/notation-tables.js'

/**
 *  ### Interpret
 * 
 *  This takes a raw user's document as an LC environment and preprocesses it in
 *  preparation for validation.  It does the following:
 *  - addSystemDeclarations(doc)
 *  - processShorthands(doc)
 *  - processAliases(doc)
 *  - moveDeclaresToTop(doc)
 *  - processTheorems(doc)
 *  - processDeclarationBodies(doc)
 *  - processLetEnvironments(doc)
 *  - processBindings(doc)
 *  - processRules(doc)
 *  - assignProperNames(doc)
 *  - markDeclaredSymbols(doc)
 * When it is finished it marks the document as interpreted.
 * 
 * @param {Environment | Array} doc - the raw user's document as an LC environment 
 */
const interpret = doc => {
  // just return if it's already interpreted
  if (doc.interpreted) return

  // These are now just declared to be constants automatically in markDeclaredSymbols without adding them to the document. TODO: remove this safely
  addSystemDeclarations(doc) 

  addIndex(doc,'Parsing')
  processShorthands(doc)
  processAliases(doc)
  addIndex(doc,'Interpret')
  moveDeclaresToTop(doc)
  processTheorems(doc)
  processDeclarationBodies(doc)
  processLetEnvironments(doc)
  addIndex(doc,'Interpret')
  // removeTrailingGivens(doc)
  processBindings(doc)
  processRules(doc)
  splitConclusions(doc)
  assignProperNames(doc)
  markDeclaredSymbols(doc)
  
  // mark it as interpreted
  doc.interpreted = true
  // mark it as a document
  doc.makeIntoA('document')

  return doc
}

//////////////////////////////////////
//
// Structural Changing Utilities
//

/**
 * System Reserved Constants
 *
 * Some symbols are reserved for system purposes as constants because they have
 * special meaning to the validation algorithm.  They are listed here in this array.
 */
const systemConstants = [
  'LDE EFA','➤',
  'AlgebraRule','NoMatrixOps','Arithmetic','ChainsRule','EquationsRule','SetBuilderRule',
  'ℕ','ℤ','ℚ','ℝ','ℂ',
  ...autoDeclaredConstants,
  ...invisibleHeads
]

/** 
 * Add system declarations to the top of the document. These are reserved
 * symbols that the user is not allowed to use. 
 * 
*/
const addSystemDeclarations = doc => {
  doc.unshiftChild(
    new Declaration(
      systemConstants.map(x=>new LurchSymbol(x))
    ).asA('given').asA('Declare') )
  return doc
}

/** Move `Declare` declarations to the top of the document. */
const moveDeclaresToTop = doc => {
  const Decs = doc.index.get('Declares')
  for (let i = Decs.length - 1; i >= 0; i--) {
    const dec = Decs[i] 
    dec.remove()
    doc.unshiftChild(dec)
  }
return doc
}


/**
 * ### Process the user's theorems 
 *
 * If a user specifies that a claim Environment is a `Theorem`, he is declaring
 * that he wants to use it as a `Rule` after that (if we enable the option to
 * allow users to enter `Theorems`... otherwise just let them enter them as
 * ordinary claim environments like proofs that aren't marked asA `Theorem` but
 * can be formatted as such). 
 *
 * But we want to mark his theorem as valid or invalid just like any other proof
 * in addition to using it as a `Rule`.  To accomplish this, we make an
 * invisible copy of the Theorem immediately following the theorem, make that a
 * formula, and label it as a `Rule` for future use.  This does not have to be
 * done if the Theorem has no metavariables as a `Rule` because it would be
 * redundant. When a Rule copy of the user's Theorem is inserted it does not
 * have to be marked as a given since it has no prop form, but its
 * instantiations do.  We flag the inserted `Rule` version of the Theorem as
 * `.userThm` to distinguish it from ordinary `Rules`.
 *
 * This has to be done after processing Shorthands and moving Declares to the
 * top so the user's theorems are in the scope of declared constants in the
 * library, which then prevents them from being metavariables. 
 *
 * If `LurchOptions.swapTheoremProofPairs` is true, and a Proof is the next
 * sibling of the Theorem, swap the two of them first before inserting the
 * `.userThm` Rule.  This prevents the Theorem from being used in its own proof,
 * which is done correctly if you don't swap them but is counterintuitive
 * because mathematicians don't usually expect it to follow the rules of
 * accessibilty in that situation.
 */
const processTheorems = doc => {
  doc.index.get('Theorems').forEach( 
    thm => {
      // to make this idempotent, check if the rule copy is already there
      if ( thm.nextSibling()?.userRule ) { return }
      // now check if you have to swap it with the next sibling if the next
      // sibling is a Proof
      if ( LurchOptions.swapTheoremProofPairs &&
           thm.nextSibling()?.isA('Proof') ) { 
        // theorem environments should always have a parent, at minimum, the
        // document itself
        const parent = thm.parent()
        const i = thm.indexInParent() 
        // just move the proof where the theorem is
        parent.insertChild(thm.nextSibling(),i)
      }
      // a Theorem may not begin with a Let declaration (its free variables are
      // already implicitly universal in the Rule copy).  Rather than crash,
      // flag the Let as 'unnecessary' - it is neutralized during validation
      // and reported to the user as a scoping error.  The flag is an LC type
      // attribute so the Rule copy below, and any instantiations made from it,
      // inherit it.
      if ( thm.isALetEnvironment() ) thm.firstChild().makeIntoA('unnecessary')
      // make a formula copy of the thm
      let thmrule = Formula.from(thm)
      // an alias declaration inside the theorem has already been expanded
      // (see processAliases), so drop it from the copy - as a formula it
      // would declare a metavariable that occurs nowhere else and so could
      // never be instantiated
      removeAliases(thmrule)
      // if it doesn't have any metavars there's no need for it
      if ( Formula.domain(thmrule).size === 0 ) { return }
      // if it does, change it from a Theorem to a Rule
      thmrule.unmakeIntoA('Theorem')
      thmrule.makeIntoA('Rule')
      thmrule.makeIntoA('given')
      // mark it for easy identification later
      thmrule.userRule = true
      // initialize it's creators array
      thmrule.creators = []
      // and insert it after the theorem
      thmrule.insertAfter(thm)
    })
  
  // update the Rules index since we might have added a few
  doc.index.update('Rules')
  
  return doc
}

/**
 * Process Aliases
 *
 * An alias `x := E` (putdown `alias> [x , E]`, marked `alias` by
 * processShorthands) introduces the symbol `x` as a shorthand for the
 * expression `E`.  It has no propositional content of its own: the document
 * should validate exactly as if the user had typed `E` wherever `x` occurs
 * free in the scope of the alias.  So we expand it here, before anything else
 * in interpretation looks at the document (in particular before the Rule copy
 * of a Theorem is made and before bindings are canonicalized), by replacing
 * each free occurrence of `x` in the alias's scope with a copy of `E`.
 *
 * A parameterized alias `x(s,t) := E` (putdown `alias> [x , (λ (s t) , E)]`,
 * the λ having just become `LDE EFA`) makes each free application `x(a,b)` of
 * exactly as many arguments as there are parameters a shorthand for `E` with
 * `a,b` substituted simultaneously for the free occurrences of `s,t`.  It is
 * notation, not a function: a bare `x`, or an `x(...)` with the wrong number
 * of arguments, is a misuse and is left alone.  (An unparameterized alias
 * may be applied, though: `x(a)` then expands to `E(a)`, as macro expansion
 * dictates.)
 *
 * The declaration itself stays in the tree, inert, so that the scoping check
 * can still report a redeclaration of `x` and so the user's atom has
 * something to carry feedback: it is marked `.ignore` (like a Comment) so it
 * is never a proposition or a validation target, its body is detached once
 * the expansion is done (so the definition site declares nothing but `x`, and
 * each copy of `E` is scoped where it lands), and processRules and
 * processTheorems drop it from formulas.  markFlaggedDeclarations() in
 * global-validation.js turns the outcome recorded here into feedback, which
 * is local, as feedback in Lurch generally is: the alias's own marker says
 * whether the definition is valid where it stands, and never changes because
 * of what comes after it, while each use that could not be expanded gets its
 * own marker saying why.
 *
 *   - `E` may not mention `x` (recorded on the declaration as
 *     `alias error: 'selfreferential'`); nothing is expanded.
 *   - an occurrence is not expanded when a free symbol of `E` (other than a
 *     parameter) would be captured by a binder where it lands, or when a
 *     free symbol of an argument would be captured by a binder inside `E`
 *     (`'captured'`); the other occurrences are still expanded.
 *   - a misused parameterized alias (see above) is left alone (`'misused'`);
 *     the well-formed occurrences are still expanded.
 *   - every outermost expression left containing an unexpanded `x` records
 *     the reason under the name in its js attribute `.unaliased` (an object
 *     `{ x: 'selfreferential' | 'captured' | 'misused' }`).  In the current
 *     design such an expression still validates as an ordinary expression
 *     about an arbitrary symbol `x`, which is sound but not what the user
 *     meant, so it is reported.
 *
 * A whole-line occurrence of `x` (or of `x(a,b)`) carries the line's identity
 * - its `given` type, its ID in the web UI, and the test harness's expected
 * result - so those are transferred to the expression that replaces it.
 *
 * Aliases are expanded in document order, so a later alias whose body
 * mentions an earlier one is expanded correctly.
 */
const processAliases = doc => {
  doc.descendantsSatisfying( d => d.isA('alias') ).forEach( dec => {
    // whatever happens below, the alias is never a proposition
    dec.ignore = true
    // the shape `[x , E]` is guaranteed by the Lurch notation parser, so
    // anything else is hand-written putdown
    if ( !(dec instanceof Declaration) || dec.symbols().length !== 1 ||
         !dec.body() )
      throw new Error('An alias must declare one symbol and have a body.')
    const name = dec.symbols()[0].text()
    const body = dec.body()
    // a parameterized alias has the binding (LDE EFA (s t) , E) as its body:
    // the parameters are its bound symbols and E its own body; otherwise the
    // body is E itself
    const binding = body instanceof Application && body.numChildren() === 2 &&
      body.child(0) instanceof LurchSymbol &&
      body.child(0).text() === 'LDE EFA' &&
      body.child(1) instanceof BindingExpression ? body.child(1) : undefined
    const params = binding ? binding.boundSymbolNames() : []
    const template = binding ? binding.body() : body
    // free/bound questions are judged relative to the environment containing
    // the alias: binders above it enclose the definition and its uses alike
    const root = dec.parent()
    // the declared symbols of a declaration are not uses of the name (a later
    // `Let x` is a redeclaration for the scoping check to report, not an
    // occurrence to expand)
    const isDeclaredName = s => s.parent() instanceof Declaration &&
                                s.parent().symbols().includes(s)
    // the free occurrences of the name in the scope of the alias, innermost
    // first (the scope is in document order, each node before its
    // descendants) so that an occurrence inside the arguments of another,
    // as in x(x(a),b), is expanded before the outer one copies its arguments
    const occurrences = dec.scope(false).filter( s =>
      s instanceof LurchSymbol && s.text() === name &&
      !isDeclaredName(s) && s.isFree(root) ).reverse()
    // record on its outermost expression that an occurrence was left
    // unexpanded, and why (the first reason found for a name stands)
    const markUnaliased = ( s, why ) => {
      const outer = s.getOutermost()
      outer.unaliased ??= { }
      outer.unaliased[name] ??= why
    }
    // an alias may not mention its own name (even bound: an expansion would
    // then redeclare x inside x's own scope)
    if ( body.hasDescendantSatisfying( d =>
           d instanceof LurchSymbol && d.text() === name ) ) {
      dec.setAttribute( 'alias error', 'selfreferential' )
      occurrences.forEach( s => markUnaliased( s, 'selfreferential' ) )
    } else {
      occurrences.forEach( sym => {
        // the occurrence to replace: the symbol itself, or for a
        // parameterized alias the application of it to as many arguments as
        // there are parameters (anything else is a misuse)
        const occ = params.length === 0 ? sym : sym.parent()
        if ( params.length > 0 && !( occ instanceof Application &&
             occ.child(0) === sym &&
             occ.numChildren() === params.length + 1 ) )
          return markUnaliased( sym, 'misused' )
        const args = occ.children().slice(1)
        // no free symbol of E, other than its parameters (the binding's free
        // symbols exclude the ones it binds), may become bound where the
        // instance lands
        if ( !( binding ?? body ).isFreeToReplace( occ, root ) )
          return markUnaliased( sym, 'captured' )
        // build the instance of E: collect the free occurrences of every
        // parameter first, then replace them all by copies of the arguments,
        // so the substitution is simultaneous even when an argument mentions
        // a parameter; no free symbol of an argument may become bound by a
        // binder inside E
        let copy = template.copy()
        const slots = params.map( p => copy.descendantsSatisfying( d =>
          d instanceof LurchSymbol && d.text() === p && d.isFree(copy) ) )
        if ( slots.some( ( ss, i ) =>
               ss.some( slot => !args[i].isFreeToReplace( slot, copy ) ) ) )
          return markUnaliased( sym, 'captured' )
        slots.forEach( ( ss, i ) => ss.forEach( slot => {
          const arg = args[i].copy()
          // E may be the bare parameter, in which case the instance is the
          // argument itself
          if ( slot === copy ) copy = arg
          else slot.replaceWith(arg)
        } ) )
        // a whole-line occurrence carries the line's identity, so transfer
        // its LC attributes (type flags, web UI ID - but not the text that
        // makes an instance a symbol) and the js fields the test harness and
        // comma chains use to the replacement
        const notText = keys => keys.filter( k => k !== 'symbol text' )
        const stale = notText( copy.getAttributeKeys() )
        if ( stale.length > 0 ) copy.clearAttributes( ...stale )
        notText( occ.getAttributeKeys() ).forEach( k =>
          copy.setAttribute( k, occ.getAttribute(k) ) )
        ;[ 'continued', 'ExpectedResult' ].forEach( k => {
          if ( occ[k] !== undefined ) copy[k] = occ[k]
        } )
        occ.replaceWith(copy)
      } )
    }
    // the expansion is done, so detach the body: the definition site now
    // declares nothing but x, and each copy of E is scoped where it landed
    dec.lastChild().replaceWith( Declaration.emptyBody().copy() )
  } )
  return doc
}

/**
 * Remove any alias declarations inside an LC (used on Rules and on the Rule
 * copy of a Theorem, after processAliases has expanded them).
 */
const removeAliases = L =>
  L.descendantsSatisfying( d => d.isA('alias') ).forEach( d => d.remove() )

/**
 * Process Declaration Bodies
 * 
 * Append a copy of the bodies of all declarations immediately after its Declaration.
 */
const processDeclarationBodies = doc => {
  // get the declarations with a body (hence the 'true') that don't contain
  // metavariables (do this before converting a Rule to a formula)
  const decs = doc.index.get('Decs with body').filter( dec => Formula.domain(dec).size===0)
  // insert a copy of the body after the declaration and mark where it came from
  // with the js attribute .bodyOf, unless it's already there
  decs.forEach( dec => {
    // skip declarations nested inside another declaration - inserting a copy
    // there would corrupt the outer declaration's structure (its symbols()
    // would no longer be all but its last child).  Such content is unsupported
    // and inert, since the outer declaration below gets no body copy either.
    if ( dec.hasAncestorSatisfying( a => a !== dec && a instanceof Declaration ) )
      return
    // a declaration body may not contain another declaration (the scope of the
    // inner declaration is not legible to a user).  Flag it as 'unsupported' -
    // it keeps its atomic propositional form, but no copy of its body is
    // inserted, so its content is inert, and markFlaggedDeclarations() gives
    // the user feedback about it during validation
    if ( dec.body() instanceof Declaration ||
         dec.body().hasDescendantSatisfying( d => d instanceof Declaration ) ) {
      dec.makeIntoA('unsupported')
      return
    }
    // if its already there, we're done
    if ( dec.nextSibling()?.bodyOf === dec ) { return }
    let decbody = dec.body().copy()
    if (dec.isA('given')) decbody.makeIntoA('given')
    decbody.bodyOf = dec
    decbody.insertAfter(dec)
  })
  // overkill, but let's do it for now since the body might be almost anything
  doc.index.update('Statements')
  return doc
}


/**
 * Process Let Environments
 * 
 * Get the `Let`'s.  If they don't start an environment, wrap them to make a valid
 * Let-environment. We make this restriction, so that a Let-env is a type of LC
 * that can be used as a rule premise and can only be satisfied by another
 * Let-env.  We don't upgrade that to a subclass for now.
 * 
 * TODO: consider upgrading let-envs to a subclass of environment
 */
const processLetEnvironments = doc => {
  // Get all of the Let's whether or not they have bodies and make sure they are
  // the first child of their enclosing environment.  If not, wrap their scope
  // in an environment so that they are.
  doc.index.get('Lets').forEach( dec => {
    const i = dec.indexInParent()
    const parent = dec.parent()
    if (i) parent.insertChild( new Environment(...parent.children().slice(i)) , i )
  } )
  return doc
}

/**
 * Rename Bindings for Alpha Equivalence
 *
 * Make all bindings canonical by assigning ProperNames `x₀, x₁, ...` to the
 * bound variables in order.
 */
const processBindings = doc => {
  doc.index.update('Statements')
  doc.index.get('Statements').forEach( expr => renameBindings( expr ))
  doc.declarations(true).forEach( decl => renameBindings( decl.body() ))
  return doc
}


/**
 * Process Rules 
 *
 * Check all of `Rules` to ensure they are the right type of LC. Convert them
 * into formulas.  If they have metavariables, mark them `.ignore` so they have
 * no prop form. If they don't mark them as an `Inst`. Replace and rename their
 * bound variables to `y₀, y₁, ...` to avoid classes with user variables with
 * the same name.
 */
const processRules = doc => {
  // get all of the Rules
  doc.index.get('Rules').forEach( f => {
    // a Rule must be an environment
    if ( !(f instanceof Environment) )
      throw new Error('A rule must be an environment.')
    // a Rule may not begin with a Let declaration (its free variables are
    // already implicitly universal).  Rather than crash, flag the Let as
    // 'unnecessary' - it is neutralized during validation and reported to the
    // user as a scoping error.  The flag is an LC type attribute so
    // instantiations of this rule inherit it.  Note that if the Let has a
    // body, the copy of the body inserted by processDeclarationBodies()
    // remains as a given, so the rule still means the typed universal closure
    // the author presumably intended.
    if ( f.isALetEnvironment() ) f.firstChild().makeIntoA('unnecessary')
    // an alias declaration in a Rule has already been expanded (see
    // processAliases), so drop it before converting to a formula, where it
    // would declare a metavariable that could never be instantiated
    removeAliases(f)
    // convert it to a formula
    // the second arg specifies it should be done in place
    Formula.from(f,true)
    // if it has metavariables, ignore it as a proposition
    if (Formula.domain(f).size>0) { f.ignore = true 
    // otherwise mark it as an Instantiation (sort of an identity instantiation)
    } else {
      f.unmakeIntoA('Rule')
      f.makeIntoA('Inst')
      f.makeIntoA(instantiation)
      f.rule = f
      f.creators = []
      f.pass = 0
    }
    // replace all bound variables with y₀, y₁, ... etc and rename them to
    // ProperNames x₀, x₁, ... etc to make them canonical
    f.statements().forEach( expr => { 
      replaceBindings( expr , 'y' )
      // TODO: this might be redundate if we run the previous routine first
      renameBindings( expr )
      } )
  } )
  // update the index
  doc.index.update('Rules')
  doc.index.update('Metavars')
  return doc
}


/**
 * Remove trailing givens
 *
 * Remove any givens at the end of an environment because they have no
 * propositional value.
 *
 * (currently not used because of EquationsRule type rules where they won't be
 * instantiated if they have just a claim as a constant. TODO: fix this correctly)
 */
const removeTrailingGivens = doc => {
  const E = doc.index.getAll('Environments')
  E.forEach( e => { 
    while (e.lastChild()?.isA('given')) { 
      e.popChild() 
    } 
  })
}

/**
 * Split Multiple Conclusion Environments
 *
 * Find all given environments in the document which have more than one
 * conclusion and split them into multiple propositionally equivalent environments
 * with one conclusion each.
 */
const splitConclusions = doc => {
  // update the relevant index and fetch them
  doc.index.update('multi-conclusions')
  const E = doc.index.get('multi-conclusions')
  // for each such environment
  E.forEach( e => { 

    // write(`\nSplitting:`)
    // write(e)

    // get the indices of its child claims
    const indices = []
    e.children().forEach( (kid,i) => { 
      if (!kid.isA('given')) indices.push(i)
    })
    // for each one, construct the appropriate copy and insert it after the
    // environment in reverse order to preserve their relative positions in the
    // document
    indices.reverse().forEach( i => {
      let copy = e.copy()
      let c = copy.child(i)
      // remove everything after this conclusion
      while (c.nextSibling()) c.nextSibling().remove()
      // and the conclusions before it
      copy.children().forEach( (kid,j) => {
        if (indices.includes(j) && i !== j) kid.remove()
      } )
      // check if e.ignore and e.userRule set it on the copy iff it contains metavars
      if (e.ignore && copy.some(x=>x.isA('Metavar'))) copy.ignore = true
      if (e.userRule && copy.some(x=>x.isA('Metavar'))) copy.userRule = true
      // insert it after the original environment.  We reversed the array of
      // conclusions above, so they will be insered in the correct order
      //
      // For clean-up if there is only one child of the copy environment, and
      // it's not a Rule, just insert the child. Note that we've already checked
      // that the child isn't a ForSome, and that there is at least one
      // conclusion inside of the copy environment, so that it the lone child
      // must be a conclusion.
      
      // write(`Inserting:`)

      if (copy.numChildren() == 1 && !copy.isA('Rule') ) {
        if (copy.isA('given')) copy.child(0).makeIntoA('given')
        // write(copy.child(0))
        copy.child(0).insertAfter(e)
      } else {
        // write(copy)
        copy.insertAfter(e)
      }  

    } )
    // finally, delete the original environment these replace

      // write(`Deleting:`)
      // write(e)

    e.remove()
  } )
  // update the index (TODO: update individual indices instead of them all?)
  doc.index.updateAll()
  return doc
}

/**
 * Assign Proper Names
 * 
 * Rename any non-constant free symbol declared by a declaration by appending a
 * `#`, followed by a canonical form of the body if it has one.
 * 
 * For bodies that have a binding we want to use the alpha-equivalent canonical
 * form.
 */
const assignProperNames = doc => {
  // get all the declarations we need to process, skipping unnecessary ones
  // (leading Lets of Rules or Theorems), which validation ignores as if they
  // were deleted, so they must not rename the symbols in their scope, and
  // aliases, which have already been expanded and are likewise inert
  const declarations = doc.declarations().filter( d =>
    !d.isA('unnecessary') && !d.isA('alias') )
  // cache the proper names as we compute them, and track any recursive calls
  const properNames = new Map()
  const computing = new Set()
  // only non-constant, non-numeric, non-metavariable symbols get new names
  const isNumeric = s => numeral.test(s.text())
  const shouldRename = s => !s.isA('Metavar') && !s.constant && !isNumeric(s)
  // check whether one LC occurs inside another
  const contains = (ancestor, descendant) =>
    descendant.hasAncestorSatisfying(x => x === ancestor)
  // get the declared names that will actually receive new ProperNames
  const declaredNames = decl => new Set(
    decl.symbols().filter(shouldRename).map(s => s.text())
  )
  // find the declaration, if any, that controls this free symbol
  const localDeclarationFor = (symbol, currentDecl) => {
    let result
    declarations.forEach( decl => {
      // don't use the declaration itself, or declarations inside its own body
      if (decl === currentDecl) return
      if (currentDecl.body() && contains(currentDecl.body(), decl)) return
      if (!declaredNames(decl).has(symbol.text())) return
      if (!decl.scope().includes(symbol)) return
      result = decl
    })
    return result
  }
  // compute the body suffix for a declaration with body
  const bodyName = decl => {
    const body = decl.body()
    const myNames = declaredNames(decl)
    // names declared by declarations nested inside the body itself.  Such
    // symbols have their entire scope inside the body, so their raw name is
    // already canonical for identity purposes.  We must not render them via
    // L.properName() because that value is stateful: it is unassigned when the
    // user's document is interpreted but already assigned on symbols arriving
    // in an instantiation via matching, which would give the same declaration
    // two different body signatures (and thus two different atoms).  The
    // signature must be a pure function of the body's structure.
    const innerNames = new Set()
    body.descendantsSatisfying( d => d instanceof Declaration && !d.isA('Declare') )
        .forEach( d => d.symbols().forEach( s => innerNames.add(s.text()) ) )
    return body.toPutdown((L,S,A) => {
      if (!(L instanceof LurchSymbol)) return S
      // constants and numbers keep their ordinary names
      if (L.constant || isNumeric(L)) return S
      // bound symbols already have canonical ProperNames for alpha equivalence
      if (!L.isFree(body)) return L.properName()
      // occurrences of symbols declared by this same declaration stay raw
      if (myNames.has(L.text())) return S
      // symbols declared by declarations inside the body stay raw as well
      if (innerNames.has(L.text())) return S
      // other declared free symbols use their recursively computed names
      const localDecl = localDeclarationFor(L,decl)
      if (!localDecl) return L.properName()
      return properNamesFor(localDecl).get(L.text()) || L.properName()
    })
  }
  // compute and cache the ProperNames for a declaration
  const properNamesFor = decl => {
    if (properNames.has(decl)) return properNames.get(decl)
    if (computing.has(decl)) return new Map()
    computing.add(decl)
    const names = new Map()
    const suffix = decl.body() ? bodyName(decl) : ''
    decl.symbols().filter(shouldRename)
      .forEach( c => names.set(c.text(), c.text()+'#'+suffix) )
    properNames.set(decl,names)
    computing.delete(decl)
    return names
  }
  // assign the computed ProperNames throughout the declaration's scope
  const applyDeclarationNames = decl => {
    const names = properNamesFor(decl)
    decl.symbols().filter(shouldRename).forEach( c => {
      const name = names.get(c.text())
      if (!name) return
      c.setAttribute('ProperName',name)
      if (decl.isALet()) c.declaredBy = decl
      // only rename free occurrences, so bound variables keep alpha names
      decl.scope(false)
        .filter( x => x instanceof LurchSymbol &&
                      x.text()===c.text() &&
                      x.isFree() )
        .forEach( s => {
          if (decl.isALet()) s.declaredBy = decl
          s.setAttribute('ProperName',name)
        })
    })
  }

  declarations.forEach(applyDeclarationNames)

  return doc
}

/**
 * Common helper used by both `replaceBindings` and `renameBindings`
 * to walk a tree and assign canonical bound variable names.
 *
 * @param {Expression} expr - Expression to process
 * @param {string} symb - Prefix symbol (e.g. 'x' or 'y')
 * @param {boolean} ProperNameOnly - If true, uses setAttribute('ProperName') instead of .rename()
 */
const canonicalizeBindings = (expr, symb, ProperNameOnly = false) => {
  // the current stack of declared binding names and their new name
  const stack = new Map()
  // push and pop from the stack during traversal
  const push = () => stack.forEach(v => v.push(v.at(-1)))
  const pop = () => stack.forEach((v, k) => {
    v.pop()
    if (v.length === 0) stack.delete(k)
  }) 
  // get the new name of something on the stack
  const get = name => stack.has(name) ? stack.get(name).at(-1) : undefined
  // set the new name of the correct name on the stack. If the name is already
  // there (which happens if the user enters, e.g. ∃x, P(x) ⇒ ∃x, Q(x) )
  // disambiguate by renaming to the latest thing the x's are in the scope of
  // (∃x₁, P(x₁) ⇒ ∃x₂, Q(x₂)).
  const set = (name, newname) => {
    if (stack.has(name)) stack.get(name)[stack.get(name).length - 1] = newname
    else stack.set(name, [newname])
  }
  // traverse the tree
  let counter = 0
  const solve = e => {
    // LurchSymbols get renamed according to what's on the stack
    if (e instanceof LurchSymbol && stack.has(e.text())) {
      const newname = get(e.text())
      if (ProperNameOnly)
        e.setAttribute('ProperName', newname)
      else
        e.rename(newname)
    }
    // BindingExpessions push everything they bind onto the stack, then
    // processed the children, the pops off the stack.
    if (e instanceof BindingExpression) {
      push()
      counter++
      // with the current parser there should only be one bound symbol name e.g.
      // x.y.z.P(x,y,z) parsed to nested univariate bindings.
      e.boundSymbolNames().forEach(name => {
        set(name, `${symb}${subscript(counter)}`)
      })
      e.children().forEach(c => solve(c))
      counter--
      pop()
    }
    // Any non-binding LC just processes its children recursively.
    if (!(e instanceof BindingExpression) && !(e instanceof LurchSymbol))
      e.children().forEach(c => solve(c))
  }

  solve(expr)
}

/**
 * Replace bound variables in formulas
 * 
 * This turns all bound variables in formulas to a canonical form like `y₀, y₁, ...`
 * that cannot be entered by the user. Applying this to formulas before instantiating
 * prevents variable capture.
 * 
 * @param {Expression} expr - The expression to process
 * @param {string} [symb='y'] - The symbol to use for the replacement
 */
const replaceBindings = (expr, symb = 'y') => {
  canonicalizeBindings(expr, symb, false)
}

/**
 * Rename bound variables for alpha equivalence (scope-aware)
 *
 * This assigns canonical names x₀, x₁, etc. as the ProperName attribute of
 * variables *lexically bound* in BindingExpressions. It avoids renaming
 * variables that are free or outside the scope of any binding.  This allows
 * alpha equivalent expression to have the same propositional form.
 *
 * @param {Expression} expr - The expression to process
 * @param {string} [symb='x'] - The symbol to use for the replacement
 */

const renameBindings = (expr, symb = 'x') => {
  canonicalizeBindings(expr, symb, true)
}

// TODO: These next two are not complete.  Complete them or delete them.
//
// We keep a list of js attribute names that are used by validation.  Since
// these are computed from the original content of the LC supplied by the user
// having this list lets us reset the entire LC by removing these attributes and
// recomputing them to revalidate it from scratch when we need to. 
const computedAttributes = [
  'constant', 'properName'
]
// Reset all of the attributes computed by these interpretation utilities.  
//
// NOTE: it might be faster to just rebuild and recompute the whole document
// from source, but we put this here just in case it's needed. 
const resetComputedAttributes = doc => {
  [...doc.descendantsIterator()].forEach( x => {
    computedAttributes.forEach( a => delete x[a])
  })
  return doc
}

// A numeral is a string of digits, a decimal, or a repeating decimal such as
// `1.23[456]`.  Numerals are constants automatically, so users need not
// Declare every number they mention.
const numeral = /^\d+$|^\d+\.\d*(\[\d+\])?$/

/**
 * Is this symbol a constant?
 *
 * A symbol is a constant if it is a numeral or if it is declared by some
 * `Declare` in the document.  All `Declare`s are global (interpretation hoists
 * them to the top of the document), so this does not depend on where the
 * symbol sits.  The texts of the Declared symbols are cached in
 * `doc.constants` the first time they are needed.
 *
 * This is the single definition of "constant" used both to set the `.constant`
 * js attribute on the symbols of a document (see `markDeclaredSymbols`) and to
 * reject instantiations that try to declare a constant (see
 * `isBadInstantiation` in global-validation.js), so the two cannot drift apart.
 * The latter needs the document passed in explicitly, because `.constant` is a
 * js attribute that `Formula.instantiate` does not copy, and the instantiation
 * being tested is not yet in the document.
 *
 * @param {LurchSymbol} s - the symbol to test
 * @param {LogicConcept} [doc=s.root()] - the document whose `Declare`s apply
 */
const isConstantSymbol = ( s, doc = s.root() ) => {
  // if the text of the constants is cached in doc.constants, fetch it,
  // otherwise compute it
  if (!doc.constants) {
    doc.constants = new Set(doc.index.get('Declares')
                    .map(x=>x.children().map(kid=>kid.text())).flat())
  }
  return numeral.test(s.text()) || doc.constants.has(s.text())
}

/**
 * Mark Declared Symbols
 *
 * Mark every constant symbol `s` throughout an LC by setting `s.constant=true`,
 * where "constant" is decided by `isConstantSymbol`: explicitly Declared
 * symbols and numerals.
 *
 * @param {LurchDocument} [target] - The target 
 */
const markDeclaredSymbols = ( target ) => {
  // get the document
  const doc = target.root()
  // mark every symbol in the target that is a constant
  target.descendantsSatisfying( x => x instanceof LurchSymbol )
        .forEach( s => { if (isConstantSymbol(s, doc)) s.constant = true } )
  return target
}

export default { interpret, addSystemDeclarations, processShorthands, 
  processAliases, moveDeclaresToTop, processTheorems, processDeclarationBodies, 
  processLetEnvironments, removeTrailingGivens, splitConclusions, 
  processBindings, processRules, assignProperNames, markDeclaredSymbols,
  isConstantSymbol,
  replaceBindings, renameBindings
}
