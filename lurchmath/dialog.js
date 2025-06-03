
import { UploadItem } from './upload-download.js'
import { appSettings } from './settings-install.js'
import { syntaxTreeHTML, putdownHTML } from './notation.js'

/**
 * This class makes it easier to create and use TinyMCE dialogs that have
 * components that work well with Lurch.  It handles a lot of the boilerplate
 * code that TinyMCE demands and it allows us to work in a more object-oriented
 * way, rather than passing around large pieces of JSON and writing all of a
 * dialog's code in one big function call.
 */
export class Dialog {

    /**
     * Create (but do not yet show) a dialog box associated with a given editor.
     * 
     * @param {string} title - the title to display at the top of the dialog
     * @param {tinymce.Editor} editor - the editor in which to create the dialog
     */
    constructor ( title, editor, cssClass = null ) {
        this.editor = editor
        this.cssClass = cssClass
        this.json = {
            title,
            body : {
                type : 'panel',
                items : [ ]
            },
            buttons : [
                {
                    name : 'OK',
                    text : 'OK',
                    type : 'submit',
                    buttonType : 'primary'
                },
                {
                    name : 'Cancel',
                    text : 'Cancel',
                    type : 'cancel'
                }
            ],
            onChange : ( ...args ) => this.onChange?.( ...args ),
            onAction : ( ...args ) => {
                this.items.forEach( item => item.onAction?.( ...args ) )
            },
            onSubmit : () => {
                this.dialog?.close()
                this.resolver?.( true )
            },
            onCancel : () => {
                this.dialog?.close()
                this.resolver?.( false )
            },
            onTabChange : ( _, details ) => {
                this.currentTabName = details.newTabName
                this.element = Dialog.getTopDialogElement()
                this.runItemShowHandlers()
            }
        }
        this.dialog = null
        this.currentTabName = null
        this.items = [ ]
        this.focusItem = null
        this.hideHeader = false
        this.hideFooter = false
    }

    /**
     * Close this dialog box and resolve any open promise with a "false"
     * argument, as if the user had canceled the dialog.
     */
    close () {
        this.dialog?.close()
        this.resolver?.( false )
    }

    /**
     * TinyMCE dialogs allow you to specify any set of buttons for the dialog's
     * footer.  By default, every dialog this class displays will have an OK
     * button for submitting the dialog and a Cancel button for canceling it.
     * You can replace those buttons by calling this function, passing an array
     * of JSON objects, one for each button you wish to define.
     * 
     * For example, to use just an OK button, you might do the following
     * (although you could accomplish it more easily with
     * {@link Dialog#removeButton removeButton()} instead).
     * 
     * ```js
     * myDialog.setButtons( [
     *     { text : 'OK', type : 'submit', buttonType : 'primary' }
     * ] )
     * ```
     * 
     * @param  {any[]} buttons - the JSON code for the buttons in the dialog's
     *   footer
     * @see {@link Dialog#removeButton removeButton()}
     */
    setButtons ( ...buttons ) {
        this.json.buttons = buttons
    }

    /**
     * Remove one of the buttons in this dialog.  Especially useful if the
     * dialog is for informational purposes only, and doesn't need a "cancel"
     * button.  You could call `myDialog.removeButton( 'Cancel' )`.
     * 
     * @param {string} text - the text shown on the button to be removed
     * @see {@link Dialog#setButtons setButtons()}
     */
    removeButton ( text ) {
        this.json.buttons = this.json.buttons.filter(
            button => button.text != text )
    }

    /**
     * If you want to keep a submit button but not have it named with its
     * default text of "OK" you can use this function to rename that default
     * button.  It will still function as a submit button.
     * 
     * @param {string} text - the new text to use in place of "OK"
     */
    setOK ( text ) {
        const button = this.json.buttons.find( button =>
            button.type == 'submit' && button.buttonType == 'primary' )
        if ( button ) button.text = text
    }

