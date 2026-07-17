
/**
 * End-to-end tests of the Gallery example documents from the lurch.plus
 * landing page.  Each is a real long-form .lurch document that ships with the
 * site, so each must validate with every feedback marker valid - no invalid,
 * indeterminate, inapplicable, or error markers anywhere.
 *
 * Atoms with no marker at all (rules, declarations, givens, expository text)
 * are fine; the assertion is that every marker that does appear is a
 * checkmark, and that at least one appears (so a silently-broken validation
 * run cannot pass).
 */

import { test, expect } from '@playwright/test'
import { LurchPage, readRepoFile } from './lurch-page.js'

const galleryDocuments = [
    'math/examples/Topo-logical - soln.lurch',
    'math/examples/Mar 26 - in class.lurch',
    'math/examples/Linear-Algebra-Examples.lurch',
    'math/examples/group-example.lurch',
    'help/example-proofs.lurch',
    'help/algebra-rule-examples.lurch'
]

for ( const path of galleryDocuments )
    test( `gallery document is fully valid: ${path}`, async ( { page } ) => {
        // these are large real documents; allow extra time to validate
        test.setTimeout( 180000 )
        const lurch = await LurchPage.boot( page )
        await lurch.loadDocument( readRepoFile( path ) )
        await lurch.validate()
        const results = await lurch.atomResults()
        const marked = results.filter( r => r.result !== undefined )
        expect( marked.length ).toBeGreaterThan( 0 )
        expect( marked.filter( r => r.result != 'valid' ) ).toEqual( [ ] )
    } )
