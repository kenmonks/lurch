///////////////////////////////////////////////////////////////////////////
// Shared notation tables for the Lurch parser and printers
//
// The notation tables are not hand-coded here: the source of truth is
// the notation file lurch-notation.txt, whose text travels in the
// generated wrapper lurch-notation-compiled.js and is compiled through
// notation-loader.js at import time, below.  This module owns
//
//   - the ENGINE facts that are not declarable in the notation file
//     (spec §1 of notation-file-format.md): the precedence anchors, the
//     structural-keyword list, the grammar-level operator words and
//     glyphs, the big-operator form-shape registry, and the invisible
//     structural heads;
//   - the small string helpers the tokenizer builds its passes from; and
//   - the DERIVED tables (chain-family policies, auto-declared constants,
//     the Declare internal-name lookup, the tex right-open registry),
//     which are pure functions of the compiled tables.
//
// Everything that needs a table imports it by name from this module (the
// generated parser, expression-core.js, the tokenizer, the printers, the
// linter, interpret.js, global-validation.js).  The internal row schema
// (alias encoding, relation/chain/infix/bigop row fields) is documented
// in notation-file-format.md §12 and expression-core.js; the load-time
// linter (table-linter.js) enforces it with lurch-notation.txt line
// numbers, so a bad declaration reports its file line.
//
// ORDER MATTERS in every compiled list that feeds matchOrderedLiteral or
// the ranked matchers: array order reproduces PEG ordered choice, and the
// notation file's declaration order IS that order (spec §12).

import { loadNotation, splitDelimitedTex } from './notation-loader.js'
import { notationFileText } from './lurch-notation-compiled.js'

///////////////////////////////////////////////////////////////////////////
// Precedence levels
//
// Named anchors, sparse Coq-style numbers underneath: rows
// name their level and the precedence-climbing pass in expression-core.js
// resolves the names here.  Larger numbers bind tighter.  REL is the
// relation level (the relationRows plus the surviving PEG relation
// rules), between the propositional and the set/algebraic families.  The
// anchor names and their order are engine facts (spec §1); the notation
// file's infix bands zip onto them positionally, loosest first.  Not on
// the ladder (they stay grammar-level operand forms): the prefix
// operators not/neg (between AND and REL), - and / (operands at STAR
// level), the postfix factorial and '/complement, function application,
// and ^ (tightest, Atomic-bounded).

export const precedence = {
  IFF: 100, IMPLIES: 200, OR: 300, AND: 400,            // Prop ladder
  REL: 500,                                             // relations
  SETMINUS: 600, CROSS: 700, CUP: 800, CAP: 900,        // Set ladder
  CIRC: 1000,
  CHOOSE: 1100, SUM: 1200, PROD: 1300, STAR: 1400       // Algebraic ladder
}

///////////////////////////////////////////////////////////////////////////
// Compile the notation file
//
// The wrapper's embedded text is compiled once, at import time (<1ms);
// loader and linter complaints carry lurch-notation.txt line numbers.
// The load-time structural lint runs separately in the parser initializer
// (lintNotationTablesOrThrow in table-linter.js), over these same tables.

const compiled = loadNotation( notationFileText, precedence )
if ( compiled.errors.length )
  throw new Error( `lurch-notation.txt does not compile:\n  ` +
    compiled.errors.join( '\n  ' ) )

// The declarable tables, in the exact row shapes the expression-core
// machinery consumes:
//   phrases                      multi-word → Symbol replacements, applied
//                                in order by the tokenizer
//   UnicodeNames                 input glyph → word rewrites
//   internalNames                Declare name → canonical head
//   texSymbols                   leaf symbol → tex rendering
//   isaNouns                     the `is a ⟨noun⟩ ⟨prep⟩` registry
//   relationRows                 single-step relations (ranked matcher)
//   paramOpRows                  `a op_(p) b` parameterized relations
//   chainFamilies                transitive-chain operator families
//   propRows, setAlgRows         the precedence-climb infix ladders
//   bigOpRows                    the big-operator schema rows
//   delimitedRows                fixed-arity delimited closed forms
//   putdownLeadingSymbolRenames  constant renames (NN → ℕ)
//   operatorHeadTex              operator-head leaves → tex
export const {
  phrases, UnicodeNames, internalNames, texSymbols, isaNouns,
  relationRows, paramOpRows, chainFamilies, propRows, setAlgRows,
  bigOpRows, delimitedRows, putdownLeadingSymbolRenames, operatorHeadTex
} = compiled.tables