    /**
     * Any TinyMCE dialog can have an object mapping control IDs to values, to
     * fill the dialog's input controls with their initial values.  To specify
     * that mapping, use this function.  Its keys should be the names of any
     * input controls you've added to this dialog using
     * {@link Dialog#addItem addItem()}.
     * 
     * @param {Object} data - the mapping from control names to values
     */
    setInitialData ( data ) {
        this.json.initialData = data
    }

    /**
     * Dialogs are not, by default, split into tabs, but are just one large
     * panel of controls.  You can split them into a set of tabs by calling
     * this function and providing the names of the tabs you want created.
     * 
     * @param  {string[]} titles - the titles of the tabs
     * @see {@link Dialog#currentTabTitle currentTabTitle()}
     * @see {@link Dialog#showTab showTab()}
     * @see {@link Dialog#removeTabs removeTabs()}
     */
    setTabs ( ...titles ) {
        this.json.body = {
            type : 'tabpanel',
            tabs : titles.map( title => {
                return {
                    name : title.replace( /[^a-zA-Z]/g, '' ),
                    title : title,
                    items : [ ]
                }
            } )
        }
    }

    /**
     * This is the reverse operation of {@link Dialog#setTabs setTabs()}.  It
     * removes all tabs, thus collapsing all items onto one pane of the dialog.
     * This is almost never needed, because you typically set up a dialog once,
     * then use it, and don't need to change its structure in this way.
     * 
     * @see {@link Dialog#setTabs setTabs()}
     */
    removeTabs () {
        this.json.body = { type : 'panel', items : [ ] }
    }

    /**
     * If you have split your dialog into tabs using the {@link Dialog#setTabs
     * setTabs()} function, and shown your dialog, this function will report the
     * title shown on the top of the currently visible tab.
     * 
     * @returns {string} the title of the currently shown tab
     * @see {@link Dialog#setTabs setTabs()}
     * @see {@link Dialog#showTab showTab()}
     */
    currentTabTitle () {
        const n = this.json.body.tabs ? this.json.body.tabs.length : 0
        for ( let i = 0 ; i < n ; i++ )
            if ( this.json.body.tabs[i].name == this.currentTabName )
                return this.json.body.tabs[i].title
    }

    /**
     * If you have split your dialog into tabs using the {@link Dialog#setTabs
     * setTabs()} function, and shown your dialog, you can call this function to
     * change which tab is visible, specifying the new one to show by its title.
     * 
     * @param {string} title - the title of the tab you want to switch to
     */
    showTab ( title ) {
        const n = this.json.body.tabs ? this.json.body.tabs.length : 0
        for ( let i = 0 ; i < n ; i++ )
            if ( this.json.body.tabs[i].title == title )
                return this.dialog.showTab( this.json.body.tabs[i].name )
    }

    /**
     * Add an item to the dialog.  There is not a specific class defined for
     * dialog items, because they need provide only a `.json()` method that
     * creates the JSON code for all the body components the item adds to the
     * dialog.  However, items can optionally also provide `.onAction()` and
     * `.onShow()` event handlers, as well as a `.get()` event that can be more
     * flexible than `dialog.getData()['arg']`.
     * 
     * @param {Object} item - the item to add, any object that has a `.json()`
     *   method that creates JSON code appropriate for TinyMCE dialogs
     * @param {string} tabTitle - the tab into which to insert the item, if the
     *   dialog is split into tabs; leave this blank if it is not
     * @see {@link AlertItem}
     * @see {@link HTMLItem}
     * @see {@link TextInputItem}
     * @see {@link ButtonItem}
     * @see {@link UploadItem}
     * @see {@link SelectBoxItem}
     * @see {@link Dialog#removeItem removeItem()}
     */
    addItem ( item, tabTitle = null ) {
        if ( !this.items.includes( item ) ) {
            this.items.push( item )
            item.dialog = this
        }
        item._generated_json = item.json()
        if ( !tabTitle )
            return item._generated_json.forEach(
                item => this.json.body.items.push( item ) )
        const tab = this.json.body.tabs.find( tab => tab.title == tabTitle )
        if ( !tab )
            throw new Error( `Invalid tab: ${tabTitle}` )
        item.tab = tab.name
        item._generated_json.forEach( item => tab.items.push( item ) )
    }

