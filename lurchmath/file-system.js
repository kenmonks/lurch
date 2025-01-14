
import {
    Dialog,
    LongTextInputItem, AlertItem, TextInputItem, ListItem, LabeledGroup, HTMLItem
} from './dialog.js'
import { LurchDocument } from './lurch-document.js'
import { appURL } from './utilities.js'
import { appSettings } from './settings-install.js'
import { downloadFile } from './upload-download.js'

// Internal use only
// Tools for auto-saving the user's work as they edit, and for loading that work
// later if they never manually saved it and need to recover it.
const autoSaveKey = 'lurch-autosave'
const autoSaveFrequencyInSeconds = 5
const autoSave = content =>
    window.localStorage.setItem( autoSaveKey, content )
const getAutoSave = () => window.localStorage.getItem( autoSaveKey )
const autoSaveExists = () => {
    for ( let i = 0 ; i < window.localStorage.length ; i++ )
        if ( window.localStorage.key( i ) == autoSaveKey ) return true
    return false
}
const removeAutoSave = () => window.localStorage.removeItem( autoSaveKey )

// Internal use only
// How to simplify any subclass name to an identifier
const simplifyName = name => name.replace( /[^a-z]/gi, '' )

/**
 * A FileSystem is a place where files can be saved and/or loaded.  This is
 * intentionally vague, so that many different types of sources or destinations
 * can be treated as filesystems, each with different features.  Examples
 * include each of the following, which will be implemented as subclasses:
 * 
 *  - A cloud storage platform such as Dropbox, which has a wide variety of
 *    features for listing, loading, saving, deleting, and renaming files.
 *  - The browser's `localStorage` object, which can store arbitrary key-value
 *    pairs, and can thus be used as a simple file system with all the same
 *    features as a cloud storage platform, but very limited space and no
 *    transferability between browsers or computers.
 *  - The user's hard drive, which can load and save files only with manual user
 *    intervention, and which does not let a web application list folder
 *    contents, delete files, or rename files.
 *  - A web repository of files, such as a GitHub repository or simply a folder
 *    on a public server, which can list files and load them, but will not let
 *    this web application save, delete, or rename files in that web repository.
 * 
 * This class therefore provides many abstract methods for the various actions
 * described above (loading, saving, etc.) and is intended to be subclassed to
 * implement specific file systems.
 * 
 * We formalize here tne definition of one central concept, a "file object."  It
 * will be a JavaScript object with some subset of the following fields.
 * 
 *  - `fileSystemName` - the name of the file system from which the file
 *    originated or was last saved.  If this field is absent, then the file was
 *    created in the application and has not yet been saved anywhere.
 *  - `filename` - the name of the file in the file system, written in a way
 *    that is sensible for a human user to read.  For example, some cloud
 *    storage systems might have unique IDs for files that are not
 *    human-readable, but by contrast this field should be the name the user
 *    gave the file.  This field should be set when a file is read from a file
 *    system, and will be absent if and only if one of the following is true:
 *     - the user created the file in the application and has not yet saved it
 *     - the user saved the file to a file system that does not tell the
 *       application the name that the user chose, such as the user's hard drive
 *       through a download operation
 *     - the file object represents a folder, as documented below
 *  - `UID` - a unique identifier for the file in the file system.  This is not
 *    necessarily a globally unique ID, but is unique within the file system
 *    named in the first attribute, above.  This field should not be present if
 *    the `fileSystemName` field is absent, because a file system gives the file
 *    its ID, so we cannot have this field without the other first.  Some
 *    file systems may be sufficiently simple that they operate using only the
 *    human-readable filename in the `filename` field, in which case this field
 *    can be omitted.
 *  - `path` - a string representing the path in which the file is stored.  If
 *    the file system does not use paths, then this may be absent.  But a file
 *    object can represent a folder by setting this field to a path but omitting
 *    the filename and UID.  Such a file object can be passed as the parameter
 *    to the file listing function to list the contents of a folder, or the file
 *    open function, to specify which folder's files the user should be choosing
 *    from by default.
 *  - `contents` - the contents of the file, as a string.  This field will be
 *    present if the file object is one that the application wants to save, by
 *    passing to a saving function, because obviously the file cannot be saved
 *    without its content.  Similarly, the field will be present if this file
 *    object is being returned from a file loading operation, since that was the
 *    purpose of the operation.  But this field may be absent if the file object
 *    is part of a directory listing, or is a parameter being passed to a file
 *    loading function, since the contents are either unnecessary or impossible
 *    in such situations.
 */
export class FileSystem {

    // Internal use only: Stores a mapping from subclass names to subclasses of
    // the FileSystem class.  Public use of this data should be done through the
    // registerSubclass() function below; clients do not need to read this data.
    static subclasses = new Map()

    /**
     * This class tracks its collection of subclasses so that we can find a
     * file system by its name, or get a list of all file systems registered.
     * We may need to find a file system by name if we have a file we need to
     * save into that system (which knows the name of the file system it came
     * from) and we may need to get a list of all file systems to populate the
     * submenus for file open, file save, etc.
     * 
     * Example of registering a subclass:
     * 
     * ```js
     * class Example extends FileSystem { ... }
     * FileSystem.registerSubclass( 'Example', Example )
     * ```
     * 
     * @param {string} name - the name of the subclass to register
     * @param {Object} subclass - the subclass itself
     * @see {@link FileSystem#getName getName()}
     */
    static registerSubclass ( name, subclass ) {
        FileSystem.subclasses.set( name, subclass )
        return name
    }

