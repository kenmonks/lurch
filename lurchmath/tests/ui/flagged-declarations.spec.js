
/**
 * End-to-end tests of the feedback for flagged declarations.
 *
 * Two kinds of declarations are flagged during interpretation rather than
 * validated (see the acid test files "Unnecessary Declarations.lurch" and
 * "Unsupported Declarations.lurch" in the LDE):
 *
 *  * 'unnecessary' - a Rule or Theorem may not begin with a Let (its free
 *    variables are already implicitly universal); and
 *  * 'unsupported' - a declaration body may not contain another declaration.
 *
 * Both must show the ⊘ (inapplicable) marker on the declaration's own atom,
 * with the explanatory hover message, and validation must proceed normally
 * around them.  A leading Let in a Proof or Premise environment is legitimate
 * (the Let-environment shape) and must NOT be flagged.
 *
 * Each expected atom is a 4-tuple [ type, lurchNotation, result, hover ].
 */

import { test, expect } from '@playwright/test'
import { LurchPage, readFixture } from './lurch-page.js'

const GOOD = 'Good work!'
const UNPROVEN = 'You have not yet convinced me of this.'
const UNNECESSARY = 'This declaration is unnecessary.'
const UNSUPPORTED =
    'Lurch does not support a declaration inside the body of another declaration.'
const _ = undefined

const cases = {

    'unnecessary-rule.md' : [
        [ 'expression', 'Declare P, c', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'expression', 'Let x', 'inapplicable', UNNECESSARY ],
        [ 'expression', 'P(x)', _, _ ],
        [ 'expression', 'P(c)', 'valid', GOOD ]
    ],

    'unnecessary-rule-typed.md' : [
        [ 'expression', 'Declare N, Q, d', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'expression', 'Let y be such that N(y)', 'inapplicable', UNNECESSARY ],
        [ 'expression', 'Q(y)', _, _ ],
        [ 'expression', 'Assume N(d)', _, _ ],
        [ 'expression', 'Q(d)', 'valid', GOOD ]
    ],

    'unnecessary-theorem.md' : [
        [ 'expression', 'Declare R, e', _, _ ],
        [ 'theorem', _, 'indeterminate', UNPROVEN ],
        [ 'expression', 'Let z', 'inapplicable', UNNECESSARY ],
        [ 'expression', 'R(z)', 'indeterminate', UNPROVEN ],
        [ 'expression', 'R(e)', 'valid', GOOD ]
    ],

    'unnecessary-redeclared.md' : [
        [ 'expression', 'Declare S', _, _ ],
        [ 'expression', 'Let w', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'expression', 'Let w', 'inapplicable',
            'This declaration is unnecessary, and you have already used w.' ],
        [ 'expression', 'S(w)', _, _ ]
    ],

    // a leading Let in a Premise (the induction-rule shape) or in a Proof (a
    // Let-environment subproof) is legitimate and must not be flagged
    'let-env-legitimate.md' : [
        [ 'expression', 'Declare P', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'premise', _, _, _ ],
        [ 'expression', 'Let x', _, _ ],
        [ 'expression', 'P(x)', _, _ ],
        [ 'expression', 'forall y. P(y)', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'expression', 'P(u)', _, _ ],
        [ 'proof', _, 'valid', GOOD ],
        [ 'expression', 'Let x', _, _ ],
        [ 'expression', 'P(x)', 'valid', GOOD ],
        [ 'expression', 'forall y. P(y)', 'valid', GOOD ]
    ],

    'unsupported-toplevel.md' : [
        [ 'expression', 'Declare B', _, _ ],
        [ 'expression', 'B(c,z) for some z for some c',
            'inapplicable', UNSUPPORTED ]
    ],

    'unsupported-rule.md' : [
        [ 'expression', 'Declare V, W, R, t', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'expression', 'Let g be such that V(g,h) for some h',
            'inapplicable', UNSUPPORTED ],
        [ 'expression', 'W(g)', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'expression', 'R(x)', _, _ ],
        [ 'expression', 'R(t)', 'valid', GOOD ]
    ],

    'unsupported-theorem.md' : [
        [ 'expression', 'Declare T', _, _ ],
        [ 'theorem', _, 'indeterminate', UNPROVEN ],
        [ 'expression', 'T(k,m) for some m for some k',
            'inapplicable', UNSUPPORTED ]
    ],

    'unsupported-proof.md' : [
        [ 'expression', 'Declare U', _, _ ],
        [ 'proof', _, 'indeterminate', UNPROVEN ],
        [ 'expression', 'Let s be such that U(s,m) for some m',
            'inapplicable', UNSUPPORTED ]
    ],

    'unsupported-premise.md' : [
        [ 'expression', 'Declare D, E', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'premise', _, _, _ ],
        [ 'expression', 'Let f be such that D(f,n) for some n',
            'inapplicable', UNSUPPORTED ],
        [ 'expression', 'E(f)', _, _ ],
        [ 'expression', 'forall y. E(y)', _, _ ]
    ],

    // all of the above at once, with disjoint symbols per section so that
    // rules, instantiations, and scoping cannot cross-talk between sections
    'flagged-combined.md' : [
        [ 'expression', 'Declare P, c', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'expression', 'Let x', 'inapplicable', UNNECESSARY ],
        [ 'expression', 'P(x)', _, _ ],
        [ 'expression', 'P(c)', 'valid', GOOD ],
        [ 'expression', 'Declare B', _, _ ],
        [ 'expression', 'B(v,z) for some z for some v',
            'inapplicable', UNSUPPORTED ],
        [ 'expression', 'Declare R, e', _, _ ],
        [ 'theorem', _, 'indeterminate', UNPROVEN ],
        [ 'expression', 'Let w', 'inapplicable', UNNECESSARY ],
        [ 'expression', 'R(w)', 'indeterminate', UNPROVEN ],
        [ 'expression', 'R(e)', 'valid', GOOD ],
        [ 'expression', 'Declare U', _, _ ],
        [ 'proof', _, 'indeterminate', UNPROVEN ],
        [ 'expression', 'Let s be such that U(s,m) for some m',
            'inapplicable', UNSUPPORTED ],
        [ 'expression', 'Declare D, E', _, _ ],
        [ 'rule', _, _, _ ],
        [ 'premise', _, _, _ ],
        [ 'expression', 'Let f be such that D(f,n) for some n',
            'inapplicable', UNSUPPORTED ],
        [ 'expression', 'E(f)', _, _ ],
        [ 'expression', 'forall y. E(y)', _, _ ]
    ]

}

for ( const [ fixture, expected ] of Object.entries( cases ) )
    test( `flagged declarations: ${fixture}`, async ( { page } ) => {
        const lurch = await LurchPage.boot( page )
        await lurch.loadDocument( readFixture( fixture ) )
        await lurch.validate()
        const results = await lurch.atomResults()
        expect( results.map( r => [ r.type, r.lurch, r.result, r.hover ] ) )
            .toEqual( expected )
    } )
