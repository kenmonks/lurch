///////////////////////////////////////////////////////////////////////////
// AST → LaTeX printer for the Lurch notation parser
//
// The single grammar in lurch-to-putdown.peggy builds a plain-object AST
// (the node vocabulary is documented in ast-to-putdown.js) and this
// module renders that AST as LaTeX.  Some renderings are deliberate
// quirks locked by the golden snapshots (the greedy nopar() regex and
// the double space texJoin() puts around infix operators like \star).
// Do not change a template here without
// regenerating and reviewing the golden snapshots (parsertests.js).
//
// Formatting-only notation that putdown ignores is recorded by the grammar
// in fmt annotations and honored here:
//
//   fmt.kw       source keyword as typed (Let/let, Declare/declare)
//   fmt.src      which surface synonym was typed (not/neg, neq, notin,
//                is/is a/is an/are/is not/..., loves/love, fears/fear,
//                the does-not verb phrases, shorthand keywords like
//                Theorem:/lemma, the label of a given)
//   fmt.phrase   the typed `is [not] a ⟨noun⟩ ⟨prep⟩` registry
//                phrase, rendered verbatim even when the putdown head
//                is symbolic ('A is a subset of S' stays English in tex
//                though its putdown is (⊆ A S))
//   fmt.mapsto   binding typed as x mapsto e rather than x.e
//   fmt.be       'Let x be such that' vs 'Let x such that'
//   fmt.signs    surface signs of a signed sum (a-b vs a+-b)
//   fmt.sub      function-application group typed as a subscript x_(0)
//   fmt.style    tuple surface: 'bracket' [..], 'langle' ⟨..⟩, or 'call'
//   fmt.tick     trailing tick mark on a bracket tuple (transpose display)
//   fmt.call     set/setbuilder/paren typed in call form (set(..),
//                paren(..)) rather than bracket form
//   steps[].nl   chain operator had a newline on either side (selects the
//                align* layout); steps[].comment is an expository // reason
//
// The paren wrapper node renders user
// parentheses: constructs that "come with their own" delimiters (function
// application, choose, integrals, set(..), tuple(..), class(..), index)
// render bare inside user parentheses, while everything else gets
// \left( \right).

import {
  texsymbol, texReservedWords, putdownLeadingSymbolRenames, operatorHeadTex,
  texRightOpen, headJoinTex, englishInfixJoin, srcJointTex, srcEchoTex,
  englishRelationHeads, negFixedTex, chainFamilies, bigOpHeadTex, bigOpDHeads,
  delimitedTexTemplates
} from './notation-tables.js'

// render a delimited-form head via its derived template (see
// delimitedTexTemplates in notation-tables.js): the template's literal
// chunks verbatim, each hole slot the rendered argument.  Hole values
// need no parenthesization - the surrounding delimiters already bound
// them - so a declared row renders with no printer edits at all.
const texDelimTemplate = (tpl, args, T) =>
  tpl.parts.map( p => typeof p === 'string' ? p : T(args[p.arg]) ).join('')

///////////////////////////////////////////////////////////////////////////
// Symbol leaves
//
// AST leaves carry the putdown parser's renamed constants (NN → ℕ) and -
// via the mention rule and the bare-mention holes - canonical
// operator heads (⊆, ★, ~, ≈, ...), so map each to its tex rendering,
// then fall back to the texsymbol table with the \text{} wrapping rule
// for multi-character words.

const leafMap = { ...operatorHeadTex }
putdownLeadingSymbolRenames.forEach( e => { leafMap[e.out] = texsymbol(e.lit) } )

// render a string leaf (Symbol, Number, "string literal") as tex
const leafTex = s => {
  // string literals render as text without their quotes
  if ( s.startsWith('"') ) return `\\text{${s.slice(1, -1)}}`
  // numbers render as themselves, except repeating decimals
  if ( /^\d/.test(s) ) {
    const m = /^(\d+\.\d*)\[([0-9]+)\]$/.exec(s)
    return m ? `${m[1]}\\overline{${m[2]}}` : s
  }
  if ( Object.prototype.hasOwnProperty.call(leafMap, s) ) return leafMap[s]
  const b = texsymbol(s)
  return ( b.length > 1 && !b.startsWith('\\') ) ? `\\text{${b}}` : b
}