    /**
     * Get a FileSystem subclass by name.  For more information about
     * registering subclasses, see the {@link module:FileSystem.registerSubclass
     * registerSubclass()} static member.
     * 
     * @param {string} name - the name of the subclass to get
     * @returns {Object} the subclass with the given name
     * @see {@link FileSystem#getName getName()}
     */
    static getSubclass ( name ) {
        return FileSystem.subclasses.get( name )
    }

    /**
     * Get a list of all registered file systems.  For more information about
     * registering subclasses, see the {@link module:FileSystem.registerSubclass
     * registerSubclass()} static member.
     * 
     * @returns {Array} the list of all registered file systems
     * @see {@link FileSystem.getSubclass getSubclass()}
     */
    static getSubclasses () {
        return Array.from( FileSystem.subclasses.values() )
    }

    /**
     * Get a list of just those subclasses whose names are given, in the order
     * specified.  This is useful when the app's settings request only a certain
     * set of file systems to be available.
     * 
     * If any of the names is not the name of a valid subclass, an error will be
     * thrown.
     * 
     * @param {Array} names - the names of the subclasses to get
     * @returns {Array} the list of subclasses with the given names
     * @see {@link FileSystem.getSubclasses getSubclasses()}
     */
    static getNamedSubclasses ( names ) {
        const result = [ ]
        for ( const name of names ) {
            const subclass = FileSystem.getSubclass( name )
            if ( !subclass ) throw new Error( `Unknown file system: ${name}` )
            result.push( subclass )
        }
        return result
    }

    /**
     * Get the name of a given {@link FileSystem} subclass, by looking it up in
     * the list of registered subclasses.  For more information about
     * registering subclasses, see the {@link module:FileSystem.registerSubclass
     * registerSubclass()} static member.
     * 
     * @param {Object} subclass - the subclass to look up
     * @returns {string} the name of the given subclass (or undefined if the
     *   given object is not a subclass that was registered)
     * @see {@link FileSystem.getSubclass getSubclass()}
     * @see {@link FileSystem.getName getName()}
     */
    static getSubclassName ( subclass ) {
        return Array.from( FileSystem.subclasses.keys() ).find( name =>
            subclass === FileSystem.getSubclass( name ) )
    }

    /**
     * Get the name of the class of this file system, by looking its class up in
     * the list of registered subclasses.  For more information about
     * registering subclasses, see the {@link module:FileSystem.registerSubclass
     * registerSubclass()} static member.
     * 
     * @returns {string} the name of the class of this file system (or undefined
     *   if this instance is a member of a subclass that was not registered)
     * @see {@link FileSystem.getSubclass getSubclass()}
     * @see {@link FileSystem.getSubclassName getSubclassName()}
     */
    getName () {
        return Array.from( FileSystem.subclasses.keys() ).find( name =>
            this instanceof FileSystem.getSubclass( name ) )
    }

    /**
     * Construct a file system and associate it with a given TinyMCE editor.
     */
    constructor ( editor ) {
        this.editor = editor
    }

    /**
     * The following member functions of the {@link FileSystem} class are
     * abstract, and thus have empty implementations in the base class: `read`,
     * `write`, `delete`, `has`, and `list`.  Subclasses may choose to implement
     * some of them, as documented in {@link FileSystem the class itself}.  You
     * can test whether a specific subclass implements a given feature by
     * calling this function.  You can test whether a specific instance
     * implements a given feature by calling {@link FileSystem#implements
     * implements()}.
     * 
     * @param {Object} subclass - the subclass to test
     * @param {string} name - the name of the feature, from the list above
     * @returns {boolean} whether the subclass implements the given feature
     * @see {@link FileSystem#implements implements()}
     */
    static subclassImplements ( subclass, name ) {
        return subclass.prototype[name] != FileSystem.prototype[name]
    }

    /**
     * The following member functions of the {@link FileSystem} class are
     * abstract, and thus have empty implementations in the base class: `read`,
     * `write`, `delete`, `has`, and `list`.  Subclasses may choose to implement
     * some of them, as documented in {@link FileSystem the class itself}.  You
     * can test whether a specific instance implements a given feature by
     * calling this function.  You can test whether a specific subclass
     * implements a given feature by calling {@link
     * FileSystem.subclassImplements subclassImplements()}.
     * 
     * @param {string} name - the name of the feature, from the list above
     * @returns {boolean} whether the instance implements the given feature
     * @see {@link FileSystem.subclassImplements subclassImplements()}
     */
    implements ( name ) {
        return this[name] != FileSystem.prototype[name]
    }

    /**
     * The following member functions of the {@link FileSystem} class are
     * abstract, and thus have empty implementations in the base class: `read`,
     * `write`, `delete`, `has`, and `list`.  Subclasses may choose to implement
     * some of them, as documented in {@link FileSystem the class itself}.  You
     * can get the full list of subclasses that implement a given feature by
     * calling this function.
     * 
     * @param {string} name - the name of the feature, from the list above
     * @returns {Array} the list of subclasses that implement the given feature
     * @see {@link FileSystem.subclassImplements subclassImplements()}
     * @see {@link FileSystem#implements implements()}
     */
    static subclassesImplementing ( name ) {
        return FileSystem.getSubclasses().filter( subclass =>
            FileSystem.subclassImplements( subclass, name ) )
    }

