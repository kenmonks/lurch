/**
 * Lurch index definitions module
 *
 * Defines the various types of nodes in a LogicConcept (usually a Lurch
 * document). The index is caches in the doc.index.
 *
 * The main places in the algorithm it might be called are in the following
 * phases. It is very efficient so calling it a few times is no big deal.
 *
 * 1. 'Parsing' phase
 * 2. 'Interpretation' phase
 * 3. 'Smart' validation (e.g. Algebra, Arithmetic, Equations, etc.)
 * 4. 'Instantiation' phase 
 * 5. 'Prop' validation phase 
 *
 */

import TreeIndexer from './tree-indexer.js'
import {
  LogicConcept, MathConcept, BindingExpression, Application, 
  Environment, Declaration, Expression, LurchSymbol
} from '../index.js'

/**
 * Create a document index, add it to the document, and populate it. The second
 * argument specifies the type of index to make.  The types correspond to the
 * various phases of processing.
 *
 * @param {*} doc 
 * @param {'Parsing'} the phase to compute the cache for
 */
export const addIndex = ( doc, phase ) => {
  const indexer = new TreeIndexer(doc)
  addLurchIndices(indexer,phase)
  doc.index = indexer
  indexer.updateAll()
}

/**
 * addLurchIndices
 *
 * This routine populates the generic tree indexer with the index definition we
 * need for a Lurch document.  It will usually be called by the `addIndex(doc)`
 * routine to create, define, and populate a document's index which can then be
 * accessed via doc.index.
 *
 * @param {*} indexer 
 * @param {'Parsing'} phase - the phase to compute the cache for
 */

// quick reference while coding this
//
//  selector = () => false,    // determines if a node gets indexed for this key
//  transform = x => x,        // what value to cache when the node matches
//  type = 'Array',            // 'Set' or 'Array' 
//  order = 'Depth'            // 'Depth' or 'Post' 
export const addLurchIndices = (indexer, phase) => {

  // a convenient utility
  const define = (key,selector,order = 'Depth') => 
    indexer.define(key,{ selector: selector , order: order})

  // Find and cache Shorthands
  const ShorthandsList = [
    'given>','<comma','BIH>','declare>','rule>','cases>','label>','subs>','thm>',
    '<thm','proof>','by','rules>','λ','@','pair','triple','≡','then','<be','some>',
    '✔︎','✗','⁉︎','⊘','➤','<<','>>'
  ]

  ////////////////////
  //  Phase 0: Parsing
  //
  if (phase === 'Parsing') {
    
    ShorthandsList.forEach( x => define( x, s => s.isSymbol(x) ) )
    // Parsing also needs to tweak the LCs with the ExpectedResult attribute
    indexer.define('ExpectedResults', { 
      selector: x => x.hasAttribute('ExpectedResult') 
    })
  
  } else if (phase === 'After ≡') {

    const remaining = ShorthandsList.slice(ShorthandsList.indexOf('≡') + 1)
    remaining.forEach( x => define( x, s => s.isSymbol(x) ) )
    
  } else if (phase = 'Interpret') {

    define('Environments', x => x instanceof Environment )

    // find all environments containing metavariables inside a given environment
    // that has more than one conclusion in post-order (for splitting rule
    // conclusions)
    define( 'multi-conclusions', x => 
      x instanceof Environment && 
      x.some( d => d.isA('Metavar') ) &&
      x.ancestors().some( d => d.isA('Rule') ) &&
      !x.ancestors().some( d => d instanceof Declaration ) &&
      !x.some( d => d.isAForSome()) &&
      x.conclusions().length>1,
      'Post'
    )

    // find all the useful .isA() nodes
    const defineIsA = types => {
      types.forEach( ([label,type]) => define(label,  x => x.isA(type) ) )
    }
    const TypeList = [
      ['Rules','Rule'],
      ['Declares','Declare'],
      ['Theorems','Theorem'],
      ['Metavars','Metavar']
    ]
    defineIsA(TypeList)

    // virtual types (not cached in the LC)

    define( 'Statements', x => 
      (x instanceof Expression) && x.isOutermost() &&
      !( (x.parent() instanceof Declaration) &&
          x.parent().symbols().includes(x)
      )
    )

    // // define( 'Decs', x => x instanceof Declaration && !x.isA('Declare') )

    define( 'Decs with body', x => 
      x instanceof Declaration && !x.isA('Declare') && x.body() )

    define( 'Lets', x => 
      x instanceof Declaration && x.isA('given') && !x.isA('Declare') )
  
    // define( 'Lets with body', x => 
    //   x instanceof Declaration && x.isA('given') && !x.isA('Declare') && x.body() )

    // define( 'ForSomes', x => 
    //   x instanceof Declaration && !x.isA('given') && !x.isA('Declare') )

    define( 'Formulas', x =>
       (x.isA('Rule') || x.isA('Part')) && !(x.finished)
    )

  } else {

  }
}