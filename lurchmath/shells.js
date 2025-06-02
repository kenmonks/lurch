
/**
 * In a Lurch document, certain sections will be marked as "shells."  These will
 * always be DIVs and will typically contain other document content.  While
 * {@link module:Atoms atoms (as defined in the Atoms module)} are indivisible
 * sections of special, meaningful document content, shells are also special,
 * meaningful document content, but are not indivisible.  They are intended to
 * contain other document content.
 * 
 *  1. The user can edit what sits inside a shell, but the application
 *     determines how the shell is drawn as a visual wrapper around that
 *     content.
 *  2. The user can edit the shells's properties by clicking on it (the visual
 *     boundary around the content, not the content itself) and interacting with
 *     whatever dialog the application pops up in response.
 *  3. There can be many different types of shells.  For example, a theorem
 *     statement may be one type, and a proof or subproof may be another.
 *  4. Like atoms, each shell will typically have some meaning that will be
 *     important when the document is processed in a mathematical way.
 * 
 * Shells are implemented as a subclass of Atoms, overriding some functions in
 * the {@link Atom Atom class} that must be done in a different way for shells,
 * and adding new functions that apply only to Shells.
 * 
 * This module contains tools for working with shells, including the
 * {@link module:Shells.install function} we use to install their
 * mouse event handlers and, most importantly, the
 * {@link module:Shells.Shell class} we use to create an API for working with
 * individual shells.
 *
 * @module Shells
 * @see {@link module:Atoms the Atoms module}
 */

import { getHeader } from './header-editor.js'
import { onlyBefore, isOnScreen, copyHTMLToClipboard } from './utilities.js'
import { Atom, className as atomClassName } from './atoms.js'
import { addAutocompleteFunction } from './auto-completer.js'
import { Dialog, TextInputItem, SelectBoxItem } from './dialog.js'
import { Environment } from './lde-cdn.js'
import { lookup, store } from './document-settings.js'
import { appSettings } from './settings-install.js'
import { Dependency } from './dependencies.js'
import { autoOpenLink } from './load-from-url.js'

/**
 * For information about the concept of shells in Lurch in general, see the
 * documentation of {@link module:Shells the Shells module}.  Because Shells are
 * a type of {@link Atom}, much of their API comes from the {@link Atom} class.
 * This subclass changes a few of the base implementations and adds a few new
 * function specific to shells.
 * 
 * As with atoms, one constructs an instance of this class by passing the
 * corresponding HTML element from the editor, along with the editor itself, and
 * the resulting object provides an extensive API (documented below and in the
 * {@link Atom Atom class}) for interfacing with the shell in a variety of ways
 * useful for the Lurch app.
 */
export class Shell extends Atom {

    static subclassName = Atom.registerSubclass( 'shell', Shell )

    // By default, each shell type is not shown on the autocomplete menu for
    // beginners.  Certain subclasses will override this with "true" instead.
    static beginnerFriendly = false
    // Most are useful for advanced users but are redundant so we may hide the
    // redundant ones by overriding this with "false" instead.
    static advancedFriendly = true
    
    /**
     * Assign this shell a specific subclass, by name.  You must assign a
     * subclass by name, using one of the names registered using
     * {@link module:Atoms.Atom.registerSubclass registerSubclass()}, and that
     * subclass must be a subclass of {@link module:Shells.Shell Shell}.  This
     * routine stores the subclass in the shell, updates any other related
     * information (e.g., how the shell is displayed), and returns a new
     * instance of the {@link module:Atoms.Atom Atom} class, specifically of the
     * named subclass, for this shell.
     * 
     * @param {string} subclassName - the name of the subclass to assign
     * @returns {Shell} an instance of the given subclass, representing this
     *   same shell
     */
    setSubclass ( subclassName ) {
        const subclass = Atom.subclasses.get( subclassName )
        if ( subclass != Shell && !( subclass.prototype instanceof Shell ) )
            throw new Error( `${subclassName} is not a subclass of Shell` )
        this.setMetadata( 'type', subclassName )
        const result = Atom.from( this.element, this.editor )
        this.element.dataset['shell_title'] = result.getTitle()
        return result
    }

