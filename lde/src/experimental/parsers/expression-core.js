///////////////////////////////////////////////////////////////////////////
// Table-driven expression core for the Lurch notation parser
//
// The operator zoo lives in notation table rows, matched by a ranked
// longest-first keyword matcher and resolved into AST nodes.  This
// module is the engine; the rows themselves are data in
// notation-tables.js.  It holds the single-keyword relation machinery
// (matchRelationToken/resolveRelation), the precedence-climbing pass for
// the propositional and set/algebraic infix ladders
// (climbEnter/climbAccepts/climbTake/resolveClimb), the multi-hole
// mixfix rows (maps, ≅ - matchTailKw and the args/argOrder handling in
// resolveRelation), and the big-operator schema matchers
// (matchBigLimName/matchBigOverName/matchBigPrefixName with
// bigAllows/bigHole/bigHead).
//
// The matcher below replicates peggy's ordered-choice-of-literals semantics
// over the table, exactly as matchOrderedLiteral does for single literals,
// with two generalizations:
//
//   - a token is a *word sequence* (`is a partition of`), each word
//     case-sensitive or not (peggy 'w' vs 'w'i), separated by required
//     whitespace, with a trailing regime per alias: 'bound' = must not
//     be followed by an alphanumeric or a '(' (word keywords - the
//     paren clause is the function-application rule, see aliasMatch),
//     'any' = no check (glyph keywords like ~ | ⊢).
//   - a *rank* argument skips the first `rank` matching ROWS.  Each row
//     contributes at most one candidate: its first matching alias, in the
//     row's listed order.  This is PEG commitment as data: a PEG choice
//     that has succeeded is never re-entered when a later element of the
//     same sequence fails, so `x is a partition
//     of, P` falls back from the partition row to the is row (two rows
//     tried in turn), but `x is a, y is b` does NOT
//     fall back from `is a` to `is` (one row: the alias choice committed
//     to `is a`, and the missing right-hand side fails the whole row).
//     Rule alternatives re-run the matcher at rank 1, 2, ... to give
//     each row its turn.  (At most two rows can match one position
//     simultaneously, e.g. the partition row and the is row at
//     `is a partition of`.)

import { relationRows, propRows, setAlgRows, bigOpRows, bigOpFormShapes,
         paramOpRows, chainFamilies, chainOpFamily, chainParamFamily,
         delimitedRows,
         precedence, structuralKeywords, extraOperatorWords, operatorGlyphs }
  from './notation-tables.js'

///////////////////////////////////////////////////////////////////////////
// AST node builders
//
// These live here rather than in the grammar initializer so the resolver
// and the grammar build identical nodes.  The node
// vocabulary is documented in ast-to-putdown.js.

// n-ary operator application (fmt carries formatting-only data the putdown
// printer ignores and the tex printer honors)
export const op = (op, args, fmt) => {
  return fmt ? { type:'op', op, args, fmt } : { type:'op', op, args }
}

// operator application from a |1..,op| sequence: a sequence with a single
// item is just that item, not a unary application
export const opSeq = (o, args) => { return (args.length>1) ? op(o,args) : args[0] }

///////////////////////////////////////////////////////////////////////////
// Token matching

// whitespace, as in the grammar's __ rule
const ws = c => c === ' ' || c === '\t' || c === '\n' || c === '\r'
// the grammar's alphanum character class
const alphanum = c => c !== undefined && /[a-z0-9]/i.test(c)

// does this alias' word sequence (and its regimes) match at pos?  Returns
// the number of characters it consumes, or -1.
const aliasMatch = (t, input, pos) => {
  let p = pos
  for ( let k = 0; k < t.words.length; k++ ) {
    if ( k > 0 ) {
      const s = p
      while ( ws(input[p]) ) p++
      if ( p === s ) return -1
    }
    const w = t.words[k].w
    const seg = input.substr(p, w.length)
    if ( t.words[k].i ? seg.toLowerCase() !== w : seg !== w ) return -1
    p += w.length
  }
  // the word-boundary rule: a word keyword may not be followed
  // by an alphanumeric, and may not directly abut an
  // open parenthesis - Lurch's hard rule is that a name immediately
  // followed by '(' reads as function application (`R(x)` applies R, as
  // `isPrime(n-1)(n+1)` shows), so `a is(b)` / `n divides(n+1)` split
  // into an operand and a mention-headed application instead of quietly
  // reading as the infix relation; write `a is (b)` for that.  Glyph
  // keywords ('any') are unaffected: `0<(x+1)` needs no space.
  if ( t.after === 'bound' &&
       ( alphanum(input[p]) || input[p] === '(' ) ) return -1
  // engine fact: '//' opens a line comment (which survives tokenization
  // verbatim), so an alias ending in '/' - the ⋅ row's division alias -
  // never matches immediately before another '/'; the comment
  // must reach the grammar's LineComment rule intact
  if ( input[p] === '/' && input[p-1] === '/' ) return -1
  return p - pos
}

