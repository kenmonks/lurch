
/**
 * This file installs one tool into the user interface, a menu item for
 * inserting an inline atom into the document, one that allows the user to write
 * mathematical expressions and declarations in a variety of editing modes.
 * Beginner mode uses the MathLive editor, which is probably easiest for new
 * users.  Intermediate mode has the greatest UI complexity, including drop-down
 * menus for statements vs. assumptions vs. all types of declarations, and
 * permitting expression input using Lurch notation or the MathLive editor.
 * Advanced mode is a minimalistic dialog in which the user can enter only Lurch
 * notation, and see a preview of it typeset before confirming their edits.
 * 
 * @module ExpressionAtoms
 */

import { Atom } from './atoms.js'
import { lookup } from './document-settings.js'
import {
    Dialog, LongTextInputItem, TextInputItem, CheckBoxItem, SelectBoxItem
} from './dialog.js'
import { parse, represent } from './notation.js'
import { MathItem, getConverter } from './math-live.js'
import { appSettings } from './settings-install.js'
import {
    Expression as LCExpression, Declaration as LCDeclaration
} from './lde-cdn.js'
import { DeclarationType } from './declarations.js'
import { copyHTMLToClipboard } from './utilities.js'

let converter = null

/**
 * Install into a TinyMCE editor instance a new menu item:
 * "Expression," intended for the Insert menu.  It creates an inline atom that
 * can be inserted into the user's document, then initiates editing on it, so
 * that the user can customize it and then confirm or cancel the insertion of it.
 * The inline atom represents a mathematical expression or declaration.
 * 
 * @param {tinymce.Editor} editor the TinyMCE editor instance into which the new
 *   menu item should be installed
 * @function
 */
export const install = editor => {
    getConverter().then( result => converter = result )
    // Define reusable function that initiates the insertion of an expression
    const insertExpression = () => {
        // const mode = appSettings.get( 'expression editor type' )
        const mode = 'Advanced'
        const atom = Atom.newInline( editor, '',
            mode == 'Beginner' ? {
                type : 'expression',
                latex : '',
                given : false
            } : mode == 'Intermediate' ? {
                type : 'expression',
                contentType : 'Statement',
                latex : '',
                lurchNotation : '',
                symbol : ''
            } : { // mode == 'Advanced'
                type : 'expression',
                lurchNotation : ''
            } )
        atom.update()
        atom.editThenInsert()
    }
    // Install that function as what happens when you use the Insert expression action
    editor.ui.registry.addMenuItem( 'expression', {
        text : 'Expression',
        icon : 'superscript',
        tooltip : 'Insert expression',
        shortcut : 'Meta+E',
        onAction : insertExpression
    } )
}

/**
 * An Atom that represents a mathematical expression or declaration.
 */
export class Expression extends Atom {

    static subclassName = Atom.registerSubclass( 'expression', Expression )

    // Internal use only
    // Redirects the user to beginner, intermediate, or advanced editing mode,
    // with the given explanation presented, returning a promise that resolves
    // or rejects depending on what happens with the corresponding dialog.
    redirectEditMode ( mode, explanation = '' ) {
        return new Promise( ( resolve, reject ) => {
            Dialog.failure(
                this.editor,
                `${explanation}  Redirecting you to ${mode} mode.`,
                `Must edit in ${mode} mode`
            ).then( () => {
                switch ( mode ) {
                    case 'beginner':
                        this.editInBeginnerMode().then( resolve ).catch( reject )
                        break
                    case 'intermediate':
                        this.editInIntermediateMode().then( resolve ).catch( reject )
                        break
                    case 'advanced':
                        this.editInAdvancedMode().then( resolve ).catch( reject )
                        break
                }
            } )
        } )
    }

    // Internal use only
    // Was this expression last edited (and thus is now saved) using the
    // beginner mode of the editor?
    // (The way to tell is that there is no Lurch notation metadata, since only
    // intermediate and advanced modes use that.)
    isInBeginnerMode () {
        return typeof( this.getMetadata( 'lurchNotation' ) ) == 'undefined'
    }

    // Internal use only
    // Was this expression last edited (and thus is now saved) using the
    // intermediate mode of the editor?
    // (The way to tell is that there is a contentType metadata, since only
    // intermediate mode uses that.)
    isInIntermediateMode () {
        return !!this.getMetadata( 'contentType' )
    }

    // Internal use only
    // Was this expression last edited (and thus is now saved) using the
    // advanced mode of the editor?
    // (Easy: neither of the previous two are true)
    isInAdvancedMode () {
        return !this.isInBeginnerMode() && !this.isInIntermediateMode()
    }