// whole-token membership in the tex reserved word list (declared reserved
// words render raw + texsymbol)
const isTexReserved = n => texReservedWords.some( e =>
  e.i ? n.toLowerCase() === e.lit : n === e.lit )

///////////////////////////////////////////////////////////////////////////
// Small string helpers for the templates below

// plain text; single characters (like ':') stay bare
const txt = a => ( a.length > 1 ) ? `\\text{${a} }` : a

// comma sequence with an expository 'and' before the last item
const sequence = ( s, omitAND = false ) => {
  const a = s.map(texsymbol)
  if (omitAND) { return a.join(',') }
  if (a.length > 2) {
    return a.slice(0, -1).join(
      '\\text{, }') + '\\text{, }\\textcolor{black}{\\text{and }}' + a[a.length-1]
  } else if (a.length === 2) {
    return `${a[0]}\\textcolor{black}{\\text{ and }}${a[1]}`
  } else {
    return a[0]
  }
}

// join a tex sequence with an infix operator (note: operators that end in
// a space, like '\star ', get a double space - a deliberate quirk,
// snapshot-locked)
const texJoin = (op, args) => {
  if (args.length === 1) return args.join(op)
  return args.join(` ${op} `)
}

// remove tex parentheses from a string (greedy regex - a deliberate
// quirk, snapshot-locked)
const nopar = s => {
  return s.replace(/^\\left\((.*)\\right\)$/, '$1')
}

// big operators - the display symbol comes from the derived bigOpHeadTex
// map (each notation-file section's tex:, spread over its heads incl.
// form-level overrides), so a new bigop section renders with no edit
// here.  Only the integral family (the rows declaring d/callIndef forms,
// bigOpDHeads) uses the \,\mathrm{d}x template; every other head takes
// the limits or the in-domain template of its node type.
const bigSym = op => bigOpHeadTex[op] ?? `\\operatorname{${op}}`
const bigLimits = (op, f, k, a, b) => {
  a = a || 0
  return `\\displaystyle${bigSym(op)}_{${k}=${a}}^{${b}} ${f}`
}
const bigOver = (op, f, k, S) => {
  return `\\displaystyle${bigSym(op)}_{${k}\\in ${S}} ${f}`
}
const integral = (f, x, a, b) => {
  if (b === undefined || b === null)
    return `\\displaystyle\\int ${f}\\,\\mathrm{d}${x}`
  a = a || 0
  return `\\displaystyle\\int_{${a}}^{${b}} ${f}\\,\\mathrm{d}${x}`
}

// Which big-operator tex templates are RIGHT-OPEN:
// a template whose rendering ends in its body hole reads wrongly when
// material follows it on the right - {\sum f}^{2} floats the exponent
// after the f, and \sum f! reads as the sum of f-factorial - so such an
// operand gets visible \left( \right) parentheses.  This is the printer-
// side dual of the parser's closed flag (bigOpFormShapes): INPUT
// closedness and OUTPUT closedness are independent, per-template
// properties - int f dx is input-closed (the dx delimits parsing), yet
// its tex is postfix-open.  The flag is per-CONTEXT for exactly that
// reason: the dx delimits a following product factor (\int f\,dx \cdot 2
// is the standard rendering), but not a postfix or exponent (\int f\,
// dx! reads as x-factorial).  Union/Intersect behave like the
// summations in both contexts (raising a set to a power is common
// - Cartesian products - and a following \cdot factor absorbs
// visually just like a summand).  The registry is DERIVED
// from the big-operator rows (texRightOpen in notation-tables.js): every
// big-operator template is open in both contexts unless its notation-file
// row declares `tex-open:` with a restricted context list (the int row is
// postfix-only), so an instructor-declared big operator gets the correct
// parenthesization with no printer edit.
const rightOpen = (node, ctx) =>
  ( node?.type === 'bigop' || node?.type === 'bigover' ) &&
  texRightOpen[node.op]?.[ctx] === true
// render a node, in visible parentheses when its template is right-open
// in the given context
const texDelimited = (node, T, ctx) =>
  rightOpen(node, ctx) ? `\\left(${T(node)}\\right)` : T(node)

