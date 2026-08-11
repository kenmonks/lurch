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
//   .parsertest --audit      also (re)generate parser-intersection-audit.md
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
//   - 'blocks' suites parse each blank-line-separated block of noncomment
//     lines as a single (possibly multi-line) input; every block must parse.
//     Used for multi-line transitive chains, where newline positions inside
//     the input are significant.
//   - 'audit' suites snapshot both outputs with NO requirement that the
//     input parse: parse errors are locked in like any other output.  Used
//     for the makedoc.js examples.  The
//     --audit flag generates parser-intersection-audit.md, a report of all
//     inputs rendered successfully in one notation but not the other.
//
// After the snapshot suites, the table-derived property tests run
// (table-property-tests.js): the notation-table linter plus generated
// alias-consistency, mention, big-operator, and canonical round-trip
// properties.  They are snapshot-free, so --update does not affect them,
// but their failures fail the run.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { lurchToPutdown, lurchToLatex as lurchToTex } from './index.js'
import { runTablePropertyTests } from './table-property-tests.js'
import { runNotationGate } from './notation-parity.js'
import { syntax as makedocSyntax } from './makedoc.js'
import Pens from '../pens.js'
const { defaultPen, itemPen, stringPen, contextPen, xPen, checkPen,
        greencheck, redx } = Pens

const here = path.dirname(fileURLToPath(import.meta.url))
const snapshotPath = path.join(here, 'parser-test-snapshots.json')
const auditPath = path.join(here, 'parser-intersection-audit.md')

// sentinel stored in the snapshot for inputs that are expected to fail
const ERROR = '(parse error)'
// snapshot key used for 'whole' suites
const WHOLE = '(whole file)'

export const parsers = { putdown: lurchToPutdown, tex: lurchToTex }

// every documented input (each synonym) from the syntax table in
// makedoc.js - that table's declarable rows derive from
// lurch-notation.txt, so the notation file's surfaces and example: lines
// are corpus-locked here automatically; the docs page renders its
// examples with enableSets:true, so the tests parse them the same way
const makedocInputs = [ ...new Set(
  makedocSyntax.filter(row => typeof row !== 'string')
    .flatMap(row => row)
    .map(s => s.trim())
) ]

export const suites = [
  { file: 'LurchParserTests',          mode: 'lines',  opts: {} },
  { file: 'LurchParserSetTests',       mode: 'lines',  opts: { enableSets: true } },
  { file: 'LurchParserSetBuilderTests', mode: 'lines', opts: { enableSets: true } },
  { file: 'LurchParserSequentTests',   mode: 'lines',  opts: {} },
  { file: 'TopDownTests',              mode: 'lines',  opts: {} },
  { file: 'LurchParserChainTests',     mode: 'blocks', opts: {} },
  { file: 'LurchParserErrorTests',     mode: 'errors', opts: {} },
  // not a file: the inputs come from the syntax table in makedoc.js
  { file: 'MakedocExamples',           mode: 'audit',
    opts: { enableSets: true },        inputs: makedocInputs },
  // the multiline environment test document is only parsed by the putdown
  // parser (the tex parser does not currently parse it in its entirety)
  { file: 'LurchParserTest',           mode: 'whole',  opts: {},
    parsers: ['putdown'] }
]