    // Internal use only
    // Does this atom represent a statement?
    // (That is, exactly one LC, which is an Expression-type LC and not a given.)
    isStatement () {
        const LCs = this.toLCs()
        return LCs.length == 1
            && ( LCs[0] instanceof LCExpression )
            && !LCs[0].isA( 'given' )
    }

    // Internal use only
    // Does this atom represent an assumption?
    // (That is, exactly one LC, which is an Expression-type LC and a given.)
    isAssumption () {
        const LCs = this.toLCs()
        return LCs.length == 1
            && ( LCs[0] instanceof LCExpression )
            && LCs[0].isA( 'given' )
    }

    // Internal use only
    // Does this atom represent a declaration?
    // (That is, exactly one LC, which is a Declaration-type LC.)
    isDeclaration () {
        const LCs = this.toLCs()
        return LCs.length == 1
            && ( LCs[0] instanceof LCDeclaration )
    }

    // Internal use only
    // Look at the metadata for this atom and try to deduce how to represent it
    // in the data for beginner mode (that is, a single expr-given pair, as an
    // object with just the fields `latex` and `given`).  This throws an error
    // if it's not possible, with a user-readable error message.
    loadBeginnerModeData () {
        if ( this.isInBeginnerMode() ) {
            return {
                latex : this.getMetadata( 'latex' ),
                given : this.getMetadata( 'given' )
            }
        }
        if ( this.isInIntermediateMode() ) {
            if ( this.isDeclaration() )
                throw new Error( 'Declarations cannot be edited in beginner mode.' )
            return {
                latex : this.getMetadata( 'latex' ),
                given : this.isAssumption()
            }
        }
        if ( this.isInAdvancedMode() ) {
            if ( this.isStatement() ) {
                const lurchNotation = this.getMetadata( 'lurchNotation' )
                return {
                    latex : converter( lurchNotation, 'lurch', 'latex' ),
                    given : false
                }
            }
            if ( this.isAssumption() )
                throw new Error( 'Converting assumptions from advanced to beginner mode not yet implemented.' )
            throw new Error( 'This type of content cannot be edited in beginner mode.' )
        }
    }

    // Internal use only
    // Look at the metadata for this atom and try to deduce how to represent it
    // in the data for intermediate mode (that is, an object with the fields
    // `contentType`, `latex`, `lurchNotation`, and `symbol`).  This throws an
    // error if it's not possible, with a user-readable error message.
    loadIntermediateModeData () {
        if ( this.isInBeginnerMode() ) {
            const latex = this.getMetadata( 'latex' )
            return {
                // Phrased the following way so that empty LaTeX => Statement:
                contentType : this.isAssumption() ? 'Assumption' : 'Statement',
                symbol : '',
                latex : latex,
                lurchNotation : converter( latex, 'latex', 'lurch' )
            }
        }
        if ( this.isInIntermediateMode() ) {
            return {
                contentType : this.getMetadata( 'contentType' ),
                symbol : this.getMetadata( 'symbol' ),
                latex : this.getMetadata( 'latex' ),
                lurchNotation : this.getMetadata( 'lurchNotation' )
            }
        }
        if ( this.isInAdvancedMode() ) {
            if ( this.isStatement() ) {
                const lurchNotation = this.getMetadata( 'lurchNotation' )
                return {
                    contentType : 'Statement',
                    symbol : '',
                    latex : converter( lurchNotation, 'lurch', 'latex' ),
                    lurchNotation : lurchNotation
                }
            }
            if ( this.isAssumption() )
                throw new Error( 'Converting assumptions to intermediate mode not yet implemented.' )
            throw new Error( 'This type of content cannot be edited in intermediate mode.' )
        }
    }

    // Internal use only
    // Look at the metadata for this atom and try to deduce how to represent it
    // in the data for advanced mode (that is, just a single string in Lurch
    // notation, though we store it in an object with the `lurchNotation` field,
    // to be future-proof).  This throws an error if it's not possible, with a
    // user-readable error message.
    loadAdvancedModeData () {
        if ( this.isInBeginnerMode() ) {
            const latex = this.getMetadata( 'latex' )
            const lurchNotation = converter( latex, 'latex', 'lurch' )
            const prefix = this.isStatement() ? '' : ':'
            return {
                lurchNotation : prefix + lurchNotation
            }
        }
        if ( this.isInIntermediateMode() ) {
            const contentType = this.getMetadata( 'contentType' )
            if ( contentType == 'Statement' ) return {
                lurchNotation : this.getMetadata( 'lurchNotation' )
            }
            if ( contentType == 'Assumption' ) return {
                lurchNotation : ':' + this.getMetadata( 'lurchNotation' )
            }
            const declType = DeclarationType.fromTemplate( contentType )
            const symbol = this.getMetadata( 'symbol' )
            const lurchNotationForBody = this.getMetadata( 'lurchNotation' )
            return {
                lurchNotation : declType.lurchNotationForm( symbol, lurchNotationForBody )
            }
        }
        if ( this.isInAdvancedMode() ) {
            return {
                lurchNotation : this.getMetadata( 'lurchNotation' )
            }
        }
    }

