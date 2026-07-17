////////////////////////////////////////////////////////////////////////////
//
// callers.mjs
//
// Given a V8 .cpuprofile file and a regex naming one or more functions,
// attribute all of the time spent under the matching function(s) to the call
// chains that led there.  This answers the question "who is responsible for
// all the time in this hot function?" - the natural follow-up after
// utils/analyze.mjs identifies a hot leaf like a copy or lookup routine.
//
// Usage (after producing a profile as described in utils/analyze.mjs):
//
//    node utils/callers.mjs <file.cpuprofile> <pattern> [depth]
//
// e.g.
//
//    node --cpu-prof --cpu-prof-dir=/tmp/prof lode testall
//    node utils/callers.mjs /tmp/prof/CPU.*.cpuprofile "deepCopy" 6
//
// The pattern is a regex matched against keys of the form
// 'functionName @ path/file.js:line' (as printed by analyze.mjs).  The
// optional depth (default 6) is how many callers above the matching frame to
// display in each chain.  Each sample is attributed to its *deepest* matching
// ancestor frame, so the reported total equals the matching functions'
// combined inclusive time.
//
////////////////////////////////////////////////////////////////////////////

import fs from 'fs'

const file = process.argv[2]
const patternText = process.argv[3]
if (!file || !patternText) {
  console.log('usage: node callers.mjs <file.cpuprofile> <pattern> [depth]')
  process.exit(1)
}
const pattern = new RegExp(patternText)
// how many caller frames to show above the matching function (default 6)
const depth = Number(process.argv[4] || 6)
// how many distinct call chains to show
const howmany = 15

const prof = JSON.parse(fs.readFileSync(file, 'utf8'))
const { nodes, samples, timeDeltas } = prof

// index the profile's call-tree nodes by id, and add parent links
const byId = new Map(nodes.map(n => [n.id, n]))
nodes.forEach(n => (n.children ?? []).forEach(c => byId.get(c).parent = n))

// accumulate self time per node id (microseconds)
const selfTime = new Map()
samples.forEach((id, i) =>
  selfTime.set(id, (selfTime.get(id) || 0) + (timeDeltas[i] || 0)))

const keyOf = n => {
  const cf = n.callFrame
  const url = cf.url.replace(/^.*\/lurch\//, '')
  return `${cf.functionName || '(anon)'} @ ${url}:${cf.lineNumber + 1}`
}

// For each sample, find its deepest ancestor (or self) matching the pattern,
// and attribute the sample's time to the chain of callers above that frame.
const byCallerChain = new Map()
let totalMatched = 0
for (const [id, t] of selfTime) {
  let m = byId.get(id)
  while (m && !pattern.test(keyOf(m))) m = m.parent
  if (!m) continue
  totalMatched += t
  // build the caller chain above the match, collapsing consecutive recursive
  // frames of the same function so recursion doesn't fill the whole chain
  const mkey = keyOf(m)
  const chain = []
  for (let c = m.parent; c && chain.length < depth; c = c.parent) {
    const k = keyOf(c)
    if (k !== mkey && chain[chain.length - 1] !== k) chain.push(k)
  }
  const ck = mkey + '\n    <- ' + chain.join('\n    <- ')
  byCallerChain.set(ck, (byCallerChain.get(ck) || 0) + t)
}

console.log(`Pattern: ${pattern}` +
  `  total time under matching frames: ${(totalMatched / 1000).toFixed(0)} ms\n`)
;[...byCallerChain.entries()].sort((a, b) => b[1] - a[1]).slice(0, howmany)
  .forEach(([k, t]) =>
    console.log(`${(t / 1000).toFixed(0).padStart(7)} ms  ${k}\n`))
