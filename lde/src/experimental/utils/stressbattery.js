///////////////////////////////////////////////////////////////////////////
// Stress Battery for Declarations with Compound Bodies
//
// Tests the engineering goal: declaration bodies may contain environments and
// declarations, with nesting of declarations at most two deep (a declaration
// inside a body may not itself contain a declaration in its own body).
//
// Run with:  node lode utils/stressbattery
//
// Each case embeds a Lurch-notation document (with «» putdown escapes where
// notation doesn't yet exist). Expectation markers: ✔︎ = valid,
// ✗ = indeterminate, ⁉︎ = invalid. Cases marked [GUARD] must keep their
// current (correct) result. Cases marked [CERT] are the certified feature set
// (environment bodies without inner declarations) and were promoted to the
// acid test file 'Environment Body Forms.lurch'.
//
// DESIGN DECISION (2026-07): declarations may NOT appear inside declaration
// bodies - the scope of such an inner declaration is not legible to a user
// (compare `:[x,[y,B]]`, whose copied y scopes over the rest of the document,
// with `:[x,{[y,B]}]`, whose y is confined to the invisible copy). Quantified
// properties in a body use the formal quantifiers instead. The [GOAL] cases
// below involving inner declarations are therefore OUT OF SCOPE and kept only
// as a record of that frontier (their root causes are documented in the
// project notes); proper user feedback for such input is a separate task.
//
// This file is intentionally not wired into the acid test suite - it is an
// exploratory battery.
///////////////////////////////////////////////////////////////////////////