    /**
     * This abstract method reads a file from the file system.  It is abstract
     * in the sense that the base implementation returns a promise that
     * immediately rejects with an error that the method is unimplemented.
     * Subclasses that provide the ability to read files must override this base
     * implementation.  Any implementation in a subclass should satisfy the
     * following criteria.
     * 
     *  1. If the user passes a file object parameter (as documented in {@link
     *     FileSystem the FileSystem class}) with enough information in it to
     *     identify a file, then this method should return a promise that
     *     resolves to that file as soon as it can be loaded.  Specifically, the
     *     object to which the promise resolves should be the same object as the
     *     one passed in, but with its `contents` member set to the contents of
     *     the file, as a string.  Furthermore, the file object should have its
     *     file system name set to the name of the subclass in question.
     *  2. If the user omits the parameter, or omits its filename or UID, or
     *     provides an invalid file object in any other way, then this method
     *     should reject with an error, because the user did not specify which
     *     file to read.
     * 
     * @param {Object} [fileObject] - an object representing the file to read,
     *   as described above
     * @returns {Promise} a promise that resolves or rejects as described in the
     *   criteria above
     * @see {@link FileSystem#has has()}
     * @see {@link FileSystem#list list()}
     */
    read ( _fileObject ) {
        return new Promise( ( _, reject ) => {
            reject( new Error( '"read" unimplemented in FileSystem class' ) )
        } )
    }

    /**
     * This abstract method saves a file to the file system.  It is abstract in
     * the sense that the base implementation returns a promise that immediately
     * rejects with an error that the method is unimplemented.  Subclasses that
     * provide the ability to save files must override this base implementation.
     * Any implementation in a subclass should satisfy the following criteria.
     * 
     *  1. If the file object's `fileSystemName` does not match the name of this
     *     instance, throw an error, because the caller is asking us to write in
     *     a place to which we have no access.  However, if the `fileSystemName`
     *     was omitted, then on a successful save, update it to the name of this
     *     subclass.
     *  2. If the file object's `contents` member is undefined, throw an error,
     *     because we have no content to write.
     *  3. If the file object contains insufficient information in its
     *     `filename`, `UID`, and `path` members to let this file system know
     *     where to write the content, throw an error.
     *  4. Save the given contents into the file system and resolve to a
     *     (possibly updated) file object on success, or reject if an error
     *     occurred when attempting to write.
     * 
     * @param {Object} fileObject - an object representing the file to write,
     *   as described above, and as documented in {@link FileSystem the
     *   FileSystem class})
     */
    write ( _fileObject ) {
        return new Promise( ( _, reject ) => {
            reject( new Error( '"write" unimplemented in FileSystem class' ) )
        } )
    }

    /**
     * This abstract method deletes a file from the file system.  It is abstract
     * in the sense that the base implementation returns a promise that
     * immediately rejects with an error that the method is unimplemented.
     * Subclasses that provide the ability to delete files must override this
     * base implementation.  Any implementation in a subclass should satisfy the
     * following criteria.
     * 
     *  1. If the file object's `fileSystemName` does not match the name of this
     *     instance, throw an error, because the caller is asking us to delete
     *     a file in a different file system.  However, if the `fileSystemName`
     *     was omitted, then on a successful deletion, update it to the name of
     *     this subclass.
     *  2. If the client passes a file object as parameter, and it contains
     *     insufficient information in its `path`, `filename`, and `UID` members
     *     to uniquely determine a file, throw an error.  Also, if it is
     *     possible in the file system in question to detect at this point
     *     whether the file exists, and it does not, throw an error.
     *  3. Otherwise, delete the file from the file system and resolve to a
     *     (possibly updated) file object on success, or reject if an error
     *     occurred when attempting to delete.
     * 
     * @param {Object} fileObject - an object representing the file to delete,
     *   as described above, and as documented in {@link FileSystem the
     *   FileSystem class})
     * @returns {Promise} a promise that resolves or rejects as described in the
     *   criteria above
    */
    delete ( _fileObject ) {
        return new Promise( ( _, reject ) => {
            reject( new Error( '"delete" unimplemented in FileSystem class' ) )
        } )
    }

    /**
     * This abstract method answers the question of whether the file system
     * contains a file with the criteria specified in the parameter.  It is
     * abstract in the sense that the base implementation returns a promise that
     * immediately rejects with an error that the method is unimplemented.
     * Subclasses that provide the ability to read files (by implementing the
     * {@link FileSystem#read read()} method) should also provide this method by
     * overriding this base implementation.  Any implementation in a subclass
     * should satisfy the following criteria.
     * 
     *  1. If the client passes a file object as parameter, and it contains
     *     sufficient information in its `path`, `filename`, and `UID` members
     *     to uniquely determine a file, then return a promise that checks
     *     whether the specified file exists in the file sytem and resolves to
     *     the result, as a boolean value.  The promise should reject only if an
     *     error occurs when attempting to check whether the file exists.
     *  2. In all other cases, throw an error.  This includes a missing
     *     parameter, insufficient information in the parameter, or a parameter
     *     whose `fileSystemName` does not match the name of this file system.
     * 
     * @param {Object} fileObject - an object representing the file being
     *   queried, as described above, and as documented in {@link FileSystem the
     *   FileSystem class})
     * @returns {Promise} a promise that resolves or rejects as described in the
     *   criteria above
     * @see {@link FileSystem#read read()}
     */
    has ( _fileObject ) {
        return new Promise( ( _, reject ) => {
            reject( new Error( '"has" unimplemented in FileSystem class' ) )
        } )
    }

