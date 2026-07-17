
/**
 * Playwright configuration for the Lurch UI test suite.
 *
 * The tests live in `tests/ui/` and drive the full Lurch app (student.html)
 * running in a real browser, served by the same simple web server used by the
 * CLI, rooted at the repository root so that the app's `../lde/...` imports
 * resolve.  Playwright starts and stops that server automatically.
 *
 * Run the suite from the `lurchmath` folder with:
 *
 *     npm test              (alias for: npx playwright test)
 *     npx playwright test --project=chromium     (Chromium only, faster)
 *     npx playwright test --ui                   (interactive watch mode)
 *     npx playwright show-report                 (view last failure report)
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig( {
    testDir : './tests/ui',
    // each test gets ample time because the first one boots the whole app
    timeout : 60000,
    // one app instance per worker; tests within a file run in order
    fullyParallel : false,
    // record traces on failure so `npx playwright show-report` can replay them
    use : {
        baseURL : 'http://localhost:8123',
        trace : 'retain-on-failure'
    },
    webServer : {
        command : 'node tests/ui/server.js',
        port : 8123,
        reuseExistingServer : true
    },
    projects : [
        { name : 'chromium', use : { ...devices['Desktop Chrome'] } },
        { name : 'webkit', use : { ...devices['Desktop Safari'] } }
    ]
} )
