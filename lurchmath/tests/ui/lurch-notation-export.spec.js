
/**
 * End-to-end test of the "Download/View document code (Lurch notation)"
 * developer menu items (see Message.documentInLurchNotation() in
 * validation-messages.js).
 *
 * Unlike the existing putdown export, this one reassembles the actual Lurch
 * Notation the user typed into each expression atom, adding only the
 * environment brackets and keywords a shell implies (Rule:, Theorem:, ...).
 * Two things make that non-trivial, and are exactly what this test checks:
 *
 *  - Atom notation is parsed in "set mode" (enableSets:true), under which
 *    `{...}` always means a set; the reassembled document is meant to be
 *    parsed in the default mode, under which `{...}` means an environment.
 *    A finite-set atom is nested inside a Rule, a bare Theorem, a Premise
 *    inside a Proof inside a Theorem, a Subproof, and a Recall, to exercise
 *    that fix at several nesting depths and in combination with every
 *    shell keyword.
 *  - Some shells (Recall) have no Lurch Notation keyword and fall back to
 *    an embedded raw-putdown escape; a Recall shell checks that path.
 *
 * The test parses the exported text back (it is already wrapped in one
 * `{ }`, the way Lode's loadDoc() wraps a loaded file, so it can be run
 * straight through the Lurch Notation parser, then processShorthands()) and
 * compares its structure against the existing putdown export, parsed the
 * same way, as an independent source of truth.
 */

import { test, expect } from '@playwright/test'
import { LurchPage } from './lurch-page.js'

const fixture = `
<rule>

\`Assume x in {1,2,3}\`

\`x = x\`

</rule>

<theorem>

\`x in {1,2,3}\`

<proof>

<premise>

\`y in {1,2,3}\`

</premise>

\`y = y\`

</proof>

</theorem>

<subproof>

\`z in {1,2,3}\`

</subproof>

<recall>

\`w in {1,2,3}\`

</recall>

<rule>

\`"equations rule"\`

</rule>
`