    /**
     * Every shell may provide a title to decorate the top of its DIV, on the
     * left-hand side.  This is optional.  The default is the name of the class,
     * in title case, followed by a colon.  Subclasses may override this, e.g.,
     * by returning the empty string to remove the title entirely.
     * 
     * @returns {string} the title to use at the top of the shell, when displayed
     *   in the document
     */
    getTitle () {
        const name = this.getMetadata( 'type' )
        return name[0].toUpperCase() + name.substring( 1 ) + ':'
    }

    /**
     * The default way to convert a Shell to LCs is to represent it as a single
     * Environment.  Subclasses may override this implementation as needed.
     * This functionality is used by {@link Message.document the conversion
     * function} of the whole document into LCs for validation.
     * 
     * Note that this does not add any of its child atoms to itself as LCs.
     * The conversion is done by the function referenced above, which takes care
     * to give each LC a unique ID, post-process the conversion to respect
     * various conventions, etc.
     * 
     * @returns {LogicConcept[]} an array containing exactly one Environment
     *   instance, representing this shell, with no children
     * @see {@link Shell#finalize finalize()}
     */
    toLCs () { 
      let ans = new Environment()
      const results = this.getValidationResults()
      // for now, we just add the first result
      if (results.length>0) ans.setAttribute('ExpectedResult',results[0])
      return [ ans ]
    }

    /**
     * After converting a shell to LCs using {@link Shell#toLCs toLCs()}, its
     * children (if any) will be created and added to it.  Specifically, we
     * expect that {@link Shell#toLCs toLCs()} will return a single environment,
     * to which children will be added.  Then this function will be called on
     * that same environment object, allowing the shell to tweak attributes of
     * its children to respect the meaning of the shell itself.  For example, if
     * the shell implies that any child environments should be givens, it can
     * make them so.
     * 
     * This default implementation does nothing.  Subclasses may override it.
     * 
     * @param {LogicConcept} shellLC - the Environment LC represneting this shell
     * @see {@link Shell#toLCs toLCs()}
     */
    finalize ( shellLC ) { }

    /**
     * Find the names of all subclasses that have been registered as subclasses
     * of this class, using the {@link module:Atoms.Atom.registerSubclass
     * registerSubclass()} method of the {@link Atom} class.  This is useful for
     * populating the dialog for changing a shell's type.
     * 
     * @returns {string[]} the names of all subclasses of Shell
     */
    static subclassNames () {
        return Array.from(
            Atom.subclasses.keys()
        ).filter( name =>
            Atom.subclasses.get( name ).prototype instanceof Shell
        )
    }

    /**
     * Show a dialog to allow the user to edit the type of the shell.  The
     * dialog will show a drop-down list of all subclasses of Shell, from which
     * the user can choose this shell's type.  If there are no registered
     * subclasses of Shell, this function returns a promise that resolves
     * immediately to false, and does nothing else.
     * 
     * @returns {Promise} a promise that resolves to true if the editing dialog
     *   is shown and the user confirms their edits, or resolves to false if the
     *   editing dialog cannot be shown or the user cancels
     */
    editShellType () {
        const shellSubclassNames = Shell.subclassNames().filter( name => { 
            return (Atom.subclasses.get( name )?.advancedFriendly) } )
        if ( shellSubclassNames.length == 0 ) return false
        const dialog = new Dialog( 'Change environment type', this.editor )
        dialog.addItem( new SelectBoxItem(
            'shellSubclass',
            'Type of environment',
            shellSubclassNames ) )
        dialog.setDefaultFocus( 'shellSubclass' )
        dialog.setInitialData( {
            shellSubclass : this.getMetadata( 'type' )
        } )
        return dialog.show().then( userHitOK => {
            if ( !userHitOK ) return false
            this.setSubclass( dialog.get( 'shellSubclass' ) )
            return true
        } )
    }

    /**
     * Show a dialog to allow the user to edit the marginal label of the shell.
     * The labels are currently limited to 11 characters. Any new lable is saved
     * in the individual environment and preserved when the document is saved,
     * but does not apply to all environments of the given type.
     *
     * @returns {Promise} a promise that resolves to true if the editing dialog
     *   is shown and the user confirms their edits, or resolves to false if the
     *   editing dialog cannot be shown or the user cancels
     */
    editMarginalLabel () {
        const shellSubclassNames = Shell.subclassNames().filter( name => { 
            return (Atom.subclasses.get( name )?.advancedFriendly) } )
        if ( shellSubclassNames.length == 0 ) return false
        const dialog = new Dialog( 'Edit marginal label', this.editor )
        dialog.addItem( new TextInputItem('label','','') )
        dialog.setDefaultFocus( 'label' )
        dialog.setInitialData( {
            label : this.element.dataset.shell_title
        } )
        return dialog.show().then( userHitOK => {
            if ( !userHitOK ) return false
            this.element.dataset.shell_title = dialog.get('label')
            return true
        } )
    }

