///////////////////////////////////////////////////////////////////////////
// The notation-file loader
//
// Compiles lurch-notation.txt (format: notation-file-format.md) into the
// exact internal row structures the expression-core machinery consumes;
// notation-tables.js runs this compile at import time and exports the
// results, so the notation file is the source of truth for every table.
//
// Two stages:
//
//   parseNotationFile(text)  line-oriented parse into declaration records,
//                            each carrying its file line number (the error
//                            channel: every complaint below names a line)
//   compileNotation(parsed)  walk the declarations in file order and build
//                            the declarable tables, applying the
//                            derivation rules of the format spec (head from
//                            the -> rewrite or the glyph surface, trailing
//                            regimes word='bound'/glyph='any', positional
//                            precedence anchors, the closed desugar
//                            vocabulary of spec §5).
//
// Ordering is data: declarations compile in file order, and that order IS
// the ranked-matcher rank order, reproducing PEG ordered choice.  The one
// systematic exception is
// that the surfaces of a single declaration are sorted longest-first (by
// word count, stable) - the longest-match convention,
// which the within-row reachability lint requires anyway.  The is-a
// registry rows are hoisted into one block at the first isa surface's
// declaration position (they are one schema, and all must outrank the
// bare is/is not rows).
//
// No raw JS ever appears in the notation file; everything here is closed
// vocabulary + tables, so the load-time linter's guarantees stay meaningful.

///////////////////////////////////////////////////////////////////////////
// Stage 1 - parse the file into declaration records

// the closed field-name set (spec §3: a value ends at the next recognized
// field token or end of line).  Order matters in the regex: tex-open
// before tex, words before word.
const FIELD_NAMES =
  [ 'also', 'words', 'word', 'tex-open', 'tex', 'example', 'assoc',
    'level', 'params', 'bare', 'case', 'names', 'body' ]
const FIELD_REGEX = new RegExp(
  `(?:^|[ \\t])(${ FIELD_NAMES.join('|') }):(?=[ \\t]|$)`, 'g' )

// strip a // comment (always preceded by start-of-line or whitespace in
// this file; a lone '/' as in 'a / b' never matches)
const stripComment = line => line.replace(/(^|[ \t])\/\/.*$/, '$1')

// split one physical line into { lead, fields: [ { name, value } ] } where
// lead is the text before the first field token (the pattern, or empty on
// continuation lines)
const splitFields = line => {
  const fields = []
  let lead = line, m
  FIELD_REGEX.lastIndex = 0
  const marks = []
  while ( ( m = FIELD_REGEX.exec(line) ) !== null )
    marks.push( { name: m[1], from: m.index, to: FIELD_REGEX.lastIndex } )
  if ( marks.length ) {
    lead = line.slice(0, marks[0].from)
    marks.forEach( (mk, i) => {
      const end = i + 1 < marks.length ? marks[i+1].from : line.length
      fields.push( { name: mk.name, value: line.slice(mk.to, end).trim() } )
    } )
  }
  return { lead: lead.trim(), fields }
}

// parse ' pattern -> rhs ' into its two parts (the arrow token is
// reserved; the → glyph is ordinary notation)
const splitArrow = text => {
  const at = text.indexOf('->')
  return at === -1
    ? { pattern: text.trim(), rhs: null }
    : { pattern: text.slice(0, at).trim(), rhs: text.slice(at + 2).trim() }
}

/**
 * Parse the notation file text into declaration records (stage 1).  Purely
 * lexical: groups, declarations, surfaces, and fields, each with its line
 * number; no table semantics yet.
 *
 * @param {string} text - the contents of lurch-notation.txt
 * @returns {{groups: object[], latexNames: object|null, unicode: object[],
 *   errors: string[]}} the parsed structure; errors carry line numbers
 */
export const parseNotationFile = text => {
  const groups = [], unicode = [], errors = []
  let latexNames = null
  let group = null, decl = null, mode = null
  const err = (line, msg) => errors.push(`line ${line}: ${msg}`)

  const lines = text.split('\n')
  lines.forEach( (raw, i) => {
    const line = i + 1
    const stripped = stripComment(raw)
    const trimmed = stripped.trim()
    if ( trimmed.length === 0 ) return

    // latex-names continuation: the list continues while it ends with ','
    if ( mode === 'latex' ) {
      latexNames.words.push( ...trimmed.split(',')
        .map( w => w.trim() ).filter( w => w.length ) )
      if ( !trimmed.endsWith(',') ) mode = null
      return
    }

    // section headers
    let m
    if ( ( m = trimmed.match(/^group +(infix|relation|constant|bigop|delimited)\b(.*)$/) ) ) {
      const { fields } = splitFields(m[2])
      group = { kind: m[1], line, fields, decls: [] }
      groups.push(group)
      decl = null
      mode = null
      return
    }
    if ( ( m = trimmed.match(/^chain family +(\S+)(.*)$/) ) ) {
      const { lead, fields } = splitFields(m[2])
      const param = lead.split(/\s+/).includes('param')
      group = { kind: 'chain', name: m[1], param, line, fields, decls: [] }
      groups.push(group)
      decl = null
      mode = null
      return
    }
    if ( ( m = trimmed.match(/^bigop +(\S+)(.*)$/) ) ) {
      const { fields } = splitFields(m[2])
      group = { kind: 'bigopRow', name: m[1], line, fields, decls: [] }
      groups.push(group)
      decl = null
      mode = null
      return
    }
    if ( ( m = trimmed.match(/^latex names:(.*)$/) ) ) {
      latexNames = { line, words: m[1].split(',')
        .map( w => w.trim() ).filter( w => w.length ) }
      if ( m[1].trim().endsWith(',') || m[1].trim().length === 0 ||
           trimmed.endsWith(',') ) mode = 'latex'
      return
    }
    if ( trimmed === 'unicode' ) { mode = 'unicode'; group = null; return }

    // unicode section lines: repeated `GLYPH -> WORD` pairs
    if ( mode === 'unicode' ) {
      const toks = trimmed.split(/\s+/)
      for ( let k = 0; k < toks.length; ) {
        if ( toks[k+1] === '->' && toks[k+2] !== undefined ) {
          unicode.push( { glyph: toks[k], word: toks[k+2], line } )
          k += 3
        } else {
          err(line, `cannot read unicode rewrite at '${toks[k]}'`)
          break
        }
      }
      return
    }

    if ( !group ) { err(line, `declaration outside any group: '${trimmed}'`); return }

    const { lead, fields } = splitFields(trimmed)

    // continuation line: no leading pattern, only fields; with no open
    // declaration the fields belong to the section header (tex-open: on
    // a bigop section, for example)
    if ( lead.length === 0 && fields.length ) {
      if ( decl ) addFields(decl, fields, line, err)
      else group.fields.push( ...fields )
      return
    }

    // constant-group lines may declare several constants per line (the
    // emoji block); parse them token-wise
    if ( group.kind === 'constant' ) {
      parseConstantLine(trimmed, line, group, err)
      decl = group.decls[group.decls.length - 1] ?? null
      return
    }

    // a new declaration: pattern [-> rhs] + fields
    const { pattern, rhs } = splitArrow(lead)
    if ( pattern.length === 0 ) { err(line, `empty pattern`); return }
    decl = { line, pattern, rhs, fields: {}, also: [] }
    addFields(decl, fields, line, err)
    group.decls.push(decl)
  } )

  return { groups, latexNames, unicode, errors }
}

// attach a line's fields to a declaration in order: a tex: appearing
// after an also: on the same line is that surface's own rendering (the
// per-surface tex echo - `also: P wedge Q tex: \wedge`),
// recorded on the also entry; everything else routes through addField
const addFields = (decl, fields, line, err) => {
  let alsoEntry = null
  fields.forEach( f => {
    if ( f.name === 'also' ) {
      const before = decl.also.length
      addField(decl, f, line, err)
      alsoEntry = decl.also.length === before + 1 ? decl.also[before] : null
    } else if ( f.name === 'tex' && alsoEntry !== null )
      alsoEntry.tex = f.value
    else addField(decl, f, line, err)
  } )
}

