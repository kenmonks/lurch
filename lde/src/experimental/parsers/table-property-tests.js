///////////////////////////////////////////////////////////////////////////
// Table-derived property tests for the Lurch notation parser
//
// Where the golden
// snapshots lock in behavior input-by-input, these tests are generated
// FROM the notation tables, so every table row is guarded automatically -
// adding a row adds its tests.  Four properties:
//
//   1. LINT       the load-time table linter (table-linter.js) reports no
//                 findings - here even warnings fail, unlike the load-time
//                 hook, so CI catches cosmetic drift too.
//   2. ALIASES    every alias of a row parses to the same fmt-stripped
//                 AST as the row's canonical alias, with the semantic
//                 structure the row declares (head, ¬-wrapping,
//                 parameterization); rows sharing (head, wrapNeg,
//                 paramize) agree with each other across surfaces, so
//                 `A subset B`, `A ⊆ B`, and `A is a subset of B` are one
//                 relation, and all three congruence surfaces are one
//                 operator.  Mentions: `(w)` and `'w'` resolve every
//                 operator word and glyph to its canonical head.  Big
//                 operators: every leading name allowed for a form, and
//                 the case variants of the case-insensitive names, parse
//                 each form to the same tree.
//   3. ROUND-TRIP parse ∘ print is the identity on fmt-stripped ASTs:
//                 every canonical form, and every composition of one
//                 canonical form inside another's operand holes, reparses
//                 from its canonical rendering (ast-to-lurch.js) to the
//                 same tree.
//   4. CORPUS     the same round-trip holds over the entire golden-test
//                 corpus (the lines/blocks suites and every parseable
//                 documented example), so the canonical printer covers
//                 the real language, not just the generated forms.
//
// Comparison is on NORMALIZED trees (stripAST below): fmt annotations,
// parentheses, comments, and the other deliberately formatting-only
// distinctions are erased from both sides first, since the canonical
// rendering intentionally forgets which synonym was typed.
//
// Run standalone with `node parsers/table-property-tests.js`, or as part
// of the snapshot suite (`node parsers/parsertests.js`, or .parsertest in
// Lode), which invokes runTablePropertyTests after the golden suites.

import { parse } from './lurch-to-putdown.js'
import { astToLurch } from './ast-to-lurch.js'
import { lintNotationTables } from './table-linter.js'
import { relationRows, propRows, setAlgRows, bigOpRows, paramOpRows,
         chainFamilies, delimitedRows, operatorGlyphs }
  from './notation-tables.js'
import { wordClassClaims } from './expression-core.js'
// suites/suiteInputs are only read inside runTablePropertyTests, never at
// module top level, so the import cycle with parsertests.js (which calls
// this module after its golden suites) is harmless in either entry order
import { suites, suiteInputs, parsers } from './parsertests.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Pens from '../pens.js'
const { defaultPen, itemPen, stringPen, xPen, checkPen, greencheck, redx }
  = Pens

///////////////////////////////////////////////////////////////////////////
// AST normalization
//
// Two trees are "the same up to formatting" when stripAST maps them to
// equal JSON: fmt annotations, chain-step comments and newline flags, and
// paren wrappers are erased; line comments are dropped from sequences (and
// a resulting one-item sequence collapses, so a single-expression input
// compares as its expression); the recorded given keyword is erased (the
// putdown printer ignores it too); a one-step chain with no by-reason
// normalizes to the plain relation node it denotes (`a = b` and the
// `(= a b)` inside a parsed `not (a = b)` are the same relation); and a
// missing big-operator lower limit normalizes to its default 0.

export const stripAST = node => {
  if ( node === null || typeof node === 'string' ) return node
  if ( Array.isArray(node) ) return node.map(stripAST)
  if ( node.type === 'paren' ) return stripAST(node.expr)
  const out = {}
  for ( const [ k, v ] of Object.entries(node) )
    if ( k !== 'fmt' && k !== 'nl' && k !== 'comment' ) out[k] = stripAST(v)
  if ( out.type === 'seq' ) {
    out.items = out.items.filter( i => i.type !== 'linecomment' )
    if ( out.items.length === 1 ) return out.items[0]
  }
  if ( out.type === 'given' ) delete out.label
  if ( out.type === 'chain' && out.steps.length === 1 &&
       ( out.steps[0].by ?? null ) === null )
    return { type: 'op', op: out.steps[0].op,
             args: [ out.first, out.steps[0].rhs ] }
  if ( out.type === 'bigop' && out.hi !== null && out.lo === null )
    out.lo = '0'
  return out
}