/**
 * Build a ranked token matcher over a table of rows.  The returned matcher
 * finds the rank-th ROW with an alias matching at the given position, and
 * returns that row's first matching alias (rows in table order, aliases in
 * listed order - the commitment structure described in
 * the header comment).  A match reports the row, the canonical source
 * text of the alias (used for fmt annotations like `is a` vs `is the` and
 * for the surface signs of signed sums), and the number of characters to
 * consume.  Trailing whitespace is not consumed; the trailing regime is
 * only checked.  Alias lists are precompiled once per table at load time.
 *
 * @param {object[]} rows - notation table rows (see notation-tables.js)
 * @returns {function} matcher (input, pos, rank) → { row, src, len } | null
 */
export const makeRowMatcher = rows => {
  // per-row alias lists, precompiled with their canonical source text.
  // ORDER MATTERS within a row wherever one alias is a prefix of another
  // (subseteq/subset, neq/ne, loves/love): longest first.
  // Row order matters wherever rows' keywords overlap (only the
  // relation table has such rows: the partition/relation-on phrases and
  // the is families).
  const rowTokens = rows.map( row =>
    ({ row, aliases: row.aliases.map( a =>
         ({ ...a, src: a.words.map( w => w.w ).join(' ') }) ) }) )
  return (input, pos, rank) => {
    let found = 0
    for ( const { row, aliases } of rowTokens ) {
      let tok = null, len = -1
      for ( const a of aliases ) {
        len = aliasMatch(a, input, pos)
        if ( len >= 0 ) { tok = a; break }
      }
      if ( tok === null ) continue
      if ( found === rank ) return { row, src: tok.src, len }
      found++
    }
    return null
  }
}

// the token classes the grammar consults: the relation
// rows (ranked: RelTok0/1/2 re-run the matcher at successive ranks), and
// the propositional and set/algebraic infix rows (their keywords
// are pairwise disjoint, so only rank 0 occurs)
export const matchRelationToken = makeRowMatcher(relationRows)
export const matchPropToken = makeRowMatcher(propRows)
export const matchSetAlgToken = makeRowMatcher(setAlgRows)
// the parameterized-operator tokens: matched by the
// ParamRel rule, which then requires the `_(params)` group
export const matchParamOpToken = makeRowMatcher(paramOpRows)

// The chain-operator token rows: one matcher row per (family, op) of the chainFamilies
// table, in table order.  The parameterized congruence row precedes the
// bare-≅ row, so the grammar's ranked ChainTok0/ChainTok1 rules give the
// `_(`-less surface its turn at rank 1 exactly like the RelStep rank
// retries (only the two cong rows share a token; every other keyword is
// unique to its row).  Exported for the table linter.
// (a pure function of the chainFamilies table, so freshly compiled
// tables can be linted with the same derivation)
export const chainOpRowsOf = fams => fams.flatMap( fam =>
  fam.ops.map( op => ({ head: op.head, param: fam.param === true,
                        family: fam.family, aliases: op.aliases }) ) )
export const chainOpRows = chainOpRowsOf(chainFamilies)
export const matchChainOpToken = makeRowMatcher(chainOpRows)

///////////////////////////////////////////////////////////////////////////
// Token classification
//
// Every alphabetic word is classified by table lookup as structural,
// operator, or neither (an ordinary Symbol); "reserved" is a derived
// property of the tables, not a maintained list.  Two maps -
// exact-match for CS entries, lowercased for CI entries - are built once
// at load time from the closed structural-keyword list, the single-word
// aliases of the relation/prop/setAlg rows, the big-operator leading
// names, and the grammar-level operator words.  An entry records the
// canonical head symbol a mention of the word denotes, or head: null for
// words that denote no object (structural keywords, and the desugaring
// aliases neq/ne/notin, whose rows build compound ¬-nodes rather than
// naming an operator).  bigName marks big-operator leading names: they
// are classified and mentionable with an explicit (op)/'op' marker, but
// the BARE mention holes skip them so that a mistyped call form like
// sum(f,k) stays a parse error instead of silently degrading to the
// function application (sum f k).

