///////////////////////////////////////////////////////////////////////////
// AST → canonical Lurch notation printer
//
// Render a parsed
// AST back into Lurch notation, choosing ONE canonical synonym for each
// semantic form.  This is the `print` of the round-trip property test
// (parse ∘ print = identity on fmt-stripped ASTs, see
// table-property-tests.js), and the seed of future canonical-form
// affordances (docs, "show me the standard way to type this").
//
// Canonical-form policy (provisional, adopted for the round-trip tests;
// revisit for user-facing use): a row's canonical synonym is its FIRST
// listed alias, except where the small override table below prefers the
// docs page's first synonym (subset over subseteq, * over ⋅, the word
// forms of the star family).  Big operators render as their Algebrite
// call forms (the canonical CAS-compatible
// surface), except the over-a-set summation, whose only surface is the
// English `sum k in S of f`.  English phrase rows whose head has a
// symbolic infix row (is a subset of / ⊆) canonicalize to the infix form;
// heads with only a phrase surface (partition, relation) keep the phrase.
//
// The printer is deliberately conservative about grouping: every compound
// operand is parenthesized, so the output never depends on precedence
// subtleties and always reparses, at the cost of more parentheses than a
// human would type.  fmt annotations are ignored (the canonical form is
// printed regardless of what the user originally typed), so
// parse(print(ast)) reproduces ast only up to fmt and parentheses - the
// round-trip test compares fmt-stripped, paren-stripped trees.
//
// Leaves that name operators (canonical heads reached via the
// mention rule or the bare-mention holes) print in the parenthesized
// mention form `(op)`, which is valid in every operand context; ordinary
// symbols, numbers, and "string literals" print as themselves; renamed
// constants (ℕ/σ/∞/→←) print as their first typable source literal.

import { relationRows, propRows, setAlgRows, paramOpRows, delimitedRows,
         putdownLeadingSymbolRenames } from './notation-tables.js'
import { wordClassClaims } from './expression-core.js'
import { operatorGlyphs } from './notation-tables.js'

// delimited-form rows by head, for printing a head's declared surface
const delimitedRowByHead = Object.fromEntries(
  delimitedRows.map( row => [ row.head, row ] ) )

///////////////////////////////////////////////////////////////////////////
// Canonical token tables, derived from the notation tables at load time

// canonical-synonym overrides (the docs page's first synonym where it
// differs from the row's first alias).  ('⊆' has no entry: the symbolic
// ⊆ surface is a chain
// step, so a (⊆ A B) OP node - which only the 'is a subset of'
// phrase row produces - must canonicalize to that phrase to
// reparse as an op node, exactly like the | divisor phrase.)
const canonOverride = {
  '⋅': '*', '★': 'star', '⊕': 'oplus', '⊗': 'otimes',
  '⊙': 'odot', 'is': 'is'
}

// head → canonical infix token, from the infix-capable rows: first the
// symbolic/word rows, then the English phrase rows for heads that have no
// other surface (partition, relation).  wrapNeg rows never print (their
// ASTs are ¬-wrapped compounds), paramize rows print via paramop nodes,
// tail rows are the mixfix patterns handled per-head below.
const infixCanon = new Map()
const rowToken = row => row.aliases[0].words.map( w => w.w ).join(' ')
const addInfix = row => {
  if ( row.wrapNeg || row.paramize || row.tail ) return
  if ( !infixCanon.has(row.head) )
    infixCanon.set(row.head, canonOverride[row.head] ?? rowToken(row))
}
;[ ...relationRows, ...propRows, ...setAlgRows ]
  .filter( row => row.fmtKey !== 'phrase' ).forEach(addInfix)
;[ ...relationRows ].filter( row => row.fmtKey === 'phrase' )
  .forEach(addInfix)

