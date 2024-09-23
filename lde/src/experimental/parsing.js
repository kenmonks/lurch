/**
 * Parse a string to convert it to an LC and process Shorthands that appear in
 * an LC.
 *
 * @module Parsing
 */
//////////////////////////////////////////////////////////////////////////////
//
//                       Parsers and Parsing Utilties 
//                       for converting strings to LCs
//                       and vice versa
//

//////////////////////////////////////////////////////////////////////////////
//
// Imports
//
import { Environment } from '../environment.js'
import { Symbol as LurchSymbol } from '../symbol.js'
import { Application } from '../application.js'
import Algebrite from '../../dependencies/algebrite.js'
const compute = Algebrite.run
import './extensions.js'

/**
 * Make both a normal and tracing peggy parser from the given string and capture
 * and customize the error formatting, then return both parsers and the original
 * parser (which throws errors but doesn't trace) in an array.
 * @function
 * @param {string} parserstr - the peggy parser definition string  
 * @returns {function[]} - the normal, tracing, and raw parsers
 */
const makeParser = parserstr => {
  
  const opts = { cache:true }
  const traceopts = { ...opts , trace:true }
  const rawparser = peggy.generate(parserstr,opts)
  const rawtraceparser = peggy.generate(parserstr,traceopts)
  
  const parser = (s,opts) => {
    try { 
      return rawparser.parse(s,opts)
    } catch(e) {
      if (typeof e.format === 'function') {
        console.log(e.format([{
          grammarSource:parserstr,
          text:s
        }]))
      } else {    
        console.log(e.toString())
      }
      return undefined
    }
  }
  
  // No need for this in a browser
  const traceparser = (typeof global !== 'undefined' ) ?
    s => {
      // make the backtracer
      
      const tracer = new Tracer(s,
        { showTrace : true,
          showFullPath : false,
          hiddenPaths : [ "__" , "_" ]
        }
      )
  
      // show backtracing whether it's an error or not
      try { 
        const ans = rawtraceparser.parse(s,{ tracer:tracer })
        write(tracer.getBacktraceString())
        return ans
      } catch(e) {
        write(tracer.getBacktraceString())
        return undefined
      }
    } : undefined
  
  return { parse: parser, trace: traceparser, raw:  rawparser.parse }
}

// Take a text file that has n lines and parse it one line at a time, optionally
// showing how each line parses, and reporting on the number of lines that
// failed to parse.  The main use is to take a file with LurchNotation lines and
// convert it to either putdown or latex, and print the results as a test of the
// parser.
const parseLines = (parser,verbose=true,name='LurchParserTests',opts) => {
  let ans = []
  const lines = 
    loadStr(name,'./parsers/','lurch').split('\n')
       .map(line => line.trim())
       .filter(line => line.length > 0 && line.slice(0,2)!=='//')
  // console.log(`File contains ${lines.length} parseable lines`)
  let pass = 0, fail = 0
  let report = []
  lines.forEach( l => {
    try { 
      ans.push(parser(l,opts))
      pass++
      if (verbose) write(`${Pens.itemPen(l)}\n → ${Pens.stringPen(parser(l,opts))}\n`)
    } catch {
      report.push(l)
      fail++
    }
  })
  report.forEach(l=>console.log(`Could not parse ${Pens.contextPen(l)}`))

  console.log(`Parsed ${pass} lines successfully, ${fail} failed`)
  return (verbose) ? ans : undefined
}

// This was a prototype made quickly at the AIM workshop We keep it for now but
// improve on it below.
export const lc2algebrite = e => {
  if (e instanceof Application && 
      e.numChildren()==3 &&
      e.child(0) instanceof LurchSymbol &&
      e.child(0).text()==='is' && 
      e.child(2) instanceof LurchSymbol &&
      e.child(2).text()==='prime' &&
      e.child(1) instanceof LurchSymbol &&
      e.child(1).text().length > 0 &&
      Number.isInteger(Number(e.child(1).text())) ) {
    const n = Number(e.child(1).text())  
    return `isprime(${n})`
  } else {  
    return '0'
  }
}

