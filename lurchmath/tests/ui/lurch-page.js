
/**
 * A page-object driver for the Lurch app, for use in Playwright tests.
 *
 * This wraps a Playwright `page` in an API that speaks Lurch: boot the app,
 * load a document (embed markdown, short-form HTML, or long-form .lurch),
 * run validation, and read back the per-atom feedback the user would see.
 *
 * Typical use in a spec file:
 *
 *     const lurch = await LurchPage.boot( page )
 *     await lurch.loadDocument( readFixture( 'smoke.md' ) )
 *     await lurch.validate()
 *     const results = await lurch.atomResults()
 *
 * All waiting is event-based (the app's own `atomUpdateFinished` and
 * `validationFinished` events), with one exception: after loading a document
 * we must let the editor's debounced change handlers settle, because they
 * clear validation results and would otherwise erase feedback that a validate
 * call applied in the meantime.  See `loadDocument()` below.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtureDir = join( dirname( fileURLToPath( import.meta.url ) ), 'fixtures' )
const repoRoot = join( dirname( fileURLToPath( import.meta.url ) ),
    '..', '..', '..' )

/**
 * Read a fixture document from the `fixtures/` folder next to this module.
 *
 * @param {string} name - the fixture filename, e.g. `'smoke.md'`
 * @returns {string} the file contents
 */
export const readFixture = name =>
    readFileSync( join( fixtureDir, name ), 'utf8' )

/**
 * Read a document from the repository, by its path relative to the repo root,
 * e.g. `'help/example-proofs.lurch'`.  Useful for testing real documents that
 * ship with the site, such as the gallery examples.
 *
 * @param {string} path - the repo-root-relative path of the file
 * @returns {string} the file contents
 */
export const readRepoFile = path =>
    readFileSync( join( repoRoot, path ), 'utf8' )

export class LurchPage {

    /**
     * Not intended to be called directly; use {@link LurchPage.boot boot()}.
     */
    constructor ( page ) {
        this.page = page
    }

    /**
     * Load the Lurch app in the given Playwright page and wait until it is
     * fully initialized.  Returns a LurchPage wrapping that page.
     *
     * @param {Page} page - a Playwright page
     * @param {string} entry - URL path of the app entry point; the default is
     *   the student entry point in embed mode, which accepts documents posted
     *   via the embed listener
     * @returns {Promise<LurchPage>}
     */
    static async boot ( page, entry = '/student.html?actAsEmbed=true' ) {
        // skip the 750ms "Validation... done!" dialog delay in every test
        await page.addInitScript( () =>
            localStorage.setItem( 'lurch-show validation has completed', 'false' ) )
        await page.goto( entry )
        await page.waitForFunction( () =>
            window?.tinymce?.activeEditor?.lurchDocument )
        // Instrument atom activity so loadDocument() can wait for the editor
        // to become quiet.  Any atom data change or deletion queues a
        // clear-all-validation-results call (see validation.js), so validating
        // while atoms are still updating loses the results to that clear.
        await page.evaluate( () => {
            const Atom = window.tinymce.activeEditor.Atom
            window.lastAtomActivity = Date.now()
            for ( const name of [ 'dataChanged', 'wasDeleted' ] ) {
                const original = Atom.prototype[name]
                Atom.prototype[name] = function ( ...args ) {
                    window.lastAtomActivity = Date.now()
                    return original.apply( this, args )
                }
            }
        } )
        return new LurchPage( page )
    }

    /**
     * Load a document into the app and wait for its atoms to finish updating.
     *
     * Embed markdown and short-form HTML go through the embed listener, which
     * expands backticked Lurch notation, `<rule>`/`<theorem>`/`<proof>` tags,
     * and so on.  Long-form HTML (saved by the app itself) is loaded directly.
     *
     * @param {string} content - the document source
     * @param {string} format - `'markdown'` (default) or `'html'` for content
     *   that goes through the embed listener; long-form HTML is detected
     *   automatically regardless of this parameter
     */
    async loadDocument ( content, format = 'markdown' ) {
        const isLongForm = await this.page.evaluate( html =>
            window.tinymce.activeEditor.lurchDocument
                .constructor.isDocumentHTML( html ), content )
        await this.page.evaluate( () => {
            window.atomUpdateFinished = false
            window.tinymce.activeEditor.once( 'atomUpdateFinished', () =>
                window.atomUpdateFinished = true )
        } )
        if ( isLongForm )
            await this.page.evaluate( html =>
                window.tinymce.activeEditor.lurchDocument.setDocument( html ),
                content )
        else
            await this.page.evaluate( ( [ content, format ] ) =>
                window.postMessage( { 'lurch-embed' :
                    `<div format='${format}'>${content}</div>` }, '*' ),
                [ content, format ] )
        await this.page.waitForFunction( () => window.atomUpdateFinished )
        // Wait for atom activity to quiesce.  Replacing a document deletes and
        // creates many atoms, each of which queues a clear-validation call on
        // a fresh task (see validation.js queueClearAll); large documents keep
        // updating atoms well after atomUpdateFinished fires.  Once no atom
        // has changed for 400ms, any queued clear has already run, and
        // validation results applied after this point are safe.
        await this.page.waitForFunction( () =>
            Date.now() - window.lastAtomActivity > 400 )
    }

