/**
 * TreeIndexer provides a configurable way to traverse a tree of LogicConcept nodes
 * and collect matching nodes into indexes.
 *
 * It can 
 * - collect all nodes in the document satisfying a custom selector 
 * - store the results in either an Array or Set (depending on if order matters
 *   and duplicates are allowed)
 * - transform the selected nodes before collecting them with a custom proc
 * - traverse the tree in either Depth-first, or Post-order order
 */
class TreeIndexer {

  /**
   * Create a TreeIndexer.
   * @param {LogicConcept} root - The document LC that this indexes
   */
  constructor(root) {
    this.root = root
    this.indexes = new Map()   // key -> { selector, transform, type, order }
    this.cache = new Map()     // key -> Array or Set
  }

  /**
   * Define a new index.
   *
   * @param {string} key - Unique key for the index.
   * @param {Object} options - Configuration options for the index.
   * @param {Function} [options.selector] - Function to decide if a node matches
   * the index.
   * @param {Function} [options.transform] - Function to transform the matching
   * node's value.
   * @param {'Array'|'Set'} [options.type] - Whether to store results in an
   * Array or Set.
   * @param {'Depth'|'Post'} [options.order] - Tree traversal order to use.
   */
  define(key, {
    selector = () => false,    // determines if a node gets indexed for this key
    transform = x => x,        // what value to cache when the node matches
    type = 'Array',            // 'Set' or 'Array'
    order = 'Depth'            // 'Depth' or 'Post'
  } = {}) {
    this.indexes.set(key, { selector, transform, type, order })
  }

  /**
   * Retrieve all indexed values for a specific key, using cached data if available.
   * Triggers a fresh update if the cache is empty.
   * 
   * @param {string} key - The index key.
   * @returns {Array|Set} The set or array of indexed values.
   */
  get(key) {
    if (!this.cache.has(key)) this.update(key)
    return this.cache.get(key)
  }

  /**
   * Traverse the tree and update the cache for a single index key.
   * 
   * @param {string} key - The index key to update.
   * @returns {Array|Set} The result of the index computation.
   * @throws Will throw an error if the key is not defined.
   */
  update(key) {

    const config = this.indexes.get(key)
    if (!config) throw new Error(`No index defined for key '${key}'`)

    const { selector, type, order } = config
    const result = (type === 'Set') ? new Set() : []
    this.cache.set(key, result)

    const visit = node => {
      if (order === 'Depth') {
        if (selector(node)) this._add(key, node)
        node.children().forEach(visit)
      } else if (order === 'Post') {
        node.children().forEach(visit)
        if (selector(node)) this._add(key, node)
      } else {
        throw new Error(`Unknown traversal order '${order}'`)
      }
    }

    visit(this.root)

    return result
  }

  /**
   * Update all indexes, traversing the tree only once per order type.
   * Clears and rebuilds the entire cache.
   */
  updateAll() {
    // clear any existing cache
    this.cache = new Map()

    // separate the pre-order keys from the post-order ones
    const preKeys = new Map([...this.indexes].filter(([k,v])=>v.order=='Depth'))
    const postKeys = new Map([...this.indexes].filter(([k,v])=>v.order=='Post'))
    // initialize the cache with the appropriate keys and containers
    preKeys?.forEach( (value,key) => { 
      this.cache.set( key , (value.type === 'Set')? new Set() : [])
    } )
    postKeys?.forEach( (value,key) => { 
      this.cache.set( key , (value.type === 'Set')? new Set() : [])
    } )

    // pass both the node and the filtered keys Map)
    const visit = (node, keys) => {
      keys.forEach( ( { selector }, key ) => {
        if (selector(node)) this._add(key,node)
      } )
    }
  
    const traversePre = node => {
      visit(node, preKeys)
      node.children().forEach(traversePre)
    }
  
    const traversePost = node => {
      node.children().forEach(traversePost)
      visit(node, postKeys)
    }
  
    if (preKeys.size) traversePre(this.root)
    if (postKeys.size) traversePost(this.root)
  }

   /**
   * Add a transformed node to the appropriate cache container.
   * 
   * @private
   * @param {string} key - The index key.
   * @param {Object} node - The tree node to process.
   */
  _add(key, node) {
    const value = this.indexes.get(key).transform(node)

    if (this.indexes.get(key).type === 'Set') this.cache.get(key).add(value)
    else this.cache.get(key).push(value)
  }

  /**
   * Delete one or more index cache entries.
   * If no keys are given, clears the entire cache.
   * 
   * @param {...string} keys - The index keys to delete.
   */
  delete( ...keys ) {
    if (!keys.length) this.cache.clear()
    else keys.forEach(key => this.cache.delete(key))
  }

  /**
   * Print a string representation of the current cache state. Intended for
   * debugging or inspection in Lode. It doesn't actually return a string.
   */
  show() {

    const writeNice = val => {
      console.log(` selector: ${val.selector.toString()}`)
      console.log(` transform: ${val.transform.toString()}`)
    }

    console.log('\nIndex Definitions')
    console.log('-----------------')
    this.indexes.forEach( (val,key) => {
      console.log(`\n${itemPen(key)} -> type: '${stringPen(val.type)}' order: '${stringPen(val.order)}'`)
      writeNice(val)
    } )

    console.log('\nCached Values')
    console.log('-------------')
    this.cache.forEach( (val,key) => {
      console.log(`\n${itemPen(key)} ->`)
      write(val)
      console.log('---------')
    })
  }

}

export default TreeIndexer