    /**
     * Remove an item from the dialog, and also remove from the dialog's
     * internal JSON data structure any JSON items created from the item that
     * is being removed.
     * 
     * @param {integer} index - the index of the item to remove
     * @see {@link Dialog#addItem addItem()}
     */
    removeItem ( index ) {
        if ( this.json.body.tabs ) {
            const tab = this.json.body.tabs.find(
                tab => tab.name == this.items[index].tab )
            tab.items = tab.items.filter( item =>
                !this.items[index]._generated_json.includes( item ) )
        } else {
            this.json.body.items = this.json.body.items.filter( item =>
                !this.items[index]._generated_json.includes( item ) )
        }
        this.items.splice( index, 1 )
    }

    /**
     * Show the dialog, run any `.onShow()` event handlers in any items in the
     * dialog, and return a promise.  That promise resolves when the user
     * submits or cancels the dialog, and returns true if it was a submit and
     * false if it was a cancel.
     * 
     * @returns {Promise} a promise that resolves when the dialog closes or
     *   encounters an error
     */
    show () {
        if ( this.json.body.tabs )
            this.currentTabName = this.json.body.tabs[0].name
        this.dialog = this.editor.windowManager.open( this.json )
        this.element = Dialog.getTopDialogElement()
        if (this.cssClass)
            this.element.classList.add(this.cssClass)
        if ( this.hideHeader )
            this.querySelector( '.tox-dialog__header' ).style.display = 'none'
        if ( this.hideFooter )
            this.querySelector( '.tox-dialog__footer' ).style.display = 'none'
        return new Promise( ( resolve, reject ) => {
            this.resolver = resolve
            this.rejecter = reject
            this.runItemShowHandlers()
        } ).finally( () => {
            delete this.element
        } )
    }

    /**
     * Specify which control should receive focus when the dialog is first
     * shown.  You can pass `null` to clear this setting.
     * 
     * @param {string} name - the name of the control to focus when the dialog
     *   is shown
     */
    setDefaultFocus ( name ) { this.focusItem = name }

    // For internal use only; see show().
    runItemShowHandlers () {
        if ( this.json.body.tabs )
            this.items.forEach( item => {
                if ( item.tab == this.currentTabName )
                    item.onShow?.( this.dialog )
            } )
        else
            this.items.forEach( item => item.onShow?.( this.dialog ) )
        if ( this.focusItem )
            setTimeout( () => this.dialog.focus( this.focusItem ) )
    }

    /**
     * This is similar to TinyMCE's `dialog.getData()[key]` syntax, but more
     * flexible in that before resorting to that fallback method, it first asks
     * each item in the dialog if it wants to return a value for the given key.
     * This lets those items behave in a more sophisticated and flexible manner
     * if they choose to.  If none of them returns a value different from
     * `undefined`, then we fall back on the standard TinyMCE method shown
     * above.  If the dialog is not shown, this returns undefined.
     * 
     * @param {string} key - the key whose value should be looked up
     * @returns {any} the corresponding value
     */
    get ( key ) {
        if ( !this.dialog ) return undefined
        const data = this.dialog.getData()
        for ( let i = 0 ; i < this.items.length ; i++ ) {
            if ( !this.items[i].get ) continue
            const maybe = this.items[i].get( key, data )
            if ( maybe !== undefined ) return maybe
        }
        return data[key]
    }

    /**
     * Ask TinyMCE to regenerate the dialog's content from its JSON encoding.
     */
    reload () {
        this.dialog?.redial( this.json )
        this.runItemShowHandlers()
    }