    /**
     * Run validation exactly as the user would (the Validate menu item) and
     * wait for the app's validationFinished event.
     *
     * Two app behaviors require care here.  First, the menu item is a toggle:
     * when the document already shows feedback markers (for example, it was
     * saved with validation results embedded), invoking it merely clears
     * them.  So if visible markers are present we invoke it once to clear,
     * then again to start the real validation run.  Second, on a large
     * document atom updates arrive in bursts that can contain gaps longer
     * than loadDocument()'s quiescence window, and each straggler update
     * queues a clear-all-validation-results call (see validation.js) that can
     * wipe freshly applied results.  So we count the real feedback messages
     * the worker sends, and if feedback arrived but no markers survived, we
     * wait for the stragglers to finish and validate again - just as a user
     * would revalidate if their results vanished.
     */
    async validate () {
        for ( let attempt = 0 ; attempt < 3 ; attempt++ ) {
            await this.page.evaluate( () => {
                const editor = window.tinymce.activeEditor
                const validate = editor.ui.registry.getAll().menuItems.validate
                const hasVisibleMarkers = [ ...editor.getBody()
                    .querySelectorAll( '[class^=feedback-marker]' ) ]
                    .some( span => !span.closest( '.mce-offscreen-selection' ) )
                if ( hasVisibleMarkers ) validate.onAction()
                // count worker feedback messages that should produce a marker
                // (skip whole-document feedback and undeclared-variable-only
                // messages, which do not)
                window.feedbackMessageCount = 0
                if ( !editor.worker.feedbackCounterInstalled ) {
                    editor.worker.feedbackCounterInstalled = true
                    editor.worker.addEventListener( 'message', event => {
                        const data = event.data
                        if ( data.type == 'feedback' && data.id
                          && data.id != 'documentEnvironment'
                          && ( data.results || [ ] ).some( r => !r.undeclared ) )
                            window.feedbackMessageCount++
                    } )
                }
                window.validationFinished = false
                editor.once( 'validationFinished', () =>
                    window.validationFinished = true )
                validate.onAction()
            } )
            await this.page.waitForFunction( () => window.validationFinished )
            // let any straggler atom updates, and the clear-validation call
            // they queue, run before we decide whether the results survived
            await this.page.waitForFunction( () =>
                Date.now() - window.lastAtomActivity > 400 )
            const wiped = await this.page.evaluate( () => {
                const editor = window.tinymce.activeEditor
                const hasResults = [ ...editor.getBody().querySelectorAll(
                    '[class^=feedback-marker], [data-validation_result]' ) ]
                    .some( el => !el.closest( '.mce-offscreen-selection' ) )
                return window.feedbackMessageCount > 0 && !hasResults
            } )
            if ( !wiped ) return
        }
        throw new Error( 'validation results were cleared on every attempt' )
    }

    /**
     * Collect every atom in the document, in document order, with the feedback
     * the user would see.  Each entry has:
     *
     *  * `type` - the atom type ('expression', 'rule', 'theorem', ...)
     *  * `lurch` - its Lurch notation, if it has any
     *  * `result` - the visible feedback marker: 'valid', 'invalid',
     *    'indeterminate', 'error', 'inapplicable', or undefined if none;
     *    for shells this comes from their data-validation_result attribute
     *  * `hover` - the hover text (tooltip) shown with the feedback, if any
     *
     * @returns {Promise<Object[]>}
     */
    async atomResults () {
        return await this.page.evaluate( () => {
            const editor = window.tinymce.activeEditor
            const Atom = editor.Atom
            const kinds =
                [ 'valid', 'invalid', 'indeterminate', 'error', 'inapplicable' ]
            return Atom.allIn( editor ).map( atom => {
                const element = atom.element
                // a marker span belongs to this atom only if this atom is the
                // nearest atom ancestor of the span (markers of nested atoms
                // must not be attributed to their containers)
                const marker = kinds.find( kind =>
                    [ ...element.querySelectorAll( `.feedback-marker-${kind}` ) ]
                        .some( span =>
                            span.closest( '.lurch-atom' ) == element ) )
                return {
                    type : JSON.parse( element.dataset['metadata_type'] ),
                    lurch : atom.getMetadata( 'lurchNotation' ) ?? undefined,
                    result : marker ?? element.dataset['validation_result'],
                    // hover text may live on the feedback marker itself (the
                    // planned behavior) or on the whole atom (the current one)
                    hover : element.querySelector( '[class*=feedback-marker][title]' )
                            ?.getAttribute( 'title' )
                        ?? element.getAttribute( 'title' )
                        ?? undefined
                }
            } )
        } )
    }
}