    // Internal use only
    // Save the given data in the metadata for this atom, in such a way that we
    // would then have isInBeginnerMode() true, and loadBeginnerModeData() would
    // extract this data.
    saveBeginnerModeData ( latex, given ) {
        this.setMetadata( 'latex', latex )
        this.setMetadata( 'given', given )
        this.removeMetadata( 'contentType' )
        this.removeMetadata( 'symbol' )
        this.removeMetadata( 'lurchNotation' )
    }

    // Internal use only
    // Save the given data in the metadata for this atom, in such a way that we
    // would then have isInIntermediateMode() true, and loadIntermediateModeData()
    // would extract this data.
    saveIntermediateModeData ( contentType, symbol, latex, lurchNotation ) {
        this.setMetadata( 'contentType', contentType )
        this.setMetadata( 'symbol', symbol )
        this.setMetadata( 'latex', latex )
        this.setMetadata( 'lurchNotation', lurchNotation )
        this.removeMetadata( 'given' )
    }

    // Internal use only
    // Save the given data in the metadata for this atom, in such a way that we
    // would then have isInAdvancedMode() true, and loadAdvancedModeData() would
    // extract this data.
    saveAdvancedModeData ( lurchNotation ) {
        this.setMetadata( 'lurchNotation', lurchNotation )
        this.removeMetadata( 'given' )
        this.removeMetadata( 'contentType' )
        this.removeMetadata( 'symbol' )
        this.removeMetadata( 'latex' )
    }

    // Internal use only.
    // Used by edit() if the user's settings are in beginner mode.
    editInBeginnerMode () {
        // Ensure that we can do this in beginner mode; if not, switch to another
        // mode instead.
        let loadedData
        try {
            loadedData = this.loadBeginnerModeData()
        } catch ( e ) {
            try {
                this.loadIntermediateModeData()
                return this.redirectEditMode( 'intermediate', e.message )
            } catch ( e ) {
                return this.redirectEditMode( 'advanced', e.message )
            }
        }
        // set up dialog contents
        const dialog = new Dialog( 'Edit math', this.editor )
        const mathLiveInput = new MathItem( 'latex', '' )
        mathLiveInput.setFocusWhenShown( true )
        dialog.addItem( mathLiveInput )
        dialog.addItem( new CheckBoxItem( 'given', 'Assumption', false ) )
        // initialize dialog with data from the atom
        dialog.setInitialData( {
            latex : loadedData.latex,
            given : loadedData.given
        } )
        // utilities used below
        const convertToLurchNotation = () => {
            try {
                return converter( dialog.get( 'latex' ), 'latex', 'lurch' )
            } catch {
                return null
            }
        }
        const latexIsValid = () => {
            try {
                const lurchNotation = convertToLurchNotation()
                if ( lurchNotation === null ) return null
                const LCs = parse( lurchNotation, 'lurchNotation' )
                return ( LCs.length == 1 ) && ( LCs[0] instanceof LCExpression )
            } catch {
                return null
            }
        }
        dialog.onChange = () =>
            dialog.dialog.setEnabled( 'OK', latexIsValid() )
        // Show it and if they accept any changes, apply them to the atom.
        const result = dialog.show().then( userHitOK => {
            if ( !userHitOK || !latexIsValid() ) return false
            this.saveBeginnerModeData( dialog.get( 'latex' ), dialog.get( 'given' ) )
            this.update()
            return true
        } )
        dialog.dialog.setEnabled( 'OK', latexIsValid() )
        return result
    }