// matrices and tuples
const isRectangular = M => !M.some( row => row.length !== M[0].length )
const transpose = M => {
  return M[0].map( (_, k) => M.map( row => row[k] ) )
}
const matrix = (a, b) => {
  let t = (b === "'") ? transpose(a) : a
  return `\\left[\\begin{matrix}\n ` +
    t.map( row => { return row.join(' & ') } ).join(' \\\\\n ') +
    `\n\\end{matrix}\\right]`
}
const tuple = (a, b) => {
  if (b == "'") {
    return `\\left[\\begin{matrix}\n ${
      a.join(' \\\\\n ')}\n\\end{matrix}\\right]`
  } else {
    return `\\left\\langle{${a}}\\right\\rangle`
  }
}

// the unary multiplicative inverse, when it stands alone: /x is (/ x) and
// renders as a reciprocal (inside a product it becomes the denominator of
// a \frac instead - see texProduct)
const texInverse = s => `\\frac{1}{${nopar(s)}}`

// products, including the (/ x) inverse factors that become \frac's.  The
// factors arrive as AST nodes (inverse factors must be recognized by node,
// since their standalone rendering is a \frac) and are rendered here.
const texProduct = (nodes, T) => {
  const isInv = n => typeof n === 'object' && n.type === 'op' && n.op === '/'
  const term = nodes.map( n =>
    isInv(n) ? { inv: T(n.args[0]) } : { str: T(n), node: n } )
  const first = term.shift()
  let latest = first.inv !== undefined ? texInverse(first.inv) : first.str
  // the AST node behind `latest`, while it is still a single factor (a
  // \frac composite delimits itself, so it needs no factor wrapping)
  let latestNode = first.inv !== undefined ? null : first.node
  let ans = ''
  // treat a leading negative sign as subtraction, not negation
  const subtract = latest.startsWith('-')
  if (subtract) latest = latest.slice(1)
  while (term.length > 0) {
    let next = term.shift()
    // an inverse factor puts the latest in the numerator and itself in the
    // denominator
    if (next.inv !== undefined) {
      latest =
      `\\frac{${nopar(latest)}}{${nopar(next.inv)}}`
      latestNode = null
    } else {
      // a right-open big operator with a following factor needs visible
      // parentheses (a node-based check, so it covers every big
      // operator, not just summations)
      if (rightOpen(latestNode, 'factor')) latest = `\\left(${latest}\\right)`
      ans += (ans.length > 0) ? `\\cdot ${latest}` : latest
      latest = next.str
      latestNode = next.node
    }
  }
  ans += (ans.length > 0) ? `\\cdot ${latest}` : latest
  if (subtract) ans = '-' + ans
  return ans
}

///////////////////////////////////////////////////////////////////////////
// Chains
//
// A chain with no newline-adjacent operator renders inline; a multi-step
// chain with one renders as an align* environment with one step per row.
// 'by' reasons and expository // comments attach to their step: inline as
// \text{ by ...} / \textcolor..., in align mode after the && separator.

// the chain operators' renderings, derived from the chain families' leaf
// tex (headJoinTex); '=' is the neutral member of every
// family and has no file row, so its rendering is the printer's
const chainOpTex = { '=' : '=', ...Object.fromEntries(
  chainFamilies.flatMap( fam => fam.ops.map( op =>
    [ op.head, headJoinTex[op.head] ] ) )
  .filter( ([ , t ]) => t !== undefined ) ) }

// a cong_(m) step renders its modulus under the ≡, exactly as the
// paramop case below renders the English congruence surfaces
const chainTexOp = (o, T) => typeof o === 'string' ? chainOpTex[o] :
  `\\underset{${o.params.map(T).join(',')}}{\\equiv}`

