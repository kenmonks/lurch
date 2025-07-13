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

  ////////////////////
  //  Phase 0: Parsing
  //
  if (phase === 'Parsing') {
    // Find and cache Shorthands
    const ShorthandsList = [
      'given>','<comma','BIH>','declare>','rule>','cases>','label>','subs>','thm>',
      '<thm','proof>','by','rules>','λ','@','pair','triple','≡','then','<be','some>',
      '✔︎','✗','⁉︎','⊘','➤','<<','>>'
    ]
    ShorthandsList.forEach( x => {
      indexer.define( x, { selector: s => s.isSymbol(x) } )
    })
    
    // Parsing also needs to tweak the LCs with the ExpectedResult attribute
    indexer.define('ExpectedResults', { 
      selector: x => x.hasAttribute('ExpectedResult') 
    })
  } else {
    // find all the useful .isA() nodes
    const defineIsA = types => {
      types.forEach( ([label,type]) => {
        indexer.define(label,{ selector: x => x.isA(type) })
      } )
    }
    const TypeList = [
      ['Rules','Rule'],
      ['Parts','Part'],
      ['Insts','Inst'],
      ['Declares','Declare'],
      ['Theorems','Theorem'],
      ['Proofs','Proof'],
      ['Metavars','Metavar'],
      ['Considers','Consider']
    ]
    defineIsA(TypeList)


  }
}