    /**
     * This abstract method returns a promise that resolves to a list of
     * objects representing all files in the file system.  It is abstract in the
     * sense that the base implementation returns a promise that immediately
     * rejects with an error that the method is unimplemented.  Subclasses that
     * provide the ability to read files (by implementing the {@link
     * FileSystem#read read()} method) should also provide this method by
     * overriding this base implementation.  Any implementation in a subclass
     * should satisfy the following criteria.
     * 
     *  1. If the client omits the parameter, then return a promise that gets
     *     the list of all files in the root of the file system and resolves to
     *     a JavaScript array of file objects (which are documented in {@link
     *     FileSystem the FileSystem class}).  The promise should reject only if
     *     an error occurs when attempting to get the list of files.  Note that
     *     a folder may contain subfolders, and those can be included in the
     *     list of results returned, because file objects have the capability of
     *     representing folders as well.  For details, see the {@link
     *     FileSystem documentation for the FileSystem class}.
     *  2. If the client passes a file object as parameter, and it contains a
     *     `path` member, then proceed exactly as in item 1., above, but not in
     *     the root of the file system, rather in the path provided.  If such a
     *     path does not exist, reject with an error.
     * 
     * @param {Object} [fileObject] - an object representing the path whose
     *   files should be listed, or if omitted, the root of the file system is
     *   assumed instead
     * @returns {Promise} a promise that resolves or rejects as described in the
     *   criteria above
     * @see {@link FileSystem#read read()}
     */
    list ( _fileObject ) {
        return new Promise( ( _, reject ) => {
            reject( new Error( '"list" unimplemented in FileSystem class' ) )
        } )
    }

    /**
     * When the user wants to select a file from this file system, this method
     * returns a list of dialog items allowing the user to choose a file.  For
     * example, if the list of files is known, the UI might be a representation
     * of that list, allowing the user to click one.  Or if the file system is
     * the web, from which one downloads URLs, the UI might be a text box into
     * which one can type a URL.
     * 
     * The base class implementation is to return a single file chooser item (in
     * an array by itself) if the file system implements the {@link
     * FileSystem#list list()} method, and undefined otherwise.
     * 
     * Anyone reimplementing this function must ensure that, whenever the user
     * interacts with the dialog items to choose a file, or change which file
     * has been chosen, the event handlers in one or more of the items returned
     * by this function must notify the dialog of what has changed by calling
     * `dialog.selectFile(fileObject)`.  The parameter should either be a file
     * object as documented at the top of {@link FileSystem this class}, or it
     * should be omitted to indicate that no (valid) file is currently selected.
     * This same function should be called during one of the items' `onShow()`
     * handlers as well, to initialize which file is selected when the tab
     * containing these dialog items first appears.  Failure to follow this
     * convention will result in undefined behavior.
     * 
     * If the UI this function returns is only for selecting a file, but not
     * loading its contents, the file object set with `dialog.selectFile()` may
     * contain just the `name` and/or `UID` fields, and need not contain the
     * `contents` field.  It can be loaded later with a call to {@link
     * FileSystem#read read()}.  If the UI this function returns is for loading
     * a file (e.g., drag-and-drop a file from the user's computer to upload it)
     * then the file object is free to include the contents as well, especially
     * since they cannot be read directly from JavaScript in that example case.
     * 
     * If the client wants the UI to browse to a specific location in the file
     * system, it can pass a file object with the `path` field set to the
     * location at which browsing should begin.
     * 
     * @returns {Object[]?} a list of dialog items representing this file system
     *   in a dialog, if the user's intent is to select a file from it
     */
    fileChooserItems ( fileObject ) {
        if ( !this.implements( 'list' ) ) return
        const name = simplifyName( this.getName() ) + 'FileList'
        const chooser = new FolderContentsItem(
            this, fileObject?.path || '', name )
        chooser.setSelectable()
        const originalOnShow = chooser.onShow
        chooser.onShow = () => {
            chooser.dialog.selectFile() // none yet
            originalOnShow.apply( chooser )
        }
        chooser.onSelectionChanged = () =>
            chooser.dialog.selectFile( chooser.get( name ) )
        chooser.onDoubleClick = () => {
            const target = chooser.get( name )
            // double-clicked a file means it's time to submit the dialog
            if ( target?.filename ) {
                chooser.dialog.json.onSubmit()
                return
            }
            // double-clicked a folder means it's time to navigate into it
            chooser.path = target.path
            chooser.repopulate()
        }
        return [ chooser ]
    }