// attach one field to a declaration, normalizing list-valued fields
const addField = (decl, { name, value }, line, err) => {
  if ( name === 'also' ) {
    // an also: value with a rewrite is one surface; without one it is a
    // comma-separated list of surfaces
    if ( value.includes('->') ) {
      const { pattern, rhs } = splitArrow(value)
      decl.also.push( { pattern, rhs, line } )
    } else value.split(',').map( s => s.trim() ).filter( s => s.length )
      .forEach( pattern => decl.also.push( { pattern, rhs: null, line } ) )
  } else if ( name === 'word' || name === 'words' ) {
    decl.fields.words = ( decl.fields.words ?? [] ).concat(
      value.split(',').map( s => s.trim() ).filter( s => s.length ) )
  } else if ( name === 'names' ) {
    decl.fields.names = value.split(',').map( s => s.trim() )
      .filter( s => s.length )
  } else if ( name === 'tex-open' ) {
    decl.fields.texOpen = value.split(',').map( s => s.trim() )
      .filter( s => s.length )
  } else {
    if ( decl.fields[name] !== undefined )
      err(line, `duplicate field '${name}:'`)
    decl.fields[name] = value
  }
}

// constant-group line: repeat [ head (word:|words: list)? (tex: TOKEN)? ].
// tex: values are single tokens in this group, which is what lets several
// constants share a line (the emoji block); word lists run to the next
// field token or end of line and may contain commas and spaces.
const parseConstantLine = (trimmed, line, group, err) => {
  const toks = trimmed.split(/\s+/)
  let k = 0
  const isField = t => /^(words?|tex):$/.test(t)
  while ( k < toks.length ) {
    const head = toks[k++]
    if ( isField(head) ) { err(line, `field '${head}' with no constant`); return }
    const decl = { line, pattern: head, rhs: null, fields: {}, also: [] }
    while ( k < toks.length && isField(toks[k]) ) {
      const f = toks[k++]
      if ( f === 'tex:' ) {
        if ( k >= toks.length ) { err(line, `tex: with no value`); return }
        decl.fields.tex = toks[k++]
      } else {
        const words = []
        while ( k < toks.length && !isField(toks[k]) ) words.push(toks[k++])
        decl.fields.words = words.join(' ').split(',')
          .map( s => s.trim() ).filter( s => s.length )
      }
    }
    group.decls.push(decl)
  }
}

///////////////////////////////////////////////////////////////////////////
// Pattern analysis helpers (stage 2)

// is this token a hole name?  Holes are single letters; with an RHS
// present, exactly the letters the RHS references (spec §4's hole rule);
// with no RHS, both single letters of a degenerate infix pattern.
const isLetter = t => /^[A-Za-z]$/.test(t)

// the tokens of an s-expression RHS, e.g. ((≅ m) a b)
const rhsTokens = rhs => rhs.match(/[()]|[^()\s]+/g) ?? []

// parse the closed desugar vocabulary (spec §5).  Returns one of
//   { shape: 'plain',  head, args }            (head holes...)
//   { shape: 'neg',    head, args }            (¬ (head holes...))
//   { shape: 'param',  head, params, args }    ((head p...) a b)
//   { shape: 'invpair', op, inv, args }        (op a (inv b))
//   { shape: 'head',   head }                  bare word (bigop override)
// or null with an error pushed.
const parseRhs = (rhs, line, err) => {
  const toks = rhsTokens(rhs)
  // bare head override (big-operator form lines)
  if ( toks.length === 1 && toks[0] !== '(' && toks[0] !== ')' )
    return { shape: 'head', head: toks[0] }
  // a tiny s-expression reader
  let pos = 0
  const read = () => {
    if ( toks[pos] === '(' ) {
      pos++
      const items = []
      while ( pos < toks.length && toks[pos] !== ')' ) items.push( read() )
      pos++
      return items
    }
    return toks[pos++]
  }
  const tree = read()
  if ( pos !== toks.length || !Array.isArray(tree) ) {
    err(line, `cannot read rewrite '${rhs}'`)
    return null
  }
  const allStrings = a => a.every( x => typeof x === 'string' )
  if ( tree[0] === '¬' && tree.length === 2 && Array.isArray(tree[1]) &&
       allStrings(tree[1]) )
    return { shape: 'neg', head: tree[1][0], args: tree[1].slice(1) }
  if ( Array.isArray(tree[0]) && allStrings(tree[0]) &&
       allStrings(tree.slice(1)) )
    return { shape: 'param', head: tree[0][0], params: tree[0].slice(1),
             args: tree.slice(1) }
  if ( tree.length === 3 && typeof tree[0] === 'string' &&
       typeof tree[1] === 'string' && Array.isArray(tree[2]) &&
       tree[2].length === 2 && allStrings(tree[2]) )
    return { shape: 'invpair', op: tree[0], inv: tree[2][0],
             args: [ tree[1], tree[2][1] ] }
  if ( allStrings(tree) )
    return { shape: 'plain', head: tree[0], args: tree.slice(1) }
  err(line, `rewrite '${rhs}' is not in the closed desugar vocabulary` +
            ` (see notation-file-format.md §5)`)
  return null
}

// Analyze one surface pattern against its (optional) parsed RHS: split
// into alternating holes and keyword groups.  Returns
//   { holes: [names...], kwGroups: [ [words...] ... ], leadingHole,
//     paramOp: { op, params } | null }
// where paramOp is set for subscript-parameterized surfaces `a op_(p) b`.
// A synonym surface with no rewrite of its own inherits the declaration's
// hole names (inheritedHoles); each hole name binds once - a repeated
// letter is a keyword occurrence, which is what makes the article in
// `a is a b` a word, not a second hole.
const analyzePattern = (pattern, rhsInfo, line, err, inheritedHoles = null) => {
  const toks = pattern.split(/\s+/)
  const rhsNames = rhsInfo !== null ? new Set( [
      ...( rhsInfo.args ?? [] ), ...( rhsInfo.params ?? [] ) ] )
    : inheritedHoles !== null ? new Set(inheritedHoles)
    : null
  // a subscript-parameterized operator token, e.g. `~_(u)` or `cong_(m)`
  const paramTok = toks.find( t => /^[^_\s]+_\([A-Za-z](,[A-Za-z])*\)$/.test(t) )
  const holes = [], kwGroups = []
  const seen = new Set()
  let current = null, leadingHole = false
  toks.forEach( (t, k) => {
    const isHole = isLetter(t) && !seen.has(t) &&
      ( rhsNames === null ? true : rhsNames.has(t) )
    if ( isHole ) {
      if ( k === 0 ) leadingHole = true
      // an interior single-letter article can only be a mistake: with a
      // rewrite it would have to be referenced there, and without one a
      // degenerate infix pattern has no interior holes
      if ( k > 0 && k < toks.length - 1 && ( t === 'a' ) )
        err(line, `hole named 'a' in '${pattern}' is almost certainly a` +
                  ` mistaken article`)
      holes.push(t)
      seen.add(t)
      current = null
    } else if ( t !== paramTok ) {
      if ( !current ) { current = []; kwGroups.push(current) }
      current.push(t)
    } else current = null
  } )
  let paramOp = null
  if ( paramTok ) {
    const m = paramTok.match(/^([^_\s]+)_\((.*)\)$/)
    paramOp = { op: m[1], params: m[2].split(',') }
  }
  if ( rhsInfo !== null ) {
    const extra = [ ...rhsNames ].filter( n =>
      !holes.includes(n) && !( paramOp?.params.includes(n) ) )
    if ( extra.length )
      err(line, `rewrite references '${extra.join("', '")}' which the` +
                ` pattern '${pattern}' does not bind`)
  }
  return { holes, kwGroups, leadingHole, paramOp }
}

// a single-token surface's lone token (constant aliases, glyph surfaces)
const loneToken = pattern => {
  const toks = pattern.split(/\s+/)
  return toks.length === 1 ? toks[0] : null
}

// is this keyword token a glyph (non-word)?  Word keywords match at word
// boundaries; glyph keywords anywhere (spec §4).
const isGlyphToken = t => !/[A-Za-z0-9]/.test(t)

///////////////////////////////////////////////////////////////////////////
// Alias construction (the notation-tables.js `al` encoding)

