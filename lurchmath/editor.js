
/**
 * This file installs a global Lurch namespace in the browser window.  Clients
 * can use that to install the Lurch app into their page at a chosen location.
 */

// Import the FileSystem module, and then several other modules that are
// imported only because importing them registers them as subclasses of
// FileSystem, even though we don't use them directly here.
import FileSystem from './file-system.js'
import { BrowserFileSystem } from './browser-file-system.js'
import { OfflineFileSystem } from './offline-file-system.js'
import { WebFileSystem } from './web-file-system.js'
import { DropboxFileSystem } from './dropbox-file-system.js'

import { loadScript, makeAbsoluteURL, isEmbedded } from './utilities.js'
import { loadFromQueryString } from './load-from-url.js'
import { appSettings } from './settings-install.js'
import { LurchDocument } from './lurch-document.js'
import Settings from './settings-install.js'
import Headers from './header-editor.js'
import DocSettings from './document-settings.js'
import Atoms from './atoms.js'
import Expressions from './expressions.js'
import ExpositoryMath from './expository-math.js'
import Dependencies from './dependencies.js'
import Shells from './shells.js'
import Validation from './validation.js'
import AutoCompleter from './auto-completer.js'
import Embedding from './embed-listener.js'
import Export from './export.js'

import { stylesheet as MathLiveCSS } from './math-live.js'

// TinyMCE's CDN URL, from which we will load it
const TinyMCEURL = 'https://cdnjs.cloudflare.com/ajax/libs/tinymce/6.6.2/tinymce.min.js'

/**
 * This namespace is installed globally when importing `editor.js`.  It allows
 * the client to customize the behavior of the Lurch app, then install that app
 * wherever in their page they want it installed.
 * 
 * To customize the default settings for the application and any documents it
 * loads, see {@link Lurch.setAppDefaults setAppDefaults()} and
 * {@link Lurch.setDocumentDefaults setDocumentDefaults()}.  To create
 * an instance of the Lurch app on your page, see
 * {@link Lurch.createApp createApp()}.
 * 
 * @namespace Lurch
 */