    // Internal use only.
    // Used by edit() if the user's settings are in intermediate mode.
    editInIntermediateMode () {
        // Ensure that we can do this in intermediate mode; if not, switch to
        // advanced mode instead.
        let loadedData
        try {
            loadedData = this.loadIntermediateModeData()
        } catch ( e ) {
            return this.redirectEditMode( 'advanced', e.message )
        }
        // set up dialog contents
        const dialog = new Dialog( 'Edit math', this.editor )
        dialog.addItem( new SelectBoxItem( 'contentType',
            'Type of mathematical content',
            [
                'Statement',
                'Assumption',
                ...DeclarationType.allInSettings( true ).map( dt =>
                    dt.template )
            ]
        ) )
        const symbolInput = new TextInputItem( 'symbol',
            'Name of variable or constant', '' )
        dialog.addItem( symbolInput )
        const lurchInput = new TextInputItem( 'lurchNotation',
            'Statement in plain text', '' )
        dialog.addItem( lurchInput )
        const mathLiveInput = new MathItem( 'latex',
            'Statement in standard notation' )
        dialog.addItem( mathLiveInput )
        const mathLivePreview = new MathItem( 'preview', 'Preview of content' )
        mathLivePreview.finishSetup = () => {
            mathLivePreview.mathLiveEditor.readOnly = true
            mathLivePreview.mathLiveEditor.style.border = 0
        }
        dialog.addItem( mathLivePreview )
        // create functions for manipulating the contents of the dialog
        const showGroup = ( element, visible ) => {
            const group = element?.parentNode
            if ( group ) group.style.display = visible ? '' : 'none'
        }
        const symbolElement = () => dialog.querySelector( 'input[type="text"]' )
        const showSymbolGroup = visible => showGroup( symbolElement(), visible )
        const expressionTextElement = () => dialog.querySelectorAll( 'input[type="text"]' )[1]
        const expressionLatexElement = () => dialog.querySelector( '#math-latex' )
        const showExpressionGroups = visible => {
            showGroup( expressionTextElement(), visible )
            showGroup( expressionLatexElement(), visible )
        }
        const expressionGroupsVisible = () =>
            expressionTextElement()?.parentNode?.style?.display != 'none'
        const showControlsForContentType = contentType => {
            showSymbolGroup( contentType != 'Statement'
                && contentType != 'Assumption' )
            showExpressionGroups( contentType == 'Statement'
                || contentType == 'Assumption'
                || DeclarationType.templateToBody( contentType ) != 'none' )
        }
        // initialize dialog with data from the atom
        dialog.setInitialData( {
            lurchNotation : loadedData.lurchNotation,
            latex : loadedData.latex,
            symbol : loadedData.symbol || '',
            contentType : loadedData.contentType
        } )
        // place the cursor where it belongs
        if ( loadedData.contentType != 'Statement'
          && loadedData.contentType != 'Assumption' )
            dialog.setDefaultFocus( 'symbol' )
        else if ( lookup( this.editor, 'notation' ) == 'latex' )
            mathLiveInput.setFocusWhenShown( true )
        else
            dialog.setDefaultFocus( 'lurchNotation' )
        // utilities used below
        const convertToLatex = () => {
            const lurchNotation = dialog.get( 'lurchNotation' )
            if ( lurchNotation.trim() == '' ) return ''
            try {
                return converter( lurchNotation, 'lurch', 'latex' )
            } catch {
                return null
            }
        }
        const convertToLurchNotation = () => {
            const latex = dialog.get( 'latex' )
            if ( latex.trim() == '' ) return ''
            try {
                return converter( latex, 'latex', 'lurch' )
            } catch {
                return null
            }
        }
        let expressionIsValid = loadedData.latex.trim() != ''
        const generatePreview = () => {
            // console.log( 'gen prev with',
            //     dialog.get( 'contentType' ),
            //     dialog.get( 'symbol' ),
            //     dialog.get( 'lurchNotation' ),
            //     dialog.get( 'latex' )
            // )
            const contentType = dialog.get( 'contentType' )
            const expressionLatex = convertToLatex()
            if ( contentType == 'Statement' )
                return expressionIsValid ? expressionLatex : null
            if ( contentType == 'Assumption' )
                return expressionIsValid ? `\\text{Assume }${expressionLatex}` : null
            const symbol = dialog.get( 'symbol' )
            if ( `${symbol}`.trim() == '' ) return null
            const declType = DeclarationType.fromTemplate( contentType )
            if ( declType.body != 'none'
              && ( !expressionIsValid || !expressionLatex ) )
                return null
            const symbolLatex = symbol.length == 1 ? symbol : `\\mathrm{${symbol}}`
            const filled = contentType
                .replace( '[statement]', `$${expressionLatex}$` )
                .replace( '[variable]', `$${symbolLatex}$` )
                .replace( '[constant]', `$${symbolLatex}$` )
            return `\\text{${filled}}`
        }
        // if they edit the Lurch notation or latex, keep them in sync
        let updatesEnabled = false
        setTimeout( () => updatesEnabled = true ) // after dialog populates
        dialog.onChange = ( _, component ) => {
            if ( !updatesEnabled ) return
            updatesEnabled = false // prevent syncing to fixed point/infinity
            if ( expressionGroupsVisible()
              && ( component.name == 'lurchNotation' || component.name == 'latex' ) ) {
                if ( component.name == 'lurchNotation' ) {
                    const converted = convertToLatex()
                    if ( converted !== null )
                        mathLiveInput.setValue( converted )
                    expressionIsValid = !!converted
                } else if ( component.name == 'latex' ) {
                    const converted = convertToLurchNotation()
                    if ( converted !== null )
                        dialog.dialog.setData( { lurchNotation : converted } )
                    expressionIsValid = !!converted
                }
            }
            if ( component.name == 'contentType' )
                showControlsForContentType( dialog.get( 'contentType' ) )
            if ( component.name != 'preview' ) {
                const preview = generatePreview()
                if ( preview )
                    mathLivePreview.setValue( preview )
                else
                    mathLivePreview.setValue( '' )
                dialog.dialog.setEnabled( 'OK', !!preview )
            }
            updatesEnabled = true
        }
        // Show it and if they accept any changes, apply them to the atom.
        const result = dialog.show().then( userHitOK => {
            if ( !userHitOK || !generatePreview() ) return false
            this.saveIntermediateModeData(
                dialog.get( 'contentType' ),
                dialog.get( 'symbol' ),
                dialog.get( 'latex' ),
                dialog.get( 'lurchNotation' )
            )
            this.update()
            return true
        } )
        showControlsForContentType( loadedData.contentType )
        const preview = generatePreview()
        if ( preview ) {
            const interval = setInterval( () => {
                if ( mathLivePreview.mathLiveEditor ) {
                    mathLivePreview.setValue( preview )
                    clearInterval( interval )
                }
            }, 25 )
        }
        dialog.dialog.setEnabled( 'OK', !!generatePreview() )
        return result
    }