// every claim is recorded (pre-dedupe) so the table linter can flag two
// tables claiming the same word with different classifications - the
// lookup maps below silently keep the first writer.  A pure function of
// the tables, so freshly compiled tables can be linted with
// the same derivation.
export const buildWordClassClaims = t => {
  const claims = []
  const addWord = (word, entry) => claims.push({ word, ...entry })
  t.structuralKeywords.forEach( k =>
    addWord(k.lit, { kind: 'structural', ci: !!k.i, head: null }) )
  for ( const row of [ ...t.relationRows, ...t.propRows, ...t.setAlgRows ] )
    for ( const a of row.aliases ) {
      if ( a.words.length !== 1 ) continue
      const w = a.words[0].w
      // only pure alphanumeric words can ever be a word-classifier hit
      // (glyph aliases live below; a spaced literal like 'cong mod' is a
      // multi-word alias in disguise and would be a dead map entry)
      if ( !/^[a-z][a-z0-9]*$/i.test(w) ) continue
      addWord(w, { kind: 'op', ci: !!a.words[0].i,
                   head: row.wrapNeg ? null : row.head })
    }
  // the chain-operator words (lt, leq, cong, divides, subset, subseteq)
  // classify from the chainFamilies table like every other operator table;
  // the two cong rows claim the word consistently (same kind and head)
  for ( const fam of t.chainFamilies )
    for ( const opRow of fam.ops )
      for ( const a of opRow.aliases ) {
        if ( a.words.length !== 1 ) continue
        const w = a.words[0].w
        if ( !/^[a-z][a-z0-9]*$/i.test(w) ) continue
        addWord(w, { kind: 'op', ci: !!a.words[0].i, head: opRow.head })
      }
  for ( const row of t.bigOpRows )
    for ( const n of row.names )
      addWord(n.lit, { kind: 'op', ci: !!n.i, head: row.head,
                       bigName: true })
  t.extraOperatorWords.forEach( e =>
    addWord(e.lit, { kind: 'op', ci: !!e.i, head: e.head,
                     noBare: !!e.noBare }) )
  return claims
}
export const wordClassClaims = buildWordClassClaims(
  { structuralKeywords, relationRows, propRows, setAlgRows, chainFamilies,
    bigOpRows, extraOperatorWords } )
const wordClassCS = new Map(), wordClassCI = new Map()
wordClassClaims.forEach( c => {
  const { word, ...entry } = c
  const map = entry.ci ? wordClassCI : wordClassCS
  const key = entry.ci ? word.toLowerCase() : word
  if ( !map.has(key) ) map.set(key, entry)      // first writer wins
} )

// the maximal alphanumeric word starting at pos, or null (same character
// classes as the grammar's Symbol rule, so classification and Symbol
// always look at the same word)
const wordAt = (input, pos) => {
  if ( !/[a-z]/i.test(input[pos] ?? '') ) return null
  let p = pos + 1
  while ( p < input.length && /[a-z0-9]/i.test(input[p]) ) p++
  return input.slice(pos, p)
}

/**
 * Classify the word at a position.  Returns
 * null when no word starts there or the word is an ordinary Symbol, else
 * { word, len, kind: 'structural'|'op', head, bigName }.  Word boundaries
 * are automatic (the maximal alphanumeric run is looked up whole), so
 * 'summit' is never classified by its 'sum' prefix.
 *
 * @param {string} input - the (normalized) input text
 * @param {number} pos - the position to classify at
 * @returns {object|null} the classification, or null for ordinary symbols
 */
export const classifyWordAt = (input, pos) => {
  const w = wordAt(input, pos)
  if ( w === null ) return null
  const entry = wordClassCS.get(w) ?? wordClassCI.get(w.toLowerCase())
  return entry ? { word: w, len: w.length, ...entry } : null
}

/**
 * Match an operator mention at a position: an operator
 * word or glyph, resolved to its canonical head symbol.  Used by the
 * grammar's (op) and 'op' mention rules and, with bare: true, by the
 * bare-mention holes (relation-left operands, the ∈ right-hand side,
 * application heads and arguments), where big-operator leading names and
 * noBare words (the prefix not/neg - a stray 'not' in operand position
 * is a malformed negation, not a mention of ¬) are excluded - see the
 * classification notes above.
 *
 * @param {string} input - the (normalized) input text
 * @param {number} pos - the position to match at
 * @param {boolean} [bare] - exclude big-operator names (bare-hole use)
 * @returns {object|null} { head, len }, or null
 */
export const matchMentionName = (input, pos, bare = false) => {
  const c = classifyWordAt(input, pos)
  if ( c ) return ( c.kind === 'op' && c.head !== null &&
                    !( bare && ( c.bigName || c.noBare ) ) )
                  ? { head: c.head, len: c.len } : null
  for ( const { g, head } of operatorGlyphs )
    if ( input.startsWith(g, pos) ) return { head, len: g.length }
  return null
}

/**
 * Match a declarable name at a position: any classified word (structural
 * or operator) or
 * operator glyph.  The grammar's DeclareSeq consumes the raw matched text
 * and the putdown printer maps it through the internal-name table.
 *
 * @param {string} input - the (normalized) input text
 * @param {number} pos - the position to match at
 * @returns {object|null} { len }, or null
 */