    /**
     * Behaves exactly like `document.querySelector()`, except that it is run on
     * just the element representing this dialog box, and thus will return only
     * an element that appears in this dialog.  Or, if this dialog has no
     * element matching the given selector, it returns undefined.
     * 
     * @param {string} selector - the CSS selector to use for the query
     * @returns {HTMLElement} the first element that matches the selector
     * @see {@link Dialog#querySelectorAll querySelectorAll()}
     * @see {@link Dialog.getTopDialogElement getTopDialogElement()}
     */
    querySelector ( selector ) {
        return this.element?.querySelector( selector )
    }

    /**
     * Behaves exactly like `document.querySelectorAll()`, except that it is run
     * on just the element representing this dialog box, and thus will return
     * only elements that appear in this dialog.  Or, if this dialog has no
     * element matching the given selector, it returns an empty node list.
     * 
     * @param {string} selector - the CSS selector to use for the query
     * @returns {NodeList} the list of elements that match the selector
     * @see {@link Dialog#querySelector querySelector()}
     * @see {@link Dialog.getTopDialogElement getTopDialogElement()}
     */
    querySelectorAll ( selector ) {
        return this.element?.querySelectorAll( selector )
    }

    /**
     * TinyMCE may have open zero or more dialog boxes at any given time.  This
     * method returns the HTML element (a DIV) corresponding to the topmost
     * dialog box, or undefined if there are no open dialogs.
     * 
     * Whenever an instance of this class is placed on screen using its
     * {@link Dialog#show show()} method, this method is used to notice which
     * DOM element represents that dialog, and it is stored in the dialog's
     * `element` field for later use by functions like
     * {@link Dialog#querySelector querySelector()} and
     * {@link Dialog#querySelectorAll querySelectorAll()}.
     * 
     * @returns {HTMLDivElement} the DIV element in the DOM representing the
     *   topmost TinyMCE dialog
     */
    static getTopDialogElement () {
        const allDialogElements =
            document.querySelectorAll( 'div.tox-dialog[role="dialog"]' )
        return allDialogElements[allDialogElements.length - 1]
    }

    /**
     * A static method that creates a dialog with just an OK button and a
     * success message in it.  This is a convenience method that makes it
     * possible to show a success message in a modal dialog using just one line
     * of code.
     * 
     * @param {tinymce.Editor} editor - the editor over which to show the dialog
     * @param {string} text - the success message to be displayed
     * @param {string} [title="Success"] - an optional title for the dialog
     * @returns {Promise} a promise that resolves when the dialog closes, the
     *   result of a call to {@link Dialog#show show()}
     * @see {@link Dialog.failure Dialog.failure()}
     * @see {@link Dialog.areYouSure Dialog.areYouSure()}
     */
    static success ( editor, text, title = 'Success' ) {
        const dialog = new Dialog( title, editor )
        dialog.removeButton( 'Cancel' )
        dialog.addItem( new AlertItem( 'success', text ) )
        return dialog.show()
    }

    /**
     * A static method that creates a dialog with just an OK button and a
     * failure message in it.  This is a convenience method that makes it
     * possible to show a failure message in a modal dialog using just one line
     * of code.
     * 
     * @param {tinymce.Editor} editor - the editor over which to show the dialog
     * @param {string} text - the failure message to be displayed
     * @param {string} [title="Failure"] - an optional title for the dialog
     * @returns {Promise} a promise that resolves when the dialog closes, the
     *   result of a call to {@link Dialog#show show()}
     * @see {@link Dialog.success Dialog.success()}
     * @see {@link Dialog.areYouSure Dialog.areYouSure()}
     */
    static failure ( editor, text, title = 'Failure' ) {
        const dialog = new Dialog( title, editor )
        dialog.removeButton( 'Cancel' )
        dialog.addItem( new AlertItem( 'error', text ) )
        return dialog.show()
    }