///////////////////////////////////////////////////////////////////
//  Arithmetic
//

// For now, the only three relations we allow
const NumericRelns = ['=','<','≤']

// utilities
// check if this LC is non-negative
const isNonnegative = e => {
  return isNumeric(e) && (compute(`0<=${numericToCAS(e)}`)==='1')
}
// check if this LC is non-zero
const isNonzero = e => {
  return isNumeric(e) && (compute(`0==${numericToCAS(e)}`)==='0')
}
// check if this LC isRational, but mathematically reduces to an integer
const isReducedInteger = e => {
  return isNumeric(e) && (compute(`denominator(${numericToCAS(e)})`)==='1')
}

// Natural Numbers
//
// Check if this LC represents a natural constant
const isNaturalNumber = n => n.matches('[1-9][0-9]*$|^0')
// Check if this expression is a natural number expression
const isNatural = e => {
  // base case - natural numbers are always natural expressions
  if (isNaturalNumber(e)) return true
  // recursion - if it is not an application, we're done
  if  ( ! (e instanceof Application) ) return false
  // it is an Application so get the op
  const op = e.child(0)
  const nargs = e.numChildren()
  // check the binary ops
  if (['\\+','⋅','\\^'].some(x=>op.matches(x)) && nargs == 3) 
    return e.children().slice(1).every(isNatural)
  // check unary ops
  if (op.matches('!') && nargs == 2) 
    return isNatural(e.child(1))
  // otherwise it's not a supported operator
  return false
}
// Check if this expression can be evaluated by natural number arithmetic
const isNaturalArithmetic = e => {
  // it must be an application with three children...
  return e instanceof Application && e.numChildren() === 3 &&
    // and it's operator must be one of the three...
    NumericRelns.some( reln => e.child(0).matches(reln)) &&
    // .. and the rest of the arguments are natural expressions
    e.children().slice(1).every(c=>isNatural(c))
}

// Integers
//
// Since negation is an operator, the constants are the same as for
// Natural Numbers

// Check if this expression is an integer expression
const isInteger = e => {
  // base case - natural numbers are always integer expressions
  if (isNaturalNumber(e)) return true
  // recursion - if it is not an application, we're done
  if  ( ! (e instanceof Application) ) return false
  // it is an Application so get the op
  const op = e.child(0)
  // and the arity
  const nargs = e.numChildren()
  // check the easy binary ops
  if (['\\+','⋅'].some(x=>op.matches(x)) && nargs == 3 &&
      e.children().slice(1).every(isInteger)) return true
  // for ^ check that the second arg is non-negative
  if (op.matches('\\^') && nargs == 3 &&
      e.children().slice(1).every(isInteger)) {
    return isNonnegative(e.child(2))
  }
  // check unary ops
  // negation can have any argument
  if (op.matches('-') && nargs == 2 ) return isInteger(e.child(1)) 
  // factorial has to have nonnegative argument
  if (op.matches('!') && nargs == 2 ) 
    return isInteger(e.child(1)) && isNonnegative(e.child(1))  
  // otherwise it's not a supported operator
  return false
}
// Check if this expression can be evaluated by natural number arithmetic
const isIntegerArithmetic = e => {
  // it must be an application with three children...
  return e instanceof Application && e.numChildren() === 3 &&
    // and it's operator must be one of the three...
    NumericRelns.some( reln => e.child(0).matches(reln)) &&
    // .. and the rest of the arguments are natural expressions
    e.children().slice(1).every(c=>isInteger(c))
}

// Rational
//
// Since negation and division are operators, the constants are the same as for
// Natural Numbers