export const matchDeclarableName = (input, pos) => {
  const c = classifyWordAt(input, pos)
  if ( c ) return { len: c.len }
  for ( const { g } of operatorGlyphs )
    if ( input.startsWith(g, pos) ) return { len: g.length }
  return null
}

/**
 * Append a classification-aware hint to a peggy parse
 * error: when the failure position sits at (or just
 * before) an operator word in operand position, name the mention syntax;
 * when it sits at a structural keyword, say the word is reserved.  The
 * offset refers to the NORMALIZED input (the grammar re-tokenizes its
 * input), so callers pass the tokenized text.
 *
 * @param {string} normalized - the tokenized input the parser saw
 * @param {object} error - the peggy SyntaxError (message is augmented)
 */
export const enrichParseError = (normalized, error) => {
  let pos = error?.location?.start?.offset
  if ( typeof pos !== 'number' ) return
  while ( /[ \t\n\r]/.test(normalized[pos] ?? '') ) pos++
  // The closed-unit schema's deliberately rejected exponent
  // surfaces: a parse that fails AT a '^' is one of the two ambiguous
  // shapes the grammar rejects on purpose, so say which and name the
  // blessed rewrites.  A ')' immediately before the '^' means an
  // application result was offered as an exponent base (f(x)^2 - every
  // other closed )-delimited form takes the exponent, so it would have
  // been consumed); otherwise, if an earlier '^' was already consumed,
  // the input is an unparenthesized exponent tower (x^y^z).  Anything
  // else falls through to the classification hints below.
  if ( normalized[pos] === '^' ) {
    let prev = pos - 1
    while ( prev >= 0 && /[ \t\n\r]/.test(normalized[prev]) ) prev--
    if ( normalized[prev] === ')' ) {
      error.message += ` (exponentiation binds above application, so an` +
        ` application result cannot be an exponent base: write (f(x))^2` +
        ` to raise the value f(x) to a power, or f^2(x) to apply the` +
        ` function f^2)`
      return
    }
    if ( normalized.lastIndexOf('^', prev) !== -1 ) {
      error.message += ` (exponentiation towers are ambiguous without` +
        ` parentheses: write x^(y^z) or (x^y)^z for the meaning you` +
        ` intend)`
      return
    }
  }
  // look at the failure token; if it is a glyph, also peek at the next
  // word (the real culprit in inputs like 'x + and')
  let firstGlyph = null
  for ( let hops = 0; hops < 2 && pos < normalized.length; hops++ ) {
    while ( /[ \t\n\r]/.test(normalized[pos] ?? '') ) pos++
    const c = classifyWordAt(normalized, pos)
    if ( c && c.kind === 'op' ) {
      error.message += ` ('${c.word}' is an operator in Lurch notation;` +
        ` write (${c.word}) to mention it as a symbol)`
      return
    }
    if ( c && c.kind === 'structural' ) {
      error.message += ` ('${c.word}' is a reserved word in Lurch notation)`
      return
    }
    // hop over one operator glyph and retry on the following word
    const g = operatorGlyphs.find( e => normalized.startsWith(e.g, pos) )
    if ( !g ) break
    firstGlyph = firstGlyph ?? g
    pos += g.g.length
  }
  // no word culprit found: if the failure token itself was an operator
  // glyph, name it (the dangling-operator family, e.g. the ⊕ of
  // 'a ★ b ⊕ c' - same-level operators cannot mix without parentheses)
  if ( firstGlyph !== null )
    error.message += ` ('${firstGlyph.g}' is an operator in Lurch` +
      ` notation; write (${firstGlyph.g}) to mention it as a symbol, or` +
      ` add parentheses if two operators of the same precedence meet)`
}

// The tail keyword of a multi-hole mixfix row: after a tail
// row's leading token and first hole have parsed, the grammar's RelStep
// rules consume the keyword separating the remaining hole - the `to` of
// `_ : _ to _`, the `mod` of `_ cong _ mod _`.  First matching alias wins,
// same semantics as the row matcher; there is no rank because the row is
// already committed (a failed tail fails the whole step, and the ranked
// RelTok rules then give the next ROW its turn - the maps row failing at
// `to` never retries a shorter `:`).
export const matchTailKw = (kws, input, pos) => {
  for ( const a of kws ) {
    const len = aliasMatch(a, input, pos)
    if ( len >= 0 ) return { len }
  }
  return null
}