// the same line filtering used by parseLines in parsing.js
const loadLines = file =>
  fs.readFileSync(path.join(here, file + '.lurch'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.slice(0, 2) !== '//')

// blank-line-separated blocks of noncomment lines, each a multi-line input
const loadBlocks = file => {
  const blocks = [], current = []
  const flush = () => {
    if (current.length) blocks.push(current.join('\n'))
    current.length = 0
  }
  fs.readFileSync(path.join(here, file + '.lurch'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .forEach(line => {
      if (line.length === 0 || line.slice(0, 2) === '//') flush()
      else current.push(line)
    })
  flush()
  return blocks
}

// the list of individual inputs for any suite mode other than 'whole'
export const suiteInputs = suite =>
  suite.inputs ? suite.inputs :
  suite.mode === 'blocks' ? loadBlocks(suite.file) :
  loadLines(suite.file)

const runParser = (parser, input, opts) => {
  try { return parser(input, { ...opts }) }
  catch { return ERROR }
}

// When a changed output is too large to eyeball (e.g. a 'whole' suite, where
// expected and actual are each an entire file), print only the first point
// where the two strings differ: DIFF_CONTEXT characters on each side of the
// first differing character, with '...' marking elided text and newlines
// escaped so the excerpt stays on one line.
const LONG_OUTPUT = 200
const DIFF_CONTEXT = 20
const excerptAt = (s, i) => {
  const from = Math.max(0, i - DIFF_CONTEXT)
  const to = Math.min(s.length, i + DIFF_CONTEXT + 1)
  return (from > 0 ? '...' : '') +
         s.slice(from, to).replaceAll('\n', '\\n').replaceAll('\t', '\\t') +
         (to < s.length ? '...' : '')
}
const firstDiff = (expected, actual) => {
  let i = 0
  while (i < expected.length && i < actual.length &&
         expected[i] === actual[i]) i++
  return { position: i,
           expected: excerptAt(expected, i),
           actual: excerptAt(actual, i) }
}

// compute { input : output } for one suite with one parser
const computeResults = (suite, parserName) => {
  const parser = parsers[parserName]
  if (suite.mode === 'whole') {
    const input = fs.readFileSync(path.join(here, suite.file + '.lurch'), 'utf8')
    return { [WHOLE]: runParser(parser, input, suite.opts) }
  }
  const results = {}
  suiteInputs(suite).forEach(input =>
    results[input] = runParser(parser, input, suite.opts))
  return results
}

// render a string as inline code or, if it is multi-line, a fenced block
const md = s => s.includes('\n')
  ? '\n  ```\n  ' + s.replaceAll('\n', '\n  ') + '\n  ```'
  : '`' + s + '`'

// Generate parser-intersection-audit.md from the computed snapshot: a report
// of every corpus input accepted by one parser but rejected by the other
// (plus documented examples rejected by both).
// The 'lines'/'blocks' suites cannot contribute
// (both parsers must succeed there) and 'errors' suites reject by design,
// so in practice divergences live in the 'audit' suites.
const writeAuditReport = snapshot => {
  const putdownOnly = [], texOnly = [], bothFail = []
  suites.forEach(suite => {
    if (suite.parsers) return           // single-parser suites cannot diverge
    const results = snapshot[suite.file]
    if (!results?.putdown || !results?.tex) return
    Object.keys(results.putdown).forEach(input => {
      const p = results.putdown[input], t = results.tex[input]
      const entry = { suite: suite.file, input, putdown: p, tex: t }
      if (p === ERROR && t === ERROR) {
        if (suite.mode !== 'errors') bothFail.push(entry)
      }
      else if (t === ERROR) putdownOnly.push(entry)
      else if (p === ERROR) texOnly.push(entry)
    })
  })
  const section = (title, entries, showParser) =>
    `## ${title} (${entries.length})\n\n` +
    (entries.length === 0 ? 'None.\n' : entries.map(e =>
      `- ${md(e.input)} — in \`${e.suite}\`` +
      (showParser ? `\n  - ${showParser}: ${md(e[showParser])}` : '')
    ).join('\n') + '\n')
  const report =
`# Parser Intersection Audit

Generated by \`node parsers/parsertests.js --audit\` — do not edit by hand.
This report lists every input in the golden-test corpus whose putdown
rendering succeeds while its tex rendering fails, or vice versa.  Both
notations come from the single unified
grammar, so the two can only diverge if one of
the printers rejects a tree the other accepts.

${section('Accepted by putdown only', putdownOnly, 'putdown')}
${section('Accepted by tex only', texOnly, 'tex')}
${section('Rejected by both parsers (documented syntax that does not parse)',
  bothFail)}`
  fs.writeFileSync(auditPath, report)
  console.log(checkPen(`Intersection audit written: ${auditPath} ` +
    `(${putdownOnly.length} putdown-only, ${texOnly.length} tex-only, ` +
    `${bothFail.length} rejected by both)`))
}

/**
 * Run all of the parser golden-snapshot test suites.
 *
 * @param {string[]} [args] - option flags: '--update' regenerates the
 *   snapshot file instead of comparing, '--verbose' prints every input and
 *   output, '--audit' (re)generates parser-intersection-audit.md
 * @returns {number} the number of test failures (0 means all passed)
 */
export const runParserTests = (args = []) => {
  const update = args.includes('--update')
  const verbose = args.includes('--verbose')
  const audit = args.includes('--audit')

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
        if (suite.mode !== 'errors' && suite.mode !== 'audit' &&
            output === ERROR) {
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
          if (snap[input].length > LONG_OUTPUT || output.length > LONG_OUTPUT) {
            const d = firstDiff(snap[input], output)
            console.log(`${redx} ${xPen(label +
                        `: output changed (first difference at character ` +
                        `${d.position}):`)}\n` +
                        `    input:    ${itemPen(input)}\n` +
                        `    expected: ${stringPen(d.expected)}\n` +
                        `    actual:   ${stringPen(d.actual)}`)
          } else {
            console.log(`${redx} ${xPen(label + ': output changed:')}\n` +
                        `    input:    ${itemPen(input)}\n` +
                        `    expected: ${stringPen(snap[input])}\n` +
                        `    actual:   ${stringPen(output)}`)
          }
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

  if (audit) writeAuditReport(newSnapshot)

  // Set-mode invariance: the enableSets mode's entire surface is
  // brace handling, so an input containing no brace must parse
  // identically in both modes.  Checked over the whole line-level corpus
  // in both notations; a failure means brace handling leaked outside
  // braces.  (The whole-file suite is skipped: its document contains
  // braces by design.)
  {
    let checked = 0, bad = 0
    suites.forEach( suite => {
      if ( suite.mode === 'whole' ) return
      const suiteParsers = suite.parsers || Object.keys(parsers)
      suiteInputs(suite).forEach( input => {
        if ( input.includes('{') || input.includes('}') ) return
        suiteParsers.forEach( parserName => {
          checked++
          const here = runParser(parsers[parserName], input, suite.opts)
          const flipped = runParser(parsers[parserName], input,
            { ...suite.opts, enableSets: !suite.opts.enableSets })
          if ( here !== flipped ) {
            bad++
            failures++
            console.log(`${redx} ${xPen(
              `set-mode invariance (${parserName}): brace-free input` +
              ` parses differently with enableSets flipped:`)}\n` +
              `    input:            ${itemPen(input)}\n` +
              `    enableSets ${suite.opts.enableSets ? 'on ' : 'off'}:` +
              `   ${stringPen(here)}\n` +
              `    enableSets ${suite.opts.enableSets ? 'off' : 'on '}:` +
              `   ${stringPen(flipped)}`)
          }
        } )
      } )
    } )
    console.log(`${defaultPen('set-mode invariance:')} ` +
                `${bad === 0 ? greencheck : redx} ${checked - bad}/` +
                `${checked} brace-free parses mode-invariant`)
  }

  // the table-derived property tests (table-property-tests.js):
  // snapshot-free properties generated from the notation tables - the
  // table linter, alias/mention/big-op consistency, and the canonical
  // round-trip over the generated forms and this corpus
  let propertyFailures = runTablePropertyTests(
    verbose ? ['--verbose'] : [])

  // the notation freshness gate
  // (notation-parity.js): lurch-notation.txt on disk must compile
  // clean through the loader, pass the structural linter (with file/line
  // provenance), match the lurch-notation-compiled.js transport wrapper's
  // embedded hash, and deep-equal the live tables
  propertyFailures += runNotationGate( verbose ? ['--verbose'] : [] )

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
    const pen = failures || propertyFailures ? xPen : checkPen
    console.log('\n' + pen(`${total} tests, ${total - failures} passed, ` +
                `${failures} failed` +
                (propertyFailures
                  ? `, ${propertyFailures} property failure(s)` : '') +
                (warnings ? `, ${warnings} warning(s)` : '')))
  }
  return failures + propertyFailures
}

// run as a command line tool if invoked directly rather than imported
if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = runParserTests(process.argv.slice(2)) ? 1 : 0
