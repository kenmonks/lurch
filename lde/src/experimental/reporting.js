/**
 * Reporting Utilties
 *
 * This provides tools for custom formatting and customized reports for LCs and
 * various output devices.  For now we only support the terminal output in Lode. 
 *
 * The main function is the LogicConcept extension `.report(options)`. It will
 * format and output a LC document with syntax highlighting and various. The
 * options object has the following fields:
 * ```
 *  showDeclares, showAttributes , showBodies, showContexts, showRules ,
 *  showUserThms , showPartials , showConsiders , showInstantiations ,
 *  showNumbers , showProperNames , showUserRules , showUserInstantiations ,
 *  showValidation
 * ```
 * which, when true, will show the corresponding part aspect of the document.
 *
 * Some predefined reports are available by using a predefined options object:
 * ```
 *  all, show, detailed , moderate, allclean, clean , user
 * ```
 * These reporting routines also are used by the Lode writer for echoing LC
 * documents and arrays of LCs and other objects.
 *
 * @module Reporting
 */

///////////////////////////////////////////////////////////////////////////////
// Imports
//
// NOTE: all imports must be at the top of the file

// load everything from index.js
import * as Lurch from '../index.js'
// load the experimental code
import Compact from './global-validation.js'
// load chalk and stripAnsi
import chalk from 'chalk'
import erase from 'strip-ansi'
import Utilities from './utils.js'
// load the commands from Lurch and Compact
Object.assign( global, Utilities )
Object.assign( global, Lurch )
Object.assign( global, Compact )

/////////////////////////////////////////////////////////////////////////
// Lode syntax highlighting

// Lode Color Theme
const defaultPen = chalk.ansi256(12)        // Lode blue
const metavariablePen = chalk.ansi256(3)    // orangish (also 220 is nice)
const constantPen = chalk.ansi256(226)      // yellowish
const instantiationPen = chalk.ansi256(8)   // dirt
const hintPen = chalk.ansi256(93)           // purpleish
const attributePen = chalk.ansi256(249)     // shade of grey
const declaredPen = chalk.ansi256(212)      // pinkish
const attributeKeyPen = chalk.ansi256(2)    // matches string green
const checkPen = chalk.ansi256(46)          // bright green
const starPen = chalk.ansi256(226)          // bright gold
const xPen = chalk.ansi256(9)               // brightred
const contextPen = chalk.ansi256(56)        // purpleish
const decPen = chalk.ansi256(30)            // aqua-ish
const commentPen = chalk.ansi256(252)       // light grey
const headingPen = chalk.ansi256(226)       // bright Yellow
const docPen = chalk.ansi256(248)           // light grey text
const linenumPen = chalk.ansi256(22)        // darkish green
const itemPen =  chalk.ansi256(214)         // orangish
const stringPen =  chalk.ansi256(2)         // the green that node useds for strings
const greyPen = chalk.rgb(130,130,130)      // the grey node uses for 'undefined'
// const smallPen (maybe TODO some day) \u{1D5BA} is the code for small a

// compute once for efficiency
const goldstar     = starPen('★')
const redstar      = xPen('☆')
const greencheck   = checkPen('✔︎')
const redx         = xPen('✗')
const inapplicable = '⊘'     
const idunno       = '❓'  // the emoji itself is red
const preemiex     = xPen('⁉︎') 

/////////////////////////////////////////////////////////////////////////
// Utilities
//


// Just list the keys in an LC.  This is more useful as an LC extension.
LogicConcept.prototype.showkeys = function() { 
  let keys = this.getAttributeKeys()
  keys.forEach( key => { 
    console.log(`${stringPen(key.replace(/^_type_/,''))}:`+
                ` ${attributePen(format(this.getAttribute(key)))}`)
  })
}