const texChain = (node, T) => {
  const steps = node.steps
  const first = T(node.first)
  const byTex = by => `\\text{ by ${typeof by === 'string' ? by : T(by)}}`
  const commentTex = c => `\\textcolor{black}{\\text{ ${c}}}`
  // single-step chains are always inline, with reason/comment attached.
  // A standalone step typed with an English-echo synonym (srcEchoTex -
  // the divides rule) echoes as the
  // English it is; typed 'a | b' it renders \mid, and inside any
  // multi-step chain every step renders \mid regardless of the typed
  // synonym (the align*/inline chain layouts are operator columns, not
  // sentences).
  if (steps.length === 1) {
    const s = steps[0]
    const opTex = srcEchoTex[s.fmt?.src] ?? chainTexOp(s.op, T)
    return first + opTex + T(s.rhs) +
      ( s.by !== null ? byTex(s.by) : '' ) +
      ( s.comment !== null ? commentTex(s.comment) : '' )
  }
  // multi-step, no newlines: inline chain; trailing reasons and comments
  // are space-separated after the whole chain
  if (!steps.some( s => s.nl )) {
    let ans = first + steps.map( s => chainTexOp(s.op, T) + T(s.rhs) ).join('')
    steps.forEach( s => {
      if (s.by !== null) ans += ` ${texsymbol('by')} ${leafTex(s.by)}`
      if (s.comment !== null) ans += ` ${commentTex(s.comment)}`
    } )
    return ans
  }
  // align* layout: one step per row
  const rows = steps.map( s =>
    chainTexOp(s.op, T) + T(s.rhs) +
    ( s.by !== null ? '&&' + byTex(s.by) : '' ) +
    ( s.comment !== null ?
      ( s.by !== null ? '' : '&&' ) + commentTex(s.comment) : '' ) )
  return `\\begin{align*}\n  ${first} &${rows[0]}` +
    rows.slice(1).map( r => ` \\\\\n    &${r}` ).join('') +
    '\n\\end{align*}'
}

///////////////////////////////////////////////////////////////////////////
// The printer

const quantTex = { '∀' : '\\forall ', '∃' : '\\exists ', '∃!' : '\\exists! ' }

// (Plain infix joins come from the derived headJoinTex /
// englishInfixJoin fallback in the op case below, and the per-joint
// and/or synonym renderings from the derived srcJointTex - all compiled
// from the notation file's tex: fields, so new rows render with no edit
// here.)

// the declared name of a constant: reserved words stay raw (sequence()
// applies texsymbol to them), symbols and numbers render as leaves
const declName = n =>
  isTexReserved(n) ? n : leafTex(n)

// signed sums: fmt.signs records the surface sign of each term after the
// first; a '-' term is encoded as (- b) and renders -b, while a '+' term
// renders +term even if the term itself is a negation (a+-b)
const texSum = (node, T) => {
  const args = node.args
  const signs = node.fmt?.signs || args.slice(1).map( () => '+' )
  let ans = T(args[0])
  args.slice(1).forEach( (a, i) => {
    if ( signs[i] === '-' && a.type === 'op' && a.op === '-' )
      ans += '-' + T(a.args[0])
    else ans += '+' + T(a)
  } )
  return ans
}

// function application: the heads with special
// renderings (multinomial, floor, ceiling, sqrt, inv, dot, abs, index)
const texApp = (node, T) => {
  // a delimited-form head applied to exactly its arity renders the
  // declared template, so the call synonym prints like the delimited
  // surface: index(G,H) and [G:H] are the same \left[G\mathbin{:}H\right]
  if ( typeof node.head === 'string' &&
       delimitedTexTemplates[node.head] !== undefined &&
       node.args.length === delimitedTexTemplates[node.head].arity )
    return texDelimTemplate( delimitedTexTemplates[node.head], node.args, T )
  const args = node.args.map(T)
  const seq = args.join(',')
  if (typeof node.head === 'string') {
    const h = node.head.toLowerCase()
    if (h === 'multinomial' && args.length === 2)
      return `\\left(${args[0]},${args[1]}\\right)`
    if (h === 'floor' && args.length === 1)
      return `\\left\\lfloor ${args[0]}\\right\\rfloor`
    if (h === 'ceiling' && args.length === 1)
      return `\\left\\lceil ${args[0]}\\right\\rceil`
    if (h === 'sqrt') return `\\sqrt{${seq}}`
    if (h === 'inv' && args.length === 1) return `${args[0]}^{-1}`
    if (h === 'dot' && args.length >= 2) return args.join('\\cdot ')
    if (node.head === 'abs') return `\\left| ${seq} \\right|`
    if (node.head === 'AlgebraRule' && args.length === 1 &&
        node.args[0] === 'NoMatrixOps')
      return '\\text{algebra rule (with no matrix operations)}'
  }
  return T(node.head) +
    ( node.fmt?.sub ? `_{${seq}}` : `\\left(${seq}\\right)` )
}

// is this application one of the special forms NOT treated as
// self-delimiting inside user parentheses? ((floor(x)) keeps its
// parentheses - snapshot-locked)
const wrappedApp = node =>
  typeof node.head === 'string' && node.args.length === 1 &&
  ['floor', 'ceiling'].includes(node.head.toLowerCase())