    /**
     * A static method that creates a dialog entitled "Are you sure?" and
     * prompting the user with a warning containing the given text.  The return
     * value is a promise that resolves with a boolean argument indicating
     * whether the user clicked yes/I'm sure (true) or no/Cancel (false).
     * 
     * @param {tinymce.Editor} editor - the editor over which to show the dialog
     * @param {string} text - the question to be displayed
     * @returns {Promise} a promise that resolves when the dialog closes, the
     *   result of a call to {@link Dialog#show show()}
     * @see {@link Dialog.success Dialog.success()}
     * @see {@link Dialog.failure Dialog.failure()}
     */
    static areYouSure ( editor, text ) {
        const dialog = new Dialog( 'Are you sure?', editor )
        dialog.addItem( new AlertItem( 'warn', text ) )
        dialog.setOK( 'I\'m sure' )
        return dialog.show()
    }

    /**
     * Pop up a notification over the editor.  This can be done with TinyMCE's
     * `NotificationManager` class, but this function just makes it slightly
     * more convenient, because the parameters are named, and one does not need
     * to remember the JSON encoding of them.
     * 
     * @param {tinymce.Editor} editor - the editor in which to show the
     *   notification
     * @param {string} type - the type of notification to show, which TinyMCE
     *   requires must be one of "success", "info", "warning", or "error"
     * @param {string} text - the content of the notification
     * @param {integer} timeout - how long (in ms) until the notification
     *   disappears (optional; defaults to 2000 for success notifications and
     *   no timeout for everything else)
     */
    static notify ( editor, type, text, timeout ) {
        if ( type == 'success' )
            timeout ||= 2000
        if ( ![ 'success', 'info', 'warning', 'error' ].includes( type ) )
            throw new Error( 'Invalid notification type: ' + type )
        editor.notificationManager.open( {
            type : type,
            text : text,
            timeout : timeout
        } )
    }

    /**
     * Show the meaning of any atom in the editor in a dialog, as long as the
     * atom has a meaning as a LogicConcept.  This will use the representations
     * defined in {@link module:Notation.syntaxTreeHTML syntaxTreeHTML()} and
     * {@link module:Notation.putdownHTML putdownHTML()}, each in a separate tab
     * of the dialog.
     * 
     * @param {Atom} atom - the Atom whose meaning should be shown
     */
    static meaningOfAtom ( atom ) {
        const result = new Dialog( 'Meaning', atom.editor )
        result.removeButton( 'Cancel' )
        result.setTabs( 'Hierarchy', 'Code' )
        const LCs = atom.toLCs()
        result.addItem( new HTMLItem( syntaxTreeHTML( LCs ) ), 'Hierarchy' )
        result.addItem( new HTMLItem( putdownHTML( LCs ) ), 'Code' )
        result.show()
        setTimeout( () =>
            // result.showTab( appSettings.get( 'preferred meaning style' ) ) )
            result.showTab( 'Code' ) )
    }

}

/**
 * An item that can be used in a {@link Dialog} to represent an alert (that is,
 * a piece of text that is colored and given an icon to make it more obvious).
 * This corresponds to the "alertbanner" type of body component in a TinyMCE
 * dialog.
 */
export class AlertItem {

    /**
     * Construct an alert item.  An appropriate icon is chosen to correspond to
     * the type of alert constructed.
     * 
     * @param {string} type - the type of alert, one of "info", "warn", "error",
     *   or "success"
     * @param {string} text - the text to show in the alert
     */
    constructor ( type, text ) {
        this.type = type
        this.text = text        
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ {
            type : 'alertbanner',
            text : this.text,
            level : this.type,
            icon : this.type == 'success' ? 'selected' :
                   this.type == 'warn' ? 'warning' :
                   this.type == 'info' ? 'info' : 'notice'
        } ]
    }

}

/**
 * An item that can be used in a {@link Dialog} to represent any HTML content.
 * This corresponds to the "htmlpanel" type of body component in a TinyMCE
 * dialog.
 */
export class HTMLItem {

    /**
     * Construct an HTML item.
     * 
     * @param {string} html - the HTML code of the content to show
     */
    constructor ( html ) {
        this.html = html
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ { type : 'htmlpanel', html : this.html } ]
    }

}