///////////////////////////////////////////////////////////////////////////
// Delimited-form matching
//
// The delimitedRows table (`group delimited` in lurch-notation.txt) holds
// fixed-arity closed patterns: a non-word opener, expression holes
// between literal separators, and a closer, as in [ G : H ] → (index G H).
// The grammar's TableDelimited shapes (one per arity) start by matching a
// row's opener here, then consume the row's later delimiters one at a
// time at their own positions with matchDelimitedLit.  Delimiters are
// matched as bare literals - no word-boundary regime applies, since the
// loader guarantees they contain no letters or digits.

// find the rank-th row of the given arity whose opener matches at pos
// (file order = rank order, as everywhere).  Rows may share an opener -
// [ a : b ] and [ a ; b ] both open with '[' - and a PEG choice that
// has succeeded is never re-entered when a later element of its
// sequence fails, so the grammar tries each rank as a FULL shape
// alternative (Delimited2R0 / Delimited2R1): a row whose interior fails
// hands the position to the next matching row, and only after all
// matching rows fail does the whole form backtrack.
export const matchDelimitedOpener = (input, pos, arity, rank) => {
  let found = 0
  for ( const row of delimitedRows ) {
    if ( row.holes.length !== arity ) continue
    if ( input.startsWith(row.delims[0], pos) ) {
      if ( found === rank ) return { row, len: row.delims[0].length }
      found++
    }
  }
  return null
}

// match one of the row's later delimiters (separator or closer) at pos
export const matchDelimitedLit = (lit, input, pos) =>
  input.startsWith(lit, pos) ? { len: lit.length } : null

// build the AST node for a completed match: apply the row's head to the
// holes, reordered by argOrder when the rewrite listed them out of
// pattern order (argOrder[i] = which pattern hole is the head's i-th
// argument)
export const resolveDelimited = (row, args) =>
  op( row.head, row.argOrder ? row.argOrder.map( k => args[k] ) : args )

///////////////////////////////////////////////////////////////////////////
// Big-operator name matching
//
// The bigOpRows table instantiates
// the shared form shapes in the grammar per operator.  Each shape rule
// starts by matching a row's leading name with the matcher for its
// operand-unit class, then gates on whether the row (and the matched name
// alias) supports the shape's form.  The name match checks the literal
// only - what must follow it (the `(` of a call form, the whitespace of an
// English form) is consumed by the shape rule itself - so a name match
// inside a longer
// symbol (`summit`) simply fails every shape and falls through to the
// generic Symbol rule.  First match wins across a class's rows
// and within a row's names, on ordered-literal-choice semantics
// (including committed-prefix behavior).

const makeBigNameMatcher = rows => (input, pos) => {
  for ( const row of rows ) {
    for ( const alias of row.names ) {
      const seg = input.substr(pos, alias.lit.length)
      if ( alias.i ? seg.toLowerCase() === alias.lit : seg === alias.lit )
        return { row, alias, len: alias.lit.length }
    }
  }
  return null
}

export const matchBigLimName =
  makeBigNameMatcher(bigOpRows.filter( r => r.unit === 'prod' ))
export const matchBigOverName =
  makeBigNameMatcher(bigOpRows.filter( r => r.unit === 'alg' ))
export const matchBigPrefixName =
  makeBigNameMatcher(bigOpRows.filter( r => r.unit === 'prefix' ))

// does the matched name's row support this form, through this alias?
export const bigAllows = (n, form) =>
  n.row.forms[form] !== undefined &&
  ( n.alias.only === undefined || n.alias.only.includes(form) )
// the operand class of the form's body hole ('prod' | 'alg' | 'set')
export const bigHole = (n, form) => n.row.forms[form].f
// the AST head for the form (sum's over-a-set forms override to sumOver)
export const bigHead = (n, form) => n.row.forms[form].head ?? n.row.head
// is the form shape closed?  The grammar's BigOpen/BigClosed
// groupings gate each shape alternative on this, so the per-form closed
// flag in bigOpFormShapes is the authority on which layer a shape
// parses in (see the table's doc comment).
export const bigFormClosed = form => bigOpFormShapes[form]?.closed === true

// May a closed unit serve as an exponent BASE?
// The one principled exception to "every closed
// form takes the postfixes and serves as an exponent base": application
// results do not, because ^ already has a meaning on an application's
// LEFT - f^2(x) is the head application ((^ f 2) x) - so admitting
// f(x)^2 would put two different trees a keystroke apart.  The blessed
// surfaces are (f(x))^2 and f^2(x); the rejection gets a targeted
// message in enrichParseError below.  'app' is ordinary application and
// 'efa' the @P(k) form; every other closed node may be a base.
export const takesExponent = a => a?.type !== 'app' && a?.type !== 'efa'

///////////////////////////////////////////////////////////////////////////
// Resolution

