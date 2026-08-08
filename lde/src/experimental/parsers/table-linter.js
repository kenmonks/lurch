///////////////////////////////////////////////////////////////////////////
// Load-time linter for the Lurch notation tables
//
// Phase 3e of the parser upgrade (roadmap §3.2): the notation tables are
// data consumed by matching machinery with specific structural assumptions
// - ordered first-match-wins alias lists, a bounded rank fallback, word
// classification maps, and Declare/mention head agreement.  A table edit
// that violates one of those assumptions does not fail loudly on its own:
// it silently reorders parses or splits one operator into two different
// atoms, exactly the failure mode the old hand-ordered PEG alternatives
// had.  This module checks every such assumption and reports violations
// immediately.  It is invoked once, when the parser module loads (see the
// global initializer in lurch-to-putdown.peggy), so a bad table throws on
// load instead of misparsing quietly; the golden-test harness also runs it
// (and, unlike the load-time hook, fails on warnings too).  In Phase 4 the
// same checks become the user-facing error channel for instructor-declared
// notation rows.
//
// The checks, each tied to the mechanism that relies on it:
//
//   - alias well-formedness: case-insensitive words must be written
//     lowercase (aliasMatch and matchOrderedLiteral compare with
//     toLowerCase, as peggy compiles 'w'i literals), trailing regimes must
//     be one of space/bound/any, pattern tails may have at most ONE part
//     (the grammar's RelStep rules consume tail[0] only), and argOrder
//     must be a permutation of the pattern's argument positions.
//   - within-row alias reachability: the row matcher returns a row's FIRST
//     matching alias, so an alias whose canonical text an earlier alias of
//     the same row also matches can never be selected on that text.
//   - rank capacity: the grammar retries the ranked relation matcher at
//     ranks 0-2 (RelStep0/1/2), so every relation row must match its own
//     canonical alias texts at rank ≤ 2; the prop/setAlg/paramOp matchers
//     are consulted at rank 0 only, so those tables' keywords must be
//     pairwise disjoint.
//   - big-operator name reachability: the name matchers return the first
//     matching literal across a unit class, with no boundary check (what
//     follows is the shape rule's business), so a name that begins with an
//     earlier name in the same class is unreachable - the exact mechanism
//     that made the old grammar's 'integral' alias dead code (see the
//     Phase 3c decision log).  Alias form restrictions (only:) must name
//     forms the row actually has.
//   - auto-declared-constants agreement: the engine (interpret.js) imports
//     autoDeclaredConstants and declares those heads system constants, so a
//     Rule using a big-operator head with no Declare cannot treat it as a
//     metavariable (the sum := defint soundness hazard - see the 2026-07-27
//     decision log entry).  The list must stay exactly "every bigOpRows
//     head including the form overrides"; drift in either direction (a new
//     row or override missing from the list, or a stale extra entry) breaks
//     that contract silently, since the engine never sees the tables.
//   - word-classification collisions: classifyWordAt's maps keep the first
//     writer, so two tables claiming the same word with different
//     classifications (structural vs operator, or different canonical
//     heads) would silently resolve to whichever loaded first.
//   - Declare/mention agreement: `Declare w` renders w through the
//     internal-name table while `(w)` mentions the word's classified head;
//     if the two disagree, the declared atom and the mentioned atom are
//     silently DIFFERENT symbols (this check found the times/× and are/is
//     drifts when it was written).
//   - ordered-literal lists (leading symbol renames) and the phrase table:
//     first-match and sequential-replacement semantics make an entry
//     shadowed by an earlier prefix/substring unreachable or corrupted.
//   - tex leaf coverage (warning): a mentionable non-ASCII head missing
//     from the tex leaf maps renders as the raw glyph in tex output.
//
// The linter is read-only over the tables and runs in well under a
// millisecond; it imports the same matcher (makeRowMatcher) the parser
// uses, so its probes cannot drift from the real matching semantics.

