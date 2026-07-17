
/**
 * Development utility, not part of the test suite: load each fixture given on
 * the command line (or all flagged-declaration fixtures by default) into the
 * headless app, validate, and print every atom's feedback, so that spec
 * expectations can be written from observed behavior.
 *
 *     node tests/ui/probe-fixtures.js [fixture names...]
 */

import { chromium } from '@playwright/test'
import { LurchPage, readFixture } from './lurch-page.js'
import { startServer } from '../../cli/simple-server.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve( dirname( fileURLToPath( import.meta.url ) ),
    '..', '..', '..' )
startServer( { verbose : false, port : 8124, root : repoRoot } )

const fixtures = process.argv.length > 2 ? process.argv.slice( 2 ) : [
    'unnecessary-rule.md',
    'unnecessary-rule-typed.md',
    'unnecessary-theorem.md',
    'unnecessary-redeclared.md',
    'let-env-legitimate.md',
    'unsupported-toplevel.md',
    'unsupported-rule.md',
    'unsupported-theorem.md',
    'unsupported-proof.md',
    'unsupported-premise.md'
]

const browser = await chromium.launch()
const page = await browser.newPage()
page.on( 'pageerror', error => console.log( `  PAGE ERROR: ${error}` ) )
const lurch = await LurchPage.boot(
    page, 'http://localhost:8124/student.html?actAsEmbed=true' )
for ( const fixture of fixtures ) {
    await lurch.loadDocument( readFixture( fixture ) )
    await lurch.validate()
    console.log( `\n${fixture}:` )
    for ( const atom of await lurch.atomResults() )
        console.log( '   ', JSON.stringify( atom ) )
}
await browser.close()
process.exit( 0 )