    /**
     * When the user wants to save a file to this file system, this method
     * returns a list of dialog items allowing the user to choose the location
     * for the save.  For example, the UI might be a list of existing files,
     * together with a text blank into which you can type the filename of the
     * new file to save (or fill that box by clicking the name of an existing
     * file to save over it) just like many existing File-Save dialogs.
     * 
     * The base class implementation is to return two dialog items that behave
     * as in the example above, one text box and one file chooser item (in an
     * array of length two) if the file system implements the {@link
     * FileSystem#list list()} method, and just the text box alone if not.
     * 
     * Anyone reimplementing this function must ensure that, whenever the user
     * interacts with the dialog items to choose a save destination, the event
     * handlers in one or more of the items returned by this function must
     * notify the dialog of what has changed by calling
     * `dialog.setLocation(fileObject)`.  The parameter should either be a file
     * object as documented at the top of {@link FileSystem this class}, or it
     * should be omitted to indicate that no (valid) destination is currently
     * specified.  This same function should be called during one of the items'
     * `onShow()` handlers as well, to initialize which destination is specified
     * when the tab containing these dialog items first appears.  (In many
     * cases, no file will be chosen initially, and you can call
     * `dialog.setLocation()` with no argument.)  Failure to follow this
     * convention will result in undefined behavior.
     * 
     * Calls to `dialog.setLocation()` never need to pass a file object with a
     * `contents` field, since the contents can be filled in afterwards by the
     * caller, and before a call to {@link FileSystem#write write()}.
     * 
     * If the client wants the UI to start out referring to a specific location
     * in the file system, such as the last folder or file where the user saved
     * something, it can pass a file object with the `filename` and/or `path`
     * fields set to the file or folder at which browsing should begin.
     * 
     * @returns {Object[]?} a list of dialog items representing this file system
     *   in a dialog, if the user's intent is to save a file into it
     */
    fileSaverItems ( fileObject ) {
        const name = simplifyName( this.getName() )
        // The default implementation always puts in a filename blank
        const result = [ ]
        const blankName = `saveFilename`
        const filenameBlank = new TextInputItem( blankName, 'Filename' )
        const getFilenameElement = () =>
            filenameBlank.dialog.querySelector( 'input[type="text"]' )
        result.push( filenameBlank )
        // If the file system implements the list method, add a file chooser as
        // well, which can alter the contents of the filename blank
        let chooser = null
        if ( this.implements( 'list' ) ) {
            const chooserName = `${name}FileList`
            chooser = new FolderContentsItem(
                this, fileObject?.path || '', chooserName )
            chooser.setSelectable()
            // If they click a file (not a folder), put its name into the
            // filename blank
            chooser.onSelectionChanged = () => {
                const target = chooser.get( chooserName )
                if ( target?.filename ) {
                    getFilenameElement().value = target.filename
                    getFilenameElement().dispatchEvent( new Event( 'input' ) )
                }
            }
            chooser.onDoubleClick = () => {
                const target = chooser.get( chooserName )
                // double-clicked a file means it's time to submit the dialog
                if ( target?.filename ) {
                    chooser.dialog.json.onSubmit()
                    return
                }
                // double-clicked a folder means it's time to navigate into it
                chooser.path = target.path
                chooser.repopulate()
            }
            result.push( chooser )
        }
        // And we need the dialog to be taller, so we need an artificial spacer
        result.push( new HTMLItem( '<div style="height: 100px;"></div>' ) )
        // Do some setup when the dialog is first shown
        filenameBlank.onShow = () => {
            // If the user passed a fileObject, then the initial value of the
            // text box should be filled with its filename, and the dialog
            // should be notified of that.  Otherwise, tell the dialog that no
            // save destination is selected.
            getFilenameElement().value = fileObject?.filename ||
                filenameBlank.dialog.get( 'saveFilename' ) || ''
            filenameBlank.dialog.setLocation( fileObject )
            // Whenever the contents of the filename blank change, notify the
            // dialog
            getFilenameElement().addEventListener( 'input', () => {
                filenameBlank.dialog.setLocation( {
                    fileSystemName : this.getName(),
                    filename : getFilenameElement().value,
                    path : chooser?.path || fileObject?.path || ''
                } )
            } )
        }
        return result
    }

    /**
     * This static member should be called by any subclass that implements the
     * {@link FileSystem#write write()} method, whenever a save is successful,
     * because there are two responses that the system must give to any
     * successful file save.
     * 
     *  1. Delete the most recent auto-save.  If we did not delete the
     *     auto-saved content, then on the next launch of the application, the
     *     user would be alerted to the fact that unsaved work existed in the
     *     auto-save file and could be recovered for them.  But that would be
     *     false, because of course, they just did save their work.
     *  2. Store the file object representing the file just saved, so that it
     *     can be stored in the {@link LurchDocument} for the editor.  If the
     *     user later invokes a "save" menu item, its event handler can use the
     *     stored file object as the parameter to the {@link FileSystem#write
     *     write()} method.
     * 
     * The file object passed to this function should have enough uniquely
     * identifying information in its `filename`, `UID`, and `path` members to
     * satisfy the requirements of the {@link FileSystem#write write()} method
     * for the same file system subclass.  If its `contents` member has data in
     * it, that data will be ignored, so that it is not unnecessarily copied.
     * No `fileSystemName` needs to be provided; each subclass will use its own.
     * 
     * @param {Object} fileObject - the file object representing the file that
     *   was just saved (and whose format is documented in the {@link
     *   FileSystem} class)
     * @see {@link FileSystem#write write()}
     */
    documentSaved ( fileObject ) {
        removeAutoSave()
        new LurchDocument( this.editor ).setFileID( {
            fileSystemName : this.getName(),
            filename : fileObject.filename,
            UID : fileObject.UID,
            path : fileObject.path
        } )
    }

    /**
     * Open a File > Open dialog over the given editor, with tabs for each
     * available file system, and allow the user to browse them for a file to
     * open.  If the user chooses a file and asks to open it, attempt to do so,
     * and as long as it succeeds, replace the editor's current contents with
     * that new document.  If anything goes wrong, show a notification to the
     * user stating what went wrong.  If it succeeds, show a brief success
     * notification after the file loads.
     * 
     * An alternate use of this function is to open a file for some other
     * purpose, and just pass the contents of the file to a callback, without
     * actually changing teh contents of the given editor.  To use this function
     * in that way, pass a callback as the second argument.  It will be called
     * when the dialog closes, either with a file object or `null` if the user
     * did not choose a file (e.g., canceled the dialog).
     * 
     * @param {tinymce.Editor} editor - the editor in which to open the file
     * @param {Function} [callback] - the callback to call when the dialog
     *   closes, which can be omitted for the standard file-loading behavior
     * @see {@link FileSystem.saveFileAs saveFileAs()}
     * @see {@link FileSystem.deleteFile deleteFile()}
     */
    static openFile ( editor, callback ) {
        const dialog = new Dialog( 'Open file', editor )
        dialog.json.size = 'medium'
        let currentFile = null
        dialog.selectFile = fileObject => {
            currentFile = fileObject
            dialog.dialog.setEnabled( 'OK', !!currentFile?.filename )
        }
        const tabs = (
            editor.appOptions?.fileOpenTabs ?
            FileSystem.getNamedSubclasses( editor.appOptions.fileOpenTabs ) :
            FileSystem.getSubclasses()
        ).map( subclass => {
            return {
                name : `From ${FileSystem.getSubclassName( subclass )}`,
                items : new subclass( editor ).fileChooserItems()
            }
        } ).filter( tab => tab.items.length > 0 )
        if ( tabs.length == 0 ) {
            Dialog.failure( editor, 'No file systems available',
                'Cannot browse for a file to open' )
            return
        }
        dialog.setTabs( ...tabs.map( tab => tab.name ) )
        tabs.forEach( tab =>
            tab.items.forEach( item =>
                dialog.addItem( item, tab.name ) ) )
        dialog.show().then( userHitOK => {
            if ( !userHitOK ) return
            // At this point, if all file systems obeyed the rules about
            // calling selectFile() at the appropriate times, then we
            // should have !!currentFile.  Do a sanity check:
            if ( !currentFile ) {
                Dialog.notify( editor, 'error', `No file selected.` )
                callback?.()
                return
            }
            // Utility function for populating the editor, used below:
            const openInEditor = fileObject => {
                const LD = new LurchDocument( editor )
                LD.setDocument( fileObject.contents )
                delete currentFile.contents
                LD.setFileID( currentFile )
                Dialog.notify( editor, 'success',
                    `Loaded ${currentFile.filename}.` )
            }
            // If the UI gave us the full file contents, use them:
            if ( currentFile.hasOwnProperty( 'contents' ) ) {
                ( callback || openInEditor )( currentFile )
                return
            }
            // Otherwise, ask the FileSystem for them first:
            const subclass = FileSystem.getSubclass(
                currentFile.fileSystemName )
            new subclass( editor ).read( currentFile ).then( result => {
                ( callback || openInEditor )( result )
            } ).catch( error => {
                console.error( error )
                Dialog.notify( editor, 'error',
                    `Could not load ${currentFile.filename}.` )
                callback?.()
            } )
        } )
        setTimeout( () => {
            const defaultTab = appSettings.get( 'default open dialog tab' )
            if ( tabs.map( tab => tab.name ).includes( defaultTab ) )
                dialog.showTab( defaultTab )
        } )
    }
    