// provenance and side-channel data from the compile: notationLineOf maps
// each emitted row object to its lurch-notation.txt line (the linter's
// error channel); notationExtras carries data recorded for the docs page
// and printer derivations (examples, tex templates, tex-open, surfaceTex)
export const notationLineOf = compiled.lineOf
export const notationExtras = compiled.extras

///////////////////////////////////////////////////////////////////////////
// Small string utilities shared by the preprocessing layers

// shrink consecutive spaces to a single space
export const shrink = s => s.replace(/ ( +)/g, ' ')

// replace each phrase in the list, then shrink the result.  A phrase
// only matches at word boundaries: an alphanumeric phrase
// edge may not abut an alphanumeric input character on either side, so
// 'xfor ally' cannot corrupt to 'x forall ly' and 'for allz.T(z)' is
// a parse error rather than a forgiving read of 'forall z.T(z)' (a
// missing space should be flagged, not guessed away).
// Edges that are already non-word - the quotes of the rule-name phrases,
// the ! of 'exists!' - need no guard.
export const replacePhrases = (s, phrases) => {
  phrases.forEach( p => {
    const left  = /^[a-z0-9]/i.test(p[0]) ? '(?<![A-Za-z0-9])' : ''
    const right = /[a-z0-9]$/i.test(p[0]) ? '(?![A-Za-z0-9])'  : ''
    const regex = new RegExp(left + p[0] + right, 'gi')
    s = s.replace(regex, ` ${p[1]} ` )
  } )
  return shrink(s)
}

///////////////////////////////////////////////////////////////////////////
// Unicode replacement
//
// Standard unicode math characters are replaced with their ascii synonyms
// so they are easy to prevent being interpreted as Symbols.  The
// character class is DERIVED from the compiled UnicodeNames table, so a
// notation-file glyph surface extends this pass automatically;
// only the toxic replacements below - whose spacing is context-sensitive
// per glyph, a tokenizer policy the file does not express - are code.
// (⁻ needs no class entry: the toxic pass has already rewritten it by
// the time the class is tried.)

const unicodeCharClass = '[' + Object.keys( UnicodeNames )
  .map( c => c === '\\' ? '\\\\' : c ).join('') + ']'

export const replaceUnicodeChars = s => {
  // first, replace toxic unicode chars with their ascii synonym
  s = s.replace(/𝜎/g  , ' sigma'    ) // usually used as a function so no following space
       .replace(/𝜆/g  , '@'         ) // for "LDE EFA"
       .replace(/≠/g  , ' neq '     )
       .replace(/∉/g  , ' notin '   )
       .replace(/⁻/g  , '^-'        )
       .replace(/𝒫/g  , ' powerset' ) // usually used as a function so no following space
  // now replace the given unicode characters that do not appear in strings or
  // putdown
  const regex = new RegExp(
    `(?<!«[^«»]*)(?<!^[^"]*"[^"]*)${unicodeCharClass}(?![^«»]*»)`, 'mg' )
  return shrink(s.replace(regex, c => { return ` ${UnicodeNames[c]} ` } ) )
}

///////////////////////////////////////////////////////////////////////////
// Ordered-literal matching
//
// matchOrderedLiteral replicates a PEG ordered choice of literal
// alternatives over a data list: it returns the first entry in the list
// whose literal matches at the given position (a prefix match, exactly like
// a peggy literal), or null.  Entries are { lit, out?, i? } where lit is the
// literal, out is an optional replacement value for rename rules, and
// i: true makes the match case insensitive (peggy's 'x'i - such literals
// must be written in lowercase here, as peggy itself compiles them).
//
// The grammars use this in rules of the shape
//
//   Rule = &{ m = matchOrderedLiteral(list, input, offset())
//             return m !== null }
//          @$(.|{ return m.lit.length }|)
//
// which consumes exactly the matched literal.  Nothing can run between the
// predicate and the consumption (there are no rule references in between),
// so a module-level match variable is safe, including with --cache.