const normal = (input, opts) =>
  JSON.stringify(stripAST(parse(input, { ...opts, ast: true })))

///////////////////////////////////////////////////////////////////////////
// Input templates derived from the tables

const aliasText = a => a.words.map( w => w.w ).join(' ')

// the input exercising one alias of a relation/prop/setAlg row, with the
// given operand texts in CANONICAL argument order (for a row with an
// argOrder permutation, the operands are placed so that the parsed,
// reordered arguments still come out as ops[0], ops[1], ... - that is
// what made the two ≅ surface orders directly comparable while the
// argOrder'd `_ cong mod _ to _` row existed; no current row uses it)
const rowInput = (row, a, ops = [ 'a', 'b', 'c' ]) => {
  const holes = 2 + ( row.tail?.length ?? 0 )
  const order = row.argOrder ?? [ ...Array(holes).keys() ]
  const surface = order.map( k => ops[k] )
  let text = `${surface[0]} ${aliasText(a)} ${surface[1]}`
  row.tail?.forEach( (part, k) =>
    text += ` ${aliasText(part.kws[0])} ${surface[2 + k]}` )
  return text
}

// big-operator form templates: the input for one leading name of a row in
// one of its forms (operand-unit class fixed by the row, see the grammar)
const bigInput = (row, name, form) => {
  if ( row.unit === 'alg' )                  // indexed-set operators
    return form === 'inOf'  ? `${name} k in S of B` :
           form === 'forIn' ? `${name} of B for k in S` :
                              `${name}(B,k,S)`
  return form === 'call'      ? `${name}(x,k,1,n)` :
         form === 'callIndef' ? `${name}(x,k)` :
         form === 'eq'        ? `${name} k = 1 to n of x` :
         form === 'd'         ? `${name} x dk` :
         form === 'inOf'      ? `${name} k in S of x` :
                                `${name} of x for k in S`
}

// the names of a row allowed in a form, each with its case variants (a
// case-insensitive name also parses capitalized and uppercased)
const bigNames = (row, form) => row.names
  .filter( n => n.only === undefined || n.only.includes(form) )
  .flatMap( n => n.i
    ? [ n.lit, n.lit[0].toUpperCase() + n.lit.slice(1), n.lit.toUpperCase() ]
    : [ n.lit ] )

///////////////////////////////////////////////////////////////////////////
// The test runner

/**
 * Run the table-derived property tests (see the module header).  Prints
 * one summary line per property family, plus details of any failure.
 *
 * @param {string[]} [args] - option flags: '--verbose' prints every
 *   generated input
 * @returns {number} the number of failures (0 means all properties hold)
 */