/**
 * Build the AST node for a table relation: a first operand followed by
 * ONE (token, arguments) step - every relation row
 * consumes exactly one step; multi-step
 * relations are transitive chains.  A step carries one argument for a
 * single-hole row and one per hole for a multi-hole pattern row
 * (maps and the ≅ mod pattern).  The step applies the row's
 * node description: head, argOrder reordering for the pattern whose
 * surface order differs from the canonical one, optional ¬ wrapper (neq,
 * notin, is not), and optional fmt annotation recording which surface
 * synonym was typed.
 *
 * @param {object|string} first - the first operand
 * @param {object[]} steps - [ { tok: { row, src }, args } ] (length 1)
 * @returns {object} the AST node
 */
export const resolveRelation = (first, steps) => {
  const row = steps[0].tok.row
  let args = [ first, ...steps.flatMap( s => s.args ) ]
  if ( row.argOrder ) args = row.argOrder.map( k => args[k] )
  // a paramize row is a parameterized operator: the
  // canonical arguments after the second move into the operator position,
  // so 'a cong b mod m' is ((≅ m) a b) - see paramOpRows in
  // notation-tables.js
  if ( row.paramize )
    return { type: 'paramop', op: row.head,
             params: args.slice(2), args: args.slice(0, 2) }
  const fmt = row.fmtKey
    ? { [row.fmtKey]: row.fmtFixed ?? steps[0].tok.src } : undefined
  if ( row.wrapNeg ) return op('¬', [ op(row.head, args) ], fmt)
  return op(row.head, args, fmt)
}

///////////////////////////////////////////////////////////////////////////
// Precedence climbing
//
// The expression ladders (Prop = iff < implies < or < and, and Set/
// Algebraic = setminus < × < ∪ < ∩ < ∘
// < choose < sum < product < star) are flat grammar rules
// `operand (opToken operand)*` whose tokens come from the propRows /
// setAlgRows tables, resolved by the standard precedence-climbing pass
// below.  Each row declares its ASSOCIATIVITY (assoc: flat | left | right
// | none - see the field's doc in notation-tables.js) and the operand
// class of its holes (hole: full | star), and the star-family rows carry
// params: true, letting their tokens take a subscripted parameter group
// ('a ⊕_(n) b' is the compound-operator application ((⊕ n) a b), the
// star-level analog of ParamRel).
//
// Consumption itself must stop at a token that cannot continue - a second
// same-row token of an assoc:'none' row, a different row at the same level
// (a ★ b ⊕ c: same-level mixing without parentheses is ambiguous to a
// reader and never consumed), or a same-row parameterized token whose
// parameters differ from the run's - so that the expression ENDS before
// it and the leftover operator becomes a targeted parse error.  A flat
// rule that collected every token and sorted precedence out afterwards
// could not do that, so the grammar gates each step of its repetition
// with climbAccepts, a pure function of the tokens already taken in the
// CURRENT rule activation.  That per-activation token list lives in a
// frame stack here: the grammar pushes a frame with climbEnter after the
// first operand succeeds, records each accepted token with climbTake
// after the token's operand parses, and pops the frame in the rule's
// final action (via resolveClimb).  From the push onward the rule
// consists only of a min-0 repetition and its final action, a path that
// cannot fail, so every pushed frame is popped exactly once - balanced
// under peggy backtracking (iterations that fail before climbTake record
// nothing), under re-entrancy (an operand containing a nested
// parenthesized expression pushes and pops its own frame), and under
// --cache (a cached rule result skips push and pop together, and the
// gate is deterministic per activation because every frame starts empty).

const climbFrames = []
const level = row => precedence[row.prec]

// structural equality of parameter ASTs, ignoring formatting: fmt
// annotations and paren wrapper nodes do not affect meaning, so they do
// not affect whether two parameterized operators are the same operator.
// Shared by the climb gate (a ⊕_(n) run continues only on equal
// parameters) and the chain gate below (the equal-moduli commitment).
const stripNode = n => {
  if ( typeof n !== 'object' || n === null ) return n
  if ( n.type === 'paren' ) return stripNode(n.expr)
  const out = Array.isArray(n) ? [] : {}
  for ( const k of Object.keys(n) )
    if ( k !== 'fmt' ) out[k] = stripNode(n[k])
  return out
}
const sameParams = (a, b) =>
  JSON.stringify(stripNode(a ?? null)) === JSON.stringify(stripNode(b ?? null))

// begin a flat-expression activation (grammar & predicate: always true)
export const climbEnter = () => {
  climbFrames.push({ toks: [] })
  return true
}