    /**
     * The default behavior for clicking a shell is that nothing should happen,
     * so this function typically just calls {@link module:Atoms.Atom.edit the
     * superclass method}, which does nothing.  However, when inserting a shell
     * for the first time, we do want the `edit()` action to do something, so
     * you can set `shellInstance.inCreationPhase = true` before calling this
     * method (directly or indirectly through
     * {@link module:Atoms.Atom.editThenInsert editThenInsert()}), and in that
     * case, it will call {@link module:Shells.Shell#editShellType
     * editShellType()}.
     * 
     * @returns {Promise} the result of calling
     *   {@link module:Shells.Shell#editShellType editShellType()} if in the
     *   creation phase, and a promise that resolves immediately to false
     *   otherwise
     */
    edit () {
        return this.inCreationPhase ? this.editShellType() : super.edit()
    }

    /**
     * Items to be included on the TinyMCE context menu if a shell is
     * right-clicked.  For information on the format of the returned data,
     * see the TinyMCE v6 manual on custom context menus.
     * 
     * In this case, it adds one item, for editing the type of the shell.  It
     * opens a dialog that provides a drop-down list for choosing which subclass
     * of shell this one is, so that when we use shells to implement common
     * mathematical concepts (e.g., Theorem, Proof, Rule, etc.) the user will
     * automatically have a way to convert among those types of document
     * structure.
     * 
     * Note: If the application has no proper subclasses of {@link Shell}
     * installed, this function will not add the item to the context menu.
     * 
     * @param {Atom} forThis - the atom that received the right-click action that
     *   led to the creation of the context menu
     * @returns {Object[]} data representing the contents of a TinyMCE context
     *   menu
     */
    contextMenu ( forThis ) {
        const result = super.contextMenu( forThis )
        const shellSubclassNames = Shell.subclassNames().filter(
            name => name != 'preview' )
        if ( forThis == this ) {
            // allow changing the environment iff it's editable and some types
            // have been registered for us to let the user browse
            if ( this.isEditable() && shellSubclassNames.length > 0 )
                result.unshift( {
                    text : 'Change environment type',
                    onAction : () => this.editShellType( shellSubclassNames )
                } )
            // allow changing the environment marginal label
            if ( this.isEditable() 
                 && lookup( this.editor, 'shell style' ) == 'boxed')
                result.unshift( {
                    text : 'Edit marginal label',
                    onAction : () => this.editMarginalLabel( )
                } )
            // allow toggling indentation iff we're in a style that can see it
            if ( lookup( this.editor, 'shell style' ) == 'minimal' )
                result.unshift( {
                    text : 'Toggle Subproof Indentations',
                    onAction : () => this.element.classList.toggle( 'unindented' )
                } )
            // allow deleting environments
            result.unshift( {
                text : 'Remove this environment',
                onAction : () => {
                    this.wasDeleted()
                    this.element.replaceWith( ...this.element.childNodes )
                  }
            } )
            // // Later when toLCs() for shells gets an upgrade:
            // result.unshift( {
            //     text : 'View meaning',
            //     onAction : () => Dialog.meaningOfAtom( this )
            // } )
            // // To be clear, the problem is that toLCs() for shells just
            // // returns an empty environment right now, and we need something
            // // recursive, like the documentLC() function in
            // // validation-messages.js to make the above action meaningful.
        }
        return result
    }

    /**
     * Override the default implementation, which uses a child element, to
     * instead place the validation result in an attribute of the element,
     * where it can be found and respected by CSS.
     *
     * @see {@link module:Atoms.Atom#setValidationResult
     * setValidationResult() for Atoms}
     */
    setValidationResult ( result, reason ) {
        if ( !result ) {
            delete this.element.dataset['validation_result']
            this.setHoverText( null )
        } else {
            this.element.dataset['validation_result'] = result
            this.setHoverText( reason )
        }
    }

