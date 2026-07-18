///////////////////////////////////////////////////////////////////////////
// Golden-file regression tests for the Lurch notation parsers
//
// This backs the .parsertest command in Lode.  It checks not only that the
// parser test files parse without errors, but locks in the exact putdown and
// LaTeX output of every test line in a snapshot file, so that any change to
// the .peggy grammars that alters existing behavior - a precedence change, a
// changed translation, a new parse failure - is detected, not just crashes.
//
// Usage, either from Lode:
//
//   .parsertest              check all outputs against the snapshot
//   .parsertest --update     regenerate the snapshot file
//   .parsertest --verbose    also print every input and output
//
// or standalone (from the lde/src/experimental folder):
//
//   node parsers/parsertests.js [--update] [--verbose]
//
// Snapshots live in parser-test-snapshots.json next to this file.  The
// intended workflow after deliberately changing parser behavior is to run
// with --update and review the resulting snapshot diff with git before
// committing.  Standalone, a nonzero exit code means at least one test
// failed.
//
// Test suites:
//   - 'lines' suites parse each noncomment line of the file individually with
//     both parsers (the same filtering used by parseLines in parsing.js) and
//     every line must parse in both.
//   - 'errors' suites contain lines that must FAIL to parse in both parsers,
//     to lock in rejection of invalid syntax.
//   - 'whole' suites parse the entire file as a single input.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as lurchToPutdown } from './lurch-to-putdown.js'
import { parse as lurchToTex } from './lurch-to-tex.js'
import Pens from '../pens.js'
const { defaultPen, itemPen, stringPen, contextPen, xPen, checkPen,
        greencheck, redx } = Pens

const here = path.dirname(fileURLToPath(import.meta.url))
const snapshotPath = path.join(here, 'parser-test-snapshots.json')

// sentinel stored in the snapshot for inputs that are expected to fail
const ERROR = '(parse error)'
// snapshot key used for 'whole' suites
const WHOLE = '(whole file)'

const parsers = { putdown: lurchToPutdown, tex: lurchToTex }

const suites = [
  { file: 'LurchParserTests',      mode: 'lines',  opts: {} },
  { file: 'LurchParserSetTests',   mode: 'lines',  opts: { enableSets: true } },
  { file: 'TopDownTests',          mode: 'lines',  opts: {} },
  { file: 'LurchParserErrorTests', mode: 'errors', opts: {} },
  // the multiline environment test document is only parsed by the putdown
  // parser (the tex parser does not currently parse it in its entirety)
  { file: 'LurchParserTest',       mode: 'whole',  opts: {}, parsers: ['putdown'] }
]

// the same line filtering used by parseLines in parsing.js
const loadLines = file =>
  fs.readFileSync(path.join(here, file + '.lurch'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.slice(0, 2) !== '//')

const runParser = (parser, input, opts) => {
  try { return parser(input, { ...opts }) }
  catch { return ERROR }
}

// compute { input : output } for one suite with one parser
const computeResults = (suite, parserName) => {
  const parser = parsers[parserName]
  if (suite.mode === 'whole') {
    const input = fs.readFileSync(path.join(here, suite.file + '.lurch'), 'utf8')
    return { [WHOLE]: runParser(parser, input, suite.opts) }
  }
  const results = {}
  loadLines(suite.file).forEach(line =>
    results[line] = runParser(parser, line, suite.opts))
  return results
}

/**
 * Run all of the parser golden-snapshot test suites.
 *
 * @param {string[]} [args] - option flags: '--update' regenerates the
 *   snapshot file instead of comparing, '--verbose' prints every input and
 *   output
 * @returns {number} the number of test failures (0 means all passed)
 */
export const runParserTests = (args = []) => {
  const update = args.includes('--update')
  const verbose = args.includes('--verbose')

  const oldSnapshot = fs.existsSync(snapshotPath)
    ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    : {}

  let failures = 0, warnings = 0, total = 0
  const newSnapshot = {}

  suites.forEach(suite => {
    newSnapshot[suite.file] = {}
    const suiteParsers = suite.parsers || Object.keys(parsers)
    suiteParsers.forEach(parserName => {
      const label = `${suite.file} (${parserName})`
      const results = computeResults(suite, parserName)
      newSnapshot[suite.file][parserName] = results
      const snap = oldSnapshot?.[suite.file]?.[parserName] || {}
      let ok = 0
      Object.entries(results).forEach(([input, output]) => {
        total++
        if (verbose) console.log(`${contextPen(label)}\n` +
          `  ${itemPen(input)}\n  → ${stringPen(output)}`)
        // structural expectations that hold with or without a snapshot
        if (suite.mode === 'errors' && output !== ERROR) {
          failures++
          console.log(`${redx} ${xPen(label +
                      ': expected a parse error but it parsed:')}\n` +
                      `    input:  ${itemPen(input)}\n` +
                      `    output: ${stringPen(output)}`)
          return
        }
        if (suite.mode !== 'errors' && output === ERROR) {
          failures++
          console.log(`${redx} ${xPen(label + ': failed to parse:')}\n` +
                      `    input: ${itemPen(input)}`)
          return
        }
        if (update) { ok++; return }
        // snapshot comparison
        if (!(input in snap)) {
          failures++
          console.log(`${redx} ${xPen(label +
                      ': no snapshot for new test (run with --update):')}\n` +
                      `    input: ${itemPen(input)}`)
        } else if (snap[input] !== output) {
          failures++
          console.log(`${redx} ${xPen(label + ': output changed:')}\n` +
                      `    input:    ${itemPen(input)}\n` +
                      `    expected: ${stringPen(snap[input])}\n` +
                      `    actual:   ${stringPen(output)}`)
        } else ok++
      })
      // snapshot entries whose input line no longer exists are just warnings,
      // since deleting a test is presumed deliberate (--update removes them)
      if (!update) Object.keys(snap).forEach(input => {
        if (!(input in results)) {
          warnings++
          console.log(contextPen(
            `⚠ ${label}: stale snapshot entry (input no longer tested):`) +
            `\n    input: ${itemPen(input)}`)
        }
      })
      const n = Object.keys(results).length
      console.log(`${defaultPen(label + ':')} ` +
                  `${ok === n ? greencheck : redx} ${ok}/${n} ok`)
    })
  })

  if (update) {
    if (failures) {
      console.log('\n' + xPen(`✗ Snapshot NOT updated: fix the ${failures}` +
                              ` failure(s) above first.`))
    } else {
      fs.writeFileSync(snapshotPath, JSON.stringify(newSnapshot, null, 2) + '\n')
      console.log('\n' + checkPen(
        `Snapshot updated: ${snapshotPath} (${total} entries)`))
    }
  } else {
    const pen = failures ? xPen : checkPen
    console.log('\n' + pen(`${total} tests, ${total - failures} passed, ` +
                `${failures} failed` +
                (warnings ? `, ${warnings} warning(s)` : '')))
  }
  return failures
}

// run as a command line tool if invoked directly rather than imported
if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = runParserTests(process.argv.slice(2)) ? 1 : 0