// Check if this expression is an integer expression
const isRational = e => {
  // base case - natural numbers are always integer expressions
  if (isNaturalNumber(e)) return true
  // recursion - if it is not an application, we're done
  if  ( ! (e instanceof Application) ) return false
  // it is an Application so get the op
  const op = e.child(0)
  // and the arity
  const nargs = e.numChildren()
  // check the easy binary ops
  if (['\\+','⋅'].some(x=>op.matches(x)) && nargs == 3 &&
      e.children().slice(1).every(isRational)) return true
  // for ^ check that the second arg is an integer expression (no roots)
  // Note: we don't allow rational expressions that simplify to an integer
  if (op.matches('\\^') && nargs == 3 &&
      e.children().slice(1).every(isRational)) {
    return isReducedInteger(e.child(2)) // this should allow rational that is integer... TODO
  }
  // check unary ops
  // for / check that the second arg is nonzero
  if (op.matches('/') && nargs == 2 &&
      isRational(e.child(1))) {
    return isNonzero(e.child(1))
  }
  // negation can have any argument
  if (op.matches('-') && nargs == 2 ) return isRational(e.child(1)) 
  // factorial has to have nonnegative integer argument
  if (op.matches('!') && nargs == 2 ) 
    return isInteger(e.child(1)) && isNonnegative(e.child(1))  
  // otherwise it's not a supported operator
  return false
}
// Check if this expression can be evaluated by natural number arithmetic
const isRationalArithmetic = e => {
  // it must be an application with three children...
  return e instanceof Application && e.numChildren() === 3 &&
    // and it's operator must be one of the three...
    NumericRelns.some( reln => e.child(0).matches(reln)) &&
    // .. and the rest of the arguments are natural expressions
    e.children().slice(1).every(c=>isRational(c))
}

// Since naturals and integers are special cases of rationals, they are all numerics
const isNumeric = isRational

// Check if this LC represents an equality (=) or inequality (< , ≤) of numeric
// expressions in the given ring. This allows us to specify the ring independently.
export const isArithmetic = {
  ℕ: isNaturalArithmetic,
  ℤ: isIntegerArithmetic,
  ℚ: isRationalArithmetic
}
// convert an Arithmetic statement in a ring to a CAS input string
// this assumes you have already checked that the Arithmetic is in the appropriate ring
export const arithmeticToCAS = e => {
  const ans = numericToCAS(e.child(1))+e.child(0).text()+numericToCAS(e.child(2))
  return ans.replace(/=/g,'==')
            .replace(/≤/g,'<=')
}

// convert an LC that isNumeric into a CAS input string
const numericToCAS = e => {
  // just return if it isn't a Numeric Expression
  if (!isNumeric(e)) return
  // syntactic sugar
  const convert = numericToCAS
  // if it's a number, return its text
  if (isNaturalNumber(e)) return e.text()
  // It isn't a number so it must be compound
  const kids = e.children()
  // binary infix ops (all for now)
  if (kids.length===3) {
    return `(${convert(kids[1])}${kids[0].text()}${convert(kids[2])})`.replace(/⋅/g,'*')
  // unary on the right
  } else if (kids[0].matches('!')) {
    return `(${convert(kids[1])}!)`
  // unary on the left
  // division is unary reciprocal
  } else if (kids[0].matches('/')) {
    return `(1/${convert(kids[1])})`
  // negation is what's left  
  } else {
    return `(${kids[0].text()}${convert(kids[1])})`
  }
}