    /**
     * Creating shells is not the same as creating atoms:
     * 
     *  - the user cannot choose to use a SPAN element to represent a shell
     *  - the contents of a shell remain `contenteditable:true`
     *  - the shell must have some default content, which can be replaced later
     *
     * @param {tinymce.Editor} editor - the editor in which to create the shell
     * @param {string} subclassName - the name of the subclass of {@link Shell}
     *   to be represented by this element (defaults to `'shell'`)
     * @see {@link module:Atoms.Atom.createElement createElement() for Atoms}
     */
    static createElement ( editor, subclassName='shell' ) {
        const result = new Shell( Atom.createElement( editor, 'div' ) )
        result.element.removeAttribute( 'contenteditable' )
        result.setSubclass( subclassName )
        result.element.innerHTML = `<p><br data-mce-bogus="1"></p>`
        return result.element
    }

    /**
     * Accessibility of HTML nodes sitting inside a hierarchy of Shells is
     * analogous to accessibility of `MathConcept` or `LogicConcept` instances
     * inside their own hierarchy.  The shells create the hierarchy/tree and the
     * HTML nodes within them act as leaves of the tree.
     * 
     * Of course, one HTML node is not accessible to another if it comes later
     * in the document, so this function assumes that you are asking about
     * accessibility of an earlier node to a later node.  It does not check to
     * be sure that this is true; the client must ensure that.
     * 
     * It returns true if the `earlier` node is accessible to the `later` node.
     * 
     * @param {Node} earlier - the earlier of the two DOM nodes to compare
     * @param {Node} later - the later of the two DOM nodes to compare
     * @param {tinymce.Editor} - the editor in which these nodes sit
     * @returns {boolean} whether the `earlier` node is accessible to the
     *   `later` node
     */
    static isAccessibleTo ( earlier, later, editor ) {
        let walk1 = earlier
        let walk2 = later
        while ( walk1 ) {
            if ( !walk2 ) return false
            walk1 = Atom.findAbove( walk1.parentNode, editor )
            walk2 = Atom.findAbove( walk2.parentNode, editor )
            if ( walk1 && ( walk1 !== walk2 ) ) return false
        }
        return true
    }

    /**
     * For the meaning of accessibility, see
     * {@link module:Shells.Shell.isAccessibleTo isAccessibleTo()}.
     * This function returns the array of all HTML nodes that are accessible to
     * the given `target` in the given `editor`, as long as they have the given
     * `className` and satisfy the given `predicate`.  HTML nodes that appear in
     * dependencies and in the document header are also included.  All nodes are
     * returned in the order that they appear in the document (counting the
     * header as earliest).
     * 
     * The predicate can be omitted and defaults to an accessibility check
     * relative to the given `target` node.  The class name can be omitted and
     * defaults to the class name used to mark nodes as being part of the
     * {@link module:Atoms.Atom Atoms module}.
     * 
     * @param {tinymce.Editor} editor - the editor in which to search
     * @param {Node} target - the node to use for filtering the result list
     * @param {Function?} predicate - a function that takes a node and returns
     *   true if that node should be included in the results
     * @param {string?} className - the class name of the nodes to include
     * @returns {Node[]} the ordered array of accessible nodes satisfying all of
     *   the given criteria
     */
    static accessibles (
        editor, target, predicate = null, className = atomClassName
    ) {
        if ( !predicate )
            predicate = node => Shell.isAccessibleTo( node, target, editor )
        return [
            // dependencies in header:
            ...( getHeader( editor )?.querySelectorAll( `.${className}` ) || [ ] ),
            // nodes in document preceding target:
            ...onlyBefore( editor.dom.doc.querySelectorAll( `.${className}` ), target )
        ].filter( isOnScreen ).filter( predicate )
    }

    /**
     * When embedding a copy of the Lurch app in a larger page, users will want
     * to write simple HTML describing a Lurch document, then have a script
     * create a copy of the Lurch app and put that document into it.  We allow
     * for representing shells using `<classname>...</classname>` elements,
     * where the tag name comes from the name of the Shell subclass.  The
     * content of the tag will be the simplified HTML representation of the
     * contents of the shell.
     * 
     * @returns {string} the representation of the atom as a `lurch` element
     */
    toEmbed () {
        return `<${this.subclassName}>`
            + Array.from( this.element.childNodes ).map(
                child => Atom.simplifiedHTML( child ) ).join( '' )
            + `</${this.subclassName}>`
    }