export const matchOrderedLiteral = (entries, input, pos) => {
  for (let k = 0; k < entries.length; k++) {
    const e = entries[k]
    if (e.i) {
      if (input.substr(pos, e.lit.length).toLowerCase() === e.lit) return e
    } else if (input.startsWith(e.lit, pos)) return e
  }
  return null
}

///////////////////////////////////////////////////////////////////////////
// Token classification
//
// "Reserved" is a derived property of the tables: the tokenizer-level word
// classifier in expression-core.js (classifyWordAt) buckets every
// alphabetic word as
//
//   structural - marks document/LC structure, never valid as a symbol;
//                the closed list below, and nothing else
//   operator   - a single-word alias of some notation-table row (the
//                relation/prop/setAlg rows, the big-operator leading
//                names, and the grammar-level operator words below); not
//                valid as a symbol, but declarable in a Declare and
//                mentionable as (op) or 'op'
//   neither    - an ordinary Symbol
//
// A word is blocked from Symbol in exactly the case pattern its keyword
// literals accept: i: true entries block case-insensitively (their grammar
// literals are 'w'i), all others block the exact lowercase word only, so
// e.g. 'In' and 'Cdot' remain ordinary symbols (the keyword case
// policy: leading keywords are case-insensitive, interior keywords are
// case-sensitive lowercase, and the keyword space is otherwise left
// unpolluted).

const kw = words => words.map( w =>
  (typeof w === 'string') ? { lit: w } : { lit: w[0], i: true } )

// The closed structural-keyword list (an engine fact, spec §1 - not
// declarable in the notation file).  [w] entries block case-insensitively
// (their grammar sites are 'w'i literals); plain entries are interior
// CS-lowercase keywords (be/such/that in Let, to/of in the big-operator
// and maps forms).
export const structuralKeywords = kw([
  // declarations and given labels
  ['declare'], ['let'], ['assume'], ['given'], ['suppose'], ['if'],
  ['from'], ['define'], ['for'], ['some'], 'be', 'such', 'that',
  // meta: labels, citations, comments
  ['by'], ['label'], ['ref'], ['comment'],
  // shorthands
  ['rule'], ['axiom'], ['definition'], ['rules'], ['axioms'],
  ['definitions'], ['theorem'], ['thm'], ['lemma'], ['corollary'],
  ['proof'], ['casesrule'], ['subsrule'], ['since'], ['because'],
  ['recall'], ['equiv'],
  // structural notation words
  ['langle'], ['rangle'], 'to', 'of'
])

// Grammar-level operator words that are not aliases of any table row: the
// prefix not/neg, the quantifiers, and the postfix/misc operator names.
// head is the canonical symbol a mention denotes (and the Declare
// internal-name map agrees with it).  noBare excludes a word from the
// BARE mention holes only - a stray 'not' in operand position is a
// malformed negation, not a mention of ¬, so it must not silently parse
// there ('a does not loves b' stays an error); (not) and 'not' still
// mention ¬ explicitly.
export const extraOperatorWords = [
  { lit: 'not', noBare: true }, { lit: 'neg', noBare: true },
  { lit: 'mapsto' }, { lit: 'division' },
  { lit: 'complement' }, { lit: 'factorial' },
  { lit: 'forall' }, { lit: 'exists' }, { lit: 'existsUnique' },
  // the sequent turnstile words: the sequent is a grammar form (the
  // Sequent rules in lurch-to-putdown.peggy), not a table row, so its
  // words are classified here - keeping them out of the Symbol space and
  // letting them mention/Declare the turnstile head (⊢, from
  // engineInternalNames) like any operator word.  noBare: a stray
  // 'proves' in operand position is a malformed sequent, not a mention
  // of ⊢ (the ⊢ glyph in operatorGlyphs below remains bare-mentionable,
  // so `⊢ is transitive` still parses)
  { lit: 'vdash', noBare: true }, { lit: 'proves', noBare: true }
].map( e => ({ ...e, head: internalNames[e.lit] ?? e.lit }) )

