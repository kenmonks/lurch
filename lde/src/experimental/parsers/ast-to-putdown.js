///////////////////////////////////////////////////////////////////////////
// AST → putdown printer for the Lurch notation parser
//
// The lurch-to-putdown grammar builds a plain-object AST in its actions,
// and this module renders that AST as putdown.
// Do not change a template's spacing or behavior here without regenerating
// and reviewing the golden snapshots (parsertests.js).
//
// The AST is a JSON-able tree: every node is a plain object with a `type`
// field and every leaf is a string (Symbols, Numbers, "string literals",
// and the '+'/'-' exponent tokens).  Formatting-only notation is recorded
// in the tree - the `paren` wrapper node below is the simplest instance -
// and ignored by this printer; the tex printer consumes it.  The node
// vocabulary, in the order the grammar produces them:
//
//   { type:'seq', items }              sequence of LCs (top level and
//                                      environment bodies)
//   { type:'env', body }               { ... } environment; body is a seq
//   { type:'raw', text }               «...» escaped putdown, opaque
//   { type:'comment', str }            % "..." ; str keeps its quotes
//   { type:'linecomment', text }       // ... to end of line; dropped by
//                                      this printer, rendered by tex
//   { type:'label', text }             label ( ... )
//   { type:'ref', label }              by ( ... ) citation with a label
//   { type:'shorthand', text }         bare tokens post-processed by the
//                                      LDE: rule> thm> proof>
//                                      rules> cases> subs> ≡ >> <comma
//                                      <be by
//   { type:'given', label, exprs }     assume/:/suppose/... optionally
//                                      absorbing the comma list of claims
//                                      that follows (flattened back to
//                                      'given> P <comma Q' here)
//   { type:'declare', names }          Declare a, b, c (names are the raw
//                                      matched strings; the putdown
//                                      internal-name map applies here)
//   { type:'forsome', names, set }     for some x, y (in A); set may be null
//   { type:'let', names, set, be }     Let x, y (in A) ((be) such that)
//                                      (set node or absent; be boolean;
//                                      both may be present at once)
//   { type:'quant', q, v, set, body }  typed forall x in A. P; q is the
//                                      quantifier symbol ∀ ∃ ∃!
//   { type:'quant', q, bind }          untyped forall z. P
//   { type:'bind', v, body }           z . body  or  z mapsto body
//   { type:'op', op, args }            n-ary operator application; op is
//                                      the putdown head symbol string
//   { type:'paramop', op, params, args }  parameterized operator:
//                                      a ~_(u,v) b, a cong b mod m,
//                                      a = b mod m, x =_(0) y,
//                                      a ⊕_(n) b - the compound operator
//                                      (op params...) applied to args
//   { type:'chain', first, steps }     transitive chain (= plus one
//                                      chainFamilies family);
//                                      steps: [ { op, rhs, by, comment,
//                                      nl } ] - op is '=', '≤', '<',
//                                      '≅', '|', '⊆', or the compound
//                                      { head:'≅', params } for a
//                                      cong_(m) step;
//                                      comment and nl (newline near the
//                                      op) are formatting-only
//   { type:'bigop', op, k, f, lo, hi } sum, product, defint, integral
//                                      with index k, body f, and limits
//                                      (lo null means 0; hi null - the
//                                      integral head - means indefinite)
//   { type:'bigover', op, k, f, domain }  sumOver, Union, Intersect over
//                                      an indexing set
//   { type:'app', head, args }         function application f(x); nested
//                                      in head position for f(x)(y)
//   { type:'efa', name, args }         @P(k) expression function
//                                      application; extra (...) groups nest
//                                      as ordinary app nodes around it
//   { type:'setbuilder', v, pred }     { v : pred } set-builder notation;
//                                      the extended form
//                                      { v in dom : p1, ..., pn } carries
//                                      { v, dom, preds } instead (dom null
//                                      when no domain was typed), and its
//                                      putdown folds the domain into a
//                                      leading ∈-condition and wraps the
//                                      resulting ≥2 conditions in the
//                                      invisible seq> head, so the
//                                      binding's body stays a single
//                                      Expression
//   { type:'set', elts }               finite set
//   { type:'class', elts }             equivalence class class(a,~)
//   { type:'tuple', elts }             tuple / pair / triple / matrix row
//   { type:'paren', expr }             user-typed or paren() parentheses:
//                                      formatting only, dropped in putdown
//
// Many nodes also carry a fmt object recording formatting-only detail
// (keyword case and English variants, subscript groups, tuple styles and
// tick marks, signed-sum surface signs, chain newlines).  This printer
// ignores fmt entirely; ast-to-tex.js documents and consumes it.
//
// Desugarings are performed
// here or at node-build time with generic op
// nodes: neq → (¬ (= a b)), notin → (¬ (∈ a b)), is not →
// (¬ (is a b)), typed quantifiers, Let/for-some membership bodies, and the
// signed-sum encoding (+ a (- b)).

import { internal } from './notation-tables.js'

// membership conjunction body shared by the let and forsome declaration
// shorthands: (∈ x A) for each declared name
const membership = ( names, set ) =>
  names.map( x => `(∈ ${x} ${astToPutdown(set)})` ).join(' ')

// the optional ` by reason` suffix of a chain step
const byReason = x => ( x === null ) ? `` : ` by ${astToPutdown(x)}`