    /**
     * When exporting a Lurch document (or a portion thereof) to LaTeX format,
     * this function determines how a Shell is represented.  This is a simple
     * default that is likely to be overridden by subclasses.  It just places
     * the contents of the shell in a LaTeX block quote, unless the class (or
     * subclass) has defined a static member `latexEnvironment`, in which case
     * it wraps it in the `\\begin{X}` and `\\end{X}` for that environment
     * (e.g., `"theorem"`).
     * 
     * @param {string} innerLaTeX - the LaTeX representation of the contents of
     *   the shell, already computed recursively
     * @returns {string} the LaTeX representation of the shell, with the given
     *   contents included in it
     */
    toLatex ( innerLaTeX ) {
        const envName = this.constructor.latexEnvironment || 'quote'
        return `\\begin{${envName}}\n${innerLaTeX}\n\\end{${envName}}`
    }

}

/**
 * This function should be called in the editor's setup routine.  It installs
 * several things into the editor:
 * 
 *  * a menu item for inserting "environments" (untyped shells)
 *  * an event handler for deleting empty environments (which can occur if the
 *    user creates an environment, leaves it empty, and then positions their
 *    cursor after it and hits backspace---a corner case, but still one we must
 *    handle correctly)
 *  * two menu items for inserting blank paragraphs before and after the current
 *    block, so that the user does not get stuck unable to move their cursor
 *    after the last shell in the document, or before the first, or between two
 *    adjacent ones
 *  * an autocompleter shortcut that replaces `\{` with an "environment" (an
 *    untyped shell)
 * 
 * @param {tinymce.Editor} editor - the editor in which to install the features
 *   described above
 * @function
 */