// Operator glyphs: single-character operator tokens as they reach the
// grammar (unicode replacement has already turned ⊆ ≤ ∈ ... into words).
// Mentionable as (g) or 'g', declarable in a Declare; head is the
// canonical symbol.  ':' (the maps token) is deliberately absent - it is
// the given marker, not a mentionable operator.
export const operatorGlyphs = [
  { g: '~', head: '~' }, { g: '★', head: '★' }, { g: '⊕', head: '⊕' },
  { g: '⊗', head: '⊗' }, { g: '⊙', head: '⊙' }, { g: '⋅', head: '⋅' },
  { g: '*', head: '⋅' }, { g: '+', head: '+' }, { g: '-', head: '-' },
  { g: '|', head: '|' }, { g: '⊢', head: '⊢' }, { g: '=', head: '=' },
  { g: '<', head: '<' }, { g: '/', head: '/' }, { g: '^', head: '^' }
]

// A frozen word list consulted ONLY by the tex printer's Declare-name
// rendering (declName in ast-to-tex.js renders these raw through
// texsymbol).  Not consulted by the parser.
const rw = words => words.map( w =>
  (typeof w === 'string') ? { lit: w } : { lit: w[0], i: true } )
export const texReservedWords = rw([
  ['declare'], 'existsUnique', 'forall', 'exists', '*', 'leq', 'lt',
  'not', 'to', 'from', 'implies', 'iff', 'intersect', 'union',
  'Cup', 'Cap', 'Union', 'Intersect', ['bigcup'], ['bigcap'],
  'cross', 'subseteq', 'subset', ['setminus'], 'circ', 'wedge', 'vee',
  'subgroup', 'sqsubseteq',
  'equiv', 'mapsto', 'approx', 'langle', 'rangle', 'complement',
  'in', 'and', 'or', '=', '<', '+', '*', '|', '-', '^'
])

///////////////////////////////////////////////////////////////////////////
// tex symbol lookup (the texSymbols table is compiled above)

export const texsymbol = s => {
  return (texSymbols[s]) ? texSymbols[s] : s
}

///////////////////////////////////////////////////////////////////////////
// Chain-family policies, derived from chainFamilies (see the field
// documentation in notation-file-format.md and expression-core.js)

// derived: canonical head → family name for the string-headed chain ops
// ('=' is neutral and appears in no family; the param family is excluded
// - its operators are compound objects, never bare head strings, so the
// string '≅' always means the bare-congruence family)
export const chainOpFamily = Object.fromEntries( chainFamilies
  .filter( fam => fam.param !== true )
  .flatMap( fam => fam.ops.map( op => [ op.head, fam.family ] ) ) )

// derived: family → op heads in strength order (the transitive-conclusion
// policy: the conclusion operator of a chain is the first op head in
// listed order that occurs among its steps, else `=`), and the name of
// the parameterized family
export const chainFamilyConclusion = Object.fromEntries( chainFamilies.map(
  fam => [ fam.family, fam.ops.map( op => op.head ) ] ) )
export const chainParamFamily =
  chainFamilies.find( fam => fam.param === true )?.family ?? null

// derived: op head → the families it belongs to, for the parameterized
// `ChainsRule(op, ...)` form (global-validation.js): each argument is a
// bare operator mention, so its canonical head names the families to
// enable - `ChainsRule(lt)` enables ineq, `ChainsRule(cong)` enables
// both congruence families (they share the head ≅)
export const chainFamiliesOfHead = head => chainFamilies
  .filter( fam => fam.ops.some( op => op.head === head ) )
  .map( fam => fam.family )

