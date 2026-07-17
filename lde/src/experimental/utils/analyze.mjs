////////////////////////////////////////////////////////////////////////////
//
// analyze.mjs
//
// Summarize a V8 .cpuprofile file: rank every function by self time (time
// spent in the function's own code) and by inclusive time (time spent in the
// function plus everything it called).  This is useful for profiling the
// validation algorithm without any external tooling.
//
// To produce a profile, run the test suite (or any Lode script) under V8's
// sampling profiler, then analyze the resulting file:
//
//    cd lde/src/experimental
//    node --cpu-prof --cpu-prof-dir=/tmp/prof lode testall
//    node utils/analyze.mjs /tmp/prof/CPU.*.cpuprofile
//
// Reading the output:
//
//  * High SELF time = the function's own code is hot (a leaf bottleneck).
//  * High INCLUSIVE time with low self time = the cost is in its callees;
//    use utils/callers.mjs to see where the time under a hot leaf comes from.
//  * Times are aggregated over all call sites of each function, identified
//    by name, file, and line number.  Recursive calls are counted once per
//    sample, so inclusive times never exceed the total.
//
////////////////////////////////////////////////////////////////////////////

import fs from 'fs'

const file = process.argv[2]
if (!file) {
  console.log('usage: node analyze.mjs <file.cpuprofile> [howmany]')
  process.exit(1)
}
// how many rows to show in each ranking (default 40)
const howmany = Number(process.argv[3] || 40)

const prof = JSON.parse(fs.readFileSync(file, 'utf8'))
const { nodes, samples, timeDeltas } = prof

// index the profile's call-tree nodes by id, and add parent links
const byId = new Map(nodes.map(n => [n.id, n]))
nodes.forEach(n => (n.children ?? []).forEach(c => byId.get(c).parent = n))

// accumulate self time per node id (microseconds); each sample records the
// node that was executing, and timeDeltas gives the sample's duration
const selfTime = new Map()
samples.forEach((id, i) =>
  selfTime.set(id, (selfTime.get(id) || 0) + (timeDeltas[i] || 0)))

// a human-readable key identifying the function a node belongs to
const keyOf = n => {
  const cf = n.callFrame
  const url = cf.url.replace(/^.*\/lurch\//, '')
  return `${cf.functionName || '(anon)'} @ ${url}:${cf.lineNumber + 1}`
}

// self time per function key
const selfByFn = new Map()
for (const [id, t] of selfTime) {
  const k = keyOf(byId.get(id))
  selfByFn.set(k, (selfByFn.get(k) || 0) + t)
}

// inclusive time per function key: attribute each sample to every distinct
// function on its stack (each at most once, so recursion isn't double-counted)
const inclByFn = new Map()
for (const [id, t] of selfTime) {
  const seen = new Set()
  for (let n = byId.get(id); n; n = n.parent) {
    const k = keyOf(n)
    if (seen.has(k)) continue
    seen.add(k)
    inclByFn.set(k, (inclByFn.get(k) || 0) + t)
  }
}

const total = [...selfTime.values()].reduce((a, b) => a + b, 0)
const ms = t => (t / 1000).toFixed(0).padStart(8)
const pct = t => (100 * t / total).toFixed(1).padStart(5)
const report = (title, ranking, other) => {
  console.log(`\n=== TOP ${howmany} BY ${title} TIME ===`)
  console.log(`  ${title.toLowerCase()}(ms)  ${title.toLowerCase()}%  ` +
              `${other}(ms)  function`)
  ;[...ranking.entries()].sort((a, b) => b[1] - a[1]).slice(0, howmany)
    .forEach(([k, t]) => console.log(
      `${ms(t)}   ${pct(t)}   ` +
      `${ms((title === 'SELF' ? inclByFn : selfByFn).get(k) || 0)}  ${k}`))
}

console.log(`Total sampled: ${(total / 1e6).toFixed(1)} s`)
report('SELF', selfByFn, 'incl')
report('INCLUSIVE', inclByFn, 'self')