    /**
     * Open a File > Save As dialog over the given editor, with tabs for each
     * available file system, and allow the user to browse them for a location
     * into which to save their current file.  If the user chooses a location
     * and asks to save into it, attempt to do so, and pop up a notification
     * indicating success or failure.  Upon success, update the file information
     * stored in the current editor about where the document has been saved,
     * and notify the document that it is not dirty, using
     * {@link FileSystem#documentSaved documentSaved()}.
     * 
     * @param {tinymce.Editor} editor - the editor whose file is to be saved
     * @see {@link FileSystem.openFile openFile()}
     * @see {@link FileSystem.deleteFile deleteFile()}
     */
    static saveFileAs ( editor ) {
        const dialog = new Dialog( 'Save file', editor )
        dialog.json.size = 'medium'
        let saveLocation = null
        dialog.setLocation = fileObject => {
            saveLocation = fileObject
            dialog.dialog.setEnabled( 'OK', !!saveLocation?.filename )
        }
        const tabs = (
            editor.appOptions?.fileSaveTabs ?
            FileSystem.getNamedSubclasses( editor.appOptions.fileSaveTabs ) :
            FileSystem.getSubclasses()
        ).map( subclass => {
            return {
                name : `To ${FileSystem.getSubclassName( subclass )}`,
                items : new subclass( editor ).fileSaverItems()
            }
        } ).filter( tab => tab.items.length > 0 )
        if ( tabs.length == 0 ) {
            Dialog.failure( editor, 'No file systems available',
                'Cannot browse for a location to save' )
            return
        }
        dialog.setTabs( ...tabs.map( tab => tab.name ) )
        tabs.forEach( tab =>
            tab.items.forEach( item =>
                dialog.addItem( item, tab.name ) ) )
        dialog.show().then( userHitOK => {
            if ( !userHitOK ) return
            // At this point, if all file systems obeyed the rules about
            // calling setLocation() at the appropriate times, then we
            // should have !!saveLocation.  Do a sanity check:
            if ( !saveLocation ) {
                Dialog.notify( editor, 'error', `No filename specified.` )
                return
            }
            // Ask the FileSystem to save the editor's current contents:
            const subclass = FileSystem.getSubclass(
                saveLocation.fileSystemName )
            const LD = new LurchDocument( editor )
            saveLocation.contents = LD.getDocument()
            const fileSystem = new subclass( editor )
            fileSystem.write( saveLocation ).then( () => {
                delete saveLocation.contents
                LD.setFileID( saveLocation )
                fileSystem.documentSaved( saveLocation )
                Dialog.notify( editor, 'success',
                    `Saved ${saveLocation.filename}.` )
            } ).catch( error => {
                console.error( error )
                Dialog.notify( editor, 'error',
                    `Could not save ${saveLocation.filename}.` )
            } )
        } )
        setTimeout( () => {
            const defaultTab = appSettings.get( 'default save dialog tab' )
            if ( tabs.map( tab => tab.name ).includes( defaultTab ) )
                dialog.showTab( defaultTab )
        } )
    }
    