test( 'Lurch notation export reproduces the same structure as the putdown export',
    async ( { page } ) => {
        const lurch = await LurchPage.boot( page )
        await lurch.loadDocument( fixture )

        // Capture the Blob content of both exports instead of letting the
        // browser actually download or navigate to anything.
        await page.evaluate( () => {
            window.__capturedBlobs = [ ]
            URL.createObjectURL = blob => {
                window.__capturedBlobs.push( blob )
                return 'blob:captured'
            }
            HTMLAnchorElement.prototype.click = function () { }
        } )
        const [ putdownText, lurchText ] = await page.evaluate( async () => {
            const items = window.tinymce.activeEditor.ui.registry.getAll().menuItems
            items.downloaddocumentcode.onAction()
            items.downloaddocumentlurchnotation.onAction()
            return await Promise.all( window.__capturedBlobs.map( b => b.text() ) )
        } )

        // sanity check: the Lurch notation is not just putdown in disguise,
        // and it does contain the shell keywords and set literals we expect
        expect( lurchText ).toMatch( /rule:/i )
        expect( lurchText ).toMatch( /theorem:/i )
        expect( lurchText ).toMatch( /proof:/i )
        expect( lurchText ).toContain( '«' ) // the Recall fallback escape
        expect( lurchText ).toMatch( /^\{/ ) // one outer document environment
        expect( lurchText ).toMatch( /^\{\n  / ) // indented one level in

        const result = await page.evaluate( async ( [ putdownText, lurchText ] ) => {
            await import( '/lde/src/utilities.js' ) // installs JSON.equals
            const { LogicConcept } = await import( '/lde/src/logic-concept.js' )
            const { parse } = await import(
                '/lde/src/experimental/parsers/lurch-to-putdown.js' )
            const { addIndex } = await import(
                '/lde/src/experimental/index-definitions.js' )
            const { processShorthands } = await import(
                '/lde/src/experimental/parsing.js' )

            const prep = doc => {
                addIndex( doc, 'Parsing' )
                processShorthands( doc )
                return doc
            }

            // Independent source of truth: the existing putdown export,
            // parsed directly (no Lurch Notation parsing involved at all).
            const fromPutdown = prep( LogicConcept.fromPutdown( putdownText )[0] )

            // The new export: already wrapped in one { } environment, so
            // just parse it as Lurch Notation in the DEFAULT mode (no
            // enableSets), then convert to putdown and re-parse.
            const fromLurch = prep( LogicConcept.fromPutdown( parse( lurchText ) )[0] )

            // Describe the structure we care about, ignoring bookkeeping
            // attributes the putdown export adds that the Lurch Notation
            // export does not (_id, lurchNotation): the isA flags that
            // shells communicate, and the recursive shape/leaf text.
            const flagsToCheck =
                [ 'given', 'Rule', 'Theorem', 'Proof', 'BIH', 'Declare' ]
            const describe = lc => {
                const flags = flagsToCheck.filter( f => lc.isA( f ) )
                const kind = lc.constructor.className
                const children = lc.children ? lc.children() : [ ]
                if ( children.length > 0 )
                    return { flags, kind, children: children.map( describe ) }
                return {
                    flags, kind,
                    text : lc.toPutdown().replace( /\s*\+\{[^}]*\}/g, '' ).trim()
                }
            }

            return {
                fromPutdown : fromPutdown.children().map( describe ),
                fromLurch : fromLurch.children().map( describe )
            }
        }, [ putdownText, lurchText ] )

        expect( result.fromLurch ).toEqual( result.fromPutdown )
    } )

test( 'the view pages copy safe string literals containing the exact code',
    async ( { page, context, browserName } ) => {
        // WebKit's Playwright driver does not support granting clipboard
        // permissions at all (browserContext.grantPermissions throws
        // "Unknown permission"), so navigator.clipboard access cannot be
        // exercised there; this test only runs its clipboard assertion
        // where the harness can actually grant it.
        if ( browserName == 'chromium' )
            await context.grantPermissions( [ 'clipboard-read', 'clipboard-write' ] )
        const lurch = await LurchPage.boot( page )
        await lurch.loadDocument( fixture )

        for ( const [ downloadItem, viewItem ] of [
            [ 'downloaddocumentcode', 'viewdocumentcode' ],
            [ 'downloaddocumentlurchnotation', 'viewdocumentlurchnotation' ]
        ] ) {
            // Capture the same code the "download" item would produce, as an
            // independent way to know what the view page ought to show/copy.
            const code = await page.evaluate( async downloadItem => {
                const items = window.tinymce.activeEditor.ui.registry
                    .getAll().menuItems
                const originalCreateObjectURL = URL.createObjectURL
                const originalClick = HTMLAnchorElement.prototype.click
                let blob
                URL.createObjectURL = b => { blob = b; return 'blob:captured' }
                HTMLAnchorElement.prototype.click = function () { }
                items[downloadItem].onAction()
                URL.createObjectURL = originalCreateObjectURL
                HTMLAnchorElement.prototype.click = originalClick
                return blob.text()
            }, downloadItem )

            const [ viewPage ] = await Promise.all( [
                page.waitForEvent( 'popup' ),
                page.evaluate( viewItem => window.tinymce.activeEditor.ui.registry
                    .getAll().menuItems[viewItem].onAction(), viewItem )
            ] )
            await viewPage.waitForLoadState()

            // The page shows the raw code, but copies a safe literal whose
            // value is exactly that code after Lode evaluates it.
            expect( await viewPage.locator( 'pre' ).textContent() ).toBe( code )
            await viewPage.locator( '#copy-link' ).click()
            if ( browserName == 'chromium' ) {
                const clipboard = await viewPage.evaluate( () =>
                    navigator.clipboard.readText() )
                expect( clipboard ).toBe( JSON.stringify( code ) )
                expect( JSON.parse( clipboard ) ).toBe( code )
            }
            await viewPage.close()
        }
    } )