import * as liveTables from './notation-tables.js'
import { makeRowMatcher, wordClassClaims as liveWordClassClaims,
         chainOpRows as liveChainOpRows } from './expression-core.js'
const { bigOpFormShapes, structuralKeywords, operatorGlyphs } = liveTables

// The form shapes the grammar implements (BigCall, BigEq, BigCallIndef,
// BigD, BigLimInOf/BigLimForIn and the BigOver variants) are registered
// in bigOpFormShapes (Phase 3f), each with its closed flag; a bigOpRows
// form key outside that registry is a row the grammar cannot
// instantiate, and a registry entry without a boolean closed flag would
// silently gate its shape out of both the BigOpen and BigClosed layers
// (the grammar's groupings test the flag on every attempt).
const knownBigForms = Object.keys( bigOpFormShapes )
const knownUnits = [ 'prod', 'alg', 'prefix' ]
const knownHoleClasses = [ 'prod', 'alg', 'set' ]
const knownRegimes = [ 'bound', 'any' ]
// the climb-row schema (assoc/per-hole-precedence slice, 2026-07-29):
// every prop/setAlg row declares its associativity, and every setAlg row
// the unit class of its holes; the grammar dispatches on exactly these
// values (resolveClimb's assoc branches, the StarUnit/FullUnit hole
// guards), so an unknown value would silently fall into another branch
const knownAssoc = [ 'flat', 'left', 'right', 'none' ]
const knownHoles = [ 'full', 'star' ]

// canonical probe text for an alias: its words joined by single spaces,
// with a leading space and a trailing ' z' (satisfying both trailing
// regimes); probes run at position 1
const probeText = a => ' ' + a.words.map( w => w.w ).join(' ') + ' z'

/**
 * Lint the notation tables against the structural assumptions of the
 * matching machinery (see the module header for the full list of checks).
 * Pure and read-only: returns the findings, throws nothing.
 *
 * By default the live tables in notation-tables.js (compiled from
 * lurch-notation.txt since the Phase 4c flip) are linted.  A caller may
 * pass other tables instead - the freshness gate lints a fresh compile of
 * the .txt on disk (any subset of the declarable exports plus derived
 * wordClassClaims / chainOpRows / internal / autoDeclaredConstants) - and
 * may pass lineOf, a Map from row objects to their lurch-notation.txt
 * line numbers, which the linter appends to every message naming a row,
 * so a bad declaration is reported at its file line.
 *
 * @param {object} [tables] - overrides for any consulted table
 * @param {Map} [lineOf] - row object → notation-file line number
 * @returns {{errors: string[], warnings: string[]}} human-readable
 *   findings; errors are violations that misparse or split atoms,
 *   warnings are cosmetic (currently: tex leaf coverage)
 */
