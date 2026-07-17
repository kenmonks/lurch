
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

/**
 * Read a fixture document from the `fixtures/` folder next to this module.
 *
 * @param {string} name - the fixture filename, e.g. `'smoke.md'`
 * @returns {string} the file contents
 */
export const readFixture = name =>
    readFileSync( join( fixtureDir, name ), 'utf8' )

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
        // Let the editor's debounced document-change handlers fire now; they
        // clear validation results, and if we validated immediately they would
        // erase the fresh results right after they appear.
        await this.page.waitForTimeout( 500 )
    }

    /**
     * Run validation exactly as the user would (the Validate menu item) and
     * wait for the app's validationFinished event.
     */
    async validate () {
        await this.page.evaluate( () => {
            window.validationFinished = false
            const editor = window.tinymce.activeEditor
            editor.once( 'validationFinished', () =>
                window.validationFinished = true )
            editor.ui.registry.getAll().menuItems.validate.onAction()
        } )
        await this.page.waitForFunction( () => window.validationFinished )
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