export const runTablePropertyTests = (args = []) => {
  const verbose = args.includes('--verbose')
  let failures = 0
  const families = []
  const family = label => {
    const f = { label, ok: 0, bad: 0 }
    families.push(f)
    return f
  }
  const fail = (f, msg) => {
    f.bad++
    failures++
    console.log(`${redx} ${xPen(`${f.label}: ${msg}`)}`)
  }
  const check = (f, msg, fn) => {
    if ( verbose ) console.log(defaultPen(`${f.label}: ${msg}`))
    try {
      const problem = fn()
      if ( problem ) fail(f, `${msg}\n    ${problem}`)
      else f.ok++
    } catch ( e ) { fail(f, `${msg}\n    threw: ${e.message}`) }
  }

  /////////////////////////////////////////////////////////////////////////
  // 1. the linter is clean (including warnings, unlike the load-time hook)
  {
    const f = family('lint')
    const { errors, warnings } = lintNotationTables()
    check(f, 'notation tables lint clean', () =>
      errors.length + warnings.length === 0
        ? null
        : [ ...errors, ...warnings ].join('\n    ') )
  }

  /////////////////////////////////////////////////////////////////////////
  // 2a. every alias of every row parses to the same stripped AST
  {
    const f = family('aliases')
    const tables = [ [ 'relationRows', relationRows ],
                     [ 'propRows', propRows ],
                     [ 'setAlgRows', setAlgRows ] ]
    tables.forEach( ([ tname, rows ]) => rows.forEach( row => {
      const canonical = normal(rowInput(row, row.aliases[0]), {})
      row.aliases.slice(1).forEach( a => {
        const input = rowInput(row, a)
        // a row's inverse-pair alias is the one alias kind that is
        // deliberately NOT synonymous: it wraps its operand in the
        // unary inverse (a - b is a + -b, and a / b is a * /b)
        const expect = ( row.inv !== undefined && aliasText(a) === row.inv )
          ? normal(`a ${aliasText(row.aliases[0])} ${row.inv}b`, {})
          : canonical
        check(f, `${tname} '${row.head}': '${input}'`, () => {
          const got = normal(input, {})
          return got === expect ? null :
            `parsed ${got}\n    canonical ${expect}`
        } )
      } )
    } ) )
    // parameterized operators: a op_(u) b → ((op u) a b) for every row
    paramOpRows.forEach( row => row.aliases.forEach( a => {
      const input = `a ${aliasText(a)}_(u) b`
      check(f, `paramOpRows '${row.head}': '${input}'`, () => {
        const got = normal(input, {})
        const expect = JSON.stringify({ type: 'paramop', op: row.head,
                                        params: [ 'u' ], args: [ 'a', 'b' ] })
        return got === expect ? null :
          `parsed ${got}\n    expected ${expect}`
      } )
    } ) )
    // chain operators (the chainFamilies table): every alias
    // of every op parses the single-step form to the same stripped AST as
    // the op's first alias (a one-step chain with no by-reason normalizes
    // to the plain relation node, so this also locks the single-step
    // output of the | and ⊆ rows)
    chainFamilies.forEach( fam => fam.ops.forEach( opRow => {
      const subs = fam.param ? '_(u)' : ''
      const canonical =
        normal(`a ${aliasText(opRow.aliases[0])}${subs} b`, {})
      opRow.aliases.slice(1).forEach( a => {
        const input = `a ${aliasText(a)}${subs} b`
        check(f, `chainFamilies '${opRow.head}': '${input}'`, () => {
          const got = normal(input, {})
          return got === canonical ? null :
            `parsed ${got}\n    canonical ${canonical}`
        } )
      } )
    } ) )
  }

  /////////////////////////////////////////////////////////////////////////
  // 2a½. associativity and climb parameters: every climb
  // row's declared assoc field produces the declared run shape on a
  // three-operand run of its first alias, and the params rows apply the
  // compound operator, continue only on structurally equal parameters,
  // and nest per their assoc
  {
    const f = family('assoc')
    const J = JSON.stringify
    ;[ ...propRows, ...setAlgRows ].forEach( row => {
      const tok = aliasText(row.aliases[0])
      const input = `a ${tok} b ${tok} c`
      const bin = (x, y) => ({ type: 'op', op: row.head, args: [ x, y ] })
      check(f, `assoc '${row.assoc}' of '${row.head}': '${input}'`, () => {
        if ( row.assoc === 'none' ) {
          // the run must not be one application: either the leftover
          // fails the whole parse, or the input splits into several LCs
          let got
          try { got = stripAST(parse(input, { ast: true })) }
          catch { return null }
          return ( got.type === 'seq' && got.items.length > 1 ) ? null :
            `expected an error or a multi-LC split, parsed ${J(got)}`
        }
        const got = normal(input, {})
        const expect = J(
          row.assoc === 'left'  ? bin(bin('a', 'b'), 'c') :
          row.assoc === 'right' ? bin('a', bin('b', 'c')) :
            { type: 'op', op: row.head, args: [ 'a', 'b', 'c' ] } )
        return got === expect ? null :
          `parsed ${got}\n    expected ${expect}`
      } )
    } )
    setAlgRows.filter( row => row.params === true ).forEach( row => {
      const tok = aliasText(row.aliases[0])
      const pbin = (x, y) => ({ type: 'paramop', op: row.head,
                                params: [ 'u' ], args: [ x, y ] })
      check(f, `params of '${row.head}': 'a ${tok}_(u) b'`, () => {
        const got = normal(`a ${tok}_(u) b`, {})
        return got === J(pbin('a', 'b')) ? null : `parsed ${got}`
      } )
      check(f, `params run of '${row.head}' (equal params nest ${row.assoc})`,
        () => {
          const got = normal(`a ${tok}_(u) b ${tok}_( u ) c`, {})
          const expect = J(
            row.assoc === 'right' ? pbin('a', pbin('b', 'c'))
                                  : pbin(pbin('a', 'b'), 'c') )
          return got === expect ? null :
            `parsed ${got}\n    expected ${expect}`
        } )
      check(f, `params mismatch of '${row.head}' ends the run`, () => {
        let got
        try { got = stripAST(parse(`a ${tok}_(u) b ${tok}_(v) c`,
                                   { ast: true })) }
        catch { return null }
        return ( got.type === 'seq' && got.items.length > 1 ) ? null :
          `expected an error or a multi-LC split, parsed ${J(got)}`
      } )
    } )
  }

  /////////////////////////////////////////////////////////////////////////
  // 2b. rows sharing (head, wrapNeg, paramize) are the same semantic form
  // across surfaces (subset/⊆/'is a subset of'; the ≅ surface family)
  {
    const f = family('surfaces')
    const groups = new Map()
    relationRows.forEach( row => {
      const key = `${row.head}|${!!row.wrapNeg}|${!!row.paramize}`
      if ( !groups.has(key) ) groups.set(key, [])
      groups.get(key).push(row)
    } )
    groups.forEach( rows => {
      if ( rows.length < 2 ) return
      const canonical = normal(rowInput(rows[0], rows[0].aliases[0]), {})
      rows.slice(1).forEach( row => {
        const input = rowInput(row, row.aliases[0])
        check(f, `'${row.head}': '${input}'`, () => {
          const got = normal(input, {})
          return got === canonical ? null :
            `parsed ${got}\n    canonical ${canonical}`
        } )
      } )
    } )
    // the chain-table surfaces of ⊆ and | agree with their English
    // phrase rows (the symbolic rows live in chainFamilies,
    // so the head groups above do not pair them automatically)
    ;[ [ 'a subset b', 'a is a subset of b' ],
       [ 'a | b', 'a is a divisor of b' ] ].forEach( ([ x, y ]) =>
      check(f, `'${x}' ≡ '${y}'`, () => {
        const gx = normal(x, {}), gy = normal(y, {})
        return gx === gy ? null : `parsed ${gx}\n    and ${gy}`
      } ) )
  }

  /////////////////////////////////////////////////////////////////////////
  // 2c. the row's declared semantics: head, ¬-wrapping, parameterization
  {
    const f = family('row-spec')
    ;[ ...relationRows, ...propRows, ...setAlgRows ].forEach( row => {
      const input = rowInput(row, row.aliases[0])
      check(f, `'${row.head}': '${input}'`, () => {
        const got = JSON.parse(normal(input, {}))
        const core = row.wrapNeg
          ? ( got.op === '¬' && got.args?.length === 1 ? got.args[0] : null )
          : got
        if ( core === null ) return `expected a ¬ wrapper: ${normal(input, {})}`
        if ( row.paramize )
          return core.type === 'paramop' && core.op === row.head ? null
            : `expected a parameterized '${row.head}': ${JSON.stringify(core)}`
        return core.type === 'op' && core.op === row.head ? null
          : `expected head '${row.head}': ${JSON.stringify(core)}`
      } )
    } )
  }

  /////////////////////////////////////////////////////////////////////////
  // 2d. mentions: (w) and 'w' resolve every operator word and glyph to
  // its canonical head, in both marker forms
  {
    const f = family('mentions')
    const seen = new Set()
    const mention = (w, head) => {
      if ( seen.has(w) ) return
      seen.add(w)
      ;[ `(${w})`, `'${w}'` ].forEach( input =>
        check(f, `${input} mentions '${head}'`, () => {
          const got = normal(input, {})
          const expect = JSON.stringify(head)
          return got === expect ? null : `parsed ${got}, expected ${expect}`
        } ) )
    }
    wordClassClaims.filter( c => c.kind === 'op' && c.head !== null )
      .forEach( c => mention(c.word, c.head) )
    operatorGlyphs.forEach( ({ g, head }) => mention(g, head) )
  }

  /////////////////////////////////////////////////////////////////////////
  // 2e. big operators: every allowed name of every form, and the case
  // variants of the case-insensitive names, parse the form identically
  {
    const f = family('bigops')
    bigOpRows.forEach( row => Object.keys(row.forms).forEach( form => {
      const names = bigNames(row, form)
      const canonical = normal(bigInput(row, names[0], form), {})
      names.slice(1).forEach( name => {
        const input = bigInput(row, name, form)
        check(f, `'${row.head}' ${form}: '${input}'`, () => {
          const got = normal(input, {})
          return got === canonical ? null :
            `parsed ${got}\n    canonical ${canonical}`
        } )
      } )
    } ) )
  }

  /////////////////////////////////////////////////////////////////////////
  // 3. round-trip: parse ∘ print = identity on stripped ASTs, over every
  // canonical form and every composition of one form inside another
  const roundTrip = (f, input, opts = {}) =>
    check(f, `'${input.replaceAll('\n', '\\n')}'`, () => {
      let ast
      try { ast = parse(input, { ...opts, ast: true }) }
      catch { return null }             // unparseable corpus entries skip
      const printed = astToLurch(ast)
      let back
      try { back = parse(printed, { ...opts, ast: true }) }
      catch ( e ) {
        return `canonical rendering '${printed}' does not reparse: ` +
               e.message
      }
      const a = JSON.stringify(stripAST(ast))
      const b = JSON.stringify(stripAST(back))
      return a === b ? null :
        `canonical rendering '${printed}' reparses differently\n` +
        `    parsed    ${a}\n    reparsed  ${b}`
    } )
  /////////////////////////////////////////////////////////////////////////
  // 2e. delimited forms: every row's surface builds its head application
  // (holes reordered by argOrder), the call synonym builds the same
  // putdown, the form is a closed unit (takes an exponent), the tex
  // template renders every hole, and the canonical print round-trips
  {
    const f = family('delimited')
    const samples = [ 'a', 'b', 'c' ]
    delimitedRows.forEach( row => {
      const n = row.holes.length
      const surface = row.delims[0] + samples.slice(0, n)
        .map( (s, k) => s + row.delims[k + 1] ).join('')
      const headArgs = row.argOrder !== undefined
        ? row.argOrder.map( k => samples[k] )
        : samples.slice(0, n)
      const expectPutdown = `(${ [ row.head, ...headArgs ].join(' ') })`
      check(f, `delimitedRows '${row.head}': '${surface}'`, () => {
        const got = parse(surface)
        return got === expectPutdown ? null :
          `parsed ${got}\n    expected ${expectPutdown}`
      } )
      // the call synonym takes its arguments in head order already
      if ( /^[A-Za-z][A-Za-z0-9]*$/.test(row.head) ) {
        const call = `${row.head}(${ samples.slice(0, n).join(',') })`
        const expectCall =
          `(${ [ row.head, ...samples.slice(0, n) ].join(' ') })`
        check(f, `delimitedRows '${row.head}': call '${call}'`, () => {
          const got = parse(call)
          return got === expectCall ? null :
            `parsed ${got}\n    expected ${expectCall}`
        } )
      }
      check(f, `delimitedRows '${row.head}': closed '${surface}^2'`, () => {
        const got = parse(`${surface}^2`)
        const expect = `(^ ${expectPutdown} 2)`
        return got === expect ? null :
          `parsed ${got}\n    expected ${expect}`
      } )
      check(f, `delimitedRows '${row.head}': tex renders '${surface}'`,
        () => {
          const tex = parse(surface, { tex: true })
          const missing = samples.slice(0, n).filter( s => !tex.includes(s) )
          return missing.length === 0 ? null :
            `'${tex}' never renders hole value(s) '${missing.join("', '")}'`
        } )
      check(f, `delimitedRows '${row.head}': round-trip '${surface}'`,
        () => {
          const tree = parse(surface, { ast: true })
          const printed = astToLurch(tree)
          const there = JSON.stringify(stripAST(tree))
          const back = JSON.stringify(
            stripAST(parse(printed, { ast: true })) )
          return there === back ? null :
            `canonical rendering '${printed}' reparses differently`
        } )
    } )
  }

  {
    const f = family('round-trip')
    // canonical flat forms from the tables
    const flats = []
    ;[ ...relationRows, ...propRows, ...setAlgRows ].forEach( row =>
      flats.push(rowInput(row, row.aliases[0])) )
    paramOpRows.forEach( row =>
      flats.push(`a ${aliasText(row.aliases[0])}_(u) b`) )
    bigOpRows.forEach( row => Object.keys(row.forms).forEach( form =>
      flats.push(bigInput(row, row.names[0].lit, form)) ) )
    // grammar-level forms not in the tables
    const seeds = [
      'forall x. P(x)', 'exists x. x=2*x', 'exists unique x. x=2*x',
      'forall x in A. P(x)', 'x. x+2', 'x mapsto x+2',
      'not P', '-x', '/x', 'x^2', 'x^-', 'x!', "A'", 'x_(0)',
      'f(x)', 'f(x)(y)', 'f_(0)(x)_(n+1)', '@P(k)', '@P(x)(y)',
      'set(a,b,c)', 'set(p : p is prime)', 'class(a)', 'class(a,~)',
      'tuple(x,y)', '[x,y,z]', '⟨x,y⟩', '[[1,2],[3,4]]', "[x,y]'",
      'x=y=z', 'x = y = z by algebra', 'a leq b leq c', 'x lt 0',
      'a cong_(m) b', 'a cong_(m) b cong_(m) c', 'x = y cong_(m) z',
      'a cong_(m) b cong_(k) c', 'a cong_(m) b = c by test',
      'a | b | c', 'm | n = p', 'A subset B subset C', 'A = B subset C',
      'a cong b', 'a cong b cong c', 'a = b cong c',
      'm | n by arithmetic', '~ | b', '~ subset A subset B',
      'a neq 0', 'x notin A', 'A is not a subset of B',
      'a does not love b', 'x is not y',
      'a oplus_(n) b', 'x star_(G) y', 'a ⊕_(n) b ⊕_(n) c',
      'x star y star z', 'A setminus B setminus C', 'P implies Q implies R',
      'sum(f,k,1,n) star x', 'x + Union k in A of B',
      'Let x', 'Let x, y in A', 'Let x be such that x in NN',
      'Declare and, or, not', 'Declare is, 0, +, cos', 'Assume P, Q',
      'f(c)=0 for some c', 'f(c)=0 for some c in A',
      '{ :A A }', '«(∈ x A)»', '% "a comment"', 'contradiction', 'NN',
      '1.23[456]', 'infty', 'x in NN implies x+1 in NN'
    ]
    ;[ ...flats, ...seeds ].forEach( input => roundTrip(f, input) )
    // compositions: each canonical form, parenthesized, in the first and
    // last operand holes of each row template and a few grammar contexts
    const inners = [ ...flats,
      'f(x)', 'x^2', '-x', 'forall y. Q(y)', 'tuple(x,y)', '@P(j)' ]
    const outers = []
    ;[ ...relationRows, ...propRows, ...setAlgRows ].forEach( row => {
      const holes = 2 + ( row.tail?.length ?? 0 )
      const ops = [ 'a', 'b', 'c' ]
      outers.push( inner =>
        rowInput(row, row.aliases[0],
                 [ inner, ...ops.slice(1, holes) ]) )
      outers.push( inner =>
        rowInput(row, row.aliases[0],
                 [ ...ops.slice(0, holes - 1), inner ]) )
    } )
    outers.push(
      inner => `not ${inner}`,
      inner => `forall x. ${inner}`,
      inner => `x. ${inner}`,
      inner => `f(${inner})`,
      inner => `tuple(${inner},y)`,
      inner => `set(${inner})`,
      inner => `sum(${inner},k,1,n)`,
      inner => `sum k = 1 to n of ${inner}`,
      inner => `Union(${inner},k,S)`,
      inner => `${inner}^2`,
      inner => `Assume ${inner}`,
      inner => `Let x in ${inner}`
    )
    outers.forEach( outer => inners.forEach( inner =>
      roundTrip(f, outer(`(${inner})`)) ) )
  }

  /////////////////////////////////////////////////////////////////////////
  // 4. the same round-trip over the whole golden corpus
  {
    const f = family('corpus round-trip')
    const here = path.dirname(fileURLToPath(import.meta.url))
    suites.forEach( suite => {
      if ( suite.mode === 'errors' ) return
      if ( suite.mode === 'whole' ) {
        const doc = fs.readFileSync(
          path.join(here, suite.file + '.lurch'), 'utf8')
        roundTrip(f, doc, suite.opts)
        return
      }
      suiteInputs(suite).forEach( input =>
        roundTrip(f, input, suite.opts) )
    } )
  }

  families.forEach( f => {
    const n = f.ok + f.bad
    console.log(`${defaultPen('table properties · ' + f.label + ':')} ` +
                `${f.bad === 0 ? greencheck : redx} ${f.ok}/${n} ok`)
  } )
  return failures
}

// run as a command line tool if invoked directly rather than imported
if ( process.argv[1] &&
     path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ) {
  const failures = runTablePropertyTests(process.argv.slice(2))
  const pen = failures ? xPen : checkPen
  console.log('\n' + pen(`table property tests: ${ failures
    ? failures + ' failure(s)' : 'all passed' }`))
  process.exitCode = failures ? 1 : 0
}
