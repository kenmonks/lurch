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
  Application, Environment, Expression, Declaration, LurchSymbol,
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

/**
 *  ### Interpret
 * 
 *  This takes a raw user's document as an LC environment and preprocesses it in
 *  preparation for validation.  It does the following:
 *  - addSystemDeclarations(doc)
 *  - processShorthands(doc)
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

  addSystemDeclarations(doc)
  addIndex(doc,'Parsing')
  processShorthands(doc)
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
 * Add system declarations to the top of the document. These are reserved
 * symbols that the user is not allowed to use. Currently they are
 * 'LDE EFA' and '➤'.
*/
const addSystemDeclarations = doc => {
  doc.unshiftChild(
    new Declaration(
      [new LurchSymbol('LDE EFA'), new LurchSymbol('➤')]
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
      // make a formula copy of the thm
      let thmrule = Formula.from(thm)
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
    // check if f is not an Environment, or is a Let-environment, and throw
    // an error either way
    if (!f instanceof Environment || f.isALetEnvironment() )
      throw new Error('A rule must be an environment that is not a Let-environment.')
    // it's not, so convert it to a formula
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
 * Rename any symbol declared by a declaration with body by appending the putdown
 * form of their body. Rename any symbol in the scope of a Let-without body by
 * appending a tick mark.
 * 
 * For bodies that have a binding we want to use the alpha-equivalent canonical
 * form.
 */
const assignProperNames = doc => {
    
  // get the declarations with a body (hence the 'true') which is an expression
  let declarations = doc.declarations(true)
  
  // rename all of the declared symbols with body that aren't metavars
  declarations.forEach( decl => {
    // write(`Decl:`)
    // write(decl)
    decl.symbols().filter(s=>!s.isA('Metavar')).forEach( c => {
    // write(`c:`)
    // write(c)
      // Compute the new ProperName
      c.setAttribute('ProperName',
        c.text()+'#'+decl.body().toPutdown((L,S,A)=>S)) //.prop())
      // apply it to all c's in it's scope
      decl.scope().filter( x => x instanceof LurchSymbol && x.text()===c.text())
        .forEach(s => s.setAttribute('ProperName',c.getAttribute('ProperName')))
    })
  })

  // if it is an instantiation it is possible that some of the declarations
  // without bodies have been instantiated with ProperNames already (from the
  // user's expressions) that are not the correct ProperNames for the
  // instantiation, so we fix them.  
  //
  // TODO: merge this with the code immediately above.
  declarations = doc.declarations().filter( x => x.body()===undefined )
  declarations.forEach( decl => {
    decl.symbols().filter(s=>!s.isA('Metavar')).forEach( c => {
      // Compute the new ProperName
      c.setAttribute('ProperName', c.text())
      // apply it to all c's in it's scope
      decl.scope().filter( x => x instanceof LurchSymbol && x.text()===c.text())
        .forEach(s => s.setAttribute('ProperName',c.getAttribute('ProperName')))
    })
  })

  // Now add tick marks for all symbols declared with Let's.
  doc.lets().forEach( decl => {
    decl.symbols().filter(s=>!s.isA('Metavar')).forEach( c => {
      // Compute the new ProperName
      let cname = c.properName()
      if (!cname.endsWith("'")) c.setAttribute( 'ProperName' , cname + "'" )
      c.declaredBy = decl
      // apply it to all c's in it's scope
      decl.scope().filter( x => x instanceof LurchSymbol && x.text()===c.text())
        .forEach( s => {
          s.declaredBy = decl
          s.setAttribute('ProperName',c.getAttribute('ProperName'))
      })
    })
  })

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
    // Applications just process the children recursvely
    if (e instanceof Application)
      e.children().forEach(c => solve(c))
    // Note that we don't allow a declaration inside a binding currently.
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


/**
 * Mark Declared Symbols
 *
 * Mark explicitly declared symbols `s`, throughout an LC by setting
 * `s.constant=true`.  Symbols consisting of a string of digits, decimals, and
 * repeating decimals like `1.23[456]` are automatically marked as constants.
 *
 * @param {LurchDocument} [target] - The target 
 */
const markDeclaredSymbols = ( target ) => {
  // get the document
  const doc = target.root()
  // if the text of the constants is cached in an array in doc.constants, fetch
  // it, otherwise compute it
  if (!doc.constants) { 
    doc.constants = new Set(doc.index.get('Declares')
                    .map(x=>x.children().map(kid=>kid.text())).flat())
  }
  // fetch all of the symbols in the target
  let symbols = target.descendantsSatisfying( x => x instanceof LurchSymbol )
  // for each one, see if it is in the scope of any Declare declaration of that symbol
  symbols.forEach( s => {
      if ( /^\d+$|^\d+\.\d*(\[\d+\])?$/.test(s.text()) || 
           doc.constants.has(s.text())) s.constant = true
  })
  return target
}

export default { interpret, addSystemDeclarations, processShorthands, 
  moveDeclaresToTop, processTheorems, processDeclarationBodies, 
  processLetEnvironments, removeTrailingGivens, splitConclusions, 
  processBindings, processRules, assignProperNames, markDeclaredSymbols,
  replaceBindings, renameBindings
}