// user parentheses: reproduce which constructs render bare inside them
const texParen = (node, T) => {
  const inner = node.expr
  const R = T(inner)
  if (typeof inner === 'object') {
    // summations in parentheses keep them
    if ( (inner.type === 'bigop' && inner.op === 'sum') ||
         (inner.type === 'bigover' && inner.op === 'sumOver') )
      return `\\left(${R}\\right)`
    // self-delimiting constructs drop them
    if (inner.type === 'app' && !wrappedApp(inner)) return R
    if (inner.type === 'efa' || inner.type === 'class') return R
    if (inner.type === 'bigop') return R              // integrals, product
    if (inner.type === 'op' &&
        (inner.op === 'choose' ||
         delimitedTexTemplates[inner.op] !== undefined)) return R
    if ( (inner.type === 'set' || inner.type === 'setbuilder' ||
          inner.type === 'paren') && inner.fmt?.call ) return R
    if (inner.type === 'tuple' && inner.fmt?.style === 'call') return R
  }
  // the mention-an-operator special case: ('~') renders bare
  if (R === '\\sim') return R
  return `\\left(${R}\\right)`
}

/**
 * Render a Lurch notation AST (as built by the lurch-to-putdown grammar)
 * as LaTeX.  Leaves are strings and render via the texsymbol table.
 *
 * @param {object|string} node - an AST node or string leaf
 * @returns {string} the LaTeX rendering of the node
 */