window.Lurch = {
    
    /**
     * This is the main function that is to be used by clients.  It creates an
     * instance of the Lurch app in any element on the page.  Typically, one
     * calls this on a textarea to be used as the editor, or on a DIV into which
     * you want this function to automatically create a new texteditor to use
     * as the base for the app.
     * 
     * It returns a Promise that resolves when TinyMCE (the underlying editor
     * technology on which Lurch is built) has completed its setup phase (though
     * the editor instance may not yet have had its `init` event called).  The
     * resolve call will be passed the new TinyMCE editor instance.
     * 
     * The `options` object can have any subset of the following fields:
     * 
     *  - `options.menuData` will be used to override default menus.  The format
     *    is the same as it is for {@link https://www.tiny.cloud/docs/tinymce/latest/menus-configuration-options/#menu
     *    TinyMCE menu specifications}.
     *  - `options.toolbarData` will be used to override default toolbars.  The
     *    format is the same as it is for {@link https://www.tiny.cloud/docs/tinymce/latest/toolbar-configuration-options/#toolbar
     *    TinyMCE toolbar specifications}.
     *  - `options.editor` will be used to override anything passed to TinyMCE's
     *    `init()` call.  This is inherently stronger than the previous two
     *    combined, because menu and toolbar data is part of what is passed to
     *    the `init()` call, but it can be cumbersome to override the entire
     *    menu or toolbar setup, and thus the previous two options are available
     *    for overriding just pieces of them.  E.g., you can provide `menuData`
     *    as `{ 'file' : { ... } }` and it will affect only the file menu,
     *    because it is incorporated into the defaults using `Object.assign()`.
     *  - `options.preventLeaving` enables or disables the feature that prompts
     *    the user to confirm before leaving the page, so that they do not lose
     *    their work by accidentally reloading the page or closing a tab.  If
     *    this value is not set, the default is `true` for the main app and
     *    `false` for embedded version of the app (e.g., in our documentation
     *    site, where users typically are not creating documents they care to
     *    save).
     *  - `options.fileOpenTabs` can be used to reorder or subset the list of
     *    tabs in the File > Open dialog box, which defaults to
     *    `[ 'From in-browser storage', 'From your computer', 'From the web',
     *    'From Dropbox' ]`.
     *  - `options.fileSaveTabs` can be used to reorder or subset the list of
     *    tabs in the File > Save dialog box, which defaults to
     *    `[ 'To in-browser storage', 'To your computer', 'To Dropbox' ]`.
     *  - `options.fileDeleteTabs` can be used to reorder or subset the list of
     *    tabs in the File > Delete dialog box, which defaults to
     *    `[ 'In in-browser storage', 'In Dropbox' ]`.
     *  - `options.helpPages` can be an array of objects of the form
     *    `{ title : '...', url : '...' }`.  These will be displayed in the help
     *    menu (which is omitted if no such pages are provided) in the order
     *    they appear in this option.  Clicking any one of them just opens the
     *    URL in a new window.  This allows each Lurch installation to have its
     *    own custom set of help pages for students or other users.
     *  - `options.autoSaveEnabled` enables or disables the feature of
     *    auto-saving the user's work into the browser's local storage every few
     *    seconds.  This is `true` (enabled) by default for the main app, but
     *    false by default for embedded copies of the app.  You can use this
     *    setting to change that default.
     *  - `options.appRoot` can be a relative path from the `index.html` file to
     *    the root of the repository in which `editor.js` is located.  If you
     *    are using the `index.html` provided in the Lurch repository, then you
     *    do not need to provide this path, and it will default to `'.'`, which
     *    is correct.  If your HTML page is in a different folder than this
     *    repository, you will need to provide the path from the HTML page to
     *    the repository.  This is essential so that the app can find CSS and JS
     *    files in the repository to load programmatically as needed.
     *  - `options.appDefaults` can be a dictionary that overrides the default
     *    application settings.  Doing so may not affect the experience of a
     *    user who has already customized their own application settings,
     *    because this set of key-value pairs supplies only the *default*
     *    settings.  The user's chosen settings naturally override the defaults.
     *    To see which keys and values are available, see
     *    {@link SettingsInstaller the settings installer module}, and view the
     *    source code for the `appSettings` object.
     *  - `options.documentDefaults` can be a dictionary that overrides the
     *    default document settings.  Doing so may not affect the experience of
     *    a user who loads a document that includes its own settings, because
     *    this set of key-value pairs supplies only the *default* settings.  The
     *    current document's settings naturally override the defaults.
     *    To see which keys and values are available, see
     *    {@link LurchDocument.settingsMetadata the document settings metadata}
     *    in the {@link LurchDocument} class.
     * 
     * The `options` object is stored as an `appOptions` member in the TinyMCE
     * editor instance once it is created, so that any part of the app can refer
     * back to these options later.
     * 
     * @param {HTMLElement} element - the element into which to install the app
     * @param {Object?} options - the options to use for the new app
     * @returns {Promise} a promise that resolves as documented above
     * @function
     * @memberof Lurch
     */
    createApp : ( element, options = { } ) => {

        // Fill in defaults for the options object.
        options = Object.assign( {
            appDefaults : { },
            documentDefaults : { },
            menuData : { },
            helpPages : [ ],
            appRoot : '.',
            editor : { },
            preventLeaving : !isEmbedded(),
            autoSaveEnabled : !isEmbedded(),
            toolbarData : 'undo redo | '
                + 'styles bold italic | '
                //   + 'link unlink | ' // reduce toolbar clutter
                + 'alignleft aligncenter alignright outdent indent | '
                + 'numlist bullist'
        }, options )
        // Handle menuData separately, because we support supplying just a part
        // of the menuData object and having the rest filled in by defaults:
        const buildMenu = ( title, ...list ) => {
            return { title, items : list.join( ' | ' ) }
        }
        const menuData = Object.assign( {
            file : buildMenu( 'File',
                'newlurchdocument opendocument savedocument savedocumentas deletesaved',
                'embeddocument exportlatex',
                'print'
            ),
            edit : buildMenu( 'Edit',
                'undo redo',
                'cut copy paste pastetext',
                'selectall',
                'link unlink openlink',
                'searchreplace',
                'listprops',
                'preferences'
            ),
            insert : buildMenu( 'Insert',
                'link emoticons hr',
                'insertdatetime',
                'expression expositorymath',
                'environment paragraphabove paragraphbelow'
            ),
            format : buildMenu( 'Format',
                'bold italic underline strikethrough superscript subscript',
                'styles blocks fontfamily fontsize align lineheight',
                'forecolor backcolor',
                'language',
                'removeformat'
            ),
            document : buildMenu( 'Document',
                'viewcontext',
                'validate clearvalidation',
                'docsettings togglemeaning'
            ),
            help : buildMenu( 'Help', 'aboutlurch' )
        }, options.menuData )

        // If the options object specifies default app settings, apply them:
        Object.keys( options.appDefaults ).forEach( key => {
            const settingMetadata = appSettings.metadata.metadataFor( key )
            if ( !settingMetadata )
                console.log( 'No such setting:', key )
            else
                settingMetadata.defaultValue = options.appDefaults[key]
        } )
        // And then have the settings recompute its cached default values:
        appSettings.defaults = appSettings.metadata.defaultSettings()
        // Do the same for default document settings:
        Object.keys( options.documentDefaults ).forEach( key => {
            const settingMetadata = LurchDocument.settingsMetadata.metadataFor( key )
            if ( !settingMetadata )
                console.log( 'No such setting:', key )
            else
                settingMetadata.defaultValue = options.documentDefaults[key]
        } )

        // Ensure the element is/has a textarea, so we can install TinyMCE there
        if ( element.tagName !== 'TEXTAREA' ) {
            element.insertBefore( document.createElement( 'textarea' ),
                element.firstChild )
            element = element.firstChild
            element.setAttribute( 'id', 'editor' )
        }

        // If developer mode is enabled in settings, create the Developer menu
        // if ( appSettings.get( 'developer mode on' ) === true )
        //     menuData.developer = buildMenu( 'Instructor',
        //        'editdependencyurls',
        //        'viewdocumentcode redpen'
        //     )

        // Add any help pages from the options object to a new help menu.
        // Further below, during editor initialization, we will install menu
        // items with these names, associated with these help pages.
        // (Each will be an object of the form {title,url}.)
        options.helpPages.forEach( ( _, index ) => {
            if ( !menuData.help )
                menuData.help = buildMenu( 'Help', `helpfile${index+1}` )
            else
                menuData.help.items += ' ' + `helpfile${index+1}`
        } )

        // Load TinyMCE from its CDN...
        return new Promise( ( resolve, _ ) => loadScript( TinyMCEURL ).then( () => {
            // ...then set up the editor in the textarea from above,
            // again overriding any of our default options with those specified
            // in the options object passed to createApp(), if any.
            const tinymceSetupOptions = Object.assign( {
                selector : '#editor',
                content_css : [
                    'document',
                    `${options.appRoot}/syntax-theme.css`,
                    MathLiveCSS
                ],
                visual_table_class : 'lurch-borderless-table',
                noneditable_class: 'mceNonEditable',
                height : "100%",
                promotion : false, // disable premium features advertisement
                toolbar : options.toolbarData,
                menubar : 'file edit insert format document developer help',
                menu : menuData,
                browser_spellcheck: true,
                contextmenu : 'atoms lurchBase',
                plugins : 'lists link contextmenu',
                link_context_toolbar: true,
                statusbar : false,
                setup : editor => {

                    // Register base context menu items once and expose a getter for Atoms
                    const installBaseMenu = editor => {
                        const reg = editor.ui.registry.getAll().menuItems
                        // idempotent: avoid duplicate registration if multiple editors exist
                        if (reg && reg.shellLabels) return

                        // Base menu items
                        editor.ui.registry.addMenuItem('shellLabels', {
                            text: 'Show/Hide Environment Labels',
                            tooltip: 'Show or hide the environment labels when viewing meaning.',
                            onAction: () => { 
                              editor.getBody().classList.toggle('shell-labels') 
                              editor.focus()
                            }
                        })                      
                        editor.ui.registry.addMenuItem('enterFullscreen', {
                          text: 'Enter fullscreen',
                          onAction: () => editor.execCommand('mceFullScreen')
                        })
                        editor.ui.registry.addMenuItem('exitFullscreen', {
                          text: 'Exit fullscreen',
                          onAction: () => editor.execCommand('mceFullScreen')
                        })
                        editor.lurchBaseMenu = () => 'shellLabels'
                    }

                    // Save the options object for any part of the app to reference:
                    editor.appOptions = options                    
                    
                    // Register base context menu before Atoms installs its own
                    installBaseMenu(editor)

                    // Show the base context menu when right-clicking anything,
                    // but only if the editor body has class "shell-style-boxed"
                    editor.ui.registry.addContextMenu('lurchBase', {
                      update: () => {
                        const hasBoxed = editor.getBody().classList.contains('shell-style-boxed')
                        return hasBoxed && editor.lurchBaseMenu ? editor.lurchBaseMenu() : ''
                      }
                    })

                    editor.ui.registry.addContextMenu('lurchBase', {
                      update: () => {
                        const body = editor.getBody()
                        let result = ''
                        // add the shell-labels item iff showing meaning 
                        if (body.classList.contains('shell-style-boxed') && editor.lurchBaseMenu) 
                          result += editor.lurchBaseMenu()

                        // Robust fullscreen state: use plugin API if available, else class probe
                        const isFs = !!(
                          editor?.plugins?.fullscreen?.isFullscreen?.() ??
                          (document.documentElement.classList.contains('tox-fullscreen') ||
                           document.body.classList.contains('tox-fullscreen'))
                        )
                        // choose which item to show
                        const toggleFullscreen = isFs ? 'exitFullscreen' : 'enterFullscreen'
                        result += ' '+ toggleFullscreen
                        return result
                      }
                    })

                    // As soon as the editor is ready...
                    editor.on( 'init', () => {
                        // Ensure it's not in front of any later Google Drive dialogs:
                        document.querySelector( '.tox-tinymce' ).style.zIndex = 500
                        // And ensure it has a lurchDocument property:
                        new LurchDocument( editor )
                    } )

                    // Install all tools the editor always needs:
                    Settings.install( editor )
                    Atoms.install( editor )
                    Expressions.install( editor )
                    ExpositoryMath.install( editor )
                    Shells.install( editor )
                    Dependencies.install( editor )
                    Validation.install( editor )
                    AutoCompleter.install( editor )
                    Export.install( editor )
                    FileSystem.install( editor )
                    Headers.install( editor )
                    DocSettings.install( editor )
                    Embedding.install( editor )
                    editor.on( 'init', () => loadFromQueryString( editor ) )

                    // Install any help pages specified in the options object
                    options.helpPages.forEach( ( page, index ) => {
                        editor.ui.registry.addMenuItem( `helpfile${index+1}`, {
                            text : page.title,
                            // icon : 'help',
                            onAction : () =>
                                window.open( makeAbsoluteURL( page.url ), '_blank' )
                        } )
                    } )            
                    // Add About Lurch menu item
                    editor.ui.registry.addMenuItem( 'aboutlurch', {
                        text : 'About Lurch',
                        // icon : 'help',
                        tooltip : 'About Lurch',
                        onAction : () => window.open(
                            './about', '_blank' )
                    } )

                    // Add red pen menu item
                    editor.ui.registry.addMenuItem( 'redpen', {
                        text : 'Grading pen',
                        tooltip : 'Enable grading pen style',
                        shortcut : 'meta+Shift+G',
                        icon : 'highlight-bg-color',
                        onAction : () => {
                            editor.execCommand( 'Italic' )
                            editor.execCommand( 'ForeColor', false, '#DA1D0C' )
                            editor.execCommand( 'FontName', false, 'Georgia' )
                            editor.execCommand( 'FontSize', false, '1.1rem' )
                        }
                    } )

                    // Create keyboard shortcuts for all menu items
                    const menuItems = editor.ui.registry.getAll().menuItems
                    for ( let itemName in menuItems ) {
                        const item = menuItems[itemName]
                        if ( item.hasOwnProperty( 'shortcut' ) ) {
                            const shortcut = item.shortcut
                                .replace( /enter/i, '13' )
                                .replace( /space/i, '32' )
                            editor.addShortcut( shortcut, item.text,
                                () => item.onAction() )
                        }
                    }

                    // Handle tab key in a way more like what users will expect
                    editor.on( 'keydown', event => {
                        if ( event.keyCode == 9 ) {
                            if ( event.shiftKey ) {
                                editor.execCommand( 'outdent' )
                            } else {
                                editor.execCommand( 'indent' )
                            }
                            event.preventDefault()
                            event.stopPropagation()
                            return false
                        }
                    } )
                     
                    // when using the fullscreen plugin, check if the app is changed
                    // to full screen and if so toggle the visibility of the
                    // Lurch menu and toolbar and Logo
                    editor.on('FullscreenStateChanged', function(e) {

                        if (e.state) {
                            // Hide toolbar and menus
                            document.querySelector('.tox-editor-header').style.display = 'none'
                            // Hide status bar (we don't have one)
                            // document.querySelector('.tox-statusbar').style.display = 'none' 
                        } else {
                            // Show toolbar and menus
                            document.querySelector('.tox-editor-header').style.display = ''
                            // Show status bar (we don't have one)
                            // document.querySelector('.tox-statusbar').style.display = '' 
                        }
                    })
                  
                    // Do not let the user leave the page accidentally, only on
                    // purpose (after confirming via dialog).  See docs above
                    // for the default value of this feature.
                    if ( options.preventLeaving )
                        window.addEventListener( 'beforeunload', event => {
                            // Note: The following code is NOT the same as just
                            // assigning isDirty() to the returnValue.
                            if ( editor.isDirty() ) event.returnValue = true
                        } )

                    // resolve the outer promise, to say that we finished
                    // TinyMCE setup
                    resolve( editor )

                    // Put the cursor in the editor at startup
                    editor.once( 'PostRender', () => editor.focus() )
                }
            }, options.editor )
            tinymce.init( tinymceSetupOptions )
        } ) )
    }

}    
