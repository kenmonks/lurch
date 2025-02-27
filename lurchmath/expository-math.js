
/**
 * Expository math is content in a Lurch document that is meant to be read for
 * human comprehension but not as part of the logical content of a proof.  For
 * instance, a document author might want to add some side comments that include
 * variables, equations, or other expressions, typeset with LaTeX, but that are
 * not intended for the system to grade, interpret, or obey.
 * 
 * For example, if an instructor is writing the rules for a logical system, they
 * might want to show how NOT to use the rules, or how NOT to write expressions,
 * and they don't want their document to contain validation errors, as if there
 * were something wrong with it, when it's really just showing by example what
 * to avoid.
 * 
 * We therefore provide a new type of {@link Atom} that functions very similar
 * to the {@link Expression} type, with two exceptions.  First, the notation
 * used is LaTeX, not Lurch notation.  Second, the content is not interpreted by
 * the system for use in validation; more precisely, it is completely ignored
 * during the conversion of a document to LCs, which is then used in validation.
 * 
 * @module ExpositoryMathAtoms
 */

import { Atom } from './atoms.js'
import { represent } from './notation.js'
import { appSettings } from './settings-install.js'
import { Dialog, TextInputItem, LongTextInputItem, HTMLItem } from './dialog.js'
import { MathItem } from './math-live.js'
import { escapeLatex } from './utilities.js'

/**
 * An Atom that represents a piece of mathematical notation used only for
 * exposition
 */
export class ExpositoryMath extends Atom {

    static subclassName = Atom.registerSubclass( 'expositorymath', ExpositoryMath )

    /**
     * Shows a dialog for editing an expository math atom, but it may style the
     * dialog differently, depending on whether the user has chosen beginner,
     * intermediate, or advanced mode for the expository math editor.
     * 
     * In beginner mode, the dialog contains only a MathLive editor, which the
     * user uses to create their expository math content.
     * 
     * In any other mode, the dialog has two portions, a text input that accepts
     * LaTeX input and a MathLive editor that allows editing of WYSIWYG math
     * content.  These two stay in sync, in that if the user edits either one,
     * the other is updated automatically.
     * 
     * Advanced mode differs from intermediate mode in two ways.  First, the
     * header, footer, and labels in the dialog are removed to style it like
     * the advanced mode editor for {@link Expression} atoms.  Second, the
     * MathLive editor is read-only, also to imitate the advanced mode behavior
     * of the dialog for {@link Expression} atoms.
     * 
     * @returns {Promise} same convention as specified in
     *   {@link module:Atoms.Atom#edit edit() for Atoms}
     */
    edit () {
        const mode = appSettings.get( 'expository math editor type' )
        const latex = this.getMetadata( 'latex' )
        // set up dialog contents
        const dialog = new Dialog( 'Edit expository math', this.editor )
        dialog.hideHeader = dialog.hideFooter = mode == 'Advanced'
        const latexInput = mode == 'Advanced' 
            // use an expandable textarea for Advanced mode
            ? new LongTextInputItem( 'latex', '', '' )
            : new TextInputItem( 'latex', 'LaTeX notation', '' )
        dialog.addItem( latexInput )
        const textSelector = mode == 'Advanced' 
            ? 'textarea[type="text"]'
            : 'input[type="text"]'
        // const mathjaxPreview = new HTMLItem('<div id="mathjaxPreview"></div>')
        // dialog.addItem( mathjaxPreview )
        // mathjaxPreview.onShow = () => {
        //   const jaxinthebox = dialog.querySelector( '#mathjaxPreview' )
        //   jaxinthebox.innerHTML = `$$${dialog.get( 'latex' )}$$`
        //   // set MathJax rendering to svg in the dialog to avoid conflict with 
        //   // standard TinyMCE .tox css on dialogs for chtml
        //   MathJax.typeset()
        // }

        const mathLivePreview = new MathItem( 'preview',
            mode == 'Advanced' ? '' : 'Math editor' )
        mathLivePreview.finishSetup = () => {
            if ( mode == 'Advanced' ) {
                mathLivePreview.mathLiveEditor.readOnly = true
                mathLivePreview.mathLiveEditor.style.border = 0
                mathLivePreview.mathLiveEditor.style.padding = '0.5rem 0 0 0.5rem'
            }
            mathLivePreview.setValue( latex )
        }
        dialog.addItem( mathLivePreview )

        // initialize dialog with data from the atom
        dialog.setInitialData( { latex } )
        dialog.setDefaultFocus( 'latex' )
        // utility: is the current latex empty?
        const empty = () => dialog.get( 'latex' ).trim() == ''
        // if they edit the Lurch notation or latex, keep them in sync
        dialog.onChange = ( _, component ) => {
            if ( component.name == 'latex' ) {
                mathLivePreview.setValue( dialog.get( 'latex' ) )
              // get the dom element and render it on load
              // const jaxinthebox = dialog.querySelector( '#mathjaxPreview' )
              // jaxinthebox.innerHTML = `$$${dialog.get( 'latex' )}$$`
              // MathJax.typeset()
            }
            if ( component.name == 'preview' )
                dialog.querySelector( textSelector ).value =
                    mathLivePreview.mathLiveEditor.value
            dialog.dialog.setEnabled( 'OK', !empty() )
        }
        // Show it and if they accept any changes, apply them to the atom.
        const result = dialog.show().then( userHitOK => {
            if ( !userHitOK || empty() ) return false
            this.setMetadata( 'latex', dialog.get( 'latex' ) )
            this.update()
            return true
        } )
        dialog.dialog.setEnabled( 'OK', !empty() )
        // prevent enter to confirm if the input is empty
        const latexInputElement = dialog.querySelector( textSelector )
        latexInputElement.addEventListener( 'keydown', event => {
            if ( event.key == 'Enter' && empty() ) {
                event.preventDefault()
                event.stopPropagation()
                return false
            }
        } )
        if (mode === 'Advanced') {
            // set the initial height based on the number of current lines
            // of text in the initial value, plus wordwrap at 45 chars
            const computeHeight = (s) => 10+24*Math.max(1,
                s.split( '\n' ).reduce( (total,line) => 
                    { return total+Math.max(1,Math.ceil(line.length/45)) },0)) 
            
            latexInputElement.style.height = computeHeight(latex)+'px'

            latexInputElement.addEventListener('input', () => {
              latexInputElement.style.height = 
                  computeHeight(latexInputElement.value)+'px'
            })

            // listen for the Enter and Shift+Enter keys        
            latexInputElement.addEventListener( 'keydown', event => {
                if ( event.key == 'Enter' ) {
                    if ( !event.shiftKey ) {
                        // Plain enter submits whether or not it is valid
                        // and lets the renderer's error system handle it
                        dialog.querySelector( 'button[title="OK"]' ).click()
                    }
                }
            } )
            // add the css class
            latexInputElement.classList.add( 'advancedTextArea' )
            // give it focus, but if it ever loses focus, close the dialog
            latexInputElement.focus()
            latexInputElement.addEventListener( 'blur', () =>
                setTimeout( () => dialog.close() ) )          
        }
        // hide latex input for beginner mode
        latexInputElement.parentNode.style.display = mode == 'Beginner' ? 'none' : ''
        return result
    }