const cases = [

{ name: 'C01 [GUARD] env-body ForSome conclusion (Bug 1 fix)',
  src: `{
  Declare is, nonempty, in
  Rule: :{ If A is nonempty  n in A for some n in NN }
  Assume W is nonempty
  w in W for some w in NN ✔︎
}` },

{ name: 'C02 [GUARD] Let-env premise with ForSome sibling inside',
  src: `{ Declare P, Q, G
  Rule: :{ Q(u) }
  Rule: :{ :Q(v)  P(v,w) for some w }
  Rule: :{ :{ Let x  P(x,y) for some y }  G }
  { Let a
    Q(a) ✔︎
    P(a,w) for some w ✔︎
  }
  G ✔︎
}` },

{ name: 'C03 [GOAL] ∃∀ conclusion + interior extraction',
  note: 'ForSome atom validates today; the re-claimed Let-env interior is the (c) false preemie',
  src: `{ Declare Trig, P
  Rule: :{ :Trig(y)  { Let z  P(x,z) } for some x }
  Assume Trig(c)
  { Let z  P(w,z) } for some w ✔︎
  { Let z
    P(w,z) ✔︎
  }
}` },

{ name: 'C04 [GOAL] ∀∃ typed Let (inner expression body) as rule premise',
  note: 'a leading premise keeps the rule from starting with a Let (that shape is banned)',
  src: `{ Declare Trig, N, P, G
  Rule: :{ :Trig(y)  :«:[s , { (N s) [m , (P s m)] }]»  G }
  Assume Trig(c)
  «:[s , { (N s) [m , (P s m)] }]»
  G ✔︎
}` },

{ name: 'C05 [GOAL] ∀∃ typed Let (inner environment body) as rule premise',
  src: `{ Declare Trig, N, P, G
  Rule: :{ :Trig(y)  :«:[s , { (N s) [m , { (P s m) (N m) }] }]»  G }
  Assume Trig(c)
  «:[s , { (N s) [m , { (P s m) (N m) }] }]»
  G ✔︎
}` },

{ name: 'C06 [GOAL] using a typed Let body: conjuncts, witness escape, witness re-claim',
  note: 'stray P(s,m) BEFORE any re-claim must fail (m not in scope); after re-claiming, m is in scope',
  src: `{ Declare N, P
  «:[s , { (N s) [m , (P s m)] }]»
  N(s) ✔︎
  P(s,m) ✗
  P(s,m) for some m ✔︎
  P(s,m) ✔︎
}` },

{ name: 'C07 [GOAL] ∀∀ typed Let (Let-env body): extraction with same/different Let name',
  note: 'both extractions are mathematically valid ∀-elims from the typed Let',
  src: `{ Declare Q, f
  «:[g , { :[x] (Q (g x)) }]»
  { Let x
    Q(g(x)) ✔︎
  }
  { Let a
    Q(g(a)) ✔︎
  }
}` },

{ name: 'C07b [GOAL] ∀∀ extraction via the atomized ∀-elim rule',
  note: 'adds Rule :{ :{Let x 𝜆P(x)} 𝜆P(t) } so matching can align different Let names',
  src: `{ Declare Q, f
  Rule: :{ :{ Let x  𝜆P(x) }  𝜆P(t) }
  «:[g , { :[x] (Q (g x)) }]»
  { Let a
    Q(g(a)) ✔︎
  }
}` },

{ name: 'C08 [GOAL] ∃∃ nested ForSome conclusion',
  src: `{ Declare Trig, N, P
  Rule: :{ :Trig(y)  «[a , { (N a) [b , (P a b)] }]» }
  Assume Trig(c)
  «[u , { (N u) [v , (P u v)] }]» ✔︎
}` },

{ name: 'C09 [GUARD] state-sensitive identity (the P(n,m) toy)',
  note: 'the unconstrained ForSome must NOT justify the Let-constrained one',
  src: `{ Declare P, in, NN
  { P(n,m) for some m }
  { Let n in NN
    P(n,m) for some m ✗
  }
}` },

{ name: 'C10 [GUARD] weaker typed Let must not satisfy stronger premise',
  src: `{ Declare Trig, N, P, G
  Rule: :{ :Trig(y)  :«:[s , { (N s) [m , (P s m)] }]»  G }
  Assume Trig(c)
  «:[s , { (N s) }]»
  G ✗
}` },

{ name: 'C11 [GUARD] quantifier shift: ∀∃ fact must not give ∃∀ claim',
  src: `{ Declare P
  «:{ :[x] [m , (P x m)] }»
  { Let z  P(w,z) } for some w ✗
}` },

{ name: 'C12 [GUARD] AGENTS2 premise-assembly abuse stays preemie-invalid',
  src: `{ Declare A, B
  Rule: :{ :{ Let x  A(x) }  B }
  { Let w
    A(w)
    B ⁉︎
  }
}` },

{ name: 'C13 [GOAL] bare-declaration body (no wrapping environment)',
  note: 'currently crashes: processDeclarationBodies inserts the inner body copy inside the outer Declaration node',
  src: `{ Declare P
  «:[s , [m , (P s m)] ]»
  P(s,m) for some m ✔︎
}` },

{ name: 'C14 [GOAL] multi-symbol ForSome (PNF-style ∃∃)',
  src: `{ Declare Trig, P
  Rule: :{ :Trig(y)  P(a,b) for some a,b }
  Assume Trig(c)
  P(u,v) for some u,v ✔︎
}` },

///////////////////////////////////////////////////////////////////////////
// Certified scope: environment bodies WITHOUT inner declarations
// (atomized conjunction, implication, and mixed forms in declaration bodies)
///////////////////////////////////////////////////////////////////////////

{ name: 'D01 [CERT] conjunction body: typed Let, extract conjuncts, drive a rule',
  src: `{ Declare N, M, G
  Rule: :{ :N(x) :M(x)  G(x) }
  Let s be such that { N(s) M(s) }
  N(s) ✔︎
  M(s) ✔︎
  G(s) ✔︎
}` },

{ name: 'D02 [CERT] conjunction body: induction-style Let-env premise with env-body typed Let',
  note: 'user subproof with env-body typed Let satisfies the rule premise; conclusion outside',
  src: `{ Declare P, Q, C, G
  Rule: :{ :{ Let k be such that { P(k) Q(k) }  C(k) }  G }
  Rule: :{ :P(u) :Q(u)  C(u) }
  { Let k be such that { P(k) Q(k) }
    P(k) ✔︎
    Q(k) ✔︎
    C(k) ✔︎
  }
  G ✔︎
}` },

{ name: 'D03 [CERT] implication body: ForSome conclusion, then use the implication',
  src: `{ Declare A, B, Trig
  Rule: :{ :Trig(y)  { :A(c) B(c) } for some c }
  Assume Trig(t)
  { :A(c) B(c) } for some c ✔︎
  { :A(c)
    B(c) ✔︎
  }
}` },

{ name: 'D04 [CERT] implication body: typed Let, use the implication from the copy',
  src: `{ Declare A, B, G
  Rule: :{ :B(x)  G(x) }
  Let s be such that { :A(s) B(s) }
  Assume A(s)
  B(s) ✔︎
  G(s) ✔︎
}` },

{ name: 'D05 [CERT] mixed body (iff-style): ForSome conclusion with two implication envs',
  src: `{ Declare A, B, Trig
  Rule: :{ :Trig(y)  { { :A(c) B(c) } { :B(c) A(c) } } for some c }
  Assume Trig(t)
  { { :A(c) B(c) } { :B(c) A(c) } } for some c ✔︎
  { :A(c)
    B(c) ✔︎
  }
  { :B(c)
    A(c) ✔︎
  }
}` },

{ name: 'D06 [CERT] nested mixed body: conjunction containing an implication env',
  src: `{ Declare N, A, B, G
  Rule: :{ :N(x) :B(x)  G(x) }
  Let s be such that { N(s) { :A(s) B(s) } }
  Assume A(s)
  N(s) ✔︎
  B(s) ✔︎
  G(s) ✔︎
}` },

{ name: 'D07 [GUARD] conjunction body must not satisfy an implication-body premise',
  src: `{ Declare P, Q, C, G
  Rule: :{ :{ Let k be such that { :P(k) Q(k) }  C(k) }  G }
  Rule: :{ :Q(u)  C(u) }
  { Let k be such that { P(k) Q(k) }
    C(k)
  }
  G ✗
}` },

]