///////////////////////////////////////////////////////////////////////////
// The big-operator form-shape registry: one entry per shared form shape
// the grammar implements,
// recording whether the shape is CLOSED - i.e. carries its own
// delimiters, so no precedence question can arise at its edges.  A closed
// form is a member of the grammar's Closed class: valid in EVERY operand
// hole (including the star holes) and given the whole postfix/exponent
// layer (factorial, the complement tick, and service as an exponent base)
// as data.  An open form is right-open English (its body hole absorbs
// everything its hole precedence admits) and parses only in the FullUnit
// positions.  The grammar's BigOpen/BigClosed groupings gate each shape
// alternative on this flag (see lurch-to-putdown.peggy), so a flag that
// disagrees with the grouping makes the shape fail loudly instead of
// parsing in the wrong layer; the linter checks that every form key the
// rows use names a registered shape.  An engine fact (spec §1): form
// SHAPES are grammar work, only which shapes a row supports is declared
// in the notation file.
export const bigOpFormShapes = {
  call:      { closed: true  },  // ⟨op⟩(f, k, [a,] b) - delimited by ( )
  callIndef: { closed: true  },  // ⟨op⟩(f, x)         - delimited by ( )
  d:         { closed: true  },  // ⟨op⟩ f dx          - delimited by dx
  eq:        { closed: false },  // ⟨op⟩ k [= a] to b of f
  inOf:      { closed: false },  // ⟨op⟩ k in S of f
  forIn:     { closed: false }   // ⟨op⟩ [of] f for k in S
}

// Auto-declared constants: a symbol is auto-declared constant exactly
// when its meaning is fixed by Lurch itself.  The big-operator heads qualify because a
// validation tool (Algebrite) interprets them, so a Rule that uses one
// with a forgotten Declare must not treat it as a metavariable: sum and
// defint parse to the same 4-ary shape with a binding first argument, so
// an undeclared sum in a summation Rule instantiates as sum := defint and
// silently justifies a FALSE integral identity.  Auto-declaring the head
// costs nothing expressively - the body, index, and limits stay
// metavariables.  The list is DERIVED, not hand-maintained: every
// bigOpRows head including the form-level head overrides (sumOver,
// integral), so adding a big-operator row extends it automatically; the
// linter (table-linter.js) guards the derivation.  The engine wiring is
// in interpret.js, which folds this list into its systemConstants
// machinery (addSystemDeclarations / markDeclaredSymbols).
export const autoDeclaredConstants = [ ...new Set( bigOpRows.flatMap(
  row => [ row.head, ...Object.values( row.forms ).map( spec => spec.head )
                             .filter( h => h !== undefined ) ] ) ) ]

// The INVISIBLE structural heads: putdown head
// symbols the parser emits for notation the user types with pure
// structure - `f : A to B` → maps, `[G:H]` → index, `⟨a,b⟩` → tuple,
// `{1,2}` → set, `{ x : P(x) }` → setbuilder, `class(a,~)` → class, and
// a transitive chain's trans_chain wrapper.  The user never types these
// words, so "what constant should I Declare?" is unanswerable for them,
// and an undeclared one inside a Rule is a metavariable - the same
// soundness hazard the auto-declared big-operator heads close (a
// 3-tuple ⟨g,X,Y⟩ could instantiate maps:=tuple in a Rule stated with
// `f : A to B` and falsely justify its conclusion).  interpret.js folds
// this list into systemConstants alongside autoDeclaredConstants.
// Redundant user Declares of these remain valid (certified by the Auto
// Constants acid tests).  Deliberately a hand list: these
// heads are the printer's node vocabulary (ast-to-putdown.js), not
// notation-file rows, and only maps has any file presence at all.
export const invisibleHeads =
  [ ...new Set( [
    'maps', 'index', 'tuple', 'set', 'setbuilder', 'class', 'trans_chain',
    // the extended set-builder's condition wrapper: { x in S : P, Q }
    // puts (seq> (∈ x S) P Q) in the binding's body, turning the
    // sequence of conditions into the single Expression an LC binding
    // requires (its putdown-only name echoes the rule>/thm> shorthand
    // family, which the user likewise never types)
    'seq>',
    // every delimited-form head is invisible vocabulary too: ⌊x⌋ never
    // shows the user the word floor, so nothing prompts a Declare, and
    // an undeclared head is hijackable by a Rule metavariable
    ...delimitedRows.map( row => row.head ) ] ) ]