/**
 * May the climb consume this token here?  False in exactly two
 * situations, both of which END the expression before the token (whose
 * leftover then surfaces as a targeted parse error - the no-dangling-
 * operators policy):
 *
 *   - the token's level is below this grammar entry point's minimum (the
 *     per-hole precedence of the enclosing form: summands accept ⋅ and
 *     tighter, big-operator bounds accept choose and tighter, the unary
 *     -// operands and the star-row holes accept only the star level);
 *   - the nearest already-taken token at this level or tighter sits at
 *     EXACTLY this level and cannot continue the run: a different row
 *     (same-level mixing needs parentheses), an assoc:'none' row (choose,
 *     iff), or the same parameterized row with structurally different
 *     parameters ('a ⊕_(n) b ⊕_(m) c' ends after the first application).
 *
 * @param {object} tok - a match from a row matcher: { row, src, len }
 * @param {object[]|null} params - the token's parsed parameter group, or
 *   null (only rows with params: true ever have one)
 * @param {number} min - this entry point's minimum level (inclusive)
 * @returns {boolean} whether the grammar may consume this token
 */
export const climbAccepts = (tok, params, min) => {
  const p = level(tok.row)
  if ( p < min ) return false
  const toks = climbFrames[climbFrames.length - 1].toks
  for ( let k = toks.length - 1; k >= 0; k-- ) {
    const q = level(toks[k].row)
    if ( q < p ) break     // swallowed by a looser op: a fresh run opens
    if ( q === p )         // nearest same-or-tighter token is at this level:
      return toks[k].row === tok.row && tok.row.assoc !== 'none' &&
             sameParams(toks[k].params, params)
  }
  return true              // no active application at this level
}

// record a consumed token (grammar & predicate: always true).  Runs only
// after the token AND its operand have parsed, so a backtracked step
// records nothing.
export const climbTake = (tok, params) => {
  climbFrames[climbFrames.length - 1].toks.push(
    { row: tok.row, params: params ?? null } )
  return true
}

// the AST node for one application of a row: a plain op node, or the
// compound-operator application ((op p ...) a b) when the token carried a
// parameter group (the param-aware climb; the node vocabulary is shared
// with ParamRel and documented in ast-to-putdown.js)
const climbNode = (row, args, params, fmt) =>
  params ? { type: 'paramop', op: row.head, params, args }
         : op(row.head, args, fmt)

/**
 * End a flat-expression activation: pop the frame and build the AST by
 * precedence climbing over the collected steps.  Each row's assoc field
 * decides what a same-row run builds: 'flat' collects
 * n-ary (even when tighter operators intervene: a cup b
 * cap c cup d is (∪ a (∩ b c) d)); 'left' and 'right' nest binary
 * applications; 'none' rows can never have a run (the gate consumed at
 * most one token per level).  The signed row (+/-) wraps each '-'-signed
 * argument as the unary (- x) and records the surface signs
 * in fmt.  With no steps the first
 * operand passes through untouched.
 *
 * @param {object|string} first - the first operand
 * @param {object[]} steps - [ { tok: { row, src }, arg, params } ] in
 *   input order (params null except for parameterized star tokens)
 * @returns {object|string} the AST for the whole flat expression
 */
export const resolveClimb = (first, steps) => {
  climbFrames.pop()
  let i = 0
  const go = (lhs, min) => {
    while ( i < steps.length && level(steps[i].tok.row) >= min ) {
      const row = steps[i].tok.row
      if ( row.assoc === 'right' ) {
        // collect the run's fully-climbed operands, then nest rightward
        const args = [ lhs ]
        while ( i < steps.length && steps[i].tok.row === row ) {
          const s = steps[i]
          i++
          args.push( go(s.arg, level(row) + 1) )
        }
        lhs = args.reduceRight( (r, l) => climbNode(row, [ l, r ]) )
      } else if ( row.assoc === 'left' || row.assoc === 'none' ) {
        // one binary application per step, nesting leftward ('none' rows
        // reach here with a single step - the gate admits no run)
        const s = steps[i]
        i++
        const arg = go(s.arg, level(row) + 1)
        lhs = climbNode(row, [ lhs, arg ], s.params)
      } else {  // 'flat': n-ary collection
        // `signs` is the per-joint list of typed operator tokens: the
        // signed row records it as fmt.signs (surface signs of a sum),
        // and a fmtKey:'src' row as fmt.srcs (the per-surface tex echo
        // of and/or); other rows record nothing
        const args = [ lhs ], signs = []
        let params = null
        while ( i < steps.length && steps[i].tok.row === row ) {
          const s = steps[i]
          i++
          signs.push(s.tok.src)
          params = s.params ?? params
          const arg = go(s.arg, level(row) + 1)
          // an inverse-pair token wraps its operand in the unary inverse
          // (a - b is (+ a (- b)); a / b is (⋅ a (/ b)))
          args.push( row.inv !== undefined && s.tok.src === row.inv
                     ? op(row.inv, [arg]) : arg )
        }
        lhs = climbNode(row, args, params,
                        row.signed ? { signs } :
                        row.fmtKey === 'src' ? { srcs: signs } : undefined)
      }
    }
    return lhs
  }
  return go(first, 0)
}