/**
 * An item that can be used in a {@link Dialog} to represent a blank text box
 * into which the user can type content.  This corresponds to the "input" type
 * of body component in a TinyMCE dialog.
 */
export class TextInputItem {

    /**
     * Construct a new text input control.
     * 
     * @param {string} name - the key to use to identify this input control's
     *   content in the dialog's key-value mapping for all input controls
     * @param {string} label - the text to place next to the input control to
     *   explain it to the user
     * @param {string} placeholder - optional, the text to include inside the
     *   control when it is blank, as an example
     */
    constructor ( name, label, placeholder ) {
        this.name = name
        this.label = label
        this.placeholder = placeholder
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        const result = {
            type : 'input',
            name : this.name,
            label : this.label
        }
        if ( this.placeholder )
            result.placeholder = this.placeholder
        return [ result ]
    }

}

/**
 * Functions just like {@link TextInputItem}, except it is an HTML textarea,
 * and thus can contain multiple lines of input text.
 */
export class LongTextInputItem {

    /**
     * Construct a new long text input control.
     * 
     * @param {string} name - the key to use to identify this input control's
     *   content in the dialog's key-value mapping for all input controls
     * @param {string} label - the text to place above the input control to
     *   explain it to the user
     * @param {string} placeholder - optional, the text to include inside the
     *   control when it is blank, as an example
     */
    constructor ( name, label, placeholder ) {
        this.name = name
        this.label = label
        this.placeholder = placeholder
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        const result = {
            type : 'textarea',
            name : this.name,
            label : this.label
        }
        if ( this.placeholder )
            result.placeholder = this.placeholder
        return [ result ]
    }

}

/**
 * An item that can be used in a {@link Dialog} and shows up as a clickable
 * button.  This corresponds to the "button" type of body component in a TinyMCE
 * dialog.
 */
export class ButtonItem {

    /**
     * Construct a button.
     * 
     * @param {string} text - the text shown on the button
     * @param {function} action - the function to call when the button is
     *   clicked; it will be passed the {@link Dialog} instance
     * @param [string] name - the name of the button, internally (will default
     *   to the text parameter, but if you have multiple buttons with the same
     *   text, TinyMCE requires they all have different names internally)
     */
    constructor ( text, action, name ) {
        this.text = text
        this.action = action
        this.name = ( name || text ).replace( /[^_a-zA-Z0-9]/g, '_' )
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ {
            type : 'button',
            name : this.name,
            text : this.text,
            maximized : true
        } ]
    }

    // internal use only; calls this button's action if it is pressed
    onAction ( dialog, details ) {
        if ( details.name == this.name ) this.action( dialog )
    }

    /**
     * Find the element in the DOM representing this button.  This works only if
     * the dialog containing the button has been shown on screen, not before.
     * 
     * @return {HTMLElement} the DOM element with tag "BUTTON"
     */
    getElement () {
        return this.dialog.querySelector( `button[title="${this.text}"]` )
    }

}

/**
 * An item that can be used in a {@link Dialog} and shows up as a dropdown list
 * of options.  This corresponds to the "selectbox" type of body component in
 * a TinyMCE dialog.
 */
export class SelectBoxItem {
    
    /**
     * Construct a select box.
     * 
     * @param {string} name - the name of the control in the dialog, used for
     *   querying its value when the dialog closes, or providing an initial
     *   value when the dialog opens
     * @param {string} label - the label to show next to the select box in the
     *   user interface
     * @param {string[]} items - the array of items to be shown in the select
     *   box in the user interface
     */
    constructor ( name, label, items ) {
        this.name = name
        this.label = label
        this.items = items
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ {
            type : 'selectbox',
            name : this.name,
            label : this.label,
            items : this.items.map( name => {
                return { value : name, text : name }
            } )
        } ]
    }

}

