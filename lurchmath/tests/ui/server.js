
/**
 * Start the same simple web server the CLI uses, but rooted at the repository
 * root, so that the Lurch app (student.html) and all of its `lde/...` imports
 * are served correctly.  Playwright launches this script automatically via the
 * `webServer` option in `playwright.config.js`; there is normally no reason to
 * run it by hand.
 */

import { startServer } from '../../cli/simple-server.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// this file is at <repo>/lurchmath/tests/ui/server.js, so the repo root is
// three levels up
const repoRoot = resolve( dirname( fileURLToPath( import.meta.url ) ),
    '..', '..', '..' )

startServer( { verbose : false, port : 8123, root : repoRoot } )
console.log( `Serving ${repoRoot} at http://localhost:8123` )