    // Internal use only.
    // Used by edit() if the user's settings are in advanced mode.
    editInAdvancedMode () {
        const { lurchNotation } = this.loadAdvancedModeData()
        // set up dialog contents
        const dialog = new Dialog( 'Edit math', this.editor )
        dialog.hideHeader = dialog.hideFooter = true
        const lurchInput = new LongTextInputItem( 'lurchNotation', '', '' )
        dialog.addItem( lurchInput )
        const mathLivePreview = new MathItem( 'latex', '' )
        mathLivePreview.finishSetup = () => {
            mathLivePreview.mathLiveEditor.readOnly = true
            mathLivePreview.mathLiveEditor.style.border = 0
            mathLivePreview.mathLiveEditor.style.padding = '0.5rem 0 0 0.5rem'
        }
        dialog.addItem( mathLivePreview )
        // initialize dialog with data from the atom
        dialog.setInitialData( {
            lurchNotation : lurchNotation,
            latex : converter( lurchNotation, 'lurch', 'latex' )
        } )
        dialog.setDefaultFocus( 'lurchNotation' )
        // utility used below
        const convertToLatex = () => {
            try {
                return converter( dialog.get( 'lurchNotation' ), 'lurch', 'latex' )
            } catch {
                return null
            }
        }
        // utility used below
        const convertToLC = () => {
            try {
              return LogicConcept.fromPutdown( 
                converter( dialog.get( 'lurchNotation' ), 'lurch', 'putdown' ) 
              )
            } catch {
                return null
            }
        }
        // if they edit the Lurch notation or latex, keep them in sync
        dialog.onChange = ( _, component ) => {
            if ( component.name == 'lurchNotation' ) {
                // be sure the user input is valid syntax for BOTH parsers
                // before allowing them to enter it
                const convertedTex = convertToLatex()
                const convertedLC = convertToLC()
                const validSyntax = !!(convertedLC && (convertedTex || convertedTex === ''))
                if ( validSyntax ) mathLivePreview.setValue( convertedTex )
                const lurchInputElement = dialog.querySelector( 'textarea' )
                if ( lurchInputElement ) {
                    if ( validSyntax && typeof convertedTex === 'string' ) {
                        lurchInputElement.classList.remove('badsyntax')
                    } else {
                        lurchInputElement.classList.add('badsyntax')
                    }
                }
                dialog.dialog.setEnabled( 'OK', validSyntax )
            }
        }
        // Show it and if they accept any changes, apply them to the atom.
        const result = dialog.show().then( userHitOK => {
            if ( !userHitOK || !convertToLatex() ) return false
            this.saveAdvancedModeData( dialog.get( 'lurchNotation' ) )
            this.update()
            return true
        } )
        dialog.dialog.setEnabled( 'OK', !!(convertToLatex() && convertToLC()) )
        // prevent enter to confirm if the input is invalid
        const lurchInputElement = dialog.querySelector( 'textarea' )
        if ( lurchInputElement ) {
            lurchInputElement.classList.add( 'advancedTextArea' )
            // set the initial height based on the number of current lines
            // of text in the initial value, plus wordwrap at 45 chars
            const computeHeight = s => 10 + 24 * Math.max( 1,
                s.split( '\n' ).reduce( ( total, line ) => 
                    total + Math.max( 1, Math.ceil( line.length / 45 ) ), 0 ) )
            lurchInputElement.style.height = computeHeight( lurchNotation ) + 'px'
            // it should be valid to start since it was saved in the first place
            lurchInputElement.classList.remove('badsyntax')

            // give it focus, but if it ever loses focus, close the dialog
            lurchInputElement.focus()
            lurchInputElement.addEventListener( 'blur', () =>
                setTimeout( () => dialog.close() ) )

            lurchInputElement.addEventListener('input', () =>
                lurchInputElement.style.height = 
                    computeHeight (lurchInputElement.value ) + 'px' )

            // listen for the Enter and Shift+Enter keys        
            lurchInputElement.addEventListener( 'keydown', event => {
                if ( event.key == 'Enter' ) {
                    if ( event.shiftKey ) {
                        // allow Shift+Enter to add a line
                    } else if ( dialog.dialog.isEnabled?.('OK') ) {
                        // Plain enter submits if the input is valid
                        dialog.querySelector( 'button[title="OK"]' ).click()
                        event.preventDefault()
                        event.stopPropagation()
                    } else {
                        // Plain enter does nothing if the input is invalid
                        event.preventDefault()
                        event.stopPropagation()
                    }
                }
            } )
        }
        return result
    }

