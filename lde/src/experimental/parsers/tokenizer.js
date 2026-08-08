///////////////////////////////////////////////////////////////////////////
// The tokenizer for the Lurch notation parser
//
// tokenize() is a context-aware normalizer.  The grammar is
// character-level peggy, so "tokenization" here means producing the
// normalized text the grammar consumes; the token classification in
// expression-core.js hangs its word lookup on this scan.
//
// The point is context-awareness: a global string replacement would
// reach inside «raw putdown escapes», "string literals", and // comments
// (padding their commas and colons, collapsing their spaces, replacing
// phrases and toxic unicode inside them, and rewriting their braces
// under enableSets), so those regions are made genuinely opaque:
//
//   pass A  segment the input into normal / «escape» / "string" /
//           // comment spans in one left-to-right scan (the three quoted
//           rule-name phrases are kept in normal text, not opened as
//           strings, so they can still be replaced below);
//   pass B  apply the transformation pipeline - lone-➤ lines, tabs
//           to spaces, comma and colon padding, space shrinking, the
//           phrase table, the unicode table - to the NORMAL
//           segments only, reusing the table-driven helpers in
//           notation-tables.js, whose sequential semantics are
//           load-bearing (each replacement sees its predecessors'
//           output);
//   pass C  emit the segments in order, performing the transformations
//           that need cross-segment context: the label/by
//           set-bracket-to-parenthesis rewrite, the enableSets brace
//           replacement, and space collapsing - all skipping opaque
//           segments, which are emitted verbatim.

import { shrink, replacePhrases, phrases, replaceUnicodeChars }
  from './notation-tables.js'

///////////////////////////////////////////////////////////////////////////
// Pass A - segmentation

// the quoted rule-name phrases ('"algebra rule"' etc.), split into word
// lists for the flexible-whitespace match below
const quotedPhrases = phrases
  .filter( p => p[0].startsWith('"') )
  .map( p => p[0].toLowerCase().split(' ') )

// Does a quoted phrase match at pos (case-insensitively, any positive run
// of spaces/tabs between words)?
// Such text stays in a normal segment so pass B's phrase table replaces it.
const quotedPhraseLength = (input, pos) => {
  outer: for ( const words of quotedPhrases ) {
    let p = pos
    for ( let k = 0; k < words.length; k++ ) {
      if ( k > 0 ) {
        const s = p
        while ( input[p] === ' ' || input[p] === '\t' ) p++
        if ( p === s ) continue outer
      }
      const w = words[k]
      if ( input.substr(p, w.length).toLowerCase() !== w ) continue outer
      p += w.length
    }
    return p - pos
  }
  return -1
}

// Split the input into segments { type, text, atLineStart, atLineEnd }.
// Opaque segments run through their closing delimiter (» or ") or to end
// of input; a comment runs to (not including) the end of its line.
// atLineStart/atLineEnd record whether a normal segment begins/ends at a
// true line boundary, so the lone-➤ rule in pass B can anchor correctly
// (a segment cut short by a string on the same line does not end a line).
const segment = input => {
  const segs = []
  let start = 0, p = 0
  const atLineStart = i =>
    i === 0 || input[i-1] === '\n' || input[i-1] === '\r'
  const atLineEnd = i =>
    i === input.length || input[i] === '\n' || input[i] === '\r'
  const flushNormal = end => {
    if ( end > start )
      segs.push( { type: 'normal', text: input.slice(start, end),
                   atLineStart: atLineStart(start),
                   atLineEnd: atLineEnd(end) } )
  }
  const opaque = (type, end) => {
    flushNormal(p)
    segs.push( { type, text: input.slice(p, end) } )
    p = start = end
  }
  while ( p < input.length ) {
    const c = input[p]
    if ( c === '«' ) {
      const close = input.indexOf('»', p + 1)
      opaque('escape', close === -1 ? input.length : close + 1)
    } else if ( c === '"' ) {
      const m = quotedPhraseLength(input, p)
      if ( m > 0 ) { p += m; continue }
      const close = input.indexOf('"', p + 1)
      opaque('string', close === -1 ? input.length : close + 1)
    } else if ( c === '/' && input[p+1] === '/' ) {
      let q = p + 2
      while ( q < input.length && input[q] !== '\n' && input[q] !== '\r' ) q++
      opaque('comment', q)
    } else p++
  }
  flushNormal(p)
  return segs
}

///////////////////////////////////////////////////////////////////////////
// Pass B - the classic pipeline, per normal segment

// replace lines containing only a ➤ and whitespace with (the makings of)
// a line-break comment for Lode; ^ and $ may only match true line
// boundaries, so a segment that begins mid-line (after an escape on the
// same line) skips the anchor on its first line, and one that is cut
// short mid-line (by a string or comment following on the same line)
// skips it on its last
const arrowLines = (s, atLineStart, atLineEnd) => {
  const rewrite = t => t.replace(/^([ \t]*)➤[ \t]*$/mg, '$1➤ " " \n')
  let head = '', tail = ''
  if ( !atLineStart ) {
    const nl = s.search(/[\n\r]/)
    if ( nl === -1 ) return s
    head = s.slice(0, nl); s = s.slice(nl)
  }
  if ( !atLineEnd ) {
    const nl = Math.max(s.lastIndexOf('\n'), s.lastIndexOf('\r'))
    if ( nl === -1 ) return head + s
    tail = s.slice(nl + 1); s = s.slice(0, nl + 1)
  }
  return head + rewrite(s) + tail
}