    /**
     * Open a Delete File dialog, with tabs for each file system that supports
     * the deletion of files, and allow the user to browse them for a file to
     * delete.  If the user chooses a file and asks to delete it, attempt to do
     * so, and pop up a notification indicating success or failure.
     * 
     * @param {tinymce.Editor} editor - the editor over which the dialog will be
     *   shown (but the editor's contents to not play into this deletion
     *   operation)
     * @see {@link FileSystem.openFile openFile()}
     * @see {@link FileSystem.saveFileAs saveFileAs()}
     */
    static deleteFile ( editor ) {
        const dialog = new Dialog( 'Delete file', editor )
        dialog.json.size = 'medium'
        dialog.setOK( 'Delete' )
        let currentFile = null
        dialog.selectFile = fileObject => 
            dialog.dialog.setEnabled( 'OK', !!( currentFile = fileObject ) )
        const tabs = (
            editor.appOptions?.fileDeleteTabs ?
            FileSystem.getNamedSubclasses( editor.appOptions.fileDeleteTabs ) :
            FileSystem.getSubclasses()
        ).map( subclass => {
            const fileSystem = new subclass( editor )
            return {
                name : `In ${FileSystem.getSubclassName( subclass )}`,
                items : fileSystem.implements( 'list' )
                    && fileSystem.implements( 'delete' ) ? [
                        ...fileSystem.fileChooserItems(),
                        // and an artificial spacer:
                        new HTMLItem( '<div style="height: 100px;"></div>' )
                    ] : [ ]
            }
        } ).filter( tab => tab.items.length > 0 )
        if ( tabs.length == 0 ) {
            Dialog.failure( editor, 'No file systems available',
                'Cannot browse for a file to delete' )
            return
        }
        dialog.setTabs( ...tabs.map( tab => tab.name ) )
        tabs.forEach( tab =>
            tab.items.forEach( item =>
                dialog.addItem( item, tab.name ) ) )
        dialog.show().then( userHitOK => {
            if ( !userHitOK ) return
            // At this point, if all file systems obeyed the rules about
            // calling selectFile() at the appropriate times, then we
            // should have !!currentFile.  Do a sanity check:
            if ( !currentFile ) {
                Dialog.notify( editor, 'error', `No file selected.` )
                return
            }
            // Ask the FileSystem to delete the file, only if the user is sure:
            Dialog.areYouSure( editor,
                `Are you sure you want to delete ${currentFile.filename}?`
            ).then( userSaidYes => {
                if ( !userSaidYes ) return
                const subclass = FileSystem.getSubclass(
                    currentFile.fileSystemName )
                new subclass( editor ).delete( currentFile ).then( () => {
                    Dialog.notify( editor, 'success',
                        `Deleted ${currentFile.filename}.` )
                } ).catch( error => {
                    console.error( error )
                    Dialog.notify( editor, 'error',
                        `Could not delete ${currentFile.filename}.` )
                } )
            } )
        } )
        setTimeout( () => {
            const defaultTab = appSettings.get( 'default open dialog tab' )
            if ( tabs.map( tab => tab.name ).includes( defaultTab ) )
                dialog.showTab( defaultTab )
        } )
    }
    
}

// Internal use only
// Checks whether the user minds discarding their recent work before proceeding.
const ensureWorkIsSaved = editor => new Promise( ( resolve, reject ) => {
    if ( !editor.isDirty() )
        return resolve( true )
    Dialog.areYouSure(
        editor,
        'You will lose any unsaved work.  Continue anyway?'
    ).then( resolve, reject )
} )

/**
 * Install into a TinyMCE editor instance several core features related to
 * files, including all of the following.
 * 
 *  - File menu items:
 *     - New
 *     - Open
 *     - Save
 *     - Save as
 *     - Delete a document
 *     - Embed
 *  - An auto-save timer that stores a copy of the current document every few
 *    seconds when it is dirty (if the app options enable this feature)
 *  - A popup dialog that appears on app launch if and only if there is an
 *    existing auto-saved document, offering to reload that unsaved work (if the
 *    app options enable this feature)
 * 
 * @param {tinymce.Editor} editor the TinyMCE editor instance into which the new
 *   menu item should be installed
 * @function
 */