///////////////////////////////////////////////////////////////////////////
// Driver
///////////////////////////////////////////////////////////////////////////

let totalChecks = 0, totalPassed = 0
const failures = []

cases.forEach( c => {
  console.log('\n' + '─'.repeat(72))
  console.log(c.name)
  if (c.note) console.log('  note: ' + c.note)
  let doc
  try {
    doc = $(c.src)
    if (!doc) throw new Error('parse returned nothing')
  } catch (e) {
    console.log('  ✗ PARSE FAIL: ' + e.message.split('\n')[0])
    failures.push(c.name + ' (parse)')
    return
  }
  try {
    validate(doc)
  } catch (e) {
    console.log('  ✗ CRASH during validation: ' + e.message)
    failures.push(c.name + ' (crash)')
    return
  }
  // check the expectation markers like the acid harness does
  const marked = doc.descendantsSatisfying( x => x.ExpectedResult )
  marked.forEach( s => {
    totalChecks++
    const r = Validation.result(s)
    const ok = r?.result === s.ExpectedResult
    if (ok) totalPassed++
    else failures.push(c.name)
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} expected ${s.ExpectedResult.padEnd(13)} got ` +
      `${(r?.result ?? 'none').padEnd(13)}${r?.reason === 'preemie' ? '(preemie) ' : ' '}` +
      `on ${s.toPutdown().replace(/\s+/g,' ').replace(/\+\{[^}]*\}/g,'').slice(0,48)}`)
  })
  // print the full conclusion table for context
  console.log('  conclusions:')
  doc.conclusions().forEach( x => {
    const r = Validation.result(x)
    console.log(`    ${String(x.prop()).padEnd(30)} → ${r?.result ?? 'none'}` +
      `${r?.reason === 'preemie' ? ' (preemie)' : ''}`)
  })
})

console.log('\n' + '═'.repeat(72))
console.log(`SCORE: ${totalPassed} / ${totalChecks} expectation checks passed`)
if (failures.length)
  console.log('failing cases:\n  ' + [...new Set(failures)].join('\n  '))
process.exit()