const normalize = seg => {
  let s = seg.text
  s = arrowLines(s, seg.atLineStart, seg.atLineEnd)
  // tabs to spaces, pad commas and colons (colons only on the right, to
  // allow things like 'Rules:'), and collapse the doubled spaces
  s = s.replace(/\t/g, ' ')
  s = s.replace(/,/g, ' , ')
  s = s.replace(/:/g, ': ')
  s = shrink(s)
  // phrases and unicode, from the shared notation tables (quoted
  // operator names like '~' need no rewrite here: the grammar's uniform
  // mention rule parses them itself)
  s = replacePhrases(s, phrases)
  s = replaceUnicodeChars(s)
  return s
}

///////////////////////////////////////////////////////////////////////////
// Pass C - emission with cross-segment context

/**
 * Normalize a Lurch notation input string for the peggy
 * grammar.  «Raw putdown escapes», "string
 * literals", and // comments pass through verbatim; everything else gets
 * the normalization pipeline (lone-➤ lines, tab/comma/colon normalization,
 * phrase and unicode tables, label/by set-bracket protection, and - when options.enableSets
 * is on - the set-bracket replacement { } → ｛ ｝).
 *
 * @param {string} input - the raw input string
 * @param {object} [options] - parser options; only enableSets is consulted
 * @returns {string} the normalized text the grammar parses
 */
export const tokenize = (input, options = {}) => {
  const segs = segment(input)
  segs.forEach( seg => { if ( seg.type === 'normal' ) seg.text = normalize(seg) } )
  // the output is built as an array of chunks (never rejoined until the
  // end, so large inputs stay linear); only the characters the rewrites
  // below care about - '{' and '}' - are visited individually
  const out = []
  const ws = c => c === ' ' || c === '\t' || c === '\n' || c === '\r'
  // does the emitted text end with word-boundary + 'label' or 'by' +
  // optional whitespace?  Walks backward over chunk tails, so it never
  // rejoins the output
  const endsWithLabelBy = () => {
    let tail = ''
    for ( let i = out.length - 1; i >= 0 && tail.length < 8; i-- )
      for ( let j = out[i].length - 1; j >= 0; j-- ) {
        const c = out[i][j]
        if ( tail.length === 0 && ws(c) ) continue
        tail = c + tail
        if ( tail.length >= 8 ) break
      }
    return /(^|[^A-Za-z0-9_])(label|by)$/.test(tail)
  }
  // drop trailing whitespace from the emitted chunks (the whitespace
  // between the keyword and the brace is deleted, so 'by {L1}' becomes
  // 'by(L1)')
  const trimTrailingWs = () => {
    while ( out.length ) {
      const t = out[out.length - 1].replace(/[ \t\n\r]+$/, '')
      if ( t.length ) { out[out.length - 1] = t; return }
      out.pop()
    }
  }
  // append a chunk, collapsing a space run at the seam (pass B shrinks
  // spaces within each segment, so seams are the only place doubles can
  // appear)
  const emit = s => {
    if ( s.length === 0 ) return
    if ( s[0] === ' ' && out.length && out[out.length - 1].endsWith(' ') )
      s = s.slice(1)
    if ( s.length ) out.push(s)
  }
  // where the pending label/by close brace sits: [ segment index, char
  // index ], or null.  Only one can be pending at a time because the
  // content between the braces may not contain further braces.
  let pendingClose = null
  // find the brace closing the pair opened at (si, ci): the first '}'
  // after it, provided no '{' intervenes and at least one character of
  // content sits in between (the pair rewrites like
  // (\b(label|by)\s*)\{([^{}]+)\}  →  $2($3)).  Intervening opaque
  // segments count as content, but a close brace inside one is left
  // alone rather than rewritten, since opaque segments are emitted
  // verbatim.
  const findClose = (si, ci) => {
    let content = 0
    for ( let i = si; i < segs.length; i++ ) {
      const t = segs[i].text
      for ( let j = i === si ? ci + 1 : 0; j < t.length; j++ ) {
        const c = t[j]
        if ( c === '{' ) return null
        if ( c === '}' )
          return content > 0 && segs[i].type === 'normal' ? [i, j] : null
        content++
      }
    }
    return null
  }
  const special = /[{}]/g
  segs.forEach( (seg, si) => {
    if ( seg.type !== 'normal' ) {
      emit(seg.text)
      if ( pendingClose && pendingClose[0] === si ) pendingClose = null
      return
    }
    const t = seg.text
    let from = 0
    special.lastIndex = 0
    let m
    while ( ( m = special.exec(t) ) !== null ) {
      const j = m.index, c = t[j]
      emit(t.slice(from, j))
      from = j + 1
      if ( c === '{' ) {
        if ( pendingClose ) { emit(c); continue }   // cannot occur: guard
        // a set bracket right after 'label' or 'by' wraps a rule name or
        // citation: rewrite the pair to parentheses so enableSets cannot
        // turn it into a set (harmless, and done unconditionally, when
        // enableSets is off - both forms parse identically)
        const close = endsWithLabelBy() ? findClose(si, j) : null
        if ( close ) {
          trimTrailingWs()
          emit('(')
          pendingClose = close
        } else emit( options.enableSets ? '｛' : c )
      } else {                                      // c === '}'
        if ( pendingClose && pendingClose[0] === si && pendingClose[1] === j ) {
          emit(')')
          pendingClose = null
        } else emit( options.enableSets ? '｝' : c )
      }
    }
    emit(t.slice(from))
  })
  return out.join('')
}