////////////////////////////////////////////////////////
// Lode custom LC formatter
//
// Options (booleans)
//
// The idea here is that we pass an options object to the various formatting
// routines that is of the form { showP1, ... , showPn } where all of the
// showPi's are assigned 'true'.  Thus, by just listing what you want to show
// you can customize the output in a succinct manner.
//
// show LC attributes
const showAttributes =  true
// show Declares
const showDeclares =  true
// show red subscripts for declaration contexts
const showContexts = true
// show formulas
const showRules = true
// show formulas
const showConsiders = true
// show partial instantiations
const showPartials = true
// show instantiations of formulas in the library
const showInstantiations = true
// show Bodies of ForSome declarations
const showBodies = true
// number the children of the LC being shown
const showNumbers = true
// show the proper names of symbols
const showProperNames = true
// show symbols with ProperNames in a different color
const showSimpleProperNames = true
// show just the last child of the document
const showUserOnly = true
// show user theorems as formulas
const showUserRules = true
// show user theorems (not the Rule copy)
const showUserThms = true
// show instantiations of user theorems
const showUserInstantiations = true
// show validation icons
const showValidation = true

// useful sets of options
//
// show all report option
const all = { showDeclares, showAttributes , showBodies, showContexts,
              showRules , showUserThms , showPartials , showConsiders ,
              showInstantiations , showNumbers , showProperNames ,
              showUserRules , showUserInstantiations , showValidation
            }                     
// most report options
const most = { showDeclares, showAttributes , showBodies, showContexts,
              showRules , showUserThms , showConsiders ,
              showInstantiations , showNumbers , showProperNames ,
              showUserRules , showUserInstantiations , showValidation
            }                     
// simple report option
const show = { showDeclares, showAttributes , showBodies, showContexts,
               showRules , showUserThms , showPartials,
               showInstantiations , showProperNames , showConsiders ,
               showUserRules , showUserInstantiations , showValidation 
             }
// detailed report option
const detailed = {  showDeclares, showRules , showPartials, showInstantiations ,
                    showNumbers , showBodies, showProperNames , showUserRules ,
                    showUserThms , showValidation
                 }
// moderate report option
const moderate = { showInstantiations, showNumbers, showSimpleProperNames, showRules,
  showUserThms , showValidation } 

// clean report option
const allclean = { showInstantiations, showNumbers, showProperNames, 
                   showUserThms , showValidation } 
// clean report option
const clean = { showInstantiations, showNumbers, showSimpleProperNames , showUserThms ,
                showValidation } 
// user report option
const user = { showNumbers, showUserThms , showSimpleProperNames , showValidation }
// old default report option
const nice = { showDeclares, showRules , showSimpleProperNames , showUserThms ,
   showValidation }
const defaultOptions = { showSimpleProperNames , showUserThms , showValidation }


// Syntactic sugar for the formatter
const metavariable = 'LDE MV'
const instantiation = 'LDE CI'
const EFA = 'LDE EFA'
const formula = 'Formula'
const constant = 'constant'
const hint = 'BIH'
const scoping = 'scope errors'
const implicit = 'implicitly declares'
const valid = 'valid'
const invalid = 'invalid'
const context = 'context'
const declare = 'Declare'
const ProperName = 'ProperName'
const validation = 'validation result'
const validations = 'validation results'
const id = '_id'
const lurchNotation = 'lurchNotation'

