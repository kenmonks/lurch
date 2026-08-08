///////////////////////////////////////////////////////////////////////////
// Performance baseline for the Lurch notation parsers
//
// A recorded performance
// baseline that any parser change can compare against: the expression
// dialog parses on every keystroke, so parsing must stay effectively
// instantaneous.  This measures
//
//   1. the wall time to parse the entire golden-test corpus (every input of
//      every suite in parsertests.js) with each parser, and
//   2. the per-parse time of a few large, dialog-sized expressions.
//
// Usage (from the lde/src/experimental folder):
//
//   node parsers/parser-perf.js          measure and compare to the baseline
//   node parsers/parser-perf.js --save   measure and (re)write the baseline
//
// The baseline lives in parser-perf-baseline.json next to this file and is
// committed, so that any later change can re-run this script
// and see the difference.  Timings are medians over several runs; treat small
// deltas (say under 20%) as noise, since they also vary with machine load.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { performance } from 'perf_hooks'
import { suites, suiteInputs, parsers } from './parsertests.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const baselinePath = path.join(here, 'parser-perf-baseline.json')

// every (input, opts) pair in the corpus, including the whole-file suites
const corpus = { putdown: [], tex: [] }
suites.forEach(suite => {
  const inputs = suite.mode === 'whole'
    ? [fs.readFileSync(path.join(here, suite.file + '.lurch'), 'utf8')]
    : suiteInputs(suite)
  const suiteParsers = suite.parsers || Object.keys(parsers)
  suiteParsers.forEach(parserName =>
    inputs.forEach(input => corpus[parserName].push([input, suite.opts])))
})

// large dialog-sized expressions, of the kind the expression editor parses
// per keystroke; all parse in both parsers
const big = n => Array.from({ length: n }, (_, k) => k)
const largeExpressions = {
  'long sum (200 terms)':
    big(200).map(k => `${k % 10}`).join('+'),
  'products and powers (60 factors)':
    big(60).map(k => `x^${k % 7}`).join(' cdot '),
  'nested parens (40 deep)':
    '('.repeat(40) + 'x' + ')'.repeat(40) + '+1',
  'propositional (50 connectives)':
    big(25).map(() => '(P and Q)').join(' implies '),
  'quantifiers and sums':
    'forall epsilon in RR.exists N in NN.forall n in NN.' +
    '(n leq N implies abs(sum(1/k^2,k,1,n)-L) leq epsilon)',
  'chain (10 steps)':
    'x' + big(10).map(k => ` = x+${k}-${k}`).join('') + ' by algebra'
}

const timeOnce = (parser, jobs) => {
  const start = performance.now()
  jobs.forEach(([input, opts]) => {
    try { parser(input, { ...opts }) } catch {}
  })
  return performance.now() - start
}

const median = a => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const round = x => Math.round(x * 1000) / 1000

// median-of-RUNS wall time for a list of jobs, after one warmup pass
const measure = (parser, jobs, runs = 7) => {
  timeOnce(parser, jobs)
  return median(big(runs).map(() => timeOnce(parser, jobs)))
}

const results = { corpus: {}, expressions: {} }
Object.entries(parsers).forEach(([name, parser]) => {
  results.corpus[name] = {
    inputs: corpus[name].length,
    totalMs: round(measure(parser, corpus[name]))
  }
})
Object.entries(largeExpressions).forEach(([label, input]) => {
  results.expressions[label] = { chars: input.length }
  Object.entries(parsers).forEach(([name, parser]) => {
    // per-parse time: median over runs, each run averaging 20 parses
    const jobs = big(20).map(() => [input, {}])
    results.expressions[label][name + 'Ms'] = round(measure(parser, jobs) / 20)
  })
})

const report = {
  recorded: new Date().toISOString(),
  node: process.version,
  cpu: os.cpus()[0]?.model || 'unknown',
  platform: `${os.platform()} ${os.arch()}`,
  ...results
}

console.log(JSON.stringify(report, null, 2))

if (process.argv.includes('--save')) {
  fs.writeFileSync(baselinePath, JSON.stringify(report, null, 2) + '\n')
  console.log(`\nBaseline saved: ${baselinePath}`)
} else if (fs.existsSync(baselinePath)) {
  const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  console.log(`\nCompared to baseline recorded ${base.recorded} ` +
    `(node ${base.node}, ${base.cpu}):`)
  Object.keys(parsers).forEach(name => {
    const now = results.corpus[name].totalMs
    const then = base.corpus?.[name]?.totalMs
    if (!then) return
    const delta = Math.round(100 * (now - then) / then)
    console.log(`  corpus ${name}: ${now}ms vs ${then}ms ` +
      `(${delta >= 0 ? '+' : ''}${delta}%)`)
  })
} else {
  console.log(`\nNo baseline found; run with --save to record one.`)
}
