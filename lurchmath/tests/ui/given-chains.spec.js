
/**
 * End-to-end test of transitive chains used as givens.
 *
 * A chain asserts each of its steps, so `Assume 0 ≤ r < b` means what the
 * two assumptions `0 ≤ r` and `r < b` mean.  processGivenChains() in the
 * LDE's interpret.js splits every given chain into given trios, and with the
 * ChainsRule present instantiateTransitives() also supplies the chain's
 * transitive conclusion.
 *
 * This also covers the editor side of the feature.  The expression dialog
 * requires a chain to be the only LC the user's input produces that can carry
 * a validation result, and a chain preceded by the `given>` shorthand used to
 * fail that test, so an assumed chain could not be typed at all.  Shorthands
 * now do not count towards it (see convertToLCs() in expressions.js), which is
 * what lets the `Assume 0 leq r lt b` atom below exist in the first place.
 */

import { test, expect } from '@playwright/test'
import { LurchPage, readFixture } from './lurch-page.js'

test( 'an assumed transitive chain supplies its steps and its transitive conclusion',
    async ( { page } ) => {
        const lurch = await LurchPage.boot( page )
        await lurch.loadDocument( readFixture( 'given-chain.md' ) )
        await lurch.validate()
        const results = await lurch.atomResults()
        expect( results.map( r => [ r.type, r.lurch, r.result ] ) ).toEqual( [
            [ 'expression', 'Declare leq, lt, 0, r, b', undefined ],
            [ 'rule', undefined, undefined ],
            [ 'expression', 'ChainsRule', undefined ],
            // the assumed chain itself is inert, so it reports nothing
            [ 'expression', 'Assume 0 leq r lt b', undefined ],
            // both of its steps are available as assumptions
            [ 'expression', '0 leq r', 'valid' ],
            [ 'expression', 'r lt b', 'valid' ],
            // and so is the transitive conclusion, since the ChainsRule is present
            [ 'expression', '0 lt b', 'valid' ],
            // but nothing licenses the converse of a step
            [ 'expression', 'b lt 0', 'indeterminate' ]
        ] )
    } )