export const install = editor => {
    // The first menu item described above
    // (We do not call it "insert environment" because it will go on the insert
    // menu, so it just needs the word "Environment")
    editor.ui.registry.addMenuItem( 'environment', {
        icon : 'unselected',
        text : 'Environment',
        tooltip : 'Insert block representing an environment',
        shortcut : 'Meta+Shift+E',
        onAction : () => {
            const element = Shell.createElement( editor )
            const selection = editor.selection.getContent()
            if ( selection.trim() != '' ) {
                element.innerHTML = selection
                if ( !element.childNodes[0].tagName )
                    element.innerHTML = '<p>' + selection + '</p>'
            }
            const shell = Atom.from( element, editor )
            shell.inCreationPhase = true
            shell.editThenInsert()
            delete shell.inCreationPhase
        }
    } )
    // The event handler for the corner case described above
    editor.on( 'NodeChange keyup', () => {
        Array.from(
            editor.dom.doc.querySelectorAll( `.${Atom.className}` )
        ).forEach( element => {
            if ( element.dataset.has( 'shell_title' )
              && !element.querySelector( 'p' ) )
                element.remove()
        } )
    } )
    // The two actions for inserting blank paragraphs, described above
    // (Same comments apply as given above, re: Insert menu and naming)
    editor.ui.registry.addMenuItem( 'paragraphabove', {
        text : 'Insert paragraph above',
        tooltip : 'Insert an empty paragraph above the current block',
        shortcut : 'Meta+Shift+Enter',
        onAction : () => {
            for ( let walk = editor.selection.getStart()
                ; walk
                ; walk = walk.parentNode )
            {
                if ( walk.parentNode && walk.tagName == 'DIV' ) {
                    const newPara = editor.dom.doc.createElement( 'p' )
                    newPara.innerHTML = '<br data-mce-bogus="1">'
                    walk.parentNode.insertBefore( newPara, walk )
                    editor.selection.setCursorLocation( newPara, 0 )
                    editor.focus()
                    return
                }
            }
        }
    } )
    editor.ui.registry.addMenuItem( 'paragraphbelow', {
        text : 'Insert paragraph below',
        tooltip : 'Insert an empty paragraph below the current block',
        shortcut : 'Meta+Enter',
        onAction : () => {
            for ( let walk = editor.selection.getStart()
                ; walk
                ; walk = walk.parentNode )
            {
                if ( walk.parentNode && walk.tagName == 'DIV' ) {
                    const newPara = editor.dom.doc.createElement( 'p' )
                    newPara.innerHTML = '<br data-mce-bogus="1">'
                    walk.parentNode.insertBefore( newPara, walk.nextSibling )
                    editor.selection.setCursorLocation( newPara, 0 )
                    editor.focus()
                    return
                }
            }
        }
    } )
    // The user can insert an environment using an autocompleter:
    addAutocompleteFunction( editor => {
        const shellSubclassNames = Array.from( Atom.subclasses.keys() ).filter(
            name => Atom.subclasses.get( name ).prototype instanceof Shell )
        shellSubclassNames.forEach( subclassName => {
            const subclass = Atom.subclasses.get( subclassName )
            if ( !subclass.hasOwnProperty( 'defaultHTML' ) ) {
                const element = Shell.createElement( editor, subclassName )
                element.innerHTML = '<p></p>'
                subclass.defaultHTML = element.outerHTML
            }
        } )
        const inBeginnerMode =
            appSettings.get( 'expression editor type' ) == 'Beginner'
        const inAdvancedMode =
            appSettings.get( 'expression editor type' ) == 'Advanced'
        return shellSubclassNames.map( subclassName => {
            const subclass = Atom.subclasses.get( subclassName )
            if ( inBeginnerMode && !subclass.beginnerFriendly ||
                 inAdvancedMode && !subclass.advancedFriendly ) return null
            if ( inAdvancedMode ) {
                return {
                    shortcut : subclassName.toLowerCase(),
                    preview : subclass.advancedName ?
                              `${subclass.advancedName} environment` :
                              `a ${subclassName} environment`,
                    content : subclass.defaultHTML
                }
            }   
            return {
                shortcut : subclassName.toLowerCase(),
                preview : `${subclassName} environment`,
                content : subclass.defaultHTML
            }
        } ).filter( x => x !== null )
    } )
    editor.ui.registry.addMenuItem( 'togglemeaning', {
        text : 'Show/Hide meaning',
        tooltip : 'Toggle between meaning and presentation views of the document',
        shortcut : 'Alt+0',
        icon: 'preview',
        onAction : () => {
            const current = lookup( editor, 'shell style' )
            store( editor, 'shell style', current == 'boxed' ? 'minimal' : 'boxed' )
            // make the cursor stay in the middle of the screen when toggling views
            const getOffsetRelativeToBody = element => {
                let offsetTop = element.offsetTop
                let parent = element.offsetParent
                while ( parent && parent !== document.body ) {
                    offsetTop += parent.offsetTop
                    parent = parent.offsetParent
                }
                return offsetTop
            }
            const selection = editor.selection
            const editorHeight = editor.getContainer().clientHeight
            const scrollPosition = getOffsetRelativeToBody( selection.getEnd() )
            editor.getWin().scrollTo( 0, scrollPosition - ( editorHeight / 3 ) )
        }
    } )
}

/**
 * A proof is a type of shell that has the word "Proof" on top and no other
 * special functionality.  The LDE will treat it as a container with things
 * inside that should be validated.
 * 
 * It also provides a context menu item (no matter where inside the proof the
 * user right-clicked) that lets the user ask to run validation only for this
 * proof.  The implementation for that is to send the exact same validation
 * request to the deductive engine, except adding a "target=true" attribute to
 * the environment for this proof.  The engine will recognize that attribute and
 * send feedback only for the proof environment marked with that attribute.
 */
export class Proof extends Shell {
    static subclassName = Atom.registerSubclass( 'proof', Proof )
    static beginnerFriendly = true
    static advancedFriendly = true
    static latexEnvironment = 'proof'
    finalize ( shellLC ) {
        shellLC.makeIntoA( 'Proof' )
        if ( this.element.validateThisOnly )
            shellLC.setAttribute( 'target', true )
    }
    contextMenu ( forThis ) {
        const result = super.contextMenu( forThis )
        result.unshift( {
            text : 'Show feedback for this proof only',
            onAction : () => {
                this.element.validateThisOnly = true
                this.editor.ui.registry.getAll().menuItems.clearvalidation.onAction()
                this.editor.ui.registry.getAll().menuItems.validate.onAction()
                delete this.element.validateThisOnly
            }
        } )
        return result
    }
}

/**
 * A subproof is a type of shell that has no title on top and no other
 * special functionality.  It can be used inside proofs to group collections of
 * subderivations together, but without adding the unnecessary (and confusing)
 * heading "Proof" on top of them, which would be the case if we were instead
 * to use the {@link Proof} class.
 * 
 * @see {@link Premise}
 */