/**
 * An item that can be used in a {@link Dialog} and shows up as a checkbox.
 * This corresponds to the "checkbox" type of body component in a TinyMCE
 * dialog.
 */
export class CheckBoxItem {

    /**
     * Construct a checkbox.
     * 
     * @param {string} name - the name of the control in the dialog, used for
     *   querying its value when the dialog closes, or providing an initial
     *   value when the dialog opens
     * @param {string} label - the label to show next to the checkbox in the
     *   user interface
     */
    constructor ( name, label ) {
        this.name = name
        this.label = label
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ {
            type : 'checkbox',
            name : this.name,
            label : this.label
        } ]
    }

}

/**
 * An item that can be used in a {@link Dialog} and takes up the full width of
 * the dialog, but can be populated with an array of inner items, that will be
 * arranged in that row.  This corresponds to the "bar" type of body component
 * in a TinyMCE dialog.  By default, all columns in the row take up the same
 * amount of space, but you can make one larger if you modify the style of the
 * element after it has been placed into the DOM, setting one of the
 * sub-elements to have `width: 100%`.
 */
export class DialogRow {

    /**
     * Construct a dialog row.
     * 
     * @param {...Object} items - an array of dialog items (e.g.,
     *   {@link AlertItem} or {@link ButtonItem}) to place into this row
     */
    constructor ( ...items ) {
        this.items = items
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ {
            type : 'bar',
            items : this.items.map( item => item.json() ).flat()
        } ]
    }

    // internal use only; pass any notifications on to my children
    onAction ( ...args ) {
        this.items.forEach( item => item.onAction?.( ...args ) )
    }
    onShow ( ...args ) {
        this.items.forEach( item => {
            item.dialog = this.dialog
            item.onShow?.( ...args )
        } )
    }

}

/**
 * An item that can be used in a {@link Dialog} to place a label above one or
 * more other dialog items.  This corresponds to the "label" type of body
 * component in a TinyMCE dialog.
 */
export class LabeledGroup {

    /**
     * Construct a labeled group.
     * 
     * @param {string} caption - the caption to show above the group
     * @param {...Object} items - an array of dialog items (e.g.,
     *   {@link AlertItem} or {@link ButtonItem}) to place into this group
     */
    constructor ( caption, ...items ) {
        this.caption = caption
        this.items = items
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ {
            type : 'label',
            label : this.caption,
            items : this.items.map( item => item.json() ).flat()
        } ]
    }

    // internal use only; pass any notifications on to my children
    onAction ( ...args ) {
        this.items.forEach( item => item.onAction?.( ...args ) )
    }
    onShow ( ...args ) {
        this.items.forEach( item => {
            item.dialog = this.dialog
            item.onShow?.( ...args )
        } )
    }

}

/**
 * An item that can be used in a {@link Dialog} and shows up as a list of
 * one-line items with HTML contents (each one a DIV with a light border).
 * Items can be selected, clicked, or double-clicked, and handlers can be added
 * for each such situation.  The value of the item is the selected item's
 * value, or undefined if no item is selected.
 * 
 * It supports several event handlers that users can implement by defining
 * functions with the following names on the instance they create:
 * 
 *  - `onClick(value)` - called when the item is clicked, with the item's value
 *    as the one parameter
 *  - `onDoubleClick(value)` - called when the item is double-clicked, with the
 *    item's value as the one parameter
 *  - `onSelectionChanged()` - called when the selection changes, no parameters
 *    passed
 *  - `onTextShown()` - called after repopulating the list with plain text,
 *    because a client called {@link ListItem#showText showText()}
 *  - `onListShown()` - called after repopulating the list with items, because
 *    a client called {@link ListItem#showList showList()}
 */
export class ListItem {

    static mainDivId = 'dialog-list-item'
    static itemDivClass = 'dialog-list-item-one-item'