/**
 *  ## Process Shorthands 
 *
 * In order to make it convenient to enter large documents in putdown notation,
 * it is convenient to use fromPutdown to enter some reserved content in the
 * document that is preprocessed before evaluating the document.
 *
 * The following are what we have for Shorthands. More might be added later. 
 *
 *   * Scan for occurrences of the symbol `<comma` and mark its previous
 *     sibling's `.continued` attribute true. Then delete the `<comma` symbol.  
 *
 *   * Scan for occurrences of the symbol `given>` and mark its next sibling as
 *     a `given`.  If the next sibling has attribute `.continued` true then do
 *     the same for it's next sibling and iterate until a sibling is found that
 *     does not have that propoerty (or you run out of next siblings) Then
 *     delete the `given>` symbol.  
 *
 *   * Scan a document looking for any of the following Shorthands and convert
 *     the next (>) or previous (<) sibling to the corresponding type in the asA
 *     column.
 *
 *       | Shorthand   |  mark asA |
 *       | ------------|-----------|
 *       | 'BIH>'      | 'BIH'     |
 *       | 'declare>'  | 'Declare' |
 *       | 'rule>'     | 'Rule'    |
 *       | 'cases>'    | 'Cases'   |
 *       | 'subs>'     | 'Subs'    |
 *       | 'thm>'      | 'Theorem' |
 *       | '<thm'      | 'Theorem' |
 *       | 'proof>'    | 'Proof'   |
 *
 *   * Scan for occurrences of the symbol `rules>`. Its next sibling should be
 *     an environment containing given Environments. Mark each child of the next
 *     sibling as a `Rule` and delete both the `rules>` symbol and the outer
 *     environment containing the newly marked `Rules.  This allows us to use an
 *     Environment to mark a lot of consecutive `Rules` all at once and then
 *     ignore the wrapper Environment. For libraries this is cleaner than trying
 *     to mark every Rule with `rule>` individually.  
 *
 *   * Scan for occurrences of the symbol `λ` (or  `@` for backwards
 *     compatibility) and replace that with the symbol "LDE EFA" (which then
 *     will still print as '𝜆' but it's what is needed under the hood).
 *
 *   * Scan for occurrences of the symbol `then`. They are intended to be a
 *     shorthand way to enter an If-then environment inline without using a
 *     shell. The 'then' should be between given siblings and one or more claim
 *     siblings in a continuation chain determined by commas. For example, `If
 *     A,B,C then D,E,F` will then be converted to the environment `{ :A :B :C D
 *     E F }`.  These cannot be nested.  This is useful for both inserting
 *     If-then environments inline, and also for using them as the body of a
 *     declaration.  Thus, for example you can say e.g. 
 *     `If A,B,C then D,E,F for some c` or 
 *     `Let x be such that if A,B,C then D,E,F`
 *     If you just want a conjunction you can also do `D,E,F for some c` or
 *     `Let x be such that D,E,F `
 *
 * The Rule will then be replaced by the expanded version and the `≡` symbols
 *     removed, following the cyclic TFAE style of implications.  For example,
 *     if the Rule has the form `:{ a ≡ b c ≡ d }` then it will be replaced by
 *     `:{ {:a {b c}} {:{b c} d } {:d a} }`.
 *
 *   * Scan for occurrences of the symbol `≡`. They are intended to be a
 *     shorthand way to enter IFF rules (equivalences).  The '≡' should be a
 *     child of a Rule environment, and should not be the first or last child.
 *     The Rule will then be replaced by the expanded version and the `≡`
 *     symbols removed, following the cyclic TFAE style of implications.  For
 *     example, if the Rule has the form `:{ a ≡ b c ≡ d }` then it will be
 *     replaced by `:{ {:a {b c}} {:{b c} d } {:d a} }`.
 *
 *   * Scan for occurrences of the symbol `➤`. If found it should be the first
 *     child of an Application whose second child is a symbol whose text is the
 *     text of the comment.  Mark that Application with `.ignore=true` so it is
 *     ignored propositionally.
 *
 *   * Scan for occurrences of the symbol `by` and mark its previous sibling's
 *     `.by` attribute with the text of its next sibling, which must be a
 *     LurchSymbol. Then delete both the `by` and it's next sibling.  Currently
 *     used by the `Cases` tool, the Substitution rule, the CAS tool, and the
 *     Arithmetic and Algebra tools.
 *
 *   * Scan for occurrences of the symbol `✔︎`, `✗`, and `⁉︎` and mark its
 *     previous sibling with .expectedResult 'valid', 'indeterminate', and
 *     'invalid' respectively.
 *
 *   * Scan a document looking for the symbol `<<`, which we call a 'marker'.
 *     For every marker, 
 *     - if the preceding sibling is an environment, attribute it as a `BIH`. 
 *
 *     - if the preceding sibling is a declaration, attribute it as a `Declare`, 
 *
 *     - in either case, finally, delete the marker.
 *
 * Naturally we have to run this FIRST before anything else.  These changes are
 * made in-place - they don't return a copy of the document.
 *
 * This does no error checking, so << has to be an outermost expression with a
 * previous sibling and λ has to appear in some sensible location and so on.
 *
 * @function
 * @param {Environment} L - the document
 * @returns {LogicConcept} - the modified document
 */