const mkWord = w => ({ w })
const mkAlias = ( words, after, opts = {} ) =>
  ({ words: words.map(mkWord), after, ...opts })

// default trailing regime: glyph keywords check nothing, word keywords
// require a word boundary (spec §4's one word-boundary rule)
const defaultRegime = words =>
  isGlyphToken( words[words.length - 1] ) ? 'any' : 'bound'

// stable longest-first (by word count) ordering of one row's aliases -
// the trie longest-match convention; required by within-row reachability
const sortAliases = aliases => aliases
  .map( (a, i) => [ a, i ] )
  .sort( (x, y) => ( y[0].words.length - x[0].words.length ) || ( x[1] - y[1] ) )
  .map( x => x[0] )

///////////////////////////////////////////////////////////////////////////
// Engine constants: facts about the grammar and engine that are not
// declarable in the file (spec §1's "not declarable" list) but participate
// in the derived tables.

// glyphs that live at the grammar level (operator tokens the tokenizer
// does not rewrite): the operatorGlyphs table's characters, plus ':' (the
// maps token, deliberately not a mentionable operator glyph)
const grammarGlyphs =
  new Set( [ '~', '★', '⊕', '⊗', '⊙', '⋅', '*', '+', '-', '|', '⊢', '=',
             '<', '/', '^', ':' ] )

// glyphs handled by the tokenizer's toxic-replacement pass (spacing is
// context-sensitive), not by the UnicodeNames table: the file's toxic
// lines plus the two negated-relation glyphs whose rewrites are toxic-
// style for historical reasons
const toxicGlyphs = new Set( [ '𝜎', '𝜆', '⁻', '𝒫', '≠', '∉' ] )

// grammar-level operator words and their canonical heads (the
// extraOperatorWords facts, from the engine's side): these words are not
// aliases of any file row, but Declare and mentions must know their heads
const engineInternalNames = {
  equiv: '≡', not: '¬', neg: '¬', complement: '°', factorial: '!',
  forall: '∀', exists: '∃', existsUnique: '∃!', division: '/', '\\': ' ',
  // the sequent turnstile words (the Sequent rules in the grammar)
  vdash: '⊢', proves: '⊢'
}

// validation marks pass through the leading symbol renames as themselves
const validationMarks = [ '✔︎', '✗', '⁉︎', '⊘' ]

// engine-side unicode rewrites (tokenizer policy, not notation rows): the
// backslash is stripped to a space, and ⋅ - a grammar-level glyph alias
// of its own row - is normalized to '*' before the grammar sees it
const engineUnicodeRewrites = { '\\': ' ', '⋅': '*' }

// tex renderings that belong to the engine (grammar-level words and
// glyphs with no file row): the DeclareSeq/leaf renderings of the
// structural and grammar-operator vocabulary
const engineTexSymbols = {
  not: '\\neg', and: '\\text{and}', or: '\\text{or}',
  by: '\\text{ by }', '^': '{}^\\wedge', complement: '\'',
  mapsto: '\\mapsto', vdash: '\\vdash', proves: '\\vdash'
}
const engineOperatorHeadTex = {
  '¬': '\\neg', '≡': '\\equiv', '°': '\'', '↦': '\\mapsto', '⊢': '\\vdash',
  // '~' is the one ASCII operator head with a tex leaf rendering
  '~': '\\sim'
}

///////////////////////////////////////////////////////////////////////////
// Stage 2 - compile declarations into the internal tables

/**
 * Split a delimited row's tex: template at its hole letters.  A hole
 * slot is an occurrence of a hole letter standing alone: neither
 * neighbor is a letter and the preceding character is not a backslash,
 * so the l of \lfloor can never be read as a slot for a hole named l.
 * Returns the template as an array of literal strings and { arg } slots
 * (arg = the position of that hole's value among the HEAD's arguments,
 * i.e. the row's argOrder inverted), or { missing } listing holes the
 * template never references.  Shared by the loader (which refuses a
 * template with missing holes, with a file line) and by the
 * delimitedTexTemplates derivation in notation-tables.js.
 *
 * @param {string} tex - the row's tex: template
 * @param {string[]} holes - the row's hole letters, in pattern order
 * @param {number[]|null} argOrder - the row's argOrder, if any
 * @returns {{parts: (string|{arg: number})[]}|{missing: string[]}}
 */
export const splitDelimitedTex = (tex, holes, argOrder) => {
  const letter = ch => ch !== undefined && /[A-Za-z]/.test(ch)
  const parts = [], used = new Set()
  let lit = ''
  for ( let i = 0; i < tex.length; i++ ) {
    const k = holes.indexOf(tex[i])
    if ( k >= 0 && !letter(tex[i-1]) && tex[i-1] !== '\\' &&
         !letter(tex[i+1]) ) {
      if ( lit.length ) { parts.push(lit); lit = '' }
      parts.push( { arg: argOrder ? argOrder.indexOf(k) : k } )
      used.add(tex[i])
    } else lit += tex[i]
  }
  if ( lit.length ) parts.push(lit)
  const missing = holes.filter( h => !used.has(h) )
  return missing.length ? { missing } : { parts }
}

/**
 * Compile a parsed notation file (stage 2).  Returns the thirteen
 * declarable tables in the exact shapes notation-tables.js exports, plus
 * a per-row provenance map and any errors (each naming a file line).
 *
 * @param {object} parsed - the result of parseNotationFile
 * @returns {{tables: object, lineOf: Map, errors: string[],
 *   extras: object}} tables to parity-check / consume; lineOf maps each
 *   emitted row object to its declaring line; extras carries side-channel
 *   data for the docs page and printer derivations (examples, tex
 *   templates, tex-open)
 */