// custom formatter
const formatter = ( options=defaultOptions ) => {
  return (L, S, attr) => {
    let ans = ''
    
    // optionally hide user Theorems or userRules
    if ((L.isA('Theorem') && !options.showUserThms) ||
        (L.userRule && !options.showUserRules))  { // do nothing
    } else if ((L.isA('Rule') && !options.showRules) ||
        (L.userRule && !options.showUserRules))  { // do nothing
      // hint markers
    } else if (L.isA(hint) || (L instanceof LurchSymbol && L.text()==='<<')) {  
      ans += hintPen(S)
    // metavariables        
    } else if (L.isA(metavariable)) {
      ans += metavariablePen(S)        
    // the LDE EFA constant symbols
    } else if (L instanceof LurchSymbol && L.text()===EFA) {
      ans += (L.constant) ? constantPen('𝜆') : defaultPen('𝜆')
    // the contradiction symbol (to avoid parser conflict with f:A→B)
  } else if (L instanceof LurchSymbol && L.text()==='contradiction') {
    ans += (L.constant) ? constantPen('→←') : defaultPen('→←')  
    // comments just display their string (second arg) with the comment pen 
    } else if (L.isAComment()) {
      ans += commentPen(L.child(1))
    // proper names for constants with body and bound symbols 
    } else if (options.showProperNames && L.hasAttribute(ProperName)) {
      const propname = L.getAttribute(ProperName)
      // we put quotes around the properName if it contains whitespace
      ans += (L.constant)
              ?declaredPen((/\s/g.test(propname))?`'${propname}'`:propname) 
              :attributePen((/\s/g.test(propname))?`'${propname}'`:propname) 
    // proper names color but not text for constants with body but not bound 
    } else if (options.showSimpleProperNames && L.hasAttribute(ProperName)) {
      ans += (L.constant)
            ?declaredPen(S)
            :attributePen(S)
    // constants
    } else if (L.constant) {
      ans += constantPen(S)
    // declaration prefixes
    } else if (L instanceof Declaration) {
      const label = L.isA('Declare') ? decPen('Declare') : 
                    L.isA('given')   ? decPen('Let')     : decPen('ForSome')
      ans += (options.showDeclares || !L.isA('Declare')) 
             ? (L.isA('given')) 
                 ? `:${label}${S.substring(1).replace(/\s*,\s*]$/,']')}` 
                 : `${label}${S.replace(/\s*,\s*]$/,']')}` 
             : ''
    // Declaration body copies
    } else if (L.bodyOf) {
      ans += (options.showBodies) ? instantiationPen(S) : ''
    // instantiations  
    } else if (L.hasAncestorSatisfying( x => x.isA(instantiation) )) {
      ans += (options.showInstantiations) ? instantiationPen(S) : ''
    // Considers
    } else if (L.hasAncestorSatisfying( x => x.isA('Consider') )) {
      ans += (options.showConsiders) ? instantiationPen(S) : ''
    // everything else  
    } else {
      ans += defaultPen(S)
    }
    // show contexts    
    if (options.showContexts) {
      if (L.hasAttribute(context)) {
        const symblist = L.getAttribute(context)
        if (symblist.length > 0) {
          ans += attributePen('.')+
                 symblist.map(x=>contextPen(x)).join(attributePen(','))
        } 
      }
    }
    // show attributes
    if (options.showAttributes) {
      // skip highlighted attributes - first the types
      const highlighted=[ metavariable, constant, instantiation, hint, valid, 
            invalid, declare, formula ].map( s => '_type_'+s )
      // then non-types
      highlighted.push(scoping,implicit,context,ProperName,validation,validations,id,lurchNotation)
      let keys=attr.filter( a => !highlighted.includes(a) )
      // format what's left
      if (keys.length>0) {
        // open attribute bracket
        ans += attributeKeyPen('❲')
        keys.forEach( (a,k) => {
          // separate keys with commas
          ans += (k>0) ? attributePen(',') : ''
          // format types or true values just with their key
          ans += (a.startsWith('_type_')) ?
                  attributeKeyPen(a.replace(/^_type_/,'')) :
                  (L[a]===true) ? attributeKeyPen(a) :
                  attributeKeyPen(a)+
                  attributePen('='+JSON.stringify(L.getAttribute(a)))
        })
        ans+=attributeKeyPen('❳')
      }
      // add a faux-attribute for .consider's
      ans += (L.consider) ? attributeKeyPen(`❲consider❳`) : ''
    }
    // show validation except for hidden ForSome bodies
    if (options.showValidation && ans.length>0 ) {
      // TODO: adding the switchover to the new validation storage
      if (L.results("BIH")) 
        ans += (L.results("BIH").result==="valid")?goldstar:redstar
      // CAS validation marker
      if (L.results("CAS")) 
        ans += (L.results("CAS").result==="valid")?checkPen('#'):xPen('#')
      // Arithmetic validation marker
      if (L.results("arithmetic")) 
        ans += (L.results("arithmetic").result==="valid")?checkPen('#'):
          (L.results("arithmetic").result==="invalid")?xPen('#'):xPen(inapplicable)
      // TODO: remove old style validation
      if (Validation.result(L) && Validation.result(L).result==='valid') {
        // a valid BIH has to be propositionally valid, so a green check
        // isn't necessary when there's a gold star, but we now treat them as
        // independent since so the user sees both kinds of feedback.
        ans += greencheck
        // Propositionally invalid ones. Add a red x even if it's a BIH  
      } else if ((Validation.result(L) && Validation.result(L).result!=='valid')) {
        ans += (Validation.result(L).reason==='preemie') ? preemiex : redx
      }
    }
    // mark redeclared symbols
    if (L instanceof LurchSymbol && L.parent() instanceof Declaration &&
        L.parent().symbols().includes(L) &&
        L.parent().hasAttribute('scope errors') &&
        L.parent().getAttribute('scope errors').redeclared &&
        L.parent().getAttribute('scope errors').redeclared.includes(L.text())) {
       ans+=redx    
    }   
    return ans
  }  
}