export const astToTex = node => {
  if ( typeof node === 'string' ) return leafTex(node)
  const T = astToTex
  const seqTex = seq => {
    const parts = []
    seq.items.forEach( item => {
      const r = T(item)
      // a for-some declaration attaches to the expression before it
      // ('P for some c' renders as a single phrase)
      if ( typeof item === 'object' && item.type === 'forsome' &&
           parts.length ) parts[parts.length-1] += r
      else parts.push(r)
    } )
    return parts.join(' ')
  }
  switch ( node.type ) {

    // document structure
    case 'seq'       : return seqTex(node)
    case 'env'       : return `\\left\\{ ${seqTex(node.body)} \\right\\}`
    case 'raw'       : return node.text.replaceAll('｛','{').replaceAll('｝','}')
    case 'comment'   : return `\\text{${node.str.slice(1, -1)}}`
    case 'linecomment' : return `\\textcolor{black}{\\text{ ${node.text}}}`
    case 'label'     : return `\\text{\\textcolor{grey}{${node.text}}}`
    case 'ref'       : return `\\text{\\textcolor{grey}{ ${node.fmt.kw} ${node.label}}}`
    case 'shorthand' : switch ( node.text ) {
      case '≡'      : return '~\\equiv~'
      case 'cases>' : return txt('Cases')
      case 'subs>'  : return txt('Substitution')
      case '<comma' : return txt(',')
      case 'by'     : return leafTex(node.fmt.src)
      default       : return txt(node.fmt.src)
    }
    case 'given'     : return node.exprs.length
      ? `${txt(node.label)} ${sequence(node.exprs.map(T))}`
      : txt(node.label)

    // declarations
    case 'declare'   : return `${txt(node.fmt.kw)} ${sequence(node.names.map(declName))}`
    case 'forsome'   : return '\\text{ for some }' + ( node.set
      ? `${node.names.map(leafTex).join(',')}\\in ${T(node.set)}`
      : sequence(node.names.map(leafTex)) )
    case 'let'       : {
      const kw = txt(node.fmt.kw)
      const decl = node.set
        ? `${kw}${sequence(node.names.map(leafTex), true)}\\in ${T(node.set)}`
        : `${kw}${sequence(node.names.map(leafTex))}`
      if ( node.be )
        return `${decl}\\text{ ${node.fmt.be ? 'be such that' : 'such that'} }`
      return decl
    }

    // quantifiers and bindings
    case 'quant'     : return node.bind
      ? `${quantTex[node.q]}${T(node.bind)}`
      : `${quantTex[node.q]}${leafTex(node.v)} \\in ${T(node.set)}.\\, ${T(node.body)}`
    case 'bind'      : return node.fmt?.mapsto
      ? `${leafTex(node.v)}\\mapsto ${T(node.body)}`
      : `${leafTex(node.v)}.\\, ${T(node.body)}`

    // operators
    case 'op'        : {
      const o = node.op, a = node.args
      // the `is a ⟨noun⟩ ⟨prep⟩` registry phrases render the
      // typed phrase, before the operator lookup so a symbolic head (⊆, ⊑)
      // stays the English sentence the user wrote (a negated phrase puts
      // the fmt on its ¬ wrapper, handled in the ¬ case below)
      if ( node.fmt?.phrase && o !== '¬' )
        return `${T(a[0])}\\text{ ${node.fmt.phrase} }${T(a[1])}`
      // per-surface tex echo for English-echo infix
      // rows: each joint renders the synonym the user
      // typed there - or/and echo as English text, vee/wedge (and the
      // glyphs ∨/∧, which reach the parser as those words) render
      // \vee/\wedge.  Nodes built by desugars carry no fmt.srcs and fall
      // through to the englishInfixJoin fallback in the default below.
      if ( node.fmt?.srcs && o in englishInfixJoin )
        return a.map(T).reduce( (acc, s, i) =>
          acc + ( srcJointTex[node.fmt.srcs[i-1]] ?? englishInfixJoin[o] ) + s )
      // English-echo relations (rows with no tex: - the is family and
      // the verbs): the typed synonym, or the head itself, as text
      if ( englishRelationHeads.has(o) && a.length === 2 )
        return `${T(a[0])}\\text{ ${node.fmt?.src || o} }${T(a[1])}`
      switch ( o ) {
        case '¬' : {
          const src = node.fmt?.src
          // the negated registry phrases ('A is not a subset of B')
          if ( node.fmt?.phrase )
            return `${T(a[0].args[0])}\\text{ ${node.fmt.phrase} }${T(a[0].args[1])}`
          // desugared operators render as the notation the user typed:
          // a ¬-wrapped row with tex: renders its fixed marker
          // symbolically (neq → \neq, notin → \notin; derived)
          if ( src in negFixedTex )
            return `${T(a[0].args[0])}${negFixedTex[src]}${T(a[0].args[1])}`
          if ( src && src !== 'not' && src !== 'neg' )   // is not a, are not, ...
            return `${T(a[0].args[0])}\\text{ ${src} }${T(a[0].args[1])}`
          if ( src === 'not' ) return `\\text{not } ${T(a[0])}`
          return `\\neg ${T(a[0])}`
        }
        // (is/loves/fears render via the englishRelationHeads branch
        // above; ∈ | ⊢ sim and every other leaf-tex head via the
        // headJoinTex fallback below; ≅ occurs only as the
        // parameterized operator - see the paramop case; partition and
        // relation render via the fmt.phrase branch)
        case 'maps'      : return `${T(a[0])}\\colon ${T(a[1])}\\to ${T(a[2])}`
        case 'choose'    : return `\\binom{${nopar(T(a[0]))}}{${nopar(T(a[1]))}}`
        case '+'         : return texSum(node, T)
        case '⋅'         : return texProduct(a, T)
        case '/'         : return texInverse(T(a[0]))
        case '-'         : return '-' + T(a[0])
        // the postfix layer parenthesizes a right-open operand (see
        // texRightOpen); the {} groups alone are visually invisible
        case '!'         : return texDelimited(a[0], T, 'postfix') + '!'
        case '°'         : return `{${texDelimited(a[0], T, 'postfix')}}'`
        case '^'         : return `{${texDelimited(a[0], T, 'postfix')
                                  }}^{${nopar(T(a[1]))}}`
        case '★'         : return texJoin('\\star ', a.map(T))
        case '⊕'         : return texJoin('\\oplus ', a.map(T))
        case '⊗'         : return texJoin('\\otimes ', a.map(T))
        case '⊙'         : return texJoin('\\odot ', a.map(T))
        // Any head declared in lurch-notation.txt with a
        // hole-free tex: rendering joins its arguments with it, and an
        // English-echo infix head (or/and via desugar-built nodes, with
        // no fmt.srcs) joins as its text - so a NEW file row renders
        // with zero printer edits (the live-fire extension path); the
        // structural cases above (+ ⋅ / and the star family's preserved
        // texJoin spacing) never reach this fallback.  Delimited-form
        // heads ([G:H], ⌊x⌋) render their declared template the same
        // way, checked first because the lookup is arity-exact.
        default :
          if ( delimitedTexTemplates[o] !== undefined &&
               a.length === delimitedTexTemplates[o].arity )
            return texDelimTemplate( delimitedTexTemplates[o], a, T )
          if ( o in headJoinTex )
            return a.map(T).join(headJoinTex[o])
          if ( o in englishInfixJoin )
            return a.map(T).join(englishInfixJoin[o])
          throw new Error(`astToTex: unknown operator '${o}'`)
      }
    }
    // parameterized operators: congruence renders its modulus
    // under the ≡ (the classroom-friendly a\underset{m}{\equiv}b); the
    // others subscript their parameters on the operator glyph
    // (a\sim_{u}b)
    case 'paramop'   : {
      const ps = node.params.map(T).join(',')
      if ( node.op === '≅' )
        return `${T(node.args[0])}\\underset{${ps}}{\\equiv}${T(node.args[1])}`
      const base = { '~': '\\sim', '≈': '\\approx',
                     'rel': '\\backsim', '=': '=',
                     '★': '\\star', '⊕': '\\oplus',
                     '⊗': '\\otimes', '⊙': '\\odot' }[node.op] ?? node.op
      return `${T(node.args[0])}${base}_{${ps}}${T(node.args[1])}`
    }
    case 'chain'     : return texChain(node, T)

    // big operators
    case 'bigop'     : {
      const k = leafTex(node.k), f = T(node.f)
      const lo = node.lo === null ? null : T(node.lo)
      const hi = node.hi === null ? null : T(node.hi)
      if ( bigOpDHeads.has(node.op) ) return integral(f, k, lo, hi)
      return bigLimits(node.op, f, k, lo, hi)
    }
    case 'bigover'   : {
      const k = leafTex(node.k), f = T(node.f), S = T(node.domain)
      return bigOver(node.op, f, k, S)
    }

    // application forms
    case 'app'       : return texApp(node, T)
    case 'efa'       : return `\\mathcal{${node.name}}\\left(${
      node.args.map(T).join(',')}\\right)`

    // aggregates
    case 'setbuilder': {
      const v = node.dom ? `${leafTex(node.v)}\\in ${T(node.dom)}`
                         : leafTex(node.v)
      const preds = node.pred !== undefined ? T(node.pred)
                  : node.preds.map(T).join(',\\,')
      return `\\left\\{\\,${v}:\\,${preds}\\right\\}`
    }
    case 'set'       : return `\\left\\{\\,${node.elts.map(T).join(',')}\\,\\right\\}`
    case 'class'     : {
      const elts = node.elts.map(T)
      if ( elts.length === 1 ) return `\\left[${elts[0]}\\right]`
      if ( elts.length === 2 ) return `\\left[${elts[0]}\\right]_{${elts[1]}}`
      return `\\text{class}\\left(${elts.join(',')}\\right)`
    }
    // sequents: comma-joined sides around the turnstile, which renders
    // \vdash (with the formal-system subscript when present) for every
    // positive surface; the English negative echoes as text, like the
    // other `does not ⟨verb⟩` surfaces.  The parenthesized form
    // reproduces its parentheses
    case 'sequent'   : {
      const t = node.neg ? `\\text{ does not prove }`
              : `\\vdash${ node.param ? `_{${T(node.param)}}` : '' } `
      const lhs = node.lhs.map(T).join(', ')
      const rhs = node.rhs.map(T).join(', ')
      const seq = `${lhs}${t}${rhs}`
      return node.fmt?.paren ? `\\left(${seq}\\right)` : seq
    }

    case 'tuple'     : {
      const fmt = node.fmt || {}
      // a bracket tuple whose entries are all untick'd bracket tuples is a
      // matrix, displayed 2-D (and transposed by a trailing tick)
      if ( fmt.style === 'bracket' &&
           node.elts.every( e => typeof e === 'object' && e.type === 'tuple' &&
             e.fmt?.style === 'bracket' && !e.fmt?.tick ) ) {
        const rows = node.elts.map( e => e.elts.map(T) )
        if ( !isRectangular(rows) )
          throw new Error('Matrix rows must all have the same length')
        return matrix(rows, fmt.tick ? "'" : '')
      }
      return tuple(node.elts.map(T),
                   fmt.style === 'bracket' && fmt.tick ? "'" : '')
    }

    // formatting-only wrappers
    case 'paren'     : return texParen(node, T)

    default : throw new Error(`astToTex: unknown AST node type '${node.type}'`)
  }
}