export const compileNotation = parsed => {
  const errors = [ ...parsed.errors ]
  const err = (line, msg) => errors.push(`line ${line}: ${msg}`)
  const lineOf = new Map()
  const remember = (row, line) => { lineOf.set(row, line); return row }

  const tables = {
    phrases: [], UnicodeNames: {}, internalNames: {}, texSymbols: {},
    isaNouns: [], relationRows: [], paramOpRows: [], chainFamilies: [],
    propRows: [], setAlgRows: [], bigOpRows: [], delimitedRows: [],
    putdownLeadingSymbolRenames: [], operatorHeadTex: {}
  }
  // side-channel data (docs page, corpus lines, printer templates)
  const extras = { examples: [], texTemplates: [], texOpen: {},
                   surfaceTex: [], surfaceEcho: [], negFixedTex: {},
                   toxic: [], docRows: [] }

  // ── small helpers over the growing tables ────────────────────────────

  // a word alias contributes a Declare internal name when it differs from
  // its head (wrapNeg composites and multi-word phrases excluded)
  const addInternal = (word, head) => {
    if ( word !== head && tables.internalNames[word] === undefined )
      tables.internalNames[word] = head
  }
  // glyph aliases contribute only when the glyph and head differ (the
  // lone case is '*' → '⋅'); identical pairs are covered by the identity
  // fallback in internal(), and a glyph whose head is an English word is
  // not declarable at all (':' is the given marker, not a maps operator)
  const addGlyphInternal = (glyph, head) => {
    if ( glyph !== head && !/^[A-Za-z]/.test(head) )
      addInternal(glyph, head)
  }
  const addTexSymbol = (word, tex) => {
    if ( tables.texSymbols[word] === undefined )
      tables.texSymbols[word] = tex
  }
  // is a tex value a per-row template rather than a leaf rendering?  A
  // template references the pattern's hole names (spec §6)
  const texIsTemplate = (tex, holes) =>
    holes.some( h => tex.includes(`{${h}}`) || tex.startsWith(`${h}\\`) ||
                     tex.includes(` ${h}`) || tex.includes(`\\ ${h}`) )
  // a non-ASCII operator head with a plain (hole-free) tex rendering
  // becomes an operatorHeadTex leaf entry (ASCII operator tokens render
  // as themselves)
  const addHeadTex = (head, tex, holes = []) => {
    if ( tex === undefined || /^[\x00-\x7F]+$/.test(head) ) return
    if ( texIsTemplate(tex, holes) ) return
    if ( tables.operatorHeadTex[head] === undefined )
      tables.operatorHeadTex[head] = tex
  }
  // route a glyph surface: grammar-level glyphs stay aliases; toxic
  // glyphs belong to the tokenizer's toxic pass; everything else becomes
  // a UnicodeNames rewrite to a word alias of the same row
  const addUnicodeRewrite = (glyph, target) => {
    if ( toxicGlyphs.has(glyph) ) { extras.toxic.push( [ glyph, target ] ); return }
    if ( tables.UnicodeNames[glyph] === undefined )
      tables.UnicodeNames[glyph] = target
  }

  // ── the is-a registry (spec §7: the schema auto-fires on any
  // `x is a|an ⟨noun...⟩ ⟨prep⟩ y` surface).  Detection runs on the raw
  // pattern, before hole analysis, so an isa synonym may use its own
  // hole letters (`K is a subgroup of G` on the `a subgroup b` row).
  const isaSurface = pattern => {
    const m = pattern.match(
      /^([A-Za-z]) is (an?) ((?:[a-z]+ )*[a-z]+) (of|on) ([A-Za-z])$/ )
    return m ? { article: m[2], noun: m[3], prep: m[4] } : null
  }
  let isaSpliceAt = null   // index in relationRows where the block goes
  const addIsaNoun = (entry, line, host) => {
    if ( isaSpliceAt === null ) isaSpliceAt = tables.relationRows.length
    // the declared article is used verbatim (no English policing -
    // `a unit` is correct despite the vowel letter, and the instructor's
    // spelling is what users will type)
    const row = { noun: entry.noun, prep: entry.prep, head: entry.head,
                  article: entry.article,
                  ...( host?.bareRight ? { bareRight: true } : {} ) }
    tables.isaNouns.push( remember(row, line) )
  }
  // instantiate the registry exactly as notation-tables.js does (the
  // generated rows must deep-equal its isaRows)
  const isaRows = () => tables.isaNouns.flatMap( e => {
    const article = e.article ?? ( /^[aeiou]/.test(e.noun) ? 'an' : 'a' )
    const nounWords = e.noun.split(' ')
    const mk = words => ({
      head: e.head, fmtKey: 'phrase',
      ...( e.bareRight ? { bareRight: true } : {} ),
      aliases: [ mkAlias(words, 'bound') ] })
    return [
      { ...mk( [ 'is', 'not', article, ...nounWords, e.prep ] ), wrapNeg: true },
      mk( [ 'is', article, ...nounWords, e.prep ] ) ]
  } ).map( row => remember({ kind: 'relation', prec: 'REL', ...row },
                           lineOf.get(tables.isaNouns[0]) ?? 0) )

  // ── docs-page surface pools ──────────────────────────────────────────
  // Each docRow is one pool of typed inputs documenting a declaration (or
  // a chain family / big-operator section): the primary pattern, its
  // word: synonyms substituted for the keyword, the also: surfaces, the
  // isa registry's automatic `is not` twins, and the example: instances.
  // makedoc.js groups a pool's inputs by identical tex rendering into the
  // docs page's boxes (the dedup policy) and the golden corpus tests
  // every input - so a new file row is documented and corpus-locked with
  // zero JS edits.
  const wordVariants = (pattern, words) => {
    const kw = pattern.split(/\s+/).find( t => !isLetter(t) )
    return kw === undefined ? [] :
      words.map( w => pattern.split(/\s+/)
        .map( t => t === kw ? w : t ).join(' ') )
  }
  const docInputs = decl => {
    const inputs = [ decl.pattern,
      ...wordVariants(decl.pattern, decl.fields.words ?? []),
      ...decl.also.map( s => s.pattern ) ]
    ;[ decl.pattern, ...decl.also.map( s => s.pattern ) ].forEach( p => {
      if ( isaSurface(p) )
        inputs.push( p.replace(/ is (an?) /, ' is not $1 ') )
    } )
    if ( decl.fields.example !== undefined )
      inputs.push( decl.fields.example )
    return [ ...new Set(inputs) ]
  }
  const addDocRow = (band, line, inputs) => {
    if ( inputs.length ) extras.docRows.push( { band, line, inputs } )
  }

  // ── alias assembly for one declaration ───────────────────────────────
  // Gather the surfaces of one declaration into: aliases of one row,
  // extra rows (own-rewrite surfaces), unicode rewrites, isa entries.
  // noInternal collects alias words that must not feed the Declare
  // internal-name map (the inverse-pair surfaces: '-' declares the unary
  // minus, not '+').
  const gatherSurfaces = (decl, group, head) => {
    const aliases = [], extraRows = [], flags = {},
          noInternal = new Set()
    if ( decl.fields.bare === 'right' ) flags.bareRight = true
    const primaryRhs = decl.rhs === null ? null
                                         : parseRhs(decl.rhs, decl.line, () => {})
    const primaryHoles =
      analyzePattern(decl.pattern, primaryRhs, decl.line, () => {}).holes
    const surfaces = [ { pattern: decl.pattern, rhs: decl.rhs,
                         line: decl.line, primary: true },
                       ...decl.also ]
    surfaces.forEach( s => {
      // the isa schema fires on the raw surface, before hole analysis
      const isa = isaSurface(s.pattern)
      if ( isa ) {
        const isaRhs = s.rhs === null ? null : parseRhs(s.rhs, s.line, err)
        addIsaNoun( { ...isa, head: isaRhs?.head ?? head }, s.line, flags )
        return
      }
      const rhsInfo = s.rhs === null ? null : parseRhs(s.rhs, s.line, err)
      if ( s.rhs !== null && rhsInfo === null ) return
      const a = analyzePattern(s.pattern, rhsInfo, s.line, err,
                               s.primary ? null : primaryHoles)
      // chain-family parameterized surfaces alias their operator token
      if ( a.paramOp && group.kind === 'chain' ) {
        aliases.push( mkAlias( [ a.paramOp.op ],
                               defaultRegime( [ a.paramOp.op ] ) ) )
        return
      }
      if ( a.kwGroups.length === 0 ) {
        err(s.line, `surface '${s.pattern}' has no keyword`)
        return
      }
      const kws = a.kwGroups[0]
      // glyph surfaces route to the tokenizer unless grammar-level; the
      // rewrite target is the declaration's first one-word synonym - a
      // word: entry, else the first single-keyword word also-surface
      // (`also: P vee Q`, so ∨ adopts vee's rendering - the per-surface
      // tex echo), else the primary keyword (a word alias of the same
      // row every way)
      if ( kws.length === 1 && isGlyphToken(kws[0]) &&
           !grammarGlyphs.has(kws[0]) && !s.primary ) {
        const wordKwOf = pat => {
          const toks = pat.split(/\s+/).filter( t => !isLetter(t) )
          return toks.length === 1 && !isGlyphToken(toks[0])
            ? toks[0] : null
        }
        const target = decl.fields.words?.[0] ??
          decl.also.map( x => wordKwOf(x.pattern) )
                   .find( w => w !== null ) ??
          decl.pattern.split(/\s+/).find( t => !isLetter(t) )
        addUnicodeRewrite(kws[0], target)
        return
      }
      // a surface's own tex: rendering (per-surface echo) is recorded
      // for the printers' derived per-joint table (srcJointTex in
      // notation-tables.js); word is the surface's one keyword when it
      // has exactly one (the fmt.srcs key the grammar records)
      if ( s.tex !== undefined )
        extras.surfaceTex.push( { pattern: s.pattern, tex: s.tex,
                                  word: kws.length === 1 ? kws[0] : null,
                                  line: s.line } )
      // the dual rule: a word also-surface with NO tex of its own on a
      // row WITH tex echoes as English when it stands alone (the divides
      // rule) - recorded for the printers' derived echo table
      // (srcEchoTex in notation-tables.js)
      if ( !s.primary && s.tex === undefined && s.rhs === null &&
           a.kwGroups.length === 1 && kws.length === 1 &&
           !isGlyphToken(kws[0]) && decl.fields.tex !== undefined )
        extras.surfaceEcho.push( { word: kws[0], line: s.line } )
      // a non-primary surface with its own rewrite or extra keyword
      // structure is its own row (e.g. `a = b mod m`); it inherits the
      // primary's rewrite shape when it declares none
      const structural = a.kwGroups.length > 1
      if ( !s.primary && ( s.rhs !== null || structural ) &&
           group.kind === 'relation' ) {
        extraRows.push( { surface: s, analysis: a,
                          rhsInfo: rhsInfo ?? primaryRhs } )
        return
      }
      // an inverse-pair surface is the row's inv alias (`a - b` on the
      // + row, `a / b` on the ⋅ row); the row
      // is additionally signed - its surface signs echo in tex as
      // fmt.signs - exactly when it has no tex: (the rendering rule:
      // the symbolic ⋅ row reconstructs division from the AST shape).
      // The alias never feeds the Declare map ('-' declares the unary
      // minus, not '+'; '/' declares itself)
      if ( rhsInfo?.shape === 'invpair' ) {
        flags.inv = rhsInfo.inv
        if ( decl.fields.tex === undefined ) flags.signed = true
        noInternal.add( kws[0] )
      }
      aliases.push( mkAlias(kws, defaultRegime(kws)) )
    } )
    // one-word synonyms
    ;( decl.fields.words ?? [] ).forEach( w =>
      aliases.push( mkAlias( [ w ], defaultRegime( [ w ] ) ) ) )
    return { aliases, extraRows, flags, noInternal }
  }

  // The rendering rule (spec §6): a relation row records the
  // typed surface in fmt exactly when it can render as English - a row
  // with no tex: echoes its surface (fmtKey 'src': the is family, the
  // English verbs, the does-not phrases), and a ¬-wrapped desugar of a
  // symbolic row (tex: present, neg shape) records its fixed marker so
  // the printer renders \neq / \notin instead of a generic negation.
  // Symbolic rows (tex: present, no neg) record nothing - which is why
  // `a proves b` renders \vdash.
  const derivedFmt = (decl, rhsInfo) => {
    if ( decl.fields.tex === undefined ) return { fmtKey: 'src' }
    if ( rhsInfo?.shape === 'neg' ) {
      const kw = decl.pattern.split(/\s+/).find( t => !isLetter(t) )
      return { fmtKey: 'src', fmtFixed: kw }
    }
    return {}
  }

  // ── the derived per-word tables for one compiled row ─────────────────
  // Single-word aliases feed the Declare internal-name map (word → head,
  // when they differ; ¬-wrapped composite rows and inverse-pair aliases
  // excluded) and, when the row's tex is a plain leaf rendering, the
  // texSymbols map - glyph and word aliases alike ('*' gets \cdot by
  // the same rule that gives cdot \cdot).
  const deriveWordTables = (sorted, head, decl, rhsInfo, noInternal,
                            holes) => {
    const neg = rhsInfo?.shape === 'neg'
    const tex = decl.fields.tex
    const leafTex = tex !== undefined && !texIsTemplate(tex, holes)
    sorted.filter( al => al.words.length === 1 ).forEach( al => {
      const w = al.words[0].w
      if ( noInternal?.has(w) ) return
      if ( isGlyphToken(w) ) {
        addGlyphInternal(w, head)
        if ( !neg && leafTex ) addTexSymbol(w, tex)
      } else if ( !neg ) {
        addInternal(w, head)
        if ( leafTex ) addTexSymbol(w, tex)
      }
    } )
    if ( !neg ) addHeadTex(head, tex, holes)
  }

  // ── head resolution ──────────────────────────────────────────────────
  // explicit rewrite head, else the glyph among the surfaces (grammar
  // glyph aliases and tokenizer-rewritten glyphs both count), else the
  // primary keyword
  const resolveHead = decl => {
    if ( decl.rhs !== null ) {
      const info = parseRhs(decl.rhs, decl.line, () => {})
      if ( info?.head ) return info.head
      if ( info?.shape === 'invpair' ) return info.op
    }
    const surfaces = [ decl.pattern, ...decl.also.map( s => s.pattern ) ]
    for ( const p of surfaces ) {
      const glyph = p.split(/\s+/).find( t => !isLetter(t) && isGlyphToken(t) )
      if ( glyph ) return glyph
    }
    const primaryKw = decl.pattern.split(/\s+/).find( t => !isLetter(t) )
    return primaryKw ?? decl.pattern
  }

  // ── group compilers ──────────────────────────────────────────────────

  const compileRelationGroup = group => group.decls.forEach( decl => {
    const rhsInfo = decl.rhs === null ? null
                                      : parseRhs(decl.rhs, decl.line, err)
    const a = analyzePattern(decl.pattern, rhsInfo, decl.line, err)

    // subscript-parameterized surfaces route to paramOpRows
    if ( a.paramOp ) {
      if ( rhsInfo?.shape !== 'param' ) {
        err(decl.line, `parameterized surface '${decl.pattern}' needs a` +
                       ` ((op p) a b) rewrite`)
        return
      }
      const opTok = a.paramOp.op
      const row = { head: rhsInfo.head,
        aliases: [ mkAlias( [ opTok ], defaultRegime( [ opTok ] ) ) ] }
      tables.paramOpRows.push( remember(row, decl.line) )
      addDocRow('relation', decl.line, docInputs(decl))
      return
    }

    const head = resolveHead(decl)
    const { aliases, extraRows, flags, noInternal } =
      gatherSurfaces(decl, group, head)
    const sorted = sortAliases(aliases)

    // tail parts: keyword groups beyond the first, one hole after each
    const mkTail = analysis => analysis.kwGroups.slice(1).map( kws =>
      ({ kws: [ mkAlias(kws, defaultRegime(kws)) ] }) )

    const baseRow = (h, analysis, info, als) => {
      const row = { head: h }
      if ( info?.shape === 'param' ) row.paramize = true
      if ( info?.shape === 'neg' ) row.wrapNeg = true
      Object.assign( row, derivedFmt(decl, info) )
      if ( flags.bareRight ) row.bareRight = true
      row.aliases = als
      const tail = mkTail(analysis)
      if ( tail.length ) row.tail = tail
      return row
    }

    if ( sorted.length ) {
      const row = baseRow(head, a, rhsInfo, sorted)
      tables.relationRows.push( remember(row, decl.line) )
    }
    extraRows.forEach( ({ surface, analysis, rhsInfo: info }) => {
      const als = sortAliases( [
        mkAlias( analysis.kwGroups[0],
                 defaultRegime(analysis.kwGroups[0]) ) ] )
      const row = baseRow( info?.head ?? head, analysis, info, als )
      tables.relationRows.push( remember(row, surface.line) )
    } )

    deriveWordTables(sorted, head, decl, rhsInfo, noInternal, a.holes)
    // leaf marks a hole-free rendering: the row prints as an ordinary
    // infix join of that rendering (headJoinTex in notation-tables.js -
    // the zero-JS-edit path for new rows), while a
    // hole-referencing template stays printer work.  ¬-wrapped desugar
    // rows are excluded: their tex renders the negated FORM (the
    // printer's ¬ case, via the fixed fmt marker), not the head - the
    // notin row must not claim ∈'s join
    if ( decl.fields.tex !== undefined && rhsInfo?.shape !== 'neg' )
      extras.texTemplates.push( { head, tex: decl.fields.tex,
                                  leaf: !texIsTemplate(decl.fields.tex, a.holes),
                                  line: decl.line } )
    // a ¬-wrapped desugar row's tex renders its fixed marker (the same
    // keyword derivedFmt records as fmtFixed): neq → \neq, notin →
    // \notin - the printers' derived negFixedTex table
    else if ( decl.fields.tex !== undefined && rhsInfo?.shape === 'neg' ) {
      const kw = decl.pattern.split(/\s+/).find( t => !isLetter(t) )
      if ( extras.negFixedTex[kw] === undefined )
        extras.negFixedTex[kw] = `${decl.fields.tex} `
    }
    if ( decl.fields.example !== undefined )
      extras.examples.push( { example: decl.fields.example, line: decl.line } )
    addDocRow('relation', decl.line, docInputs(decl))
  } )

  // infix groups: the first infix group (before any relation group) is
  // the propositional band, later ones the set/algebraic band; anchors
  // are assigned positionally from the engine's precedence ladder by the
  // caller (compileInfixBands below)
  const infixBands = { prop: [], setAlg: [] }
  let sawRelationGroup = false

  const compileInfixGroup = group => {
    const band = sawRelationGroup ? 'setAlg' : 'prop'
    const groupFields = Object.fromEntries(
      group.fields.map( f => [ f.name, f.value ] ) )
    const sharedLevel = groupFields.level !== undefined
    group.decls.forEach( decl => {
      const rhsInfo = decl.rhs === null ? null
                                        : parseRhs(decl.rhs, decl.line, err)
      const a = analyzePattern(decl.pattern, rhsInfo, decl.line, err)
      const head = resolveHead(decl)
      const { aliases, flags, noInternal } = gatherSurfaces(decl, group, head)
      const sorted = sortAliases(aliases)
      const assocSrc = decl.fields.assoc ?? groupFields.assoc
      const assoc = assocSrc === 'nary' ? 'flat' : assocSrc
      const row = { head, assoc }
      if ( flags.inv !== undefined ) row.inv = flags.inv
      // the rendering rule at surface level: a row whose
      // primary keyword is a word with no tex: echoes the typed synonym
      // per joint (fmt.srcs - the and/or rows; their vee/wedge surfaces
      // carry their own tex: and render symbolically via the printer's
      // joint table)
      const primaryKw = decl.pattern.split(/\s+/).find( t => !isLetter(t) )
      if ( decl.fields.tex === undefined && primaryKw !== undefined &&
           !isGlyphToken(primaryKw) ) row.fmtKey = 'src'
      if ( flags.signed ) row.signed = true
      if ( groupFields.params === 'ok' ) row.params = true
      row.aliases = sorted
      row.sharedLevel = sharedLevel
      infixBands[band].push( remember(row, decl.line) )
      deriveWordTables(sorted, head, decl, rhsInfo, noInternal, a.holes)
      if ( decl.fields.tex !== undefined )
        extras.texTemplates.push( { head, tex: decl.fields.tex,
                                    leaf: !texIsTemplate(decl.fields.tex,
                                                         a.holes),
                                    line: decl.line } )
      if ( decl.fields.example !== undefined )
        extras.examples.push( { example: decl.fields.example,
                                line: decl.line } )
      addDocRow(band, decl.line, docInputs(decl))
    } )
  }

  // ── chain families ───────────────────────────────────────────────────
  // one chainFamilies row per section: the family name and flags, then
  // one member op per declaration (strength order = file order), each
  // with its sorted surfaces and derived word tables
  const compileChainGroup = group => {
    const groupFields = Object.fromEntries(
      group.fields.map( f => [ f.name, f.value ] ) )
    const fam = { family: group.name }
    if ( group.param ) fam.param = true
    if ( groupFields.bare === 'left' ) fam.bareLeft = true
    fam.ops = group.decls.map( decl => {
      const rhsInfo = decl.rhs === null ? null
                                        : parseRhs(decl.rhs, decl.line, err)
      const a = analyzePattern(decl.pattern, rhsInfo, decl.line, err)
      const head = resolveHead(decl)
      const { aliases, noInternal } = gatherSurfaces(decl, group, head)
      const sorted = sortAliases(aliases)
      deriveWordTables(sorted, head, decl, rhsInfo, noInternal, a.holes)
      if ( decl.fields.tex !== undefined )
        extras.texTemplates.push( { head, tex: decl.fields.tex,
                                    leaf: !texIsTemplate(decl.fields.tex,
                                                         a.holes),
                                    line: decl.line } )
      if ( decl.fields.example !== undefined )
        extras.examples.push( { example: decl.fields.example,
                                line: decl.line } )
      return { head, aliases: sorted }
    } )
    tables.chainFamilies.push( remember(fam, group.line) )
    addDocRow('chain', group.line,
      [ ...new Set( group.decls.flatMap(docInputs) ) ])
  }

  // ── big operators ────────────────────────────────────────────────────

  // recognize a form line's shape from its tokens after the name
  const bigFormOf = (toks, line) => {
    const t = toks.join(' ')
    if ( toks[0] === '(' || toks[0]?.startsWith('(') ) {
      const args = t.replace(/[()]/g, ' ').split(/[,\s]+/)
        .filter( s => s.length )
      // 4 arguments: the summation-style Algebrite call ⟨op⟩(f,k,a,b);
      // 3: the indexed-set call ⟨op⟩(B,k,S); 2: the indefinite call
      if ( args.length === 4 || args.length === 3 ) return 'call'
      if ( args.length === 2 ) return 'callIndef'
      return { error: `${args.length}-argument call form` }
    }
    if ( /^\w = \w to \w of \w$/.test(t) ) return 'eq'
    if ( /^\w to \w of \w$/.test(t) ) return 'eq'          // optional lower
    if ( /^\w in \w of \w$/.test(t) ) return 'inOf'
    if ( /^(of )?\w for \w in \w$/.test(t) ) return 'forIn'
    if ( /^\w d\w$/.test(t) ) return 'd'
    return { error: `unrecognized form shape` }
  }

  const bigopSections = []
  const compileBigopSection = group => {
    const groupFields = Object.fromEntries(
      group.fields.map( f => [ f.name, f.value ] ) )
    const section = { name: group.name, line: group.line,
                      fields: groupFields, forms: [] }
    group.decls.forEach( decl => {
      const surfaces = [ { pattern: decl.pattern, rhs: decl.rhs,
                           line: decl.line } ]
      // also: surfaces of a form line are optional-part variants of the
      // same registered shape; recognize and require agreement
      surfaces.push( ...decl.also )
      const toks0 = decl.pattern.split(/\s+/)
      const name = toks0[0].replace(/\(.*/, '')
      const restTokens = p => {
        const toks = p.split(/\s+/)
        const lead = toks[0]
        const tail = lead.slice(name.length)
        const rest = tail.length ? [ tail, ...toks.slice(1) ] : toks.slice(1)
        // normalize parenthesized calls to spaced tokens
        return rest.join(' ').replace(/[(),]/g, c => ` ${c} ` )
          .split(/\s+/).filter( s => s.length )
      }
      const form = bigFormOf( restTokens(decl.pattern), decl.line )
      if ( form === null || typeof form === 'object' ) {
        err(decl.line, `cannot read big-operator form` +
                       ` '${decl.pattern}'${ form?.error ? `: ${form.error}` : '' }`)
        return
      }
      decl.also.forEach( s => {
        const alsoForm = bigFormOf( restTokens(s.pattern), s.line )
        if ( alsoForm !== form )
          err(s.line, `variant '${s.pattern}' is not the same registered` +
                      ` shape as '${decl.pattern}'`)
      } )
      const headOverride = decl.rhs === null ? null : decl.rhs.trim()
      section.forms.push( { name, form, head: headOverride,
                            line: decl.line } )
      if ( decl.fields.example !== undefined )
        extras.examples.push( { example: decl.fields.example,
                                line: decl.line } )
    } )
    bigopSections.push(section)
    // the docs pool for the whole section: every form line's surfaces,
    // the names: synonyms substituted into the section-name forms, and
    // the example: instances (form lines using a restricted name like
    // defint document only their own spelling)
    const extraNames = groupFields.names?.split(',')
      .map( s => s.trim() ).filter( s => s.length ) ?? []
    const pool = []
    group.decls.forEach( decl => {
      ;[ decl.pattern, ...decl.also.map( s => s.pattern ) ].forEach( p => {
        pool.push(p)
        if ( p.startsWith(group.name) )
          extraNames.forEach( n => pool.push( n + p.slice(group.name.length) ) )
      } )
      if ( decl.fields.example !== undefined )
        pool.push( decl.fields.example )
    } )
    addDocRow('bigop', group.line, [ ...new Set(pool) ])
  }

  const compileBigops = () => bigopSections.forEach( section => {
    const { name, fields, forms, line } = section
    const ci = fields.case === 'any'
    // the row head is the call form's head (the Algebrite-canonical
    // form), defaulting to the section name
    const callForm = forms.find( f => f.form === 'call' && f.name === name )
      ?? forms.find( f => f.form === 'call' )
    const head = callForm?.head ?? name
    // form specs: body-hole class from the registered shape's closedness
    // (closed forms are delimited, so their bodies are the wide 'alg'
    // class; open English bodies are 'prod' - the settled precedence
    // design), overridden to 'set' by body: set
    const closedForms = new Set( [ 'call', 'callIndef', 'd' ] )
    const formSpecs = {}
    forms.forEach( f => {
      const cls = fields.body === 'set' ? 'set'
                : closedForms.has(f.form) ? 'alg' : 'prod'
      const spec = { f: cls }
      const formHead = f.head ?? ( f.name === name ? head : null )
      if ( formHead !== null && formHead !== head ) spec.head = formHead
      if ( formSpecs[f.form] === undefined ) formSpecs[f.form] = spec
    } )
    // unit placement, derived per the 4a decision (unit: deleted on
    // faith): rows with only closed forms are ordinary tight prefixes;
    // set-bodied rows sit in the alg unit (the indexed-set operators,
    // which the PROD..STAR levels may not apply to directly); the rest
    // are prod units
    const unit = forms.every( f => closedForms.has(f.form) ) ? 'prefix'
               : fields.body === 'set' ? 'alg' : 'prod'
    // names: the section name, declared extra names, then names
    // introduced by form lines (defint), restricted to exactly the forms
    // they appear on; reachability then wants any name that is an
    // extension of another to come first (the dead-'integral' mechanism),
    // so topologically hoist extensions above their prefixes, stably
    const nameList = [ name, ...( fields.names?.split(',')
      .map( s => s.trim() ).filter( s => s.length ) ?? [] ) ]
    const introduced = [ ...new Set( forms.map( f => f.name )
      .filter( n => !nameList.includes(n) ) ) ]
    const restricted = Object.fromEntries( introduced.map( n =>
      [ n, [ ...new Set( forms.filter( f => f.name === n )
                              .map( f => f.form ) ) ] ] ) )
    let names = [ ...nameList, ...introduced ]
    // stable prefix-hoist: move any name up past names that are its
    // proper prefixes
    for ( let i = 1; i < names.length; i++ ) {
      let j = i
      while ( j > 0 && names[i].startsWith(names[j-1]) &&
              names[i] !== names[j-1] ) j--
      if ( j < i ) names.splice( j, 0, names.splice(i, 1)[0] )
    }
    const mkName = n => {
      const entry = { lit: n }
      if ( ci ) entry.i = true
      if ( restricted[n] ) entry.only = restricted[n]
      return entry
    }
    const row = { head, unit, names: names.map(mkName), forms: formSpecs }
    tables.bigOpRows.push( remember(row, line) )
    // the section's tex: feeds Declare-name rendering for every DECLARED
    // name (section name + names: - not the form-introduced Algebrite
    // aliases like defint), the same one-tex-feeds-every-map rule as the
    // word aliases (spec §6)
    if ( fields.tex !== undefined )
      nameList.forEach( n => addTexSymbol(n, fields.tex) )
    if ( fields['tex-open'] !== undefined || fields.texOpen !== undefined )
      extras.texOpen[head] = fields.texOpen ?? fields['tex-open']
  } )

  // ── constants ────────────────────────────────────────────────────────

  // heads whose words are engine quantifier operators: their multi-word
  // phrases rename to the engine word, not to the glyph
  const engineWordOfHead = Object.fromEntries(
    Object.entries(engineInternalNames).map( ([w, h]) => [ h, w ] ) )

  const blackboard = new Set( [ 'ℕ', 'ℤ', 'ℚ', 'ℝ', 'ℂ', '𝕀', '𝕆' ] )
  const identityRenames = [], wordRenames = []

  const compileConstantGroup = group => group.decls.forEach( decl => {
    const head = decl.pattern
    const words = decl.fields.words ?? []
    // plain single words rename in the tokenizer's leading-symbol pass;
    // everything else ('exists unique', 'exists!', quoted rule names) is
    // a phrase replacement
    const single = words.filter( w => /^[A-Za-z][A-Za-z0-9]*$/.test(w) )
    const multi  = words.filter( w => !single.includes(w) )
    // the phrase-rename target: a single-word alias, else the engine
    // operator word for this head, else the head itself (camelCase
    // constant names)
    const target = single[0] ?? engineWordOfHead[head] ?? head
    // a multi-character glyph head is itself a phrase replacement (∃!,
    // →←); single glyphs are the unicode section's business
    if ( !/^[A-Za-z0-9]+$/.test(head) && [ ...head ].length > 1 &&
         !blackboard.has(head) && head !== target )
      tables.phrases.push( [ head, target ] )
    multi.forEach( w => tables.phrases.push( [ w, target ] ) )
    // single-word renames: blackboard heads are also directly typable;
    // heads that are engine operator words' canonical symbols (∀, ∃, ∃!)
    // get no renames - the grammar consumes the word itself
    if ( blackboard.has(head) ) {
      identityRenames.push( { lit: head, out: head } )
      single.forEach( w => wordRenames.push( { lit: w, out: head } ) )
    } else if ( single.length && head !== target &&
                engineWordOfHead[head] === undefined )
      single.forEach( w => wordRenames.push( { lit: w, out: head } ) )
    // tex renderings: word aliases and the phrase target
    if ( decl.fields.tex !== undefined ) {
      if ( /^[A-Za-z]/.test(head) ) addTexSymbol(head, decl.fields.tex)
      single.forEach( w => addTexSymbol(w, decl.fields.tex) )
      if ( target !== head && !single.includes(target) )
        addTexSymbol(target, decl.fields.tex)
      // quantifier heads are mentionable operators
      if ( engineWordOfHead[head] !== undefined )
        addHeadTex(head, decl.fields.tex, [])
    } else if ( multi.length && /^[A-Za-z]/.test(head) )
      // an English phrase constant with no tex renders as its text
      addTexSymbol(head, `\\text{${ multi.find( w => !w.startsWith('"') )
                                    ?? multi[0] }}`)
    if ( decl.fields.example !== undefined )
      extras.examples.push( { example: decl.fields.example,
                              line: decl.line } )
    // docs: only constants with synonyms or an example (tex-only heads
    // like the emoji block are rendering data, not typable notation
    // worth a docs box)
    if ( words.length || decl.fields.example !== undefined )
      addDocRow('constant', decl.line, docInputs(decl))
  } )

  // ── delimited forms ──────────────────────────────────────────────────
  //
  // (the tex-template splitter these rows use is the module-level
  // splitDelimitedTex above, exported so notation-tables.js can share it)
  //
  // A delimited form is a fixed-arity pattern that begins and ends with
  // delimiter tokens, with one expression hole between each adjacent
  // pair - `[ G : H ]` for the index of a subgroup, `⌊ x ⌋` for floor.
  // Because the form carries its own delimiters, no precedence question
  // can arise at its edges, so closedness is the group's definition
  // rather than a per-row field: every member is a closed unit (valid in
  // any hole, takes the postfixes, serves as an exponent base) by
  // construction.  The grammar's TableDelimited rule matches these rows.
  const compileDelimitedGroup = group => group.decls.forEach( decl => {
    const bad = msg => {
      err(decl.line, `delimited form '${decl.pattern}': ${msg}`)
    }
    // no synonym surfaces on delimited rows - refuse loudly rather than
    // silently dropping them
    if ( decl.also.length || decl.fields.words !== undefined )
      return bad(`synonym surfaces are not supported`)
    // the -> rewrite is required, and must apply a head directly to hole
    // letters.  An infix row's keyword can name its head (`a leq b`
    // needs no arrow) but delimiters cannot name anything - and the
    // head's prefix call form (index(G,H)) already parses with no help
    // from this table, so a row only contributes the delimited surface.
    if ( decl.rhs === null )
      return bad(`a -> rewrite naming the head is required`)
    const rhsInfo = parseRhs(decl.rhs, decl.line, err)
    if ( rhsInfo === null ) return
    if ( rhsInfo.shape !== 'plain' ||
         !rhsInfo.args.every( x => typeof x === 'string' ) )
      return bad(`the rewrite must be a plain (head hole...) application`)
    // the pattern is its whitespace-separated token list, and must
    // strictly alternate delimiter, hole, ..., delimiter, so n holes
    // means 2n+1 tokens.  The grammar has one shape rule per arity
    // (peggy sequences are static), so the arity cap here and the
    // Delimited1/Delimited2/... shapes grow together
    const toks = decl.pattern.split(/\s+/)
    if ( toks.length < 3 || toks.length % 2 === 0 )
      return bad(`the pattern must alternate delimiter, hole, ...,` +
                 ` delimiter`)
    if ( toks.length > 5 )
      return bad(`at most 2 holes are supported (the grammar needs a` +
                 ` wider shape rule for more)`)
    // even positions are delimiters, which must be non-word tokens (a
    // word there would collide with ordinary symbols users type); odd
    // positions are distinct single-letter holes
    const delims = [], holes = []
    let ok = true
    toks.forEach( (t, k) => {
      if ( k % 2 === 0 ) {
        if ( !isGlyphToken(t) ) {
          bad(`delimiter '${t}' is not a non-word token`); ok = false
        }
        delims.push(t)
      } else {
        if ( !isLetter(t) ) {
          bad(`hole '${t}' is not a single letter`); ok = false
        } else if ( holes.includes(t) ) {
          bad(`hole '${t}' repeats`); ok = false
        }
        holes.push(t)
      }
    } )
    if ( !ok ) return
    // the rewrite may list the holes in any order, but must use each
    // exactly once; record the permutation only when it is not the
    // identity (argOrder[i] = which pattern hole is the head's i-th
    // argument)
    const argOrder = rhsInfo.args.map( x => holes.indexOf(x) )
    if ( rhsInfo.args.length !== holes.length || argOrder.includes(-1) ||
         new Set(argOrder).size !== argOrder.length )
      return bad(`the rewrite must use each pattern hole exactly once`)
    // assemble the row; remember() tags it with its file line so linter
    // messages can point at the source.  The tex: rides on the row
    // itself rather than extras.texTemplates: a delimited tex: is
    // inherently a hole-referencing template, but texIsTemplate's
    // heuristics would misread one like \left[G:H\right] as a leaf
    // rendering and wrongly feed the derived headJoinTex map, so the
    // printers read it from the row instead
    const row = { kind: 'delimited', head: rhsInfo.head, delims, holes }
    if ( argOrder.some( (v, i) => v !== i ) ) row.argOrder = argOrder
    // a tex: template must reference every hole (splitDelimitedTex's
    // standalone-letter rule), or a hole's value would vanish from the
    // rendering; a row with no tex: renders by echoing its delimiters
    // (see delimitedTexTemplates in notation-tables.js)
    if ( decl.fields.tex !== undefined ) {
      const split = splitDelimitedTex( decl.fields.tex, holes,
                                       row.argOrder ?? null )
      if ( split.missing )
        return bad(`tex: never references hole(s)` +
                   ` '${split.missing.join("', '")}'`)
      row.tex = decl.fields.tex
    }
    tables.delimitedRows.push( remember(row, decl.line) )
    // examples and the docs-page surface pool, like every other group
    if ( decl.fields.example !== undefined )
      extras.examples.push( { example: decl.fields.example,
                              line: decl.line } )
    addDocRow('delimited', decl.line, docInputs(decl))
  } )

  // ── walk the groups in file order ────────────────────────────────────
  parsed.groups.forEach( group => {
    if ( group.kind === 'relation' ) { sawRelationGroup = true
                                       compileRelationGroup(group) }
    else if ( group.kind === 'infix' ) compileInfixGroup(group)
    else if ( group.kind === 'chain' ) compileChainGroup(group)
    else if ( group.kind === 'bigopRow' ) compileBigopSection(group)
    else if ( group.kind === 'constant' ) compileConstantGroup(group)
    else if ( group.kind === 'delimited' ) compileDelimitedGroup(group)
  } )
  compileBigops()

  // splice the isa registry rows at the first isa surface's position
  if ( tables.isaNouns.length ) {
    const rows = isaRows()
    tables.relationRows.splice( isaSpliceAt, 0, ...rows )
  }
  tables.relationRows = tables.relationRows.map( row => {
    if ( row.kind === 'relation' ) return row
    const stamped = { kind: 'relation', prec: 'REL', ...row }
    lineOf.set( stamped, lineOf.get(row) )
    return stamped
  } )

  // ── the infix bands get positional anchors from the engine ladder ────
  // (the anchor names and their order are engine facts; the file declares
  // who sits on the ladder, loosest first)
  const compileInfixBands = precedence => {
    const rel = precedence.REL
    const anchors = Object.entries(precedence)
      .sort( (a, b) => a[1] - b[1] ).map( e => e[0] )
    const propAnchors = anchors.filter( n => precedence[n] < rel )
    const algAnchors  = anchors.filter( n => precedence[n] > rel )
    const assign = (rows, anchorList, kind, band) => {
      let k = 0
      const out = []
      rows.forEach( (row, i) => {
        // rows in a shared-level group reuse one anchor
        if ( row.sharedLevel && i > 0 && rows[i-1].sharedLevel ) k--
        const prec = anchorList[k++]
        if ( prec === undefined ) {
          errors.push(`line ${ lineOf.get(row) ?? '?' }: too many ${band}` +
                      ` rows for the engine precedence ladder`)
          return
        }
        const { sharedLevel, ...rest } = row
        const stamped = { kind, head: rest.head, prec,
                          assoc: rest.assoc,
                          ...( rest.fmtKey ? { fmtKey: rest.fmtKey } : {} ),
                          ...( rest.signed ? { signed: true } : {} ),
                          ...( rest.inv ? { inv: rest.inv } : {} ),
                          ...( band === 'setAlg'
                               ? { hole: prec === 'STAR' ? 'star' : 'full' }
                               : {} ),
                          ...( rest.params ? { params: true } : {} ),
                          aliases: rest.aliases }
        lineOf.set( stamped, lineOf.get(row) )
        out.push(stamped)
      } )
      if ( k < anchorList.length )
        errors.push(`the ${band} band declares ${k} levels but the engine` +
                    ` ladder has ${anchorList.length}`)
      return out
    }
    tables.propRows = assign( infixBands.prop, propAnchors, 'infix', 'prop' )
    tables.setAlgRows = assign( infixBands.setAlg, algAnchors, 'infix',
                                'setAlg' )
  }

  // ── the unicode section and latex names ──────────────────────────────
  parsed.unicode.forEach( ({ glyph, word, line }) => {
    if ( toxicGlyphs.has(glyph) ) { extras.toxic.push( [ glyph, word ] ); return }
    if ( tables.UnicodeNames[glyph] !== undefined &&
         tables.UnicodeNames[glyph] !== word )
      err(line, `'${glyph}' already rewrites to` +
                ` '${tables.UnicodeNames[glyph]}'`)
    tables.UnicodeNames[glyph] = word
  } )
  Object.assign( tables.UnicodeNames, engineUnicodeRewrites )
  ;( parsed.latexNames?.words ?? [] ).forEach( w =>
    addTexSymbol(w, `\\${w}`) )

  // ── engine merges and ordered assembly ───────────────────────────────
  Object.entries(engineInternalNames).forEach( ([w, h]) => addInternal(w, h) )
  Object.entries(engineTexSymbols).forEach( ([w, t]) => addTexSymbol(w, t) )
  Object.entries(engineOperatorHeadTex).forEach( ([h, t]) => {
    if ( tables.operatorHeadTex[h] === undefined )
      tables.operatorHeadTex[h] = t
  } )
  tables.putdownLeadingSymbolRenames = [
    ...validationMarks.map( m => ({ lit: m, out: m }) ),
    ...identityRenames, ...wordRenames ]

  return { tables, lineOf, errors, extras, compileInfixBands }
}

/**
 * Parse and compile the notation file in one call.  The engine precedence
 * ladder is passed in (anchor definitions are engine facts, spec §1);
 * infix rows are assigned anchors positionally, loosest first.
 *
 * @param {string} text - the notation file text
 * @param {object} precedence - the named anchor ladder from
 *   notation-tables.js
 * @returns {{tables: object, lineOf: Map, errors: string[], extras: object}}
 */
export const loadNotation = (text, precedence) => {
  const parsed = parseNotationFile(text)
  const result = compileNotation(parsed)
  result.compileInfixBands(precedence)
  delete result.compileInfixBands
  return result
}
