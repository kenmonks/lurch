
/**
 * End-to-end smoke test of the Lurch app's validation feedback.
 *
 * Boots the real app, loads a small document through the embed listener,
 * runs the Validate menu item, and checks the feedback markers the user
 * would see on each atom.
 */

import { test, expect } from '@playwright/test'
import { LurchPage, readFixture } from './lurch-page.js'

test( 'validation marks a correct conclusion valid and an unjustified one indeterminate',
    async ( { page } ) => {
        const lurch = await LurchPage.boot( page )
        await lurch.loadDocument( readFixture( 'smoke.md' ) )
        await lurch.validate()
        const results = await lurch.atomResults()
        expect( results.map( r => [ r.type, r.lurch, r.result ] ) ).toEqual( [
            [ 'rule', undefined, undefined ],
            [ 'expression', 'Assume A and B', undefined ],
            [ 'expression', 'A', undefined ],
            [ 'expression', 'B', undefined ],
            [ 'expression', 'Assume X and Y', undefined ],
            [ 'expression', 'Y', 'valid' ],
            [ 'expression', 'Z', 'indeterminate' ]
        ] )
        // the valid conclusion also gets the standard hover message
        expect( results[5].hover ).toBe( 'Good work!' )
    } )