// (declared with `function`, not an arrow, so the export is initialized
// before this module's body runs and load order cannot matter)
export function lintNotationTables (tables = null, lineOf = null) {
  const { relationRows, propRows, setAlgRows, bigOpRows, paramOpRows,
          precedence, chainFamilies, isaNouns, internal, phrases,
          putdownLeadingSymbolRenames, operatorHeadTex, texSymbols,
          autoDeclaredConstants, delimitedRows, UnicodeNames,
          operatorGlyphs } =
    { ...liveTables, ...( tables ?? {} ) }
  const wordClassClaims = tables?.wordClassClaims ?? liveWordClassClaims
  const chainOpRows = tables?.chainOpRows ?? liveChainOpRows
  // a short human-readable name for a row in messages, with its notation-
  // file line when provenance is available
  const atLine = row => lineOf?.get(row) !== undefined
    ? ` [lurch-notation.txt:${ lineOf.get(row) }]` : ''
  const rowName = row => `'${row.head}' (${ row.aliases
    .map( a => a.words.map( w => w.w ).join(' ') ).join(' / ') })` +
    atLine(row)
  const errors = [], warnings = []
  const err = m => errors.push(m)
  const warn = m => warnings.push(m)

  ///////////////////////////////////////////////////////////////////////
  // alias well-formedness + within-row reachability + rank capacity
  const rowTables = [
    { name: 'relationRows', rows: relationRows, maxRank: 2 },
    { name: 'propRows',     rows: propRows,     maxRank: 0 },
    { name: 'setAlgRows',   rows: setAlgRows,   maxRank: 0 },
    { name: 'paramOpRows',  rows: paramOpRows,  maxRank: 0 },
    // the chain-operator token rows (one per chainFamilies op): the
    // grammar retries ChainTok0/ChainTok1, so rank capacity is 1 - the
    // two cong rows (parameterized before bare) are the one shared token
    { name: 'chainFamilies', rows: chainOpRows, maxRank: 1 }
  ]
  const checkAliasShape = (where, a) => {
    if ( !a.words?.length ) err(`${where}: alias with no words`)
    a.words?.forEach( w => {
      if ( !w.w ) err(`${where}: empty alias word`)
      if ( w.i && w.w !== w.w.toLowerCase() )
        err(`${where}: case-insensitive word '${w.w}' must be lowercase`)
    } )
    if ( a.after !== undefined && !knownRegimes.includes(a.after) )
      err(`${where}: unknown trailing regime '${a.after}'`)
  }
  rowTables.forEach( ({ name, rows, maxRank }) => {
    const match = makeRowMatcher(rows)
    rows.forEach( row => {
      const where = `${name} row ${rowName(row)}`
      if ( !row.aliases?.length ) { err(`${where}: no aliases`); return }
      row.aliases.forEach( a => checkAliasShape(where, a) )
      if ( row.prec !== undefined && precedence[row.prec] === undefined )
        err(`${where}: unknown precedence level '${row.prec}'`)
      // pattern tails: the grammar consumes tail[0] only
      if ( row.tail !== undefined ) {
        if ( row.tail.length !== 1 )
          err(`${where}: tail has ${row.tail.length} parts;` +
              ` the RelStep rules support exactly one`)
        row.tail.forEach( part => {
          if ( !part.kws?.length ) err(`${where}: tail part with no keywords`)
          part.kws?.forEach( a => checkAliasShape(`${where} tail`, a) )
          // tail keyword reachability (first match wins, as in matchTailKw)
          const tailMatch = makeRowMatcher([ { aliases: part.kws } ])
          part.kws?.forEach( a => {
            const m = tailMatch(probeText(a), 1, 0)
            const src = a.words.map( w => w.w ).join(' ')
            if ( m?.src !== src )
              err(`${where}: tail keyword '${src}' is unreachable behind` +
                  ` '${m?.src}'`)
          } )
        } )
      }
      if ( row.argOrder !== undefined ) {
        const holes = 2 + ( row.tail?.length ?? 0 )
        const sorted = [ ...row.argOrder ].sort()
        if ( row.argOrder.length !== holes ||
             sorted.some( (v, k) => v !== k ) )
          err(`${where}: argOrder [${row.argOrder}] is not a permutation` +
              ` of 0..${holes - 1}`)
      }
      row.aliases.forEach( a => {
        const src = a.words.map( w => w.w ).join(' ')
        const text = probeText(a)
        // within-row reachability: this row's first matching alias on this
        // alias' own canonical text must be this alias
        const own = makeRowMatcher([ row ])(text, 1, 0)
        if ( own?.src !== src )
          err(`${where}: alias '${src}' is unreachable behind earlier` +
              ` alias '${own?.src}' of the same row`)
        // rank capacity: the row must win on its own canonical text within
        // the ranks the grammar retries
        let rank = 0, at = -1, m
        while ( ( m = match(text, 1, rank) ) !== null ) {
          if ( m.row === row && at < 0 ) at = rank
          rank++
        }
        if ( at < 0 )
          err(`${where}: row never matches its own alias '${src}'`)
        else if ( at > maxRank )
          err(`${where}: alias '${src}' resolves at rank ${at}, but this` +
              ` table is consulted at rank${ maxRank ? 's 0-' + maxRank
                                                     : ' 0 only' }`)
        if ( maxRank === 0 && rank > 1 )
          err(`${where}: alias '${src}' also matches another row of a` +
              ` rank-0-only table (keywords must be pairwise disjoint)`)
        else if ( rank > maxRank + 1 )
          err(`${where}: ${rank} rows match at alias '${src}', but the` +
              ` grammar retries at most ${maxRank + 1} ranks of this table`)
      } )
    } )
  } )

  ///////////////////////////////////////////////////////////////////////
  // delimited-form rows: delimiter legality, reachability, and capacity.
  // The TableDelimited machinery matches a row's opener in operand
  // position and its later delimiters each in a private slot, so the
  // checks differ by position: the opener must not be a token any other
  // machinery claims, while interior delimiters need only survive the
  // tokenizer and avoid the structurally reserved tokens (the index
  // row's ':' separator coexists with the Maps relation ':' precisely
  // because separators are matched only in their own slot).
  {
    const dName = row => `delimitedRows '${row.head}'` +
      ` (${ row.delims.join(' … ') })` + atLine(row)
    // tokens the tokenizer or the grammar structure already own: quoted
    // spans and comments never reach the expression rules, parentheses
    // are the grouping surface, and both brace styles are the set
    // literal's (enableSets rewrites { } to ｛ ｝); backtick is reserved
    const reserved =
      new Set( [ '(', ')', '{', '}', '｛', '｝', '«', '»', "'", '"', '`' ] )
    // glyph tokens claimed as operators elsewhere: the classifier's
    // glyph list plus every single-glyph alias of the token-matched
    // row tables (an opener among them would fight those matchers for
    // the same operand-position token - '|' stays the divides chain's,
    // so absolute-value bars need a real design, not a row)
    const glyph = t => !/[A-Za-z0-9]/.test(t)
    const claimedGlyphs = new Set( operatorGlyphs )
    rowTables.forEach( ({ rows }) => rows.forEach( row =>
      row.aliases?.forEach( a => {
        if ( a.words?.length === 1 && glyph(a.words[0].w) )
          claimedGlyphs.add(a.words[0].w)
      } ) ) )
    delimitedRows.forEach( row => {
      const where = dName(row)
      row.delims.forEach( (d, k) => {
        if ( !glyph(d) )
          err(`${where}: delimiter '${d}' is not a non-word token`)
        if ( reserved.has(d) )
          err(`${where}: delimiter '${d}' is reserved`)
        if ( d.includes('//') )
          err(`${where}: delimiter '${d}' contains the comment marker //`)
        if ( UnicodeNames[d] !== undefined )
          err(`${where}: the tokenizer rewrites '${d}' to` +
              ` '${UnicodeNames[d]}', so this delimiter can never match`)
        if ( k === 0 && claimedGlyphs.has(d) )
          err(`${where}: opener '${d}' is an operator token of another` +
              ` table`)
      } )
      // the bracket-tuple shadow: [ ... ] whose separators are all
      // commas (or which has none) is the grammar's Tuple surface
      if ( row.delims[0] === '[' &&
           row.delims[row.delims.length - 1] === ']' &&
           row.delims.slice(1, -1).every( d => d === ',' ) )
        err(`${where}: [ ... ] with comma separators shadows the` +
            ` bracket tuple`)
      if ( row.argOrder !== undefined ) {
        const sorted = [ ...row.argOrder ].sort()
        if ( row.argOrder.length !== row.holes.length ||
             sorted.some( (v, k) => v !== k ) )
          err(`${where}: argOrder [${row.argOrder}] is not a permutation` +
              ` of 0..${row.holes.length - 1}`)
      }
    } )
    // capacity: the grammar retries two ranks per (opener, arity), so a
    // third row there is unreachable, and a row with delimiters
    // identical to an earlier row's can never win the retry either
    const byKey = new Map()
    delimitedRows.forEach( row => {
      const key = `'${row.delims[0]}' arity ${row.holes.length}`
      if ( !byKey.has(key) ) byKey.set(key, [])
      byKey.get(key).push(row)
    } )
    byKey.forEach( (rows, key) => {
      if ( rows.length > 2 )
        err(`delimitedRows: ${rows.length} rows share opener ${key}, but` +
            ` the grammar retries only 2 ranks` +
            rows.map( r => atLine(r) ).join('') )
      for ( let i = 1; i < rows.length; i++ )
        if ( rows[i].delims.join(' ') ===
             rows[0].delims.join(' ') )
          err(`${dName(rows[i])}: delimiters identical to` +
              ` ${dName(rows[0])}, so it can never match`)
    } )
    // one row per head (the printers' derived maps key by head), and no
    // head may collide with the big-operator schema's heads
    const seenHead = new Map()
    delimitedRows.forEach( row => {
      if ( seenHead.has(row.head) )
        err(`${dName(row)}: head '${row.head}' already declared by` +
            ` ${dName(seenHead.get(row.head))}`)
      else seenHead.set(row.head, row)
      if ( autoDeclaredConstants.includes(row.head) )
        err(`${dName(row)}: head '${row.head}' is a big-operator head`)
    } )
  }

  ///////////////////////////////////////////////////////////////////////
  // climb-row schema (assoc/per-hole-precedence slice, 2026-07-29): the
  // grammar and resolveClimb dispatch on assoc / hole / params, so the
  // fields must exist with known values; the retired `chainable` and
  // `argClass` fields must not creep back in (they would silently claim
  // behavior the machinery no longer implements); `signed` is handled
  // only by the flat resolution branch; and `params` reaches the grammar
  // only through the SetAlg-family climb rules, never the Prop rule
  ;[ [ 'propRows', propRows ], [ 'setAlgRows', setAlgRows ] ]
    .forEach( ([ tname, rows ]) => rows.forEach( row => {
      const where = `${tname} row ${rowName(row)}`
      if ( !knownAssoc.includes(row.assoc) )
        err(`${where}: assoc must be one of ${knownAssoc.join('/')}` +
            ` (got '${row.assoc}')`)
      if ( row.chainable !== undefined )
        err(`${where}: 'chainable' is retired - declare assoc instead`)
      if ( row.argClass !== undefined )
        err(`${where}: 'argClass' is retired - declare hole instead`)
      if ( row.signed === true && row.assoc !== 'flat' )
        err(`${where}: signed rows must be assoc 'flat' (the surface-sign` +
            ` encoding lives in the flat resolution branch)`)
    } ) )
  setAlgRows.forEach( row => {
    const where = `setAlgRows row ${rowName(row)}`
    if ( !knownHoles.includes(row.hole) )
      err(`${where}: hole must be one of ${knownHoles.join('/')}` +
          ` (got '${row.hole}')`)
    if ( row.params !== undefined && row.params !== true )
      err(`${where}: params must be true or absent`)
  } )
  propRows.forEach( row => {
    if ( row.params !== undefined )
      err(`propRows row ${rowName(row)}: params is not supported by the` +
          ` Prop climb (only the SetAlg-family rules parse the subscript` +
          ` group)`)
    if ( row.hole !== undefined )
      err(`propRows row ${rowName(row)}: hole is fixed by the grammar` +
          ` (PropItem) - the field would be silently ignored`)
  } )

  ///////////////////////////////////////////////////////////////////////
  // big-operator rows: units, forms, and name reachability
  Object.entries(bigOpFormShapes).forEach( ([form, shape]) => {
    if ( typeof shape?.closed !== 'boolean' )
      err(`bigOpFormShapes '${form}': closed flag must be boolean (the` +
          ` grammar gates the shape on it in both the BigOpen and` +
          ` BigClosed layers)`)
  } )
  bigOpRows.forEach( row => {
    const where = `bigOpRows '${row.head}'`
    if ( !knownUnits.includes(row.unit) )
      err(`${where}: unknown unit '${row.unit}'`)
    Object.entries(row.forms ?? {}).forEach( ([form, spec]) => {
      if ( !knownBigForms.includes(form) )
        err(`${where}: unknown form '${form}'`)
      if ( !knownHoleClasses.includes(spec.f) )
        err(`${where}: form '${form}' has unknown body hole class '${spec.f}'`)
    } )
    row.names?.forEach( n => {
      if ( n.i && n.lit !== n.lit.toLowerCase() )
        err(`${where}: case-insensitive name '${n.lit}' must be lowercase`)
      n.only?.forEach( form => {
        if ( row.forms?.[form] === undefined )
          err(`${where}: name '${n.lit}' restricted to nonexistent form` +
              ` '${form}'`)
      } )
    } )
  } )
  // name reachability per unit class: first matching literal wins across
  // the class with no boundary check, so a later name that begins with an
  // earlier one is unreachable (the dead-'integral' mechanism)
  knownUnits.forEach( unit => {
    const names = bigOpRows.filter( r => r.unit === unit )
      .flatMap( r => r.names.map( n => ({ head: r.head, ...n }) ) )
    names.forEach( (b, j) => names.slice(0, j).forEach( a => {
      const shadowed = a.i ? b.lit.toLowerCase().startsWith(a.lit)
                           : b.lit.startsWith(a.lit)
      if ( shadowed )
        err(`bigOpRows: name '${b.lit}' (${b.head}) is unreachable behind` +
            ` earlier name '${a.lit}' (${a.head}) in the '${unit}' class`)
    } ) )
  } )

  ///////////////////////////////////////////////////////////////////////
  // auto-declared-constants agreement: recompute "every bigOpRows head
  // incl. the form overrides" independently and require the export to
  // equal it as a set, with no duplicates - so replacing the derived
  // export with a hand list that drifts fails on load instead of silently
  // reopening the sum := defint hazard (missing entry) or shadowing a
  // user symbol (stale extra entry)
  const expectedAutoConstants = new Set( bigOpRows.flatMap(
    row => [ row.head, ...Object.values( row.forms ?? {} )
      .map( spec => spec.head ).filter( h => h !== undefined ) ] ) )
  const actualAutoConstants = new Set( autoDeclaredConstants )
  expectedAutoConstants.forEach( h => {
    if ( !actualAutoConstants.has(h) )
      err(`autoDeclaredConstants: big-operator head '${h}' is missing` +
          ` (the engine would treat it as a metavariable when undeclared)`)
  } )
  actualAutoConstants.forEach( h => {
    if ( !expectedAutoConstants.has(h) )
      err(`autoDeclaredConstants: entry '${h}' is not a bigOpRows head` +
          ` (the list must be exactly the big-operator heads)`)
  } )
  if ( autoDeclaredConstants.length !== actualAutoConstants.size )
    err(`autoDeclaredConstants: list contains duplicates`)

  ///////////////////////////////////////////////////////////////////////
  // word-classification collisions: the classifier maps keep the first
  // writer, so a word claimed twice with different classifications is a
  // silent conflict.  Claims land in a case-sensitive and a
  // case-insensitive map; a CS claim also shadows a CI claim of the same
  // lowercase word for its exact spelling, so those cross-map pairs are
  // conflicts too unless they agree.
  const claimKey = c => c.ci ? c.word.toLowerCase() : c.word
  const claimDesc = c => `${c.kind}${ c.head ? ` head '${c.head}'` : '' }`
  const seen = new Map()
  wordClassClaims.forEach( c => {
    if ( c.ci && c.word !== c.word.toLowerCase() )
      err(`word classification: case-insensitive word '${c.word}' must be` +
          ` lowercase`)
    const key = `${c.ci ? 'ci' : 'cs'}:${claimKey(c)}`
    const prev = seen.get(key)
    if ( prev && ( prev.kind !== c.kind || prev.head !== c.head ) )
      err(`word classification: '${c.word}' claimed as ${claimDesc(prev)}` +
          ` and again as ${claimDesc(c)}`)
    if ( !prev ) seen.set(key, c)
  } )
  wordClassClaims.filter( c => !c.ci ).forEach( c => {
    const prev = seen.get(`ci:${c.word.toLowerCase()}`)
    if ( prev && ( prev.kind !== c.kind || prev.head !== c.head ) )
      err(`word classification: '${c.word}' (${claimDesc(c)}) shadows the` +
          ` case-insensitive claim ${claimDesc(prev)} for its exact` +
          ` spelling`)
  } )
  const glyphSeen = new Map()
  operatorGlyphs.forEach( ({ g, head }) => {
    const prev = glyphSeen.get(g)
    if ( prev !== undefined && prev !== head )
      err(`operatorGlyphs: '${g}' listed twice with heads '${prev}' and` +
          ` '${head}'`)
    glyphSeen.set(g, head)
  } )

  ///////////////////////////////////////////////////////////////////////
  // Declare/mention agreement: for every mentionable word and glyph, the
  // internal-name table (which Declare renders through) must agree with
  // the classified head (which mentions resolve to).  Big-operator names
  // are exempt: a name like 'int' deliberately serves two putdown heads
  // (defint and integral, by form), so no single Declare mapping exists;
  // Declare int declares the raw word (see the Phase 3c/3e notes).
  wordClassClaims
    .filter( c => c.kind === 'op' && c.head !== null && !c.bigName )
    .forEach( c => {
      if ( internal(c.word) !== c.head )
        err(`Declare/mention drift: 'Declare ${c.word}' declares` +
            ` '${internal(c.word)}' but '(${c.word})' mentions '${c.head}'` +
            ` (internalNames needs '${c.word}' → '${c.head}')`)
    } )
  operatorGlyphs.forEach( ({ g, head }) => {
    if ( internal(g) !== head )
      err(`Declare/mention drift: 'Declare ${g}' declares '${internal(g)}'` +
          ` but '(${g})' mentions '${head}'`)
  } )

  ///////////////////////////////////////////////////////////////////////
  // ordered-literal lists: first match wins with no boundary check, so an
  // entry that begins with an earlier entry's literal is unreachable
  putdownLeadingSymbolRenames.forEach( (b, j) => {
    if ( b.i && b.lit !== b.lit.toLowerCase() )
      err(`leading renames: case-insensitive literal '${b.lit}' must be` +
          ` lowercase`)
    putdownLeadingSymbolRenames.slice(0, j).forEach( a => {
      const shadowed = a.i ? b.lit.toLowerCase().startsWith(a.lit)
                           : b.lit.startsWith(a.lit)
      if ( shadowed )
        err(`leading renames: '${b.lit}' is unreachable behind earlier` +
            ` prefix '${a.lit}'`)
    } )
  } )

  ///////////////////////////////////////////////////////////////////////
  // the phrase table: replacements run sequentially case-insensitively, so
  // an earlier pattern occurring inside a later pattern corrupts the later
  // one's text before it can match, and a replacement containing a space
  // would itself be re-split
  phrases.forEach( ([pat, out], j) => {
    if ( / /.test(out) )
      err(`phrases: replacement '${out}' contains a space`)
    phrases.slice(0, j).forEach( ([earlier]) => {
      if ( pat.toLowerCase().includes(earlier.toLowerCase()) )
        err(`phrases: pattern '${pat}' contains earlier pattern` +
            ` '${earlier}' and can never match intact`)
    } )
  } )

  ///////////////////////////////////////////////////////////////////////
  // the is-a noun registry
  const nounSeen = new Set()
  isaNouns.forEach( e => {
    const key = `${e.noun}|${e.prep}`
    if ( nounSeen.has(key) )
      err(`isaNouns: duplicate entry '${e.noun}' / '${e.prep}'${atLine(e)}`)
    nounSeen.add(key)
    if ( !/^[a-z]+( [a-z]+)*$/.test(e.noun) )
      err(`isaNouns: noun '${e.noun}' must be lowercase words` +
          ` (interior keywords are case-sensitive lowercase)${atLine(e)}`)
    if ( !/^[a-z]+$/.test(e.prep) )
      err(`isaNouns: preposition '${e.prep}' must be one lowercase` +
          ` word${atLine(e)}`)
    if ( e.article !== undefined && ![ 'a', 'an' ].includes(e.article) )
      err(`isaNouns: article '${e.article}' for '${e.noun}'${atLine(e)}`)
  } )

  ///////////////////////////////////////////////////////////////////////
  // the chain-operator families (Slice 2 of the chains-first-class plan):
  // family names must be unique (validation keys its per-family
  // transitive-conclusion policy on them), a family must have ops with
  // aliases (the token rows above catch alias problems), a param family's
  // ops are compound - never bare-mentionable first operands - so
  // bareLeft on one is dead data, and the retired relation-row
  // `chainable` field must not creep back in (the n-ary flatten it drove
  // was replaced by chains; a row carrying it would silently claim a
  // behavior the grammar no longer implements)
  const famSeen = new Set()
  chainFamilies.forEach( fam => {
    if ( famSeen.has(fam.family) )
      err(`chainFamilies: duplicate family name '${fam.family}'`)
    famSeen.add(fam.family)
    if ( !fam.ops?.length )
      err(`chainFamilies '${fam.family}': no ops`)
    if ( fam.param === true && fam.bareLeft === true )
      err(`chainFamilies '${fam.family}': bareLeft on a param family is` +
          ` unreachable (parameterized operators are never bare mentions)`)
  } )
  relationRows.forEach( row => {
    if ( row.chainable !== undefined )
      err(`relationRows row ${rowName(row)}: 'chainable' is retired -` +
          ` multi-step relations are chainFamilies transitive chains`)
  } )

  ///////////////////////////////////////////////////////////////////////
  // tex leaf coverage (warnings): a mentionable non-ASCII head not in the
  // tex leaf maps renders as the raw glyph in tex output
  const renamedOuts = new Set(putdownLeadingSymbolRenames.map( e => e.out ))
  const mentionHeads = new Set( [
    ...wordClassClaims.filter( c => c.kind === 'op' && c.head !== null )
                      .map( c => c.head ),
    ...operatorGlyphs.map( g => g.head )
  ] )
  mentionHeads.forEach( h => {
    if ( /^[\x00-\x7F]+$/.test(h) ) return
    if ( operatorHeadTex[h] === undefined && texSymbols[h] === undefined &&
         !renamedOuts.has(h) )
      warn(`tex leaf coverage: mentionable head '${h}' has no tex` +
           ` rendering (operatorHeadTex) and renders as the raw glyph`)
  } )

  return { errors, warnings }
}

/**
 * Run the linter and report: throw one aggregate Error when any check
 * fails, and console.warn the warnings.  This is the load-time hook the
 * parser's global initializer calls, so a bad table refuses to load
 * instead of silently misparsing.  Since the Phase 4c flip the live
 * tables are compiled from lurch-notation.txt, and their provenance map
 * (notationLineOf) is passed here so every complaint naming a row ends
 * with its notation-file line - the instructor-facing error channel.
 */
export function lintNotationTablesOrThrow () {
  const { errors, warnings } =
    lintNotationTables( null, liveTables.notationLineOf )
  warnings.forEach( w => console.warn(`notation table warning: ${w}`) )
  if ( errors.length )
    throw new Error(`notation table errors:\n  ${errors.join('\n  ')}`)
}
