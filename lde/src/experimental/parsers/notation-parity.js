///////////////////////////////////////////////////////////////////////////
// The notation freshness gate
//
// The live tables ARE loader output, compiled at import time from the
// text embedded in lurch-notation-compiled.js, so this gate checks the
// FRESHNESS and WELL-FORMEDNESS of the notation file on disk:
//
//   1. lurch-notation.txt compiles through the loader with no errors
//      (each error names its file line), so an edit is vetted here
//      before .compilenotation embeds it;
//   2. the freshly compiled tables pass the full structural lint with
//      file/line provenance (the same linter the parser runs at load
//      time over the live tables);
//   3. the transport wrapper is not stale: its embedded sha256 matches
//      the .txt on disk (edit + forgotten .compilenotation fails here);
//   4. the fresh compile deep-equals the LIVE tables - normally implied
//      by 3, but this names the exact row and field if the generated
//      wrapper is ever edited by hand or the two ever drift.
//
// Run standalone
//
//   node parsers/notation-parity.js [--verbose]
//
// or via the golden suite (parsertests.js runs it after the property
// tests).

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { loadNotation } from './notation-loader.js'
import * as live from './notation-tables.js'
import { lintNotationTables } from './table-linter.js'
import { buildWordClassClaims, chainOpRowsOf } from './expression-core.js'
import Pens from '../pens.js'
const { defaultPen, greencheck, redx } = Pens

const here = path.dirname(fileURLToPath(import.meta.url))
export const notationFilePath = path.join(here, 'lurch-notation.txt')
const compiledPath = path.join(here, 'lurch-notation-compiled.js')

// the declarable exports: everything else in
// notation-tables.js is engine machinery or derived from these by shared
// code (chainOpFamily, autoDeclaredConstants, ...), so equality on these
// implies equality downstream
const DECLARABLE = [
  'phrases', 'UnicodeNames', 'internalNames', 'texSymbols', 'isaNouns',
  'relationRows', 'paramOpRows', 'chainFamilies', 'propRows', 'setAlgRows',
  'bigOpRows', 'delimitedRows', 'putdownLeadingSymbolRenames',
  'operatorHeadTex'
]

// structural deep-compare collecting per-path differences (object key
// order is immaterial, array order is data)
const diff = (expected, actual, at, out, depthLimit = 40) => {
  if ( out.length > depthLimit ) return
  if ( expected === actual ) return
  const te = typeof expected, ta = typeof actual
  if ( te !== 'object' || ta !== 'object' ||
       expected === null || actual === null ) {
    out.push(`${at}: expected ${JSON.stringify(expected)}, got` +
             ` ${JSON.stringify(actual)}`)
    return
  }
  if ( Array.isArray(expected) !== Array.isArray(actual) ) {
    out.push(`${at}: expected ${ Array.isArray(expected) ? 'array' : 'object' }`)
    return
  }
  if ( Array.isArray(expected) ) {
    if ( expected.length !== actual.length )
      out.push(`${at}: expected length ${expected.length}, got` +
               ` ${actual.length}`)
    const n = Math.min(expected.length, actual.length)
    for ( let i = 0; i < n; i++ )
      diff(expected[i], actual[i], `${at}[${i}]`, out, depthLimit)
    return
  }
  const keys = new Set( [ ...Object.keys(expected), ...Object.keys(actual) ] )
  keys.forEach( k => {
    if ( !(k in actual) )
      out.push(`${at}.${k}: missing (expected ${JSON.stringify(expected[k])})`)
    else if ( !(k in expected) )
      out.push(`${at}.${k}: unexpected ${JSON.stringify(actual[k])}`)
    else diff(expected[k], actual[k], `${at}.${k}`, out, depthLimit)
  } )
}

// a one-line label for an array entry, to make length mismatches readable
const rowLabel = row =>
  typeof row !== 'object' || row === null ? JSON.stringify(row)
  : Array.isArray(row) ? JSON.stringify(row)
  : row.head !== undefined
    ? `head '${row.head}' (${ ( row.aliases ?? [] ).map( a =>
        a.words.map( w => w.w ).join(' ') ).join(' / ') })`
  : row.family !== undefined ? `family '${row.family}'`
  : row.noun !== undefined ? `noun '${row.noun}'`
  : row.lit !== undefined ? `'${row.lit}' → '${row.out ?? row.lit}'`
  : JSON.stringify(row).slice(0, 60)

/**
 * Lint a fresh compile of the notation file through the same structural
 * linter the parser runs at load time, with file/line provenance.
 * Derived inputs are rebuilt from the fresh tables with the very
 * functions the engine uses; the engine-owned inputs (structural
 * keywords, operator words, precedence) come from the live tables, which
 * is correct because they are constants, not file-derived.  Shared by
 * runNotationGate below and by compile-notation.js, so that a wrapper is
 * never written for a file the parser would refuse to load ("if it
 * compiles, it works when loaded").
 *
 * @param {object} tables - a loadNotation result's tables
 * @param {Map} lineOf - its provenance map
 * @returns {{errors: string[], warnings: string[]}}
 */