// head → canonical parameterized-operator token: the relation-level rows
// (a ~_(u) b) plus the parameterized star-family
// rows (a oplus_(n) b), whose canonical synonym follows the
// same override table as their plain infix uses
const paramCanon = new Map( [
  ...paramOpRows.map( row => [ row.head, rowToken(row) ] ),
  ...setAlgRows.filter( row => row.params === true ).map( row =>
    [ row.head, canonOverride[row.head] ?? rowToken(row) ] )
] )

// head → mention word for operator leaves: the first classified word
// claiming the head, else the glyph itself
const mentionCanon = new Map()
wordClassClaims.forEach( c => {
  if ( c.kind === 'op' && c.head !== null && !mentionCanon.has(c.head) )
    mentionCanon.set(c.head, c.word)
} )
operatorGlyphs.forEach( ({ g, head }) => {
  if ( !mentionCanon.has(head) ) mentionCanon.set(head, g)
} )

// renamed-constant leaves (ℕ σ ∞ →← ...) → their first source literal
// (the identity entries come first in the table, so directly typable
// glyphs stay themselves)
const renameSrc = new Map()
putdownLeadingSymbolRenames.forEach( ({ lit, out }) => {
  if ( !renameSrc.has(out) ) renameSrc.set(out, lit)
} )

// chain-step operators and quantifiers; a compound chain-step operator
// (the cong_(m) congruence step) prints with its parameters
// resubscripted.  chainTok holds only the ops that ALSO print 2-arg op
// nodes in the op case below (= ≤ <); the chain-only step tokens
// (the ≅ | ⊆ families) live in chainStepTok
// so that a (⊆ A B) op node - the phrase rows' output - keeps its
// phrase canonicalization instead of a chain-shaped reprint
const chainTok = { '=': '=', '≤': 'leq', '<': '<' }
const chainStepTok = { ...chainTok, '≅': 'cong', '|': '|', '⊆': 'subset' }
const chainOpLurch = o => typeof o === 'string'
  ? chainStepTok[o] ?? null
  : `cong_(${callArgs(o.params)})`
const quantWord = { '∀': 'forall', '∃': 'exists', '∃!': 'exists unique' }

// LDE shorthand tokens → canonical source text
const shorthandSrc = {
  '≡': 'equiv', '>>': 'since', 'rules>': 'rules:', 'rule>': 'rule:',
  'thm>': 'thm:', 'proof>': 'proof:', 'cases>': 'CasesRule:',
  'subs>': 'SubsRule:', '<comma': ',', 'by': 'by'
}

///////////////////////////////////////////////////////////////////////////
// The printer

// a string leaf, in expression position
const leaf = s => {
  if ( s.startsWith('"') || /^\d/.test(s) ) return s
  if ( mentionCanon.has(s) ) return `(${mentionCanon.get(s)})`
  return renameSrc.get(s) ?? s
}

const err = node => {
  throw new Error(`astToLurch: cannot print AST node ` +
    `${ typeof node === 'object' ? `type '${node.type}'` : `'${node}'` }` +
    ( node?.op !== undefined ? ` op '${node.op}'` : '' ))
}

// which node types are self-delimiting (safe as an operand without added
// parentheses); everything else - including big-operator call forms - is
// conservatively wrapped by operand() below.
const closed = new Set([ 'app', 'efa', 'set', 'setbuilder', 'class',
                         'tuple', 'paren', 'sequent' ])

const operand = node => {
  if ( typeof node === 'string' ) return leaf(node)
  return closed.has(node.type) ? P(node) : `(${P(node)})`
}

// the argument list of a call form ( f(x), set(...), sum(...): full
// expressions are fine, commas cannot occur at an expression's top level )
const callArgs = args => args.map(P).join(',')

// one summand of an n-ary + : a unary minus prints as a signed term
const summand = a =>
  ( a?.type === 'op' && a.op === '-' && a.args.length === 1 )
    ? `-${operand(a.args[0])}` : operand(a)

// the by-reason of a chain step (a Symbol; ref nodes print via P)
const byReason = by => typeof by === 'string' ? by : P(by)

