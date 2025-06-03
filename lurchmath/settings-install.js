/**
 * This module exports one function that installs in a TinyMCE editor features
 * for editing application settings, and it also exports the settings object
 * itself, for reading/writing specific settings.
 * 
 * @module SettingsInstaller
 */

import { Settings } from './settings.js'
import {
    SettingsMetadata, SettingsCategoryMetadata, ShowWarningSettingMetadata,
    CategorySettingMetadata, LongTextSettingMetadata, BoolSettingMetadata,
    NoteMetadata
} from './settings-metadata.js'

/**
 * This is the global settings object that stores the user's settings in their
 * browser's LocalStorage.  It includes metadata for all the settings of the app
 * and gets loaded when the editor is initialized.
 * 
 * @see {@link Settings}
 */
export const oldAppSettings = new Settings(
    'Application settings',
    new SettingsMetadata(
        new SettingsCategoryMetadata(
            'Math content',
            new CategorySettingMetadata(
                'notation',
                'Default notation to use for new documents',
                [ 'Lurch notation', 'LaTeX' ],
                'Lurch notation'
            ),
            new CategorySettingMetadata(
                'expression editor type',
                'Type of expression editor to use',
                [ 'Beginner', 'Intermediate', 'Advanced' ],
                'Advanced'
            ),
            new CategorySettingMetadata(
                'expository math editor type',
                'Type of expository math editor to use',
                [ 'Beginner', 'Intermediate', 'Advanced' ],
                'Advanced'
            ),
            new BoolSettingMetadata(
                'dollar sign shortcut',
                'Use $ as a shortcut for entering expository math',
                true
            ),
            new CategorySettingMetadata(
                'default shell style',
                'Default style for environments in new documents',
                [ 'boxed', 'minimal' ],
                'minimal'
            ),
            new NoteMetadata(
                'If you change the default environment style, you will need to '
              + 'reload the application for the change to take effect.'
            )
        ),
        new SettingsCategoryMetadata(
            'Editor appearance',
            new CategorySettingMetadata(
                'application width in window',
                'Width of application in browser window',
                [ 'Fixed size', 'Full width' ],
                'Fixed size'
            ),
            new BoolSettingMetadata(
                'developer mode on',
                'Enable instructor menu',
                false
            ),
            new NoteMetadata(
                'If you toggle the developer menu on/off, you will need to reload '
              + 'the application for the change to take effect.'
            )
        ),
        new SettingsCategoryMetadata(
            'File load/save',
            // It would be better not to hard-code the names of the file systems
            // below, but if we try to compute them dynamically, that creates an
            // import cycle of badness that creates errors at app launch.
            // Could be fixed in the future?  Not super important.
            new CategorySettingMetadata(
                'default open dialog tab',
                'Default source for loading files',
                [
                    'From your computer',
                    'From the web',
                    'From Dropbox',
                    'From in-browser storage'
                ],
                `From your computer`
            ),
            new CategorySettingMetadata(
                'default save dialog tab',
                'Default destination for saving files',
                [
                    'To your computer',
                    'To Dropbox',
                    'To in-browser storage'
                ],
                `To your computer`
            )
        ),
        new SettingsCategoryMetadata(
            'Export to LaTeX',
            new BoolSettingMetadata(
                'add LaTeX document wrapper',
                'Wrap the result in a document environment',
                true
            ),
            new BoolSettingMetadata(
                'export LaTeX selection only',
                'Convert only the selection to LaTeX',
                false
            ),
            new BoolSettingMetadata(
              'export LaTeX shells',
              'Export shells as LaTeX environments',
              true
          ),
      ),
        new SettingsCategoryMetadata(
            'Application warnings',
            new ShowWarningSettingMetadata(
                'warn before extract header',
                'Show warning before moving the header into the document',
                'Moving the header into the document is an action that cannot be undone.'
            ),
            new ShowWarningSettingMetadata(
                'warn before embed header',
                'Show warning before moving document content into header',
                'Moving content into the header is an action that cannot be undone.'
            )
        ),
        new SettingsCategoryMetadata(
            'Advanced',
            new CategorySettingMetadata(
                'preferred meaning style',
                'Preferred style to use when viewing content\'s meaning',
                [ 'Hierarchy', 'Code' ],
                'Code'
            ),
            new LongTextSettingMetadata(
                'declaration type templates',
                'Phrases for variable and constant declarations',
                [
                    'Let [variable] be arbitrary',
                    'Let [variable] be such that [statement]',
                    '[statement], where [variable] is arbitrary',
                    'Reserve a new symbol [constant]',
                    'For some [constant], [statement]',
                    '[statement], for some [constant]'
                ].join( '\n' ),
                text => {
                    const errors = [ ]
                    text.split( '\n' ).forEach( ( line, index ) => {
                        const numV = line.split( '[variable]' ).length - 1
                        if ( numV > 1 )
                            errors.push( `Phrase ${index + 1}: too many [variable]s` )
                        const numC = line.split( '[constant]' ).length - 1
                        if ( numC > 1 )
                            errors.push( `Phrase ${index + 1}: too many [constant]s` )
                        const numS = line.split( '[statement]' ).length - 1
                        if ( numS > 1 )
                            errors.push( `Phrase ${index + 1}: too many [statement]s` )
                        if ( numV == 0 && numC == 0 )
                            errors.push( `Phrase ${index + 1}: neither [variable] nor [constant]` )
                        if ( numS > 0 && !line.startsWith( '[statement]' )
                                      && !line.endsWith( '[statement]' ) )
                            errors.push( `Phrase ${index + 1}: [statement] is not at the start or end` )
                        if ( /\[variable\]\s*\[statement\]/.test( line )
                          || /\[constant\]\s*\[statement\]/.test( line )
                          || /\[statement\]\s*\[variable\]/.test( line )
                          || /\[statement\]\s*\[constant\]/.test( line ) )
                            errors.push( `Phrase ${index + 1}: no text between placeholders` )
                    } )
                    return errors
                }
            )
        )
    )
)