export const lintFreshCompile = (tables, lineOf) =>
  lintNotationTables( {
    ...tables,
    wordClassClaims: buildWordClassClaims( {
      ...tables,
      structuralKeywords: live.structuralKeywords,
      extraOperatorWords: live.extraOperatorWords } ),
    chainOpRows: chainOpRowsOf(tables.chainFamilies),
    internal: live.makeInternal( tables.internalNames, tables.bigOpRows ),
    autoDeclaredConstants: [ ...new Set( tables.bigOpRows.flatMap( row =>
      [ row.head, ...Object.values(row.forms).map( spec => spec.head )
                          .filter( h => h !== undefined ) ] ) ) ],
    precedence: live.precedence
  }, lineOf )

/**
 * Run the notation freshness gate: compile lurch-notation.txt from disk,
 * lint the result with file/line provenance, check the transport wrapper
 * is not stale, and deep-compare the fresh compile against the live
 * tables.
 *
 * @param {string[]} [args] - '--verbose' prints per-table row counts
 * @returns {number} the number of failures (0 = fresh and clean)
 */
export const runNotationGate = (args = []) => {
  const verbose = args.includes('--verbose')
  const text = fs.readFileSync(notationFilePath, 'utf8')
  const { tables, lineOf, errors } = loadNotation(text, live.precedence)
  let failures = 0
  errors.forEach( e => {
    failures++
    console.log(`✗ notation loader: ${e}`)
  } )
  // lint the fresh compile through the same structural linter the parser
  // runs at load time over the live tables, with file/line provenance:
  // this is the error channel - a bad declaration reports its
  // lurch-notation.txt line.
  const lint = lintFreshCompile(tables, lineOf)
  lint.errors.forEach( e => {
    failures++
    console.log(`✗ notation lint: ${e}`)
  } )
  lint.warnings.forEach( w =>
    console.log(`⚠ notation lint: ${w}`) )
  // transport staleness guard: lurch-notation-compiled.js embeds the
  // notation file and its sha256; a hash that no longer matches the .txt
  // on disk means someone edited the file without rerunning Lode's
  // .compilenotation (since the flip, the LIVE tables come from the
  // embedded copy, so a stale wrapper means the edit is not live)
  const hash = createHash('sha256').update(text).digest('hex')
  if ( !fs.existsSync(compiledPath) ) {
    failures++
    console.log(`✗ lurch-notation-compiled.js is missing - run` +
                ` .compilenotation in Lode`)
  } else {
    const embedded = fs.readFileSync(compiledPath, 'utf8')
      .match(/notationFileHash = "([0-9a-f]+)"/)?.[1]
    if ( embedded !== hash ) {
      failures++
      console.log(`✗ lurch-notation-compiled.js is STALE (embedded hash` +
                  ` ${ embedded?.slice(0, 12) ?? 'missing' }… ≠ file hash` +
                  ` ${ hash.slice(0, 12) }…) - lurch-notation.txt was` +
                  ` edited without rerunning .compilenotation in Lode`)
    }
  }
  // freshness proper: the fresh compile of the .txt on disk must
  // deep-equal the LIVE tables, naming the exact row and field on drift
  DECLARABLE.forEach( name => {
    const out = []
    diff( tables[name], live[name], name, out )
    if ( out.length ) {
      failures += out.length
      console.log(`✗ freshness: live '${name}' differs from` +
                  ` lurch-notation.txt on disk (rerun .compilenotation):`)
      out.slice(0, 25).forEach( d => console.log(`    ${d}`) )
      if ( out.length > 25 ) console.log(`    ... ${out.length - 25} more`)
      if ( Array.isArray(tables[name]) && Array.isArray(live[name]) &&
           tables[name].length !== live[name].length ) {
        console.log(`    disk rows:`)
        tables[name].forEach( (r, i) =>
          console.log(`      [${i}] ${rowLabel(r)}`) )
        console.log(`    live rows:`)
        live[name].forEach( (r, i) =>
          console.log(`      [${i}] ${rowLabel(r)}`) )
      }
    } else if ( verbose ) {
      const n = Array.isArray(tables[name]) ? tables[name].length
                : Object.keys(tables[name]).length
      console.log(`✓ fresh: ${name} (${n} entries)`)
    }
  } )
  if ( failures === 0 )
    console.log(`${defaultPen('notation gate:')} ${greencheck} ` +
                `lurch-notation.txt compiles clean, lints clean, and is` +
                ` live (${DECLARABLE.length} exports)`)
  else
    console.log(`${defaultPen('notation gate:')} ${redx} ` +
                `${failures} failure(s)`)
  return failures
}

// run as a command line tool if invoked directly rather than imported
if ( process.argv[1] &&
     path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) )
  process.exitCode = runNotationGate(process.argv.slice(2)) ? 1 : 0