    /**
     * Render the LaTeX from the dialog as HTML and place that HTML into the
     * body of the atom.  No check is done to be sure that the LaTeX is valid;
     * the user can type invalid LaTeX and get erroneous typeset results.
     */
    update () {
        const latex = this.getMetadata( 'latex' )
        this.fillChild( 'body', `${represent( latex, 'latex' )}` )
    }

    /**
     * All atoms must be able to represent themselves in LaTeX form, so that the
     * document (or a portion of it) can be exporeted for use in a LaTeX editor,
     * such as Overleaf.  This function overrides the default implementation
     * with a representation suitable to expository math atoms, which is just to
     * enclose their LaTeX content in dollar signs.
     * 
     * @returns {string} LaTeX representation of an expository math atom
     */
    toLatex () { return `$${this.getMetadata( 'latex' )}$` }
    
    /**
     * When embedding a copy of the Lurch app in a larger page, users will want
     * to write simple HTML describing a Lurch document, then have a script
     * create a copy of the Lurch app and put that document into it.  We allow
     * for representing expository math using `<latex>...</latex>` elements,
     * which contain LaTeX notation.  This function can convert any expository
     * math atom into the corresponding `latex` element, as a string.
     * 
     * @returns {string} the representation of the atom as a `lurch` element
     */
    toEmbed () { return `<latex>${this.getMetadata( 'latex' )}</latex>` }

}

/**
 * Install into a TinyMCE editor instance a new menu item:  "Expository math,"
 * intended for the Insert menu.  It creates an inline atom that can be inserted
 * into the user's document, then initiates editing on it, so that the user can
 * customize it and then confirm or cancel the insertion of it.
 * The inline atom has no mathematical meaning and is ignored during validation,
 * but can be used for expository purposes, hence the name.
 * 
 * We also install a keyboard handler for the `$` key, in case the user has
 * enabled the setting that interprets that key as initiating insertion of an
 * expository math expression.
 * 
 * @param {tinymce.Editor} editor the TinyMCE editor instance into which the new
 *   menu item should be installed
 * @function
 */
export const install = editor => {
    const insertExpositoryMath = () => {
        const atom = Atom.newInline( editor, '', {
            type : 'expositorymath',
            latex : ''
        } )
        atom.update()
        atom.editThenInsert()
    }
    const svgicon = '<svg width="24" height="24" viewBox="0 0 24 24"><text x="0" y="18" font-size="8" font-family="sans-serif">$$</text></svg>'
    editor.ui.registry.addIcon('tex',svgicon)
    editor.ui.registry.addMenuItem( 'expositorymath', {
        // text : 'Expository math',
        text : 'LaTeX',
        tooltip : 'Insert expository math',
        // shortcut : 'Meta+Alt+E',
        icon : 'tex',
        shortcut : '$',
        onAction : insertExpositoryMath
    } )
    // Install that function as what happens when you type a dollar sign,
    // as in LaTeX.  (Yes, this means that you can't type a dollar sign directly in Lurch.
    // but you can enter one as expository math by entering \$ for the LaTeX.)
    editor.on( 'init', () => {
        editor.dom.doc.body.addEventListener( 'keypress', event => {
            if ( event.key == '$' && appSettings.get( 'dollar sign shortcut' ) ) {
                event.preventDefault()
                event.stopPropagation()
                insertExpositoryMath()
            }
        } )
    } )
}

export default { install }