    /**
     * Shows a dialog for editing an expression atom, but it may show one of
     * three different dialogs, depending on whether the user has chosen
     * beginner, intermediate, or advanced mode in their settings.
     * 
     * **Beginner mode does this:**
     * 
     * Shows a dialog containing just a MathLive editor and a checkbox for
     * given/claim status.  The user can then confirm or cancel the edit, as
     * per the convention described in
     * {@link module:Atoms.Atom#edit the edit() function for the Atom class}.
     * 
     * **Intermediate mode does this:**
     * 
     * Shows a multi-part dialog for editing expression atoms using Lurch
     * notation or a MathLive editor widget.  The user can then confirm or
     * cancel the edit, as per the convention described in
     * {@link module:Atoms.Atom#edit the edit() function for the Atom class}.
     * 
     * **Advanced mode does this:**
     * 
     * The dialog is extremely minimalist, no title bar, no footer buttons, no
     * miniature headings over each input/output, and the only input is the
     * Lurch notation.  The MathLive widget is a read-only preview.  There is no
     * checkbox for given/claim status, but that status is inferred from the
     * Lurch notation.
     * 
     * @returns {Promise} same convention as specified in
     *   {@link module:Atoms.Atom#edit edit() for Atoms}
     */
    edit () {
        // switch ( appSettings.get( 'expression editor type' ) ) {
        switch ( 'Advanced' ) {
            case 'Beginner':
                return this.editInBeginnerMode()
            case 'Intermediate':
                return this.editInIntermediateMode()
            case 'Advanced':
                return this.editInAdvancedMode()
        }
    }