export const install = editor => {
    if ( FileSystem.getSubclasses().length === 0 )
        throw new Error( 'Cannot install file menu items with no file systems' )
    // First, add all file menu items in the order given above (though the code
    // below does not determine the order they appear on the menu).
    editor.ui.registry.addMenuItem( 'newlurchdocument', {
        text : 'New',
        icon : 'new-document',
        tooltip : 'New document',
        shortcut : 'Alt+N',
        onAction : () => ensureWorkIsSaved( editor ).then( saved => {
            if ( saved ) new LurchDocument( editor ).newDocument()
        } )
    } )
    editor.ui.registry.addMenuItem( 'opendocument', {
        text : 'Open',
        tooltip : 'Open file',
        shortcut : 'Alt+O',
        onAction : () => ensureWorkIsSaved( editor ).then( saved => {
            if ( saved ) FileSystem.openFile( editor )
        } )
    } )
    editor.ui.registry.addMenuItem( 'savedocument', {
        text : 'Save',
        tooltip : 'Save document',
        shortcut: 'Alt+S',
        onAction : () => {
            // Get all the document's information
            const doc = new LurchDocument( editor )
            const fileID = doc.getFileID()
            // Special case: If the app settings enable only the download
            // option, don't bother to show a dialog:
            if ( editor.appOptions?.fileSaveTabs?.length == 1
              && editor.appOptions.fileSaveTabs[0] == 'your computer' ) {
                downloadFile( editor, fileID?.filename )
                return
            }
            // If we have no record of where it was last saved, we have to give
            // up on a silent save and revert to a "save as" operation (which
            // prompts the user).  We also do this if the file was loaded from a
            // file system that does not support writing.
            const subclass = FileSystem.getSubclass( fileID?.fileSystemName )
            if ( !subclass || !FileSystem.subclassImplements( subclass, 'write' ) )
                return FileSystem.saveFileAs( editor )
            // We have enough information to do a silent save, so try that.
            fileID.contents = doc.getDocument()
            const fileSystem = new subclass( editor )
            fileSystem.write( fileID ).then( result => {
                if ( !result ) return
                fileSystem.documentSaved( result )
                Dialog.notify( editor, 'success', 'File saved.' )
            } ).catch( error => {
                Dialog.notify( editor, 'error',
                    `A filesystem error occurred.
                    See browser console for details.` )
                console.error( error )
            } )
        }
    } )
    editor.ui.registry.addMenuItem( 'savedocumentas', {
        text : 'Save as',
        tooltip : 'Save file as',
        shortcut : 'Alt+Shift+S',
        onAction : () => FileSystem.saveFileAs( editor )
    } )
    editor.ui.registry.addMenuItem( 'deletesaved', {
        text : 'Delete a document',
        tooltip : 'Delete a saved document',
        onAction : () => FileSystem.deleteFile( editor )
    } )
    editor.ui.registry.addMenuItem( 'embeddocument', {
        text : 'Embed...',
        tooltip : 'Embed document in a web page',
        onAction : () => {
            // Create an iframe that will give us the code the user needs
            const html = new LurchDocument( editor ).getDocument()
            const iframe = document.createElement( 'iframe' )
            iframe.src = `${appURL()}?data=${encodeURIComponent( btoa( html ) )}`
            iframe.style.width = '800px'
            iframe.style.height = '400px'
            // Create a dialog in which to show the user the results
            const dialog = new Dialog( 'Embedding code', editor )
            dialog.json.size = 'medium'
            // We must put the styles in the element itself, to override
            // TinyMCE's very aggressive CSS within dialogs:
            dialog.addItem( new LongTextInputItem( 'code',
                'Copy the following code into your web page' ) )
            dialog.setInitialData( { code : iframe.outerHTML } )
            dialog.removeButton( 'Cancel' )
            dialog.setDefaultFocus( 'code' )
            dialog.show()
            // After showing the dialog, set its text area to read-only, sized
            // appropriately, scrolled to the top, and with everything selected
            const textarea = dialog.querySelector( 'textarea' )
            textarea.select()
            textarea.setAttribute( 'readonly', 'true' )
            textarea.setAttribute( 'rows', 15 )
            textarea.scrollTo( 0, 0 )
        }
    } )
    // If the auto-save feature is enabled, then wait for the app to finish
    // loading, and then check to see if there is any autosaved data that was
    // never saved by the user.  If so, offer to recover it.  Also, set up the
    // auto-save recurring timer (again iff that feature is enabled).
    if ( editor.appOptions?.autoSaveEnabled ) {
        editor.on( 'init', () => {
            // First, if there's an auto-save, offer to load it:
            if ( autoSaveExists() ) {
                const dialog = new Dialog( 'Unsaved work exists', editor )
                dialog.addItem( new AlertItem(
                    'warn',
                    'There is an unsaved document stored in your browser.  '
                  + 'This could be from another copy of Lurch running in another tab, '
                  + 'or from a previous session in which you did not save your work.'
                ) )
                dialog.setButtons(
                    { text : 'Load it', type : 'submit', buttonType : 'primary' },
                    { text : 'Delete it', type : 'cancel' }
                )
                dialog.show().then( choseToLoad => {
                    if ( choseToLoad )
                        new LurchDocument( editor ).setDocument( getAutoSave() )
                    else
                        new LurchDocument( editor )
                    removeAutoSave()
                } )
            } else {
                new LurchDocument( editor )
            }
            // Next, set up the recurring timer for autosaving:
            setInterval( () => {
                if ( editor.isDirty() )
                    autoSave( new LurchDocument( editor ).getDocument() )
            }, autoSaveFrequencyInSeconds * 1000 )
        } )
    }
}

/**
 * An item that can be added to a {@link Dialog} to allow the user to browse the
 * contents of a {@link FileSystem} and interact with the files therein.
 */
export class FolderContentsItem extends ListItem {

    /**
     * Construct a new folder contents item for browsing the given file system.
     * Optionally you may also specify in which subfolder the browsing begins.
     * 
     * @param {FileSystem} fileSystem - the file system to browse
     * @param {String} [initialPath] - the path to start in (defaults to the
     *   file system root, which works for every file system, even those that
     *   do not have subfolders)
     * @param {String} [name] - the name to give this item, defaults to
     *   a simplified version of the name of the given `fileSystem`
     */
    constructor ( fileSystem, initialPath = '', name ) {
        if ( !name ) name = simplifyName( fileSystem.getName() )
        super( name )
        this.fileSystem = fileSystem
        this.path = initialPath
        // this.minHeight = '400px'
        // this.maxHeight = '600px'
    }

    /**
     * This is initially set in the constructor, but it may change as the user
     * browses the contents of the file system.
     * 
     * @returns {String} the current path being browsed
     */
    getPath () { return this.path }

    /**
     * This sets the path that should be shown in the item and forces a
     * repopulation of the item's contents based on that new path.  The new
     * path must be valid or the behavior of the item hereafter is undefined.
     * 
     * @param {String} newPath - the new path to display
     */
    setPath ( newPath ) {
        this.path = newPath
        if ( this.dialog && this.getMainDiv() ) this.repopulate()
    }

    // internal use only; specializes repopulate() to a file system's needs
    repopulate () {
        this.showText( `Loading files from ${this.fileSystem.getName()}...` )
        this.fileSystem.list( { path : this.path } ).then( files => {
            if ( files.length == 0 ) {
                this.showText( 'No files in this folder.' )
                return
            }
            this.showList(
                files.map( fileObject => {
                    const icon =
                        ( typeof fileObject.icon == 'string' ) ? fileObject.icon :
                        fileObject.isBookmark ? '&#x1F516;' :
                        fileObject.filename ? '&#x1F4C4;' : '&#x1F4C1;'
                    const text = fileObject.displayName
                              || fileObject.filename
                              || fileObject.path
                    return `${icon} ${text}`
                } ), files )
        } ).catch( error => {
            this.showText( 'Error loading file list.  See console for details.' )
            console.error( 'Error loading file list:', error )
        } )
    }

    // internal use only; called when the dialog is shown
    onShow () { this.repopulate() }

}

export default { FileSystem, install }