// join two consecutive sequence items: most go on their own lines, but a
// be-such-that Let and the LDE comma/by shorthands glue to their
// neighbors, and a for-some rider follows its statement on the same line
const seqJoiner = (a, b) =>
  ( a.type === 'let' && a.be ) || ( a.type === 'shorthand' &&
    ( a.text === '<comma' || a.text === 'by' || a.text === '>>' ) ) ||
  b.type === 'forsome' ||
  ( b.type === 'shorthand' && b.text === '<comma' ) ? ' ' : '\n'

const P = node => {
  if ( typeof node === 'string' ) return leaf(node)
  switch ( node.type ) {

    // document structure (line comments are kept: they are boundaries -
    // adjacent expressions do not merge across a full-line comment - so
    // dropping them would change the sequence structure on reparse)
    case 'seq' : {
      const items = node.items
      return items.map( (item, k) =>
        ( k > 0 ? seqJoiner(items[k - 1], item) : '' ) + P(item) ).join('')
    }
    case 'env'         : return `{ ${P(node.body)} }`
    case 'raw'         : return `«${node.text}»`
    case 'comment'     : return `% ${node.str}`
    case 'linecomment' : return `// ${node.text}`
    // label/ref delimiters accept any of ( [ { " but the content may not
    // contain a closer, so the parenthesized UNquoted form is canonical
    case 'label'       : return `label(${node.text})`
    case 'ref'         : return `by(${node.label})`
    case 'shorthand'   : return shorthandSrc[node.text] ?? err(node)

    // declarations and givens
    case 'given'   : return 'Assume' + ( node.exprs.length
                       ? ' ' + node.exprs.map(P).join(', ') : '' )
    case 'declare' : return `Declare ${node.names.join(', ')}`
    case 'forsome' : return `for some ${node.names.join(', ')}` +
                       ( node.set ? ` in ${operand(node.set)}` : '' )
    case 'let'     : return `Let ${node.names.join(', ')}` +
                       ( node.set ? ` in ${operand(node.set)}` : '' ) +
                       ( node.be ? ' be such that' : '' )

    // quantifiers and bindings
    case 'quant' : return node.bind
      ? `${quantWord[node.q]} ${P(node.bind)}`
      : `${quantWord[node.q]} ${node.v} in ${operand(node.set)}. ` +
        P(node.body)
    case 'bind'  : return `${node.v}. ${P(node.body)}`

    // operator applications
    case 'op' : {
      const { op, args } = node
      if ( op === '¬' && args.length === 1 )
        return `not ${operand(args[0])}`
      if ( ( op === '-' || op === '/' ) && args.length === 1 )
        return `${op}${operand(args[0])}`
      if ( op === '^' )
        return `${operand(args[0])}^${ args[1] === '-' || args[1] === '+'
                                       ? args[1] : operand(args[1]) }`
      if ( op === '!' ) return `${operand(args[0])}!`
      if ( op === '°' ) return `${operand(args[0])} complement`
      if ( op === 'maps' )
        return `${operand(args[0])} : ${operand(args[1])} to ` +
               operand(args[2])
      // delimited-form heads print their declared surface, holes back
      // in pattern order - [G : H] for the group index, ⌊x⌋ for floor
      // (the call synonym index(G,H) parses as a plain application, so
      // the delimited form is the op node's one surface)
      const drow = delimitedRowByHead[op]
      if ( drow !== undefined && args.length === drow.holes.length ) {
        const hole = k => operand(
          args[ drow.argOrder ? drow.argOrder.indexOf(k) : k ] )
        let out = drow.delims[0] + hole(0)
        for ( let k = 1; k < drow.holes.length; k++ )
          out += ` ${drow.delims[k]} ` + hole(k)
        return out + drow.delims[drow.holes.length]
      }
      if ( op === '+' )
        return args.map(summand).join(' + ')
      if ( chainTok[op] !== undefined && args.length === 2 )
        return `${operand(args[0])} ${chainTok[op]} ${operand(args[1])}`
      if ( infixCanon.has(op) )
        return args.map(operand).join(` ${infixCanon.get(op)} `)
      return err(node)
    }
    case 'paramop' : {
      // congruence has no ParamRel surface
      // (cong_(m) is a chain step), so a ≅ paramop node - which can
      // only come from the English relation rows, all single-modulus -
      // canonicalizes to its English surface and reparses to itself
      if ( node.op === '≅' && node.params.length === 1 )
        return `${operand(node.args[0])} cong ${operand(node.args[1])}` +
               ` mod ${operand(node.params[0])}`
      if ( !paramCanon.has(node.op) ) err(node)
      return `${operand(node.args[0])} ${paramCanon.get(node.op)}` +
             `_(${callArgs(node.params)}) ${operand(node.args[1])}`
    }
    case 'chain' : return operand(node.first) + node.steps.map( s =>
      ` ${chainOpLurch(s.op) ?? err(node)} ${operand(s.rhs)}` +
      ( s.by !== null && s.by !== undefined
        ? ` by ${byReason(s.by)}` : '' ) ).join('')

    // big operators: the Algebrite call forms, except the over-a-set
    // summation, whose only surface is the English form
    case 'bigop' : {
      const { op, k, f, lo, hi } = node
      if ( hi === null ) return `${op}(${callArgs([ f, k ])})`
      return `${op}(${callArgs([ f, k, lo ?? '0', hi ])})`
    }
    case 'bigover' : return node.op === 'sumOver'
      ? `sum ${node.k} in ${operand(node.domain)} of ${operand(node.f)}`
      : `${node.op}(${callArgs([ node.f, node.k, node.domain ])})`

    // application forms (curried applications flatten to f(x)(y))
    case 'app' : {
      const groups = []
      let base = node
      while ( base.type === 'app' ) {
        groups.unshift(base.args)
        base = base.head
      }
      const head = typeof base === 'string' ? leaf(base) : P(base)
      return head + groups.map( g => `(${callArgs(g)})` ).join('')
    }
    case 'efa' : return `@${node.name}(${callArgs(node.args)})`

    // sequents always print the parenthesized general form, which is
    // self-delimiting and reparses to the same putdown whatever the
    // original surface was (bare binary, prefix, or comma-separated);
    // the sides are InnerExpressions, so printing them unwrapped is safe
    case 'sequent' : {
      const t = node.neg ? 'does not prove'
              : `⊢${ node.param ? `_(${P(node.param)})` : '' }`
      const lhs = node.lhs.map(P).join(', ')
      return `(${lhs}${ lhs ? ' ' : '' }${t} ${node.rhs.map(P).join(', ')})`
    }

    // aggregates
    case 'setbuilder' : {
      const v = node.dom ? `${node.v} in ${P(node.dom)}` : node.v
      const preds = node.pred !== undefined ? P(node.pred)
                  : node.preds.map(P).join(', ')
      return `set(${v} : ${preds})`
    }
    case 'set'        : return `set(${callArgs(node.elts)})`
    case 'class'      : return `class(${callArgs(node.elts)})`
    case 'tuple'      : return `tuple(${callArgs(node.elts)})`

    // formatting wrappers
    case 'paren' : return `(${P(node.expr)})`

    default : return err(node)
  }
}

/**
 * Render a Lurch notation AST (as built by the unified parser with
 * `options.ast`) back into canonical Lurch notation.  One synonym is
 * chosen per semantic form (see the policy in the module header), every
 * compound operand is parenthesized, and fmt annotations are ignored, so
 * the output reparses to the same tree up to fmt annotations and
 * parenthesization - the round-trip property guaranteed by
 * table-property-tests.js.
 *
 * @param {object|string} ast - an AST node or string leaf
 * @returns {string} canonical Lurch notation for the tree
 */
export const astToLurch = ast => P(ast)