    /**
     * The behavior of this function depends on whether the atom was last edited
     * using beginner mode, intermediate mode, or advanced mode.
     * 
     * If it was created using beginner mode, then we check to ensure that the
     * LaTeX version of the MathLive editor's contents represents a single
     * mathematical expression, optionally marked as an assumption.  If so, we
     * return an array containing just that expression (possibly marked as a
     * given).  If not, we return an empty array.
     * 
     * If it was created using intermediate mode, then it may represent a
     * statement (i.e., claim expression), an assumption (i.e., given
     * expression), or a declaration (of any of a variety of types, with or
     * without body).  As long as one of these holds true, we return a
     * JavaScript array containing the single LogicConcept represented by this
     * atom.  If not, we return an empty array.
     * 
     * If it was created using advanced mode, then we parse the Lurch notation
     * that was typed into the advanced mode dialog.  This will produce zero or
     * more LogicConcepts, in an array, which we return.
     * 
     * @returns {LogicConcept[]} an array containing zero or one LogicConcepts
     */
    toLCs () {
        const ensureOneExpression = LCs => {
            if ( LCs.message ) {
                console.log( 'Input did not parse:' )
                console.log( LCs.message )
                return [ ]
            }
            if ( LCs.length != 1 ) {
                console.log( 'Input yielded more than one LC:' )
                console.log( LCs.map( LC => LC.toPutdown() ) )
                return [ ]
            }
            if ( !( LCs[0] instanceof LCExpression ) ) {
                console.log( 'Input yielded a non-Expression LC:' )
                console.log( LCs[0].toPutdown() )
                return [ ]
            }
            return LCs
        }
        if ( this.isInBeginnerMode() ) {
            const { latex, given } = this.loadBeginnerModeData()
            if ( latex.trim() == '' ) return [ ]
            const lurchNotation = converter( latex, 'latex', 'lurch' )
            const prefix = given ? ':' : ''
            const result = parse( prefix + lurchNotation, 'lurchNotation' )
            return ensureOneExpression( result )
        }
        if ( this.isInIntermediateMode() ) {
            const { contentType, symbol, lurchNotation } = this.loadIntermediateModeData()
            if ( contentType == 'Statement' )
                return ensureOneExpression( parse( lurchNotation, 'lurchNotation' ) )
            if ( contentType == 'Assumption' )
                return ensureOneExpression(
                    parse( ':' + lurchNotation, 'lurchNotation' ) )
            const declType = DeclarationType.fromTemplate( contentType )
            if ( declType.body == 'none' )
                return [ declType.toLC( symbol ) ]
            const parsed = ensureOneExpression( parse( lurchNotation, 'lurchNotation' ) )
            if ( parsed.length == 0 ) return [ ]
            return [ declType.toLC( symbol, parsed[0] ) ]
        }
        if ( this.isInAdvancedMode() ) {
            const { lurchNotation } = this.loadAdvancedModeData()
            const ans = parse( lurchNotation, 'lurchNotation' )
            const results = this.getValidationResults()
            // there might be more than one result, e.g for transitive chains,
            // so show the worst one
            const result = 
                (results.includes('inapplicable')) ? 'inapplicable' :
                (results.includes('invalid')) ? 'invalid' :
                (results.includes('indeterminate')) ? 'indeterminate' :
                (results.includes('valid')) ? 'valid' : 'error'
            // if this atom produces only one LC expression, then assign its
            // ExpectedResult attribute.  If it produces multiple expressions
            // then we don't know which validation result in the span class came
            // from which LC so it is useless for testing.  
            if (results.length>0 && ans.length==1) {
                ans.forEach( x => x.setAttribute('ExpectedResult',result) )
            }
            return ans
        }
    }

    /**
     * The behavior of this function depends on whether the atom was last edited
     * using beginner mode, intermediate mode, or advanced mode.
     * 
     * If it was created using beginner mode, then we place its HTML
     * representation in the body of the atom, and possibly place the word
     * "Assume" into the prefix of the atom, iff the atom is marked as an
     * assumption.  The atom suffix is not involved.
     * 
     * If it was created using intermediate mode and is a statement or
     * assumption, then we treat it as in beginner mode.  However, if it is a
     * declaration, we use {@link DeclarationType#documentForm documentForm()}
     * to convert it to HTML and use that as the body of the atom.  Any former
     * prefix in the atom is removed.  The atom suffix is not involved.
     * 
     * If it was created using advanced mode, then we apply a Lurch notation to
     * LaTeX conversion function, followed by a rendering of that LaTeX as HTML,
     * which goes into the body of the atom.  Any former prefix in the atom is
     * removed.  The atom suffix is not involved.
     */
    update () {
        const setContent = ( lurchNotation, given ) => {
            if ( given )
                this.fillChild( 'prefix', 'Assume ' )
            else
                this.removeChild( 'prefix' )
            const repr = `${represent( lurchNotation, 'lurchNotation' )}`
            this.fillChild( 'body', repr )
        }
        if ( this.isInBeginnerMode() ) {
            const { latex, given } = this.loadBeginnerModeData()
            setContent( converter( latex, 'latex', 'lurch' ), given )
        } else if ( this.isInIntermediateMode() ) {
            const { contentType, symbol, lurchNotation } = this.loadIntermediateModeData()
            if ( contentType == 'Statement' )
                setContent( lurchNotation, false )
            else if ( contentType == 'Assumption' )
                setContent( lurchNotation, true )
            else {
                const declType = DeclarationType.fromTemplate( contentType )
                const repr = `${represent( lurchNotation, 'lurchNotation' )}`
                this.fillChild( 'body', declType.documentForm( symbol, repr ) )
                this.removeChild( 'prefix' )
            }
        } else { // advanced mode
            const { lurchNotation } = this.loadAdvancedModeData()
            setContent( lurchNotation, false )
        }
    }