/**
 * This is a truncated version of {@link appSettings} use for the Preferences
 * dialog to hide from advanced, confusing, or no longer functional settings. 
 *
 * @see {@link Settings}
 */
export const appSettings = new Settings(
    'Application settings',
    new SettingsMetadata(
        new SettingsCategoryMetadata(
            'Export to LaTeX',
            new BoolSettingMetadata(
                'add LaTeX document wrapper',
                'Wrap the result in a document environment',
                true
            ),
            new BoolSettingMetadata(
                'export LaTeX selection only',
                'Convert only the selection to LaTeX',
                false
            ),
            new BoolSettingMetadata(
              'export LaTeX shells',
              'Export shells as LaTeX environments',
              true
            ),
        ),
        new SettingsCategoryMetadata(
            'Application warnings',
            new ShowWarningSettingMetadata(
                'warn before extract header',
                'Show warning before moving the header into the document',
                'Moving the header into the document is an action that cannot be undone.'
            ),
            new ShowWarningSettingMetadata(
                'warn before embed header',
                'Show warning before moving document content into header',
                'Moving content into the header is an action that cannot be undone.'
            ),
               new BoolSettingMetadata(
                'show validation has completed',
                'Show a brief message that validation has completed',
                true
            )
        )
    )
)

// Internal use only
// Called when the user says OK in the app settings dialog.
// Parameter is a list of what settings they changed (array of string keys),
// or undefined if the app has just loaded and we need to apply loaded changes.
const applySettings = changes => {
    // First, if there were any changes, save the settings to the browser.
    if ( changes && changes.length > 0 ) appSettings.save()
    // Now, for any change that must result in some code being run now to alter
    // the app's behavior, run that code.

    // This shouldn't happen because it's not an actual setting anymore
    // if ( !changes || changes.includes( 'application width in window' ) ) {
    //     // Mark the body as to whether we're full screen or not, so CSS responds
    //     if ( appSettings.get( 'application width in window' ) == 'Fixed size' )
    //         document.body.classList.remove( 'fullscreen' )
    //     else
    //         document.body.classList.add( 'fullscreen' )
    // }
}

/**
 * First, install in a given TinyMCE editor the UI features for editing
 * application settings.
 * 
 * Second, install an event handler so that when the editor finishes its
 * initialization, we load the application settings and apply to the editor any
 * of them that impact its appearance.
 * 
 * @param {tinymce.Editor} editor - the editor into which to install the
 *   features
 * @function
 */
export const install = editor => {
    editor.ui.registry.addMenuItem( 'preferences', {
        text : 'Application settings',
        tooltip : 'Lurch application settings',
        icon : 'preferences',
        onAction : () => {
            appSettings.load()
            appSettings.userEdit( editor ).then( changes =>
                applySettings( changes ) )
        }
    } )
    editor.on( 'init', () => {
        appSettings.load()
        applySettings()
    } )
}

export default { appSettings, install }
