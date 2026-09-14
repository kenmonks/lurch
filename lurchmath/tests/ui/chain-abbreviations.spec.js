
/**
 * End-to-end test of the chain forms that the expression dialog now admits.
 *
 * An atom shows one validation marker, so the dialog requires that input
 * mentioning a transitive chain produce at most one LC that can carry a
 * result.  It decides that by running interpretation's shorthand absorption on
 * copies of the parsed LCs and counting the surviving claims (see
 * convertToLCs() in expressions.js), which admits an assumed chain, a chain in
 * a comma list, a chain as a Let's such-that body, and a chain inside a set
 * builder's condition list.
 *
 * On the engine side this covers processChainAbbreviations() expanding an
 * assumed chain into given trios and processSetBuilderChains() splicing a set
 * builder's chain condition into its trios, both in interpret.js, plus the
 * transitive conclusion instantiateTransitives() supplies when the ChainsRule
 * is loaded.
 */

import { test, expect } from '@playwright/test'
import { LurchPage, readFixture } from './lurch-page.js'

test( 'assumed and set-builder chains expand into their trios in the real app',
    async ( { page } ) => {
        const lurch = await LurchPage.boot( page )
        await lurch.loadDocument( readFixture( 'chain-abbreviation.md' ) )
        await lurch.validate()
        const results = await lurch.atomResults()
        expect( results.map( r => [ r.type, r.lurch, r.result ] ) ).toEqual( [
            [ 'expression', 'Declare leq, lt, eq, m, n, b, P', undefined ],
            [ 'rule', undefined, undefined ],
            [ 'expression', 'ChainsRule', undefined ],
            [ 'rule', undefined, undefined ],
            [ 'expression', 'SetBuilderRule', undefined ],
            [ 'rule', undefined, undefined ],
            [ 'expression', 'Assume P(y)', undefined ],
            [ 'expression', 'y lt b', undefined ],
            // the assumed chain is inert, and both of its steps plus the
            // transitive conclusion are available
            [ 'expression', 'Assume 0 leq r lt b', undefined ],
            [ 'expression', '0 leq r', 'valid' ],
            [ 'expression', 'r lt b', 'valid' ],
            [ 'expression', '0 lt b', 'valid' ],
            // and a chain condition in a set builder yields each of its steps
            [ 'expression', 'Assume n in set(k in ZZ : m leq k leq n)', undefined ],
            [ 'expression', 'm leq n', 'valid' ],
            [ 'expression', 'n leq n', 'valid' ]
        ] )
    } )