export class Subproof extends Shell {
    static subclassName = Atom.registerSubclass( 'subproof', Subproof )
    static beginnerFriendly = true
    static advancedFriendly = true
    toLatex ( innerLatex ) { return `\n\n${innerLatex}\n\n` }
    getTitle () { return '' }
}

/**
 * A premise is a type of shell that functions exactly like a {@link Subproof},
 * except that it always marks itself as a given environment.
 * 
 * @see {@link Subproof}
 */
export class Premise extends Shell {
    static subclassName = Atom.registerSubclass( 'premise', Premise )
    static advancedFriendly = true
    getTitle () { return 'Premise:' }
    finalize ( shellLC ) {
        shellLC.makeIntoA( 'given' )
    }
    toLatex ( innerLatex ) {
        return super.toLatex( '(Rule premise) ' + innerLatex )
    }
}


/**
 * A rule is a type of shell with the following features.
 * 
 *  - It labels itself as a "rule" using the attribute the LDE respects for
 *    rules of inference, so that validation will treat it as one.
 *  - It marks itself as a given, which the LDE requires for rules.
 */
export class Rule extends Shell {
  static subclassName = Atom.registerSubclass( 'rule', Rule )
  static advancedName = 'an axiom, definition, or rule'
  static advancedFriendly = true
  static latexEnvironment = 'lurchrule'
  finalize ( shellLC ) {
      shellLC.makeIntoA( 'given' )
      shellLC.makeIntoA( 'Rule' )
  }
  // TODO: debug this.  Copying a rule and pasting it put the conclusion
  // in as an expression labeled as a subproof.
  //
  // contextMenu ( forThis ) {
  //     const result = super.contextMenu( forThis )
  //     result.unshift( {
  //         text : 'Copy rule as a template',
  //         onAction : () => {
  //             const copy = this.element.cloneNode( true )
  //             const makeTemplate = node => {
  //                 if ( Atom.isAtomElement( node ) ) {
  //                     const atom = Atom.from( node, this.editor )
  //                     if ( atom.getMetadata( 'type' ) == 'premise' )
  //                         node.replaceWith( ...node.childNodes )
  //                         atom.setMetadata( 'type', 'subproof' )
  //                     if ( node.tagName == 'DIV' )
  //                         Array.from( node.childNodes ).forEach( makeTemplate )
  //                 } else {
  //                     Array.from( node.childNodes ).forEach( makeTemplate )
  //                 }
  //             }
  //             makeTemplate( copy )
  //             copyHTMLToClipboard( copy.innerHTML )
  //         }
  //     } )
  //     return result
  // }
}

/**
* A definition is a type of shell that functions exactly like a {@link Rule},
* except has the word "Definition" on top instead of "Rule".
*/
export class Definition extends Rule {
  static subclassName = Atom.registerSubclass( 'definition', Definition )
  static advancedFriendly = false
  static latexEnvironment = 'definition'
}    

/**
* An axiom is a type of shell that functions exactly like a {@link Rule},
* except has the word "Axiom" on top instead of "Rule".
*/
export class Axiom extends Rule {
  static subclassName = Atom.registerSubclass( 'axiom', Axiom )
  static advancedFriendly = false
  static latexEnvironment = 'axiom'
}

/**
* A theorem is a type of shell that labels itself as a "theorem" using the
* attribute the LDE respects for theorem statements, so that validation will
* treat it as one.
*/
export class Theorem extends Shell {
  static subclassName = Atom.registerSubclass( 'theorem', Theorem )
  static advancedName = 'a theorem, lemma, or corollary'
  static advancedFriendly = true
  static beginnerFriendly = true
  static latexEnvironment = 'theorem'
  finalize ( shellLC ) {
      shellLC.makeIntoA( 'Theorem' )
  }
}

/**
* A lemma is a type of shell that functions exactly like a {@link Theorem},
* except has the word "Lemma" on top instead of "Theorem".
*/
export class Lemma extends Theorem {
  static subclassName = Atom.registerSubclass( 'lemma', Lemma )
  static beginnerFriendly = false
  static advancedFriendly = false
  static latexEnvironment = 'lemma'
}