    /**
     * Construct a new list item.  Later you can either fill it with items, by
     * calling {@link ListItem#showList showList()}, or fill it with plain text
     * (e.g., as a temporary message like "Loading..." or a message like "No
     * items to show") by calling {@link ListItem#showText showText()}.
     */
    constructor ( name ) {
        this.name = name
        this.names = [ ]
        this.values = [ ]
        this.itemsAreSelectable = false
        this.selectedItem = null
        this.minHeight = '100px'
        this.maxHeight = '200px'
    }

    /**
     * Switch the mode of this item to permit selecting items (`on` true) or not
     * permit selecting items (`on` false).  Turning this off removes the
     * current selection, if there is one.
     * 
     * @param {boolean} on - whether items are selectable
     */
    setSelectable ( on = true ) {
        this.itemsAreSelectable = on
        if ( !on ) this.selectItem( null, null )
    }

    // internal use only; selects an item
    selectItem ( itemDiv, itemValue ) {
        this.dialog.querySelectorAll( `.${ListItem.itemDivClass}` ).forEach(
            div => div.style.backgroundColor = '' )
        if ( itemDiv ) itemDiv.style.backgroundColor = 'lightblue'
        this.selectedItem = itemValue
        this.onSelectionChanged?.()
    }

    // internal use only; creates the JSON to represent this object to TinyMCE
    json () {
        return [ {
            type : 'htmlpanel',
            html : `<div id="${ListItem.mainDivId}-${this.name}"
                style="border: solid 1px #006CE7;
                padding: 0.5em;
                border-radius: 6px;
                min-height: ${this.minHeight};
                max-height: ${this.maxHeight};
                overflow-y: scroll;"></div>`
        } ]
    }

    // internal use only
    getMainDiv () {
        return this.dialog.querySelector( `#${ListItem.mainDivId}-${this.name}` )
    }

    // internal use only; change contents of this DIV to text
    showText ( text ) {
        const element = this.getMainDiv()
        if ( !element ) return
        this.selectedItem = null
        element.innerHTML = text
        this.onTextShown?.()
        if ( this.itemsAreSelectable ) this.selectItem( null, null )
    }

    // internal use only; change contents of this DIV to a list of items
    showList ( names, values ) {
        if ( values.length == 0 )
            values = names
        if ( names.length != values.length )
            throw new Error( 'Names and values must be the same length' )
        this.names = names
        this.values = values
        this.selectedItem = null
        const panel = this.getMainDiv()
        if ( !panel ) return
        panel.innerHTML = ''
        names.forEach( ( name, index ) => {
            const value = values[index]
            // put a new item into the panel and give it content
            const itemDiv = panel.ownerDocument.createElement( 'div' )
            itemDiv.classList.add( ListItem.itemDivClass )
            panel.appendChild( itemDiv )
            itemDiv.innerHTML = name
            // style it
            itemDiv.style.padding = '5px 0'
            itemDiv.style.cursor = 'default'
            itemDiv.width = '100%'
            // Add event handlers to the item
            itemDiv.addEventListener( 'click', () => setTimeout( () => {
                // don't let the second half of a double-click count also count
                // as an individual click
                if ( this.justDoubleClicked ) {
                    this.justDoubleClicked = false
                    return
                }
                // If the dialog has closed since the click, do nothing
                if ( !this.dialog.element )
                    return
                // If items are selectable, update the selection
                if ( this.itemsAreSelectable ) {
                    if ( this.selectedItem == value )
                        this.selectItem( null, null )
                    else
                        this.selectItem( itemDiv, value )
                }
                // Let users install an onClick() handler
                this.onClick?.( value )
            } ) )
            itemDiv.addEventListener( 'dblclick', () => {
                // Let users install an onDoubleClick() handler
                this.onDoubleClick?.( value )
                // Prevent the double-click from also triggering a click
                this.justDoubleClicked = true
            } )
        } )
        this.onListShown?.()
        if ( this.itemsAreSelectable ) this.selectItem( null, null )
    }

    // internal use only; returns a file object if requested by the dialog's
    // get() function
    get ( key, _ ) {
        if ( key == this.name ) return this.selectedItem
    }

}