// Delimited-form tex templates, one per delimitedRows head: the row's
// tex: split at its hole letters into literal chunks and { arg } slots
// (splitDelimitedTex - the loader guarantees every hole is referenced),
// or, for a row with no tex:, the typed delimiters echoed around the
// holes.  ast-to-tex renders BOTH surfaces of a head through this map -
// the op node the delimited surface builds and the exact-arity call
// form - and texParen treats these heads as self-delimiting; arity
// distinguishes a true delimited application from an ordinary use of
// the same name with a different argument count.
export const delimitedTexTemplates = Object.fromEntries(
  delimitedRows.map( row => {
    const order = row.argOrder ?? null
    const parts = row.tex !== undefined
      ? splitDelimitedTex( row.tex, row.holes, order ).parts
      : row.delims.flatMap( (d, k) => k < row.holes.length
          ? [ d, { arg: order ? order.indexOf(k) : k } ] : [ d ] )
    return [ row.head, { parts, arity: row.holes.length } ]
  } ) )

// The Declare internal-name lookup: an exact internalNames hit, else a
// case-insensitive big-operator name normalizes its case
// (derived): the grammar accepts any capitalization of a
// case-insensitive name, so Sum(f,k,0,n) IS the summation and a
// 'Declare Sum' must name the same symbol those uses produce - anything
// else splits the Declare and the uses into different atoms (the
// Recursion lib and math299 student files rely on 'Declare Sum').  The
// canonical Declare name is the lowercase name itself, mapped through
// the table ('Sum' → 'sum').  A pure function of the tables.
export const makeInternal = ( names, bigRows ) => {
  const ciNames = new Set( bigRows.flatMap( row =>
    row.names.filter( n => n.i ).map( n => n.lit ) ) )
  return s => {
    if ( names[s] !== undefined ) return names[s]
    const lower = s.toLowerCase()
    if ( s !== lower && ciNames.has(lower) ) return names[lower] ?? lower
    return s
  }
}
export const internal = makeInternal(internalNames, bigOpRows)

///////////////////////////////////////////////////////////////////////////
// The tex right-open registry, derived from the big-operator rows (the
// registry itself is documented where it is consumed, in
// ast-to-tex.js).  Input closedness and OUTPUT closedness are independent
// per-template properties: a big operator's tex template is right-open by
// default in both contexts ('postfix' - a following ! or ' or ^ - and
// 'factor' - a following \cdot factor), because \sum f + 1 style
// renderings trail open regardless of which input form produced them.  A
// row's `tex-open:` field in the notation file restricts the open
// contexts (the int row is postfix-only: \int f dx delimits a following
// factor but \int f dx! still reads as x!).  The declared value applies
// to the row head and every form-level head override (defint AND
// integral).
export const texRightOpen = Object.fromEntries( bigOpRows.flatMap( row => {
  const declared = notationExtras.texOpen[row.head]
  const ctxs = declared === undefined ? [ 'postfix', 'factor' ]
    : declared.split(',').map( s => s.trim() )
  const open = { postfix: ctxs.includes('postfix'),
                 factor: ctxs.includes('factor') }
  const heads = [ ...new Set( [ row.head,
    ...Object.values( row.forms ).map( spec => spec.head )
             .filter( h => h !== undefined ) ] ) ]
  return heads.map( h => [ h, open ] )
} ) )