/**
* A corollary is a type of shell that functions exactly like a {@link Theorem},
* except has the word "Corollary" on top instead of "Theorem".
*/
export class Corollary extends Theorem {
  static subclassName = Atom.registerSubclass( 'corollary', Corollary )
  static beginnerFriendly = false
  static advancedFriendly = false
  static latexEnvironment = 'corollary'
}

/**
 * A "recall" is a type of shell that labels itself as a "hint" using the
 * attribute the LDE respects for hints, so that validation will treat it as
 * one.  A hint is an instantiation of a rule of inference, which can help the
 * LDE not have to figure out how to find the instantiation on its own.  This
 * can be useful for some rules that are very time consuming to instantiate in
 * all possibly relevant ways.
 */
export class Recall extends Shell {
    static subclassName = Atom.registerSubclass( 'recall', Recall )
    static advancedFriendly = false
    static latexEnvironment = 'recall'
    finalize ( shellLC ) {
        shellLC.makeIntoA( 'BIH' )
    }
}

/**
 * A "preview" can be used to show a dependency in the editor without allowing
 * the user to edit it or any of its contents.  The preview has no meaning (in
 * terms of LCs that will be used for validation) and is thus exactly what it
 * says on the tin: just a preview.
 */
export class Preview extends Shell {

    static subclassName = Atom.registerSubclass( 'preview', Preview )
    static advancedFriendly = false
    
    // Internal use only
    // Takes a DOM node as argument and replaces all dependencies in it
    // (recursively) with their contents (removing the metadata DIV and the
    // open-in-lurch link DIV from each dependency).
    // Modifies the given HTMLElement in-place, so pass it a clone.
    static flattenDependencies ( container ) {
        // The container must contain a document if we are to proceed
        const document = Array.from( container.childNodes ).find(
            child => child.id == 'document' )
        // If it does not, remove all of its contents and return it empty
        if ( !document ) {
            container.innerHTML = ''
            return container
        }
        document.removeAttribute( 'id' ) // no duplicate IDs, please
        // If there's a header, move it into the document before proceeding
        const metadata = Array.from( container.childNodes ).find(
            child => child.id == 'metadata' )
        if ( metadata ) {
            const header = metadata.querySelector(
                '[data-category="main"][data-key="header"]' )
            if ( header )
                for ( let i = header.childNodes.length - 1 ; i >= 0 ; i-- )
                    document.insertBefore(
                        header.childNodes[i], document.childNodes[0] )
        }
        // Find any dependency atoms in the document and recursively process them
        Dependency.topLevelDependenciesIn( document ).forEach( dependency =>
            dependency.element.replaceWith( Preview.flattenDependencies(
                dependency.getHTMLMetadata( 'content' ) ) ) )
        // The result is the newly modified document node
        return document
    }

    /**
     * Fill this shell with the content of the specified dependency, recursively
     * flattened so that all inner dependencies have been expanded out to be
     * visible as well.
     * 
     * @param {Dependency} dependency - the Dependency atom to show in the preview
     */
    imitate ( dependency ) {
        this.element.innerHTML = Preview.flattenDependencies(
            dependency.getHTMLMetadata( 'content' ).cloneNode( true )
        ).innerHTML
        if ( dependency.getMetadata( 'source' ) == 'web' )
            this.setMetadata( 'url', dependency.getMetadata( 'filename' ) )
        else
            this.removeMetadata( 'url' )
    }

    // Internal use only
    // Erase all children of this shell before validation; it has no meaning
    finalize ( shellLC ) {
        while ( shellLC.numChildren() > 0 ) shellLC.removeChild( 0 )
    }

    // Internal use only
    // Overrides the default isEditable() to always be false
    isEditable () { return false }

    // Internal use only
    // Overrides the default so that we don't let users change the environment
    // type for previews, but can open them in new windows.
    contextMenu ( forThis ) {
        const result = super.contextMenu( forThis )
        const url = this.getMetadata( 'url' )
        if ( url )
            result.push( {
                text : 'Open in new Lurch window',
                onAction : () => window.open( autoOpenLink( url ), '_blank' )
            } )
        return result
    }

    // Internal use only
    // Overrides the default to add a title stating that this is a preview only
    toLatex ( innerLatex ) {
        return 'Preview of dependency contents:\n' + super.toLatex( innerLatex )
    }

}

export default { Shell, install }