///////////////////////////////////////////////////////////////////////////
// The transitive-chain family gate
//
// A transitive chain mixes = with ONE operator family of the
// chainFamilies table (notation-tables.js): the inequality ladder
// (=, <, ≤), parameterized congruence (=, cong_(m)), bare congruence
// (=, ≅), divisibility (=, |), or inclusion (=, ⊆).  '=' is neutral;
// the chain COMMITS to a family at its first non-= operator, and a
// cross-family token is not consumed - the Chain rule's repetition ends
// before it.  A parameterized-congruence chain moreover commits to its
// MODULUS: the whole point of a transitive chain is
// its transitive conclusion, and congruences compose only when the
// moduli agree, so a cong step whose parameters differ structurally
// from the committed ones ends the chain exactly like a cross-family
// token - 'a cong_(2) b cong_(3) c' is the one-step chain ((≅ 2) a b)
// followed by leftover LCs, never one trans_chain.  (The comparison is
// notation-level structural equality with fmt and parentheses stripped,
// so cong_( m ) matches cong_(m) but cong_(2) does not match
// cong_(1+1).)  The expression dialog's planned chain gate rejects any
// input that parses to a trans_chain plus leftovers, which is how a
// mismatched modulus surfaces to the user as a refusal rather than a
// silent split.
//
// The gate state lives in a frame stack on exactly the climb pattern
// above: the grammar pushes a frame with chainEnter only after the
// FIRST step has fully parsed (the first step is ungated - any chain
// operator may open a chain), from which point the Chain rule is a min-0
// repetition plus its final action, a path that cannot fail, so every
// pushed frame is popped exactly once by resolveChain.  chainAccepts is
// a pure check run before a continuation step's right-hand side parses;
// chainTake records the family only after the whole step has parsed, so
// a step that backtracks (rhs fails) cannot commit the chain to a
// family.  Balanced under re-entrancy (a parenthesized chain inside an
// operand pushes and pops its own frame) and under --cache (a cached
// Chain result skips push and pop together; the gate is deterministic
// per activation because each frame's initial state is a function of
// the first step alone).

const chainFrames = []

// the family of a chain-step operator: '=' is neutral (null), a
// parameterized step (the only non-string ChainOp) is the param family,
// and every other operator resolves through the table's head → family
// map (the string '≅' is always the BARE congruence family - the
// parameterized one has no bare-head surface)
const chainFamily = o =>
  typeof o !== 'string' ? chainParamFamily
                        : o === '=' ? null : chainOpFamily[o]

// (structural parameter equality - stripNode/sameParams - is shared with
// the climb gate and defined in the climb section above)

// begin a chain activation after its first step (grammar & predicate:
// always true).  A cong first step commits both the family and the
// modulus.
export const chainEnter = firstOp => {
  chainFrames.push({ family: chainFamily(firstOp),
                     congOp: typeof firstOp !== 'string' ? firstOp : null })
  return true
}

// may the chain consume this operator? '=' always; any other operator
// only if the chain is uncommitted or committed to the operator's own
// family - and a parameterized-congruence operator additionally only if
// its parameters structurally equal the committed ones
export const chainAccepts = o => {
  const fam = chainFamily(o)
  if ( fam === null ) return true
  const frame = chainFrames[chainFrames.length - 1]
  if ( frame.family === null ) return true
  if ( frame.family !== fam ) return false
  return fam !== chainParamFamily ||
         sameParams(o.params, frame.congOp.params)
}

// may a BARE operator mention be the first operand of a chain opening
// with this operator?  Only for the bareLeft families (| and ⊆);
// the neutral '=' and the parameterized ops never open one.
// A pure check consulted by the grammar's BareChain rule BEFORE the
// frame is pushed, so it takes the operator directly.
const bareLeftHeads = new Set( chainFamilies
  .filter( fam => fam.bareLeft === true )
  .flatMap( fam => fam.ops.map( op => op.head ) ) )
export const chainBareAccepts = o =>
  typeof o === 'string' && bareLeftHeads.has(o)

// record a fully-parsed step's operator (grammar & predicate: always
// true): the first non-= operator commits the chain to its family (and,
// for cong, its modulus)
export const chainTake = o => {
  const frame = chainFrames[chainFrames.length - 1]
  if ( frame.family === null ) {
    frame.family = chainFamily(o)
    if ( typeof o !== 'string' ) frame.congOp = o
  }
  return true
}

// end a chain activation: pop the frame and build the chain node
export const resolveChain = (first, s, t) => {
  chainFrames.pop()
  return { type: 'chain', first, steps: [ s, ...t ] }
}
