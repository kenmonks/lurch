///////////////////////////////////////////////////////////////////////////
// Post-compile patch for the generated parsers: Map-based results cache
//
// peggy 3's --cache stores memoized rule results in a plain object keyed
// by the sparse integers  position * ruleCount + ruleIndex.  V8 keeps such
// an object in dictionary mode, and its numeric-dictionary lookups degrade
// unpredictably with the key distribution - which depends on the input's
// length and rule-attempt positions.  Measured on the whole-file test
// document (LurchParserTest.lurch, ~11KB): editing only the text of its
// // comments (which shifts every downstream position) swung the parse
// time between 11ms and 66ms, and replacing the object with a Map holding
// the same integer keys made every variant parse in ~13-16ms with
// identical output.
//
// This script rewrites the generated parser's cache to that Map.  It is
// run automatically by Lode's .compileparser command right after peggy,
// is idempotent, and fails loudly if peggy's generated cache code ever
// changes shape (so a peggy upgrade cannot silently lose the patch).
//
// Usage:  node fix-parser-cache.js <generated-parser.js> [...]

import fs from 'fs'

const substitutions = [
  [ /var peg\$resultsCache = \{\};/g,
    'var peg$resultsCache = new Map();' ],
  [ /var cached = peg\$resultsCache\[key\];/g,
    'var cached = peg$resultsCache.get(key);' ],
  [ /peg\$resultsCache\[key\] = \{ nextPos: peg\$currPos, result: s0 \};/g,
    'peg$resultsCache.set(key, { nextPos: peg$currPos, result: s0 });' ]
]

const patch = file => {
  let src = fs.readFileSync(file, 'utf8')
  if ( src.includes('peg$resultsCache = new Map()') ) {
    console.log(`${file}: already patched`)
    return
  }
  substitutions.forEach( ([ pattern, replacement ]) => {
    const count = ( src.match(pattern) || [] ).length
    if ( count === 0 )
      throw new Error(`${file}: pattern not found - peggy's generated ` +
        `cache code has changed shape; update fix-parser-cache.js: ` +
        pattern)
    src = src.replace(pattern, replacement)
  } )
  fs.writeFileSync(file, src)
  console.log(`${file}: cache patched to Map`)
}

process.argv.slice(2).forEach(patch)
