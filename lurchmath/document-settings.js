
/**
 * This module exports a function that installs in a TinyMCE editor features
 * for editing document settings.  It also exports
 * {@link module:DocumentSettings.lookup lookup()} and
 * {@link module:DocumentSettings.store store()} functions that are convenience
 * shortcuts to metadata-related function calls in the {@link LurchDocument}
 * class.
 * 
 * @module DocumentSettings
 */

import { Settings } from './settings.js'
import { appSettings } from './settings-install.js'
import { LurchDocument } from './lurch-document.js'

// Necessary for the use of appSettings below, except when being loaded in a web
// worker, because localStorage does not exist there from which to load settings:
if ( typeof( localStorage ) !== 'undefined' ) appSettings.load()

/**
 * Installs in a given TinyMCE editor the UI features for editing document
 * settings.  Specifically, we add a menu item called `"docsettings"` that is
 * intended for the Document menu, and which does the following:
 * 
 *  * Pop up a user interface allowing the user to edit the document's settings.
 *  * Populate that user interface with the existing values of the settings
 *    stored in the document's metadata.
 *  * If the user accepts any changes they've made to the settings before
 *    closing the dialog, save those changes back into the document's metadata
 *    as well.
 * 
 * @param {tinymce.Editor} editor - the editor into which to install the
 *   features
 * @function
 */
export const install = editor => {
    editor.ui.registry.addMenuItem( 'docsettings', {
        text : 'Document settings',
        icon : 'settings',
        tooltip : 'Edit document settings',
        onAction : () => {
            // Create settings instance and LurchDocument instance
            const settings = new Settings( 'Document settings',
                LurchDocument.shortSettingsMetadata )
            const LDoc = new LurchDocument( editor )
            // Load document settings into it
            const allowedKeys = settings.keys()
            LDoc.getMetadataKeys( 'settings' ).forEach( key => {
                if ( allowedKeys.includes( key ) ) {
                    const metadata = settings.metadata.metadataFor( key )
                    const loaded = LDoc.getMetadata( 'settings', key )
                    settings.set( key,
                        metadata ? metadata.convert( loaded ) : loaded )
                }
            } )
            // Present interface to user
            settings.userEdit( editor )
            // Save iff the user accepted the changes
            .then( changedKeys => changedKeys.forEach( key =>
                LDoc.setMetadata( 'settings', key, 'json',
                    settings.get( key ) ) ) )
        }
    } )  
}

/**
 * Look up the value of a given setting in a given editor's document.  This will
 * return either the value the user has specified for that setting, as stored in
 * the metadata for the document currently loaded in that editor, or the default
 * value for that setting, if the user has not specified one for that document.
 * 
 * This is the function that most parts of the application will use.  Many parts
 * of the application will want to ask what the value is of a certain document
 * setting, so that they can respect it.  This function allows them to do so in
 * a quick and simple way.
 * 
 * @param {tinymce.Editor} editor - the editor in which to look up the setting
 * @param {string} key - the name of the setting to look up
 */
export const lookup = ( editor, key ) => {
    // Create all the objects we need to use for lookup. We usethe full
    // settingsMetadata for this since the settings themselves might be needed
    // elsewhere even if we don't let the user edit them.
    const settings = new Settings( 'Document settings',
        LurchDocument.settingsMetadata )
    const metadata = settings.metadata.metadataFor( key )
    const LDoc = new LurchDocument( editor )
    // If the user has never given the setting a value, use the default
    // (or return undefined if the caller specified an invalid setting key)
    if ( !LDoc.getMetadataKeys( 'settings' ).includes( key ) )
        return metadata ? metadata.defaultValue : undefined
    // Since the user has given the setting a value, apply to it any applicable
    // conversion function specified in the metadata, then return it.
    const value = LDoc.getMetadata( 'settings', key )
    return metadata ? metadata.convert( value ) : value
}

/**
 * Change the value of a given setting in a given editor's document.  This will
 * write the given value into the metadata for the current document in the given
 * editor.
 * 
 * @param {tinymce.Editor} editor - the editor in which to write the setting
 * @param {string} key - the name of the setting to change
 * @param {any} value - the value to write (JSONable)
 */
export const store = ( editor, key, value ) => {
    new LurchDocument( editor ).setMetadata( 'settings', key, 'json', value )
}

export default { install, lookup, store }