export const processShorthands = L => {

  // for each symbol named symb, do f, i.e. execute f(symb)
  const processSymbol = ( symb , f ) =>  {
    L.descendantsSatisfying( x => (x instanceof LurchSymbol) && x.text()===symb )
     .forEach( s => f(s) )
  }
  // make next sibling have a given type.  If the optional third argument is missing, do nothing further.  If flag is 'given' make the target a given.  If the flag is 'claim' make the target a claim.
  const makeNext =  (m,type,flag) => {
    const next = m.nextSibling()
    next.makeIntoA(type)
    if (flag === 'given') next.makeIntoA('given')
    if (flag === 'claim') next.unmakeIntoA('given')
    m.remove()
  }
  // make previous sibling have a given type
  const makePrevious =  (m,type) => {
    m.previousSibling().makeIntoA(type)
    m.remove()
  }

  // In addition to processing Symbols, we also want to sometimes react
  // to the presence of certain attributes.
  
  // Move ExpectedResult LC attributes to js attributes.  The reason to do this
  // is so we can use .lurch files created with the web UI as test files by
  // exporting them after validating (using the CMD+SHIFT+D option).  That has
  // to attribute the LC's with an LC attribute.  
  //
  // To use such a file as a test file we must validate it and compare the
  // ExpectedResult's with the actual results.  However, the process of
  // validation makes copies of some LC's, like the user-rules created for each
  // Theorem and the ForSome bodies.  
  //
  // But the LC copy method copies it's LC
  // attributes producing items marked with ExpectedResults that do not have any
  // result at all from validation. By moving the LC attribute to a js attribute
  // that fixes that problem because the LC copy routine does not copy js
  // attributes on the LC.
  L.descendantsSatisfying( x => x.hasAttribute('ExpectedResult'))
    .forEach( s => {
      s.ExpectedResult = s.getAttribute('ExpectedResult')
      s.clearAttributes('ExpectedResult')
    } ) 
  
  // attribute the previous sibling with .continued attribute whose value is true if
  // its next sibling is a `<comma` symbol.
  processSymbol( '<comma' ,  m => { 
    let LHS = m.previousSibling()
    // for testing purposes if the previous sibling is an 'expected result' marker
    // attribute its previous sibling instead
    if (['✔︎','✗','⁉︎','⊘'].some(x=>LHS.matches(x))) LHS = LHS.previousSibling()
    LHS.continued = true
    m.remove()  
    return 
  } )

  // make the next sibling into a Given, and if it has `.continued` equal to
  // true, do the same for its next sibling, and iterate until you reach a next
  // sibling that doesn't have that attribute or you run out of next siblings,
  // whichever comes first.  Then delete the 'given>' symbol.
  processSymbol( 'given>' ,  m => { 
    let next = m.nextSibling()
    while (next) { 
      next.makeIntoA('given')
      next = (next.continued) ? next.nextSibling() : undefined
    }
    m.remove()  
    return 
  } )
  
  // declare the type of the next or previous sibling 
  processSymbol( 'BIH>'          , m => makeNext(m,'BIH','claim') )
  processSymbol( 'declare>'      , m => makeNext(m,'Declare','given') )
  processSymbol( 'rule>'         , m => makeNext(m,'Rule','given') )  
  processSymbol( 'thm>'          , m => makeNext(m,'Theorem','claim') )  
  processSymbol( '<thm'          , m => makePrevious(m,'Theorem','claim') )  
  processSymbol( 'proof>'        , m => makeNext(m,'Proof','claim') )
  processSymbol( 'cases>'        , m => makeNext(m,'Cases','given') )  

  // Label a rule.  We imitate
  processSymbol( 'label>'         , m => {
    // if it isn't inside a Rule (or inside more than one) do nothing
    const rules = m.ancestorsSatisfying(x=>x.isA('Rule'))
    if (!rules.length==1) return
    const rule = rules[0]
    // it should have a next sibling from the parser, and it should be a
    // symbol whose text is the quoted string the user typed inside the
    // argument to the label command.
    const label = m.nextSibling().text().toLowerCase().replace(/\s+/g,'')
    // if the parent has no .labels attribute add one as an array of labels,
    // otherwise add this label to the rest.
    if (rule.labels) {
      // Convert to lower case and remove all whitespace before saving to give
      // users a little slack.
      if (!rule.labels.includes(label)) rule.labels.push(label)
    } else {
      rule.labels = [ label ]
    }
    m.parent().remove()
  })

  // Mark a rule as the substitution rule, and mark it's conclusion as a 
  // substitution EFA so that it can be instantiated by expressions marked
  // with .by='substitution'
  processSymbol( 'subs>'         , m => {
    m.nextSibling().conclusions().forEach( c => c.makeIntoA('Subs'))
    makeNext(m,'Subs','given')
  })  
  
  // Deprecated: This is the old version that was made at the AiM workshop to
  // accommodate the CAS rule.  But the CAS rule has been updated to the Algebra
  // Tool rule, so this is probably going to be deleted eventually.
  //
  // attribute the previous sibling with .by attribute whose value is the text
  // of the next sibling if it is a symbol, and the next sibling LC itself if it isn't.
  // processSymbol( 'by' ,  m => { 
  //   let LHS = m.previousSibling()
  //   // for testing purposes if the previous sibling is an 'expected result' marker
  //   // attribute its previous sibling instead
  //   if (['✔︎','✗','⁉︎','⊘'].some(x=>LHS.matches(x))) LHS = LHS.previousSibling()
  //   const RHS = m.nextSibling()
  //   // it should be a LurchSymbol or an Application
  //   if (RHS instanceof LurchSymbol) {
  //     if (RHS.text()==='CAS') {
  //       LHS.by = { CAS: lc2algebrite(LHS) }
  //       m.remove()
  //       RHS.remove()
  //     } else {
  //       LHS.by = RHS.text()
  //       m.remove()
  //       RHS.remove()
  //     }
  //   } else if (RHS instanceof Application ) {
  //     if (RHS.child(0) instanceof LurchSymbol && RHS.child(0).text()==='CAS') { 
  //       // TODO: handle the case where no arg is passed or it's not a symbol
  //       LHS.by = { CAS: RHS.child(1).text() }
  //       m.remove()
  //       RHS.remove()
  //     }
  //   }
  //   return 
  // } )
  
  // attribute the previous sibling with .by attribute whose value is the text
  // of the next sibling if it is a symbol, and the next sibling LC itself if it isn't.
  processSymbol( 'by' ,  m => { 
    let LHS = m.previousSibling()
    // if there is no previous sibling, do nothing
    if (!LHS) return
    // for testing purposes if the previous sibling is an 'expected result' marker
    // attribute its previous sibling instead
    if (['✔︎','✗','⁉︎','⊘'].some(x=>LHS.matches(x))) LHS = LHS.previousSibling()
    // if there is no previous sibling, do nothing
    if (!LHS) return
    const RHS = m.nextSibling()
    // if there is no next sibling, or it's not a symbol, do nothing
    if (!(RHS && RHS instanceof LurchSymbol) ) return
    LHS.by = RHS.text()
    m.remove()
    RHS.remove()
  } )
  
  // rules> - Mark each of the children of the next sibling (which should be an
  // environment) as a Rule, and delete both the shorthand and the environment. 
  processSymbol( 'rules>' , m => {
    const wrapper = m.nextSibling()
    wrapper.children().forEach( kid => {
      if (kid instanceof Environment) { 
        kid.makeIntoA('Rule') 
        kid.makeIntoA('given')
        // the rule has no creators
        kid.creators=[]
        // TODO: the following would be useful for web UI but not for 
        // Lode, since I've used claim environments in rules.
        // kid.children().forEach( premise => {
        //   if (premise instanceof Environment) {
        //     premise.makeIntoA('given') 
        //   }
        // }) 
      }
      wrapper.shiftChild()
      kid.insertBefore(wrapper) 
    } )
    wrapper.remove()
    m.remove()
  } )
  
  // simple replacements
  processSymbol( 'λ' , m => { 
    m.replaceWith(new LurchSymbol('LDE EFA'))
  } )  
  processSymbol( '@' , m => { 
    m.replaceWith(new LurchSymbol('LDE EFA'))
  } )
  
  // Expand equivalences
  processSymbol( '≡' ,  m => { 
    // find the parent environment, if there is none, then do nothing
    const parent = m.parent()
    if (!parent) return

    // a utility to identify equivalence separators
    const isSeparator = x => x instanceof LurchSymbol && x.text() === '≡'

    // get the children of the parent
    let inputArray = parent.children()
    // an array to hold the groups
    let groups = []
    
    // while there are separators, split the input array into groups
    let k = inputArray.findIndex( isSeparator )
    while ( k !== -1) {
      if (k==1) groups.push(inputArray[0])
      else groups.push(inputArray.slice(0,k))
      inputArray = inputArray.slice(k+1)
      k = inputArray.findIndex( isSeparator )      
    }
    // if there are no more separators, then push what's left
    if (inputArray.length === 1) groups.push(inputArray[0])
    else groups.push(inputArray)
  
    // for each group, if it is an array, create a new Environment containing
    // the group elements, otherwise just use the element itself.  Collect them
    // all into a results array.
    const results = []
    groups.forEach( group => {
      if (Array.isArray(group) ) {
        const newEnv = new Environment( ...group )
        results.push(newEnv)
      } else {
        results.push(group)
      }
    })

    // finally, replace the parent with a new environment containing all of the 
    // cyclic implications.
    const ans = new Environment()
    ans.copyAttributesFrom(parent)

    // put all of the pairs into the new environment except the last one
    results.slice(0,-1).forEach( ( result, i ) => { 
      let myEnv = new Environment( result.asA('given') , 
                                   results[i+1].copy().unmakeIntoA('given') ) 
      ans.pushChild(myEnv)
    } )
    // and complete the cycle with the last one
    ans.pushChild(new Environment( 
      results[results.length-1].asA('given'), 
              results[0].copy().unmakeIntoA('given') ) )
    
    // replace the parent with the new environment  
    parent.replaceWith(ans)
  } )

  // Expand equivalences
  processSymbol( 'then' ,  m => { 
    // make a new array to contain the relevant LHS and RHS siblings
    let sibs = []
    // get all of the consecutive previous given siblings and unshift them onto
    // the array
    let prev = m.previousSibling()
    while (prev && prev.isA('given')) { 
      sibs.unshift(prev)
      prev=prev.previousSibling()
    }
    // if there weren't any, just return without doing anything
    if (!sibs.length) return
    // now get the continuation-sequence of claims that follow it and push them
    // onto the array
    let next = m.nextSibling()
    // if there aren't any, just return without doing anything
    if (!next || next.isA('given')) return
    // otherwise get them all
    while (next && !next.isA('given')) { 
      sibs.push(next)
      next = (next.continued) ? next.nextSibling() : undefined
    }
    // put them all in an environment - this removes them from the document
    const env = new Environment(...sibs)
    // then replace the instance of `then` with the new environment (which does
    // not contain the `then`)
    m.replaceWith(env)
  } )

  // add the next sibling, if present, to the body of the previous declaration.
  // Note that this should not appear in the user's document if it is not after
  // a Let declaration whose body is empty (i.e., its last child is the symbol
  // "LDE empty") because the UI doesn't allow it to be constructed otherwise,
  // so we don't check for that.
  processSymbol( '<be' ,  m => { 
    let dec = m.previousSibling()
    const body = m.nextSibling()
    // if it doesn't have a next sibling, don't do anything.
    if (!body) return
    dec.popChild()
    dec.pushChild(body) // should remove body as the next sibling too
    m.remove()
    return 
  } )

  // Add the previous sibling, if present, to the body of the next declaration.
  // If the previous sibling is a continuation (the last in a comma separated
  // list of claims) then do this for the entire sequence. Note that if the
  // some> is preceded by an if-then sequence the if-then will be converted to
  // an environment first, so that the previous element will just be a single
  // LC.
  //
  // There are two possible cases to check for, depending if the declaration
  // already has an environment as a body or not (due to the `for some x,y in A`
  // shortcut). Note that this should not appear in the user's document if it is
  // not before a ForSome declaration whose body is either empty (i.e., its last
  // child is the symbol "LDE empty") or an environment containing one or more
  // `x∈A` expressions, because the UI doesn't allow it to be constructed
  // otherwise, so we don't check for that. 
  processSymbol( 'some>' ,  m => {
    // if it doesn't have a previous sibling, don't do anything.
    let prev = m.previousSibling()
    if (!prev) return
    // the UI can only construct some> if it's followed by a symbol
    const dec = m.nextSibling()
    // base case: if the body isn't an environment, and the previous sibling is not a continuation, just make it the body as expected
    if (!(dec.body() instanceof Environment) && 
        !prev.previousSibling()?.continued ) {
      dec.popChild() // remove the placeholder
      dec.pushChild(prev) // replace with the prev expression
    // otherwise
    } else { 
      // if the body isn't an environment, make it one
      if (!(dec.body() instanceof Environment)) {
        dec.popChild() // remove the placeholder
        dec.pushChild(new Environment()) 
      } 
      // then unshift the prev sequence onto it
      while (prev) {
        // write('prev is')
        // write(prev)
        dec.body().unshiftChild(prev)
        // write('new dec is')
        // write(dec)
        // write('new dec prev sibling is')
        // write(dec.previousSibling())
        // write('and it is')
        // write(dec.previousSibling()?.continued)
        prev = (m.previousSibling()?.continued) ? m.previousSibling() : undefined
        // write('new prev is')
        // write(prev)
      }
    }
    // either way, prev should no longer be where it was, so just get rid of the some>
    m.remove()
    return 
  } )

  // For testing purposes, flag the expected result
  processSymbol( '✔︎' , m => { 
    m.previousSibling().ExpectedResult = 'valid'
    m.remove() 
  } )
  
  processSymbol( '✗' , m => { 
    m.previousSibling().ExpectedResult = 'indeterminate' 
    m.remove()
  } )
  
  processSymbol( '⁉︎' , m => { 
    m.previousSibling().ExpectedResult = 'invalid' 
    m.remove()
  } )

  processSymbol( '⊘' , m => { 
    m.previousSibling().ExpectedResult = 'inapplicable' 
    m.remove()
  } )

  // TODO: make this more consistent with the other shorthands
  processSymbol( '➤' , m => { 
    if (m.parent().isAComment()) m.parent().ignore=true 
  })
  
  // Labels
  //
  // Just a quickie lable mechanism that will be upgraded later.
  // Labels are currently a single symbol of the form name> which assigns
  // 'name' to the .label attribute of the next sibling.  Previous siblings
  // aren't supported yet, nor is whitespace. 
  // L.descendantsSatisfying( s => (s instanceof LurchSymbol) && 
  //   /[^"()\[\]\s]+>/.test(s.text()) )
  //   .forEach( s => { 
  //     s.nextSibling().label=s.text().slice(0,-2).toLowerCase() 
  //     s.remove()
  //   } ) 

  // depricated but kept for backward compatibility
  processSymbol( '<<' , m => { 
    const target = m.previousSibling()
    const type = (target instanceof Declaration) ? 'Declare' : 'BIH'
    target.makeIntoA(type)
    m.remove()
  } )
  // depricated but kept for backward compatibility
  processSymbol( '>>' , m => makeNext(m,'BIH') )
  
  return L
}

export default {
  isNonnegative, isNonzero, isNaturalNumber, isNatural, isInteger, isRational,
  isNumeric, isNaturalArithmetic,  isIntegerArithmetic, isRationalArithmetic, 
  numericToCAS, parseLines, makeParser
}
///////////////////////////////////////////////////////////////////////////////