    /**
     * All atoms must be able to represent themselves in LaTeX form, so that the
     * document (or a portion of it) can be exporeted for use in a LaTeX editor,
     * such as Overleaf.  This function overrides the default implementation
     * with a representation suitable to expression atoms.  It wraps the LaTeX
     * representation of the expression in dollar signs.
     * 
     * @returns {string} LaTeX representation of an expression atom
     */
    toLatex () {
        const withPrefix = ( latex, given ) => {
            // Don't wrap in dollar signs if it's got an align or something:
            latex = /\\begin\{/.test( latex ) ? latex : `$${latex}$`
            return given ? 'Assume ' + latex : latex
        }
        if ( this.isInBeginnerMode() ) {
            const { latex, given } = this.loadBeginnerModeData()
            return withPrefix( latex, given )
        } else if ( this.isInIntermediateMode() ) {
            const { contentType, symbol, latex } = this.loadIntermediateModeData()
            if ( contentType == 'Statement' )
                return withPrefix( latex, false )
            if ( contentType == 'Assumption' )
                return withPrefix( latex, true )
            const declType = DeclarationType.fromTemplate( contentType )
            return declType.latexForm( symbol, latex )
        } else { // advanced mode
            const { lurchNotation } = this.loadAdvancedModeData()
            const latex = converter( lurchNotation, 'lurch', 'latex' )
            return withPrefix( latex, false )
        }
    }
    
    /**
     * Items to be included on the TinyMCE context menu if an atom of this class
     * is right-clicked.  For information on the format of the returned data,
     * see the TinyMCE v6 manual on custom context menus.
     * 
     * In this case, it adds one item, for viewing the meaning of the expression
     * in a pop-up dialog, either as a hierarchy of bullet points and sections,
     * or as a block of putdown code.
     * 
     * @param {Atom} forThis - the atom that received the right-click action that
     *   led to the creation of the context menu
     * @returns {Object[]} data representing the contents of a TinyMCE context
     *   menu
     */
    contextMenu ( forThis ) {
        const result = super.contextMenu( forThis )
        if ( forThis == this ) {
            result.unshift( {
                text : 'View meaning',
                onAction : () => Dialog.meaningOfAtom( this )
            } )
            result.unshift( {
                text : 'Copy expression',
                onAction : () => copyHTMLToClipboard( this.element.outerHTML )
            } )
        }
        return result
    }

    /**
     * When embedding a copy of the Lurch app in a larger page, users will want
     * to write simple HTML describing a Lurch document, then have a script
     * create a copy of the Lurch app and put that document into it.  We allow
     * for representing expressions using `<lurch>...</lurch>` elements, which
     * contain Lurch notation.  This function can convert any expression atom
     * into the corresponding `lurch` element, as a string.
     * 
     * @returns {string} the representation of the atom as a `lurch` element
     */
    toEmbed () {
        const wrap = lurchNotation => `<lurch>${lurchNotation}</lurch>`
        if ( this.isInBeginnerMode() ) {
            const { latex, given } = this.loadBeginnerModeData()
            if ( latex.trim() == '' ) return ''
            const lurchNotation = converter( latex, 'latex', 'lurch' )
            const prefix = given ? ':' : ''
            return wrap( prefix + lurchNotation )
        }
        if ( this.isInIntermediateMode() ) {
            const { contentType, symbol, lurchNotation } = this.loadIntermediateModeData()
            if ( contentType == 'Statement' ) return wrap( lurchNotation )
            if ( contentType == 'Assumption' ) return wrap( ':' + lurchNotation )
            const declType = DeclarationType.fromTemplate( contentType )
            return wrap( declType.lurchNotationForm( symbol, lurchNotation ) )
        }
        if ( this.isInAdvancedMode() ) {
            const { lurchNotation } = this.loadAdvancedModeData()
            return wrap( lurchNotation )
        }
    }

}

export default { install }