// The big-operator display symbols, derived from each bigop section's
// tex: via its first name (texSymbols carries every declared name), and
// mapped to the row head AND every form-level head override (sumOver,
// integral, ...) - so the tex printer's bigop cases render a NEW file
// section with zero printer edits.  The heads that
// keep the \,\mathrm{d}x template are derived too: exactly the rows
// declaring a `d` or `callIndef` form (the integral family - that tail
// is intrinsic to those form shapes, which stay engine work).
export const bigOpHeadTex = Object.fromEntries( bigOpRows.flatMap( row => {
  const sym = texSymbols[row.names[0].lit]
  if ( sym === undefined ) return []
  const heads = [ ...new Set( [ row.head,
    ...Object.values( row.forms ).map( spec => spec.head )
             .filter( h => h !== undefined ) ] ) ]
  return heads.map( h => [ h, sym ] )
} ) )
export const bigOpDHeads = new Set( bigOpRows
  .filter( row => row.forms.d !== undefined ||
                  row.forms.callIndef !== undefined )
  .flatMap( row => [ row.head,
    ...Object.values( row.forms ).map( spec => spec.head )
             .filter( h => h !== undefined ) ] ) )

// Heads with a hole-free (leaf) tex: rendering in the notation file -
// relation, infix, and chain rows alike - mapped to that rendering as an
// infix joiner: the printer's operator DEFAULT
// falls back to this table for any head its structural cases do not
// handle, so a NEW file row with leaf tex renders with zero printer
// edits - the live-fire extension path.  The trailing space matches the
// printer's join convention; hole-referencing templates (maps, choose,
// the English congruence) stay printer work and are excluded by the
// loader's leaf flag.  Heads the printer renders structurally (+ ⋅ / the
// star family's preserved texJoin spacing) never reach the fallback, so
// their presence here is inert.
export const headJoinTex = Object.fromEntries(
  notationExtras.texTemplates.filter( t => t.leaf )
    .map( t => [ t.head, `${t.tex} ` ] ) )

// English-echo infix rows (no tex: - the rendering rule): their heads
// join as English text.  Today this is exactly and/or; a new tex-less
// infix row echoes the same way with zero printer edits.
export const englishInfixJoin = Object.fromEntries(
  [ ...propRows, ...setAlgRows ].filter( r => r.fmtKey === 'src' )
    .map( r => [ r.head, `\\text{ ${r.head} }` ] ) )

// The per-joint synonym renderings for English-echo infix rows (the
// per-surface tex echo, consulted via fmt.srcs by the tex
// printer): a surface with its own tex: renders it symbolically at that
// joint (vee/wedge), and the rows' word aliases echo as English text
// (or/and).  Surface tex wins over the word-alias default, since the
// tex-carrying surfaces ARE word aliases of their rows.
export const srcJointTex = {}
notationExtras.surfaceTex.forEach( t => {
  if ( t.word !== null && srcJointTex[t.word] === undefined )
    srcJointTex[t.word] = `${t.tex} `
} )
;[ ...propRows, ...setAlgRows ].filter( r => r.fmtKey === 'src' )
  .forEach( r => r.aliases.filter( al => al.words.length === 1 )
    .forEach( al => {
      const w = al.words[0].w
      if ( srcJointTex[w] === undefined )
        srcJointTex[w] = `\\text{ ${w} }`
    } ) )

// The dual echo: word also-surfaces with NO tex of their own on rows
// WITH tex (the divides rule) - a standalone step typed with such a
// synonym echoes as the English it is, while the symbolic surfaces and
// multi-step chains print the symbol.  Derived, so a new echo synonym
// in the file needs no printer edit.
export const srcEchoTex = Object.fromEntries(
  notationExtras.surfaceEcho.map( e => [ e.word, `\\text{ ${e.word} }` ] ) )

// English-echo relation heads (rows with no tex: - the is family and the
// verbs): the tex printer renders these as the typed synonym (fmt.src)
// between the arguments.  ¬-wrapped rows are excluded (the printer's ¬
// case owns their echo).
export const englishRelationHeads = new Set( relationRows
  .filter( r => r.fmtKey === 'src' && !r.wrapNeg && !r.fmtFixed )
  .map( r => r.head ) )

// ¬-wrapped desugar rows with tex: render their fixed fmt marker
// symbolically (neq → \neq, notin → \notin); derived, joiner-shaped
// (trailing space), consumed by the tex printer's ¬ case
export const negFixedTex = notationExtras.negFixedTex