// Nested arrays of LCs come up often in Lode (e.g. X.children()) so we want to
// be able to syntax highlight them. Sometimes they may be mixed in with Sets
// and elementary values. This identifies them for formatting.
//
// TODO: this is no longer needed.  Consider deleting it.
const isNestedLCs = A => {
  return ((A instanceof LogicConcept) || (typeof A === 'string') ||
          (typeof A === 'boolean') || (typeof A === 'number') ||
          (A instanceof Array) && (A.every(isNestedLCs)) ||
          (A instanceof Set) && ([...A].every(isNestedLCs))
         )
}

// Apply the custom formatter to nested arrays and sets containing LCs. Indent
// and number lines as needed.  Note that for Arrays or Sets we usually are
// debugging something, so we show everything.  Similarly, we usually want to
// show everything when not showing an entire document (like just one rule or
// instantiation).  We check that using indentlevel.
const format = (x,options,indentlevel=0) => {  
  if (x instanceof LogicConcept) {
    // if it's not a document, show everything
    if (indentlevel==0 && !x.isA('document') ) options=all
    return defaultPen(indent(
      x.toPutdown(formatter(options), 
        text => /\n/.test( text )         || 
                /^[ \t"]*$/.test( text )  ||
                erase(text).length > 120  
      ),indentlevel))
  } else if (typeof x === 'string') { 
    return indent(stringPen(x),indentlevel)
  } else if (typeof x === 'boolean') { 
    return indent(itemPen(x),indentlevel)
  } else if (typeof x === 'number') { 
    return indent(constantPen(x),indentlevel)
  } else if (x === undefined) { 
    return indent(greyPen('undefined'),indentlevel)  
  } else if (x instanceof Array) { 
    // arrays of pairs of booleans and strings  
    if (x.length===2 && (typeof x[1] === 'boolean' || typeof x[1] === 'string')) {
      return indent(`[${x.map(y=>format(y,all,1)).join(',')} ]`,1)
    // arrays of integers
    } else if (x.every(  t => Number.isInteger(t) )) {
      return indent(`[${x.map(y=>format(y,all,1)).join(',')} ]`,1) 
    // all other arrays   
    } else {
      return indent(`[\n${x.map(y=>format(y,all,indentlevel+1))
                    .join(',\n')}\n]`,indentlevel)
    }
  } else if (x instanceof Set) { 
    if (x.length===2 && (typeof x[1] === 'boolean' || typeof x[1] === 'string')) {
      return indent(`[${[...x].map(y=>format(y,all,1)).join(',')} ]`,1)
    } else {
      return indent(`[\n${[...x].map(y=>format(y,all,indentlevel+1))
                    .join(',\n')}\n]`, indentlevel) 
    }
  } else {
    return util.inspect( x, 
      {
        customInspect: false,
        showHidden: false,
        depth: Depth,
        colors: true
      })
  }
}

///////////////////////////////////////////////////////////////////////////
//
//  Reporting
//

// generate various reports
LogicConcept.prototype.report = function ( options ) {
  // default report
  options = options || defaultOptions
  
  if (options.showUserOnly) {
   console.log(defaultPen(this.lastChild().toPutdown(formatter(options), 
      text => /\n/.test( text ) || erase(text).length > 1 )))
  } else if (options.showNumbers) {
    
    let ans = defaultPen('  {\n')
    
    let linenum = ''
    this.children().forEach( c => {
      // hide Formulas, Instantiations, Partials, and Bodies unless they ask for them
      if ( (!options.showRules && c.isA('Rule')) ||
           (!options.showPartials && c.isA('Part')) ||
           (!options.showInstantiations && c.isA('Inst')) ||
           (!options.showBodies && c.bodyOf) ||
           (!options.showDeclares && c.isA('Declare')) ||
           (!options.showConsiders && c.isA('Consider')) 
         ) return
      linenum = lineNum(c.indexInParent(),4,'  ')
      // linenum = `${c.indexInParent()}`
      // linenum += tab(4-linenum.length)
      linenum = (!c.isA(instantiation) &&!c.isA('Consider')) 
                ? linenumPen(linenum) 
                : instantiationPen(linenum)
      ans += linenum+format(c,options).replace(/\n/g,'\n    ')+'\n'
    })

    ans += defaultPen('  }')
    ans +=  (!Validation.result(this)) 
            ? '' 
            : (Validation.result(this).result==='valid') 
              ? greencheck 
              : redx
            
    console.log(ans)
  
  } else {
    console.log(defaultPen(this.toPutdown(formatter(options))))
  }
}

// Number arrays or sets of LCs
const numberedIterable  = function (options=all) {
    let ans = '  [\n'
    let linenum = ''
    this.forEach( (c,k) => {
      linenum = lineNum(k)
      // linenum = `${k}`
      // linenum += tab(4-linenum.length)
      linenum = (c instanceof LogicConcept && !c.isA(instantiation))
                  ? linenumPen(linenum) 
                  : instantiationPen(linenum)
      ans += linenum+format(c,options).replace(/\n/g,'\n    ')+'\n'
    })
    ans += '  ]'      
    console.log(ans)
}
Array.prototype.numbered = numberedIterable
Set.prototype.numbered = numberedIterable

///////////////////////////////////////////////////////////////////////////////
// Investigate
//
// Investigate an LC in a document. The optional argument 'verbose' will 
// use more English, but the default is more succint.
const _investigate = function ( suspect , options ) {
  // a utility
  const display = x => `\n  ${format(x,detailed).replace(/\n/g,'\n  ')}`
  
  if (options === 'verbose' ) {
    let ans = ''
    // investigate an instantiation
    if (suspect.isA('Inst')) {
      const n = suspect.creators.length
      ans += `The instantiation ${display(suspect)}` +
             `is an instantiation of the rule ${display(suspect.rule)}`
      if (n) 
        ans += `and motivated by the expression${(n>1)?'s':''}` +
               suspect.creators.map(display).join('')
    // for now, assume it's an expression in the user's document            
    } else {
      // get the instantiations that mention it
      const root = suspect.root()
      const mentions = root.mentions(suspect)
      if (!mentions.length) {
        ans += `The expression ${display(suspect)}`
        ans += `does not appear in any instantiations.`
      } else {
        console.log(`There are ${mentions.length} places where ${display(suspect)}`+
                    ` is mentioned.\n`)
      
        ans += `It appears in ${display(mentions[0])}` + 
               `\n   which is an instantiation of the rule ${display(mentions[0].rule)}`
        let n = mentions[0].creators.length 
        if (n) ans += `\n   motivated by the expression${(n>1)?'s':''}` +
                      mentions[0].creators.map(display).join('')
  
        mentions.slice(1).forEach( inst => {
          ans += `\nIt also appears in ${display(inst)}` + 
                 `\n   which is an instantiation of the rule ${display(inst.rule)}`
          let n = inst.creators.length 
          if (n) ans += `\n   motivated by the expression${(n>1)?'s':''}` +
                        inst.creators.map(display).join('')
          })
      }
    }
    return ans

  // otherwise, give the succint report
  } else {
    const arrows = '\n'+tab(15)+hintPen('↓ ↓ ↓')
    const hrule = tab(40,'_')
    let ans = ''
    // investigate an instantiation
    if (suspect.isA('Inst')) {
      ans += hrule+'\n'
      // first list the creators with BIH pen
      if (suspect.creators.length>0) {
        let arrow = false
        suspect.creators.forEach( c => {
          if (c !== suspect) {
            arrow = true       //⇩↓⇣
            ans += display(c)
          }
        })
        if ( arrow ) ans += arrows 
      }
      ans += display(suspect.rule)
      ans += arrows 
      ans += display(suspect)
    // for now, assume it's an expression in the user's document            
    } else {
      // get the instantiations that mention it
      const root = suspect.root()
      const mentions = root.mentions(suspect)
      if (!mentions.length) {
        ans += `The expression ${display(suspect)}\ndoes not appear in any instantiations.`
      } else {
        console.log(`The statement ${display(suspect)}`+
                    `\nappears in the following ${mentions.length} places.`)
        mentions.forEach( inst => {
          ans += _investigate(inst)+'\n'
        })
      }
    }
    return ans
  }
}

// The actual function prints the string so it syntax highlights
LogicConcept.prototype.investigate = function(option) {
  console.log(_investigate(this,option))
}

///////////////////////////////////////////////////////////////////////////////
// Stats
//
// For each top level Rules in a document, report the number of Parts 
// and Insts it has.
const _stats = function (doc,options) {
  // get only top level rules
  const kids = doc.children()
  const Rules = kids.filter( x => x.isA('Rule'))
  // get the table data
  let table = Rules.map( (r,k) => {
    const a = r.address()[0]
    const b = (k===Rules.length-1) ? kids.length : Rules[k+1].address()[0]
    const parts = kids.slice(a,b).filter(x=>x.isA('Part')).length
    const insts = kids.slice(a,b).filter(x=>x.isA('Inst')).length
    return { Address : a, Parts: parts, Insts: insts }
  })
  // return the table of data 
  return table
}

// The actual function prints the string so it syntax highlights
LogicConcept.prototype.stats = function(options) {
  console.table(_stats(this,options))
}

// Utilities related to the .stats table
LogicConcept.prototype.Rule = function(n) {
  return this.children().filter( x => x.isA('Rule'))[n]
}

// Because this is used so often
Object.defineProperty(LogicConcept.prototype, 'all', {
  get: function() {
    this.report(all)
  }
})

// Because this is used so often
Object.defineProperty(LogicConcept.prototype, 'clean', {
  get: function() {
    this.report(clean)
  }
})

// Because this is used so often
Object.defineProperty(LogicConcept.prototype, 'allclean', {
  get: function() {
    this.report(allclean)
  }
})

// Because this is used so often
Object.defineProperty(LogicConcept.prototype, 'most', {
  get: function() {
    this.report(most)
  }
})

// Because this is used so often
Object.defineProperty(LogicConcept.prototype, 'nice', {
  get: function() {
    this.report(nice)
  }
})

export default {
  
  // formatting utiltiies
  formatter, format, isNestedLCs, tab, indent, erase, timer, chalk,
  
  // special symbols
  goldstar, greencheck, redx, idunno, stringPen,
  
  // Pens
  defaultPen , metavariablePen , constantPen , instantiationPen, hintPen, 
  attributePen , attributeKeyPen , checkPen , starPen , xPen , contextPen , 
  decPen , commentPen , headingPen , docPen , linenumPen , itemPen ,
  
  // report definitions
  all, most, show, detailed , moderate, allclean, clean , user , nice ,
  
  // report options
  showAttributes , showContexts , showRules , showInstantiations , 
  showNumbers , showProperNames , showUserRules , showUserInstantiations ,
  showValidation

}

/////////////////////////////////////////////