/**
 * Render a Lurch notation AST (as built by the lurch-to-putdown grammar)
 * as putdown notation.  Leaves are strings and render as themselves.
 *
 * @param {object|string} node - an AST node or string leaf
 * @returns {string} the putdown rendering of the node
 */
export const astToPutdown = node => {
  if ( typeof node === 'string' ) return node
  const P = astToPutdown
  const spaced = nodes => nodes.map( P ).join(' ')
  switch ( node.type ) {

    // document structure (line comments are formatting-only: putdown
    // drops them)
    case 'seq'       : return spaced(
                         node.items.filter( i => i.type !== 'linecomment' ) )
    case 'env'       : return `{ ${P(node.body)} }`
    case 'raw'       : return node.text
    case 'comment'   : return `(➤ ${node.str})`
    case 'linecomment' : return ''
    case 'label'     : return `(label> "${node.text}")`
    case 'ref'       : return `by "${node.label}"`
    case 'shorthand' : return node.text
    case 'given'     : return 'given>' + ( node.exprs.length
                         ? ' ' + node.exprs.map(P).join(' <comma ') : '' )

    // declarations
    case 'declare'   : return `declare> :[${node.names.map(internal).join(' ')}]`
    case 'forsome'   : return node.set
      ? `some> [${node.names.join(' ')},{ ${membership(node.names,node.set)} }]`
      : `some> [${node.names.join(' ')}]`
    case 'let'       : {
      let decl = `:[${node.names.join(' ')}]`
      if ( node.set ) {
        let body = membership(node.names, node.set)
        if ( node.names.length > 1 ) body = `{ ${body} }`
        decl = `:[${node.names.join(' ')} , ${body}]`
      }
      // the <be shorthand merges any such-that conditions that follow into
      // the body, making it an environment if the declaration already has
      // the membership body or there is more than one condition
      return decl + ( node.be ? ' <be' : '' )
    }

    // quantifiers and bindings (typed quantifiers desugar to ⇒ / and)
    case 'quant'     : return node.bind
      ? `(${node.q} ${P(node.bind)})`
      : `(${node.q} ${node.v},(${ node.q === '∀' ? '⇒' : 'and' }` +
        ` (∈ ${node.v} ${P(node.set)}) ${P(node.body)}))`
    case 'bind'      : return `${node.v}, ${P(node.body)}`

    // operators
    case 'op'        : return `(${node.op} ${spaced(node.args)})`
    case 'paramop'   : return `((${node.op} ${spaced(node.params)}) ${spaced(node.args)})`
    case 'chain'     : {
      const steps = node.steps
      // a step operator is the symbol itself, or the compound (≅ m) for
      // a cong_(m) step - so the single-step case prints ((≅ m) a b)
      const chainOp = o =>
        typeof o === 'string' ? o : `(${o.head} ${spaced(o.params)})`
      if ( steps.length === 1 )
        return `(${chainOp(steps[0].op)} ${P(node.first)} ${P(steps[0].rhs)})` +
               byReason(steps[0].by)
      return `(trans_chain ${P(node.first)} ${ steps.map(
        s => `${chainOp(s.op)} ${P(s.rhs)}${byReason(s.by)}` ).join(' ') })`
    }

    // big operators (sum, product, int, and the indexed-set forms)
    case 'bigop'     : {
      const head = `(${node.op} (${node.k} , ${P(node.f)})`
      // no upper limit means an indefinite integral (the integral head)
      if ( node.hi === null ) return `${head})`
      // a missing lower limit defaults to 0 (sums, products, and integrals)
      return `${head} ${ node.lo ? P(node.lo) : 0 } ${P(node.hi)})`
    }
    case 'bigover'   : return `(${node.op} (${node.k} , ${P(node.f)}) ${P(node.domain)})`

    // application forms
    case 'app'       : return `(${P(node.head)} ${spaced(node.args)})`
    case 'efa'       : return `(λ ${node.name} ${spaced(node.args)})`

    // sequents - both sides are ALWAYS tuple-wrapped, even singletons
    // and the empty LHS, so the small-cases Rule shapes are uniform (see
    // the Sequents section of lurch-to-putdown.peggy); the subscripted
    // form compounds the head and the English negative ¬-wraps
    case 'sequent'   : {
      const head = node.param ? `(⊢ ${P(node.param)})` : `⊢`
      const side = elts => elts.length ? `(tuple ${spaced(elts)})` : `(tuple)`
      const seq = `(${head} ${side(node.lhs)} ${side(node.rhs)})`
      return node.neg ? `(¬ ${seq})` : seq
    }

    // aggregates
    case 'setbuilder': {
      if ( node.pred !== undefined )
        return `(setbuilder (${node.v},${P(node.pred)}))`
      const conds = [
        ...( node.dom ? [ `(∈ ${node.v} ${P(node.dom)})` ] : [] ),
        ...node.preds.map( P ) ]
      return `(setbuilder (${node.v},(seq> ${conds.join(' ')})))`
    }
    case 'set'       : return `(set ${spaced(node.elts)})`
    case 'class'     : return `(class ${spaced(node.elts)})`
    case 'tuple'     : return `(tuple ${spaced(node.elts)})`

    // formatting-only wrappers
    case 'paren'     : return P(node.expr)

    default : throw new Error(`astToPutdown: unknown AST node type '${node.type}'`)
  }
}
