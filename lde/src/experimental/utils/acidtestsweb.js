// This file is only for local debugging and benchmarking use, and so is commented out.
// The uncommented version is saved in my lurch-local repository

////////////////////////////////////////////////////////////////////////////
//  Acid Tests
//
// This exports a function to run our acid tests.
//
// import { studentFileList } from '../proofs/math299/studentfiles299/files.js'

// export const test = async (exppath = 'lde/src/experimental') => {

//   const defaultCSS = 'color: #00CCFF; font-family: "Andale Mono 18", monospace;'
//   const successCSS = 'color: #00CC00;'
//   const failCSS = 'color: #FF0000;'
//   const itemCSS = 'color: #ff9900;'
//   const stringCSS = 'color: #008000;'
//   const checkCSS = 'color: #00FF00;'
//   const attributeCSS = 'color: #00FF00;'

//   console.log(`%cLoading the acid tests ...\n\n`, defaultCSS)
//   let start = Date.now()
//   ////////////////////////////////////////////////////////////////////////////
  
//   const verbose = true
//   // Note that you can specify the start and end student files for smaller tests
//   const startTest = LurchOptions.startStudentTest
//   const endTest = LurchOptions.endStudentTest
//   // const startTest = 10
//   // const endTest = 12
//   let statusmsg = ''
//   let statuscss = [ defaultCSS ]

//   // declare the acid array
//   globalThis.acid = []

//   // define a nice utility for loading a test
//   const loadtest = async (name, 
//                           folder = 'proofs/acid tests', 
//                           extension = 'lurch', 
//                           language = 'lurch', 
//                           desc = '') => {
    
//     let lasttime = Date.now()
//     const showFile = verbose && !/studentfiles/.test(folder)

//     // student files have their own verbose mode
//     if (showFile)
//       statusmsg = `%cLoading ${name}`.padEnd(50, '.')

//     try {
//       let a = await loadDoc(name, folder, extension, language)
//       if (desc) a.desc = desc
//       acid.push(a)
//     } catch {
//       console.log(`%cError loading acid test: ${name}`, failCSS)
//       acid.push(`%cError loading acid test: ${name}`)
//     }
//     if (showFile)
//       console.log(
//         statusmsg + `%c${msToTime(Date.now() - lasttime)} (${msToTime(Date.now() - start)} total)`, defaultCSS, attributeCSS)
//   }

//   // compute the final feedback result for a transitive chain of = in the case
//   // where it has an _id, as in student test files
//   const getEquationResult = chain => {
//     const id = chain.getAttribute('_id')
//     // for now we only need this for the case where a chain has an ID from web files
//     if (!id) return
//     const someHas = result => {
//       return chain.root().some(eq => eq.getAttribute('_id') == id &&
//         Validation.result(eq) &&
//         Validation.result(eq).result == result)
//     }
//     // check the results in order
//     if (someHas('invalid')) return 'invalid'
//     if (someHas('indeterminate')) return 'indeterminate'
//     if (someHas('valid')) return 'valid'
//     // return nothing if none of these hold
//     return
//   }

//   // Load student test files iff requested
//   if (LurchOptions.runStudentTests) {
//     const studentFolder = exppath + '/proofs/math299/studentfiles299'
//     const studentFiles = studentFileList.slice(startTest, endTest + 1)
//     let i=0
//     for (const filename of studentFiles) {
//       let lasttime = Date.now()
//       const numfiles = Math.min(studentFiles.length, endTest - startTest + 1)
//       statusmsg = `%cLoading student test file ${i + 1} of ${numfiles}`.padEnd(50, '.')
      
//       await loadtest(filename, studentFolder, 'txt', 'putdown', filename)
      
//       console.log(statusmsg +
//         `%c${msToTime(Date.now() - lasttime).padStart(11, ' ')} (${msToTime(Date.now() - start)} total)`, defaultCSS, attributeCSS)

//       ++i  
//     }
//   }

//   // Load Acid Tests
//   //
//   // We switch to a for loop here so the asynchronous loop doesn't print out
//   // incorrectly
//   for (let k = 0; k <= 13; k++) await loadtest(`proofs/acid tests/acid ${k}`, exppath)
//   // Load other tests in the acid tests folder
//   await loadtest('proofs/acid tests/Transitive Chains', exppath)
//   await loadtest('proofs/acid tests/Cases', exppath)
//   await loadtest('proofs/acid tests/BIH Cases', exppath)
//   await loadtest('proofs/acid tests/user-thms', exppath)
//   await loadtest('proofs/acid tests/ArithmeticNatural', exppath)
//   await loadtest('proofs/acid tests/ArithmeticInteger', exppath)
//   await loadtest('proofs/acid tests/ArithmeticRational', exppath)
//   // Load Math 299 tests
//   await loadtest('proofs/math299/prop', exppath)
//   await loadtest('proofs/math299/pred', exppath)
//   await loadtest('proofs/math299/peanoBIH', exppath)
//   await loadtest('proofs/math299/peano', exppath)
//   await loadtest('proofs/math299/midterm', exppath)
//   await loadtest('proofs/math299/recursion', exppath)
//   await loadtest('proofs/math299/reals', exppath)
//   await loadtest('proofs/math299/sets', exppath)
//   await loadtest('proofs/math299/BIHchain',exppath,'txt','putdown','small BIH & trans chain test')
//   await loadtest('proofs/math299/inapplicable',exppath,'txt','putdown','testing an inapplicable')

//   // run the tests
//   let passed = 0
//   let failed = 0

//   // test the asciimath Peggy parser by itself
//   try {
//     const str = await loadDocStr('parsers/LurchParserTests', exppath)
//     const s = lc(parse(str))
//     passed++
//     console.log(`%cParser Test:' → ok`, itemCSS)
//   } catch (e) {
//     failed++
//     console.log(`%cERROR: LurchMath peggy parser test failed.`, failCSS)
//   }

//   let numchecks = 0
//   let numindets = 0
//   let numinvalids = 0
//   let numinapps = 0
  
//   acid.forEach((T, k) => {
//     statusmsg = '%c'
//     statuscss = [ defaultCSS ]

//     // if T is an error message, print it
//     if (typeof T==='string') { console.log(T,failCSS); return }
//     // for each test, find the first comment if any and use that as the
//     // description of the test file
//     const desc = T.desc || T.find(x => x.isAComment())?.child(1)
//     console.log(`Test ${k}: %c${desc}`, stringCSS)

//     T.descendantsSatisfying(x => x.ExpectedResult).forEach((s, i) => {
//       if ((Validation.result(s) &&
//           (Validation.result(s).result == s.ExpectedResult ||
//           // handle the inapplicable arithmetic case
//           s.results('arithmetic')?.result == s.ExpectedResult ||
//           // handle the bad BIH case
//           (s.badBIH && s.ExpectedResult == 'invalid'))
//         ) ||
//         // handle the redeclared variable case
//         (s.getAttribute('scope errors')?.redeclared && s.ExpectedResult == 'invalid') ||
//         // handle the transitive chain equations case - see if some equation derived
//         // from the transitive chain has the matching validation result, and nothing 
//         // has a worse result
//         (s.isAnEquation() && getEquationResult(s) == s.ExpectedResult)
//         // TODO: there is an edge case where the document has a bad variable
//         // declaration inside a Rule environment, but we currently do not check for that.
//       ) {
//         statusmsg +=  (i && !(i % 8)) ? '\n' : ''
//         statusmsg += `Test ${k}.${i}`.padEnd(10,' ')+' → ok   '
//         ++passed
//       } else {
//         statusmsg += `\n%c  Test ${k}.${i} → FAIL!!\nat address ${s.address()}\n\n%c`
//         statuscss.push(failCSS,defaultCSS)  
//         ++failed
//       }
//     })
//     console.log(statusmsg,...statuscss)

//     T.descendantsSatisfying( x => x.ExpectedResult ).forEach( r => {
//       const result = r.ExpectedResult
//       if (result==='valid') ++numchecks  
//       if (result==='indeterminate') ++numindets
//       if (result==='invalid') ++numinvalids
//       if (result==='inapplicable') ++numinapps 
//     })
//   })

//   const pen = (!failed) ? successCSS : failCSS
//   console.log(`\n%c${passed} tests passed - ${failed} tests failed\n`, pen)
//   console.log(
// `%c${numchecks.toString().padStart(5,' ')} ${'✔︎'}'s
// ${numindets.toString().padStart(5,' ')} %c${'?'}%c's
// ${numinvalids.toString().padStart(5,' ')} %c${'✗'}%c's
// ${numinapps.toString().padStart(5,' ')} %c${'⊘'}%c's
// ${'    1'} %c${'parser test'}
// `   , checkCSS, itemCSS, checkCSS, failCSS, checkCSS, failCSS, checkCSS, stringCSS)  

// console.log(`%cTest result stored in the array 'acid'\n`, defaultCSS)

//   // acid.forEach((x,k)=>{console.log('\nTest #'+k+'\n');x.report(user)})

//   ///////////////////////////////////////////////////////////
//   // closing    
//   console.log(`%cdone! (${(Date.now() - start)} ms)`, defaultCSS)
//   // don't echo anything
// }

// export const testall = async (exppath = 'lde/src/experimental') => {
//   const saved = LurchOptions.runStudentTests
//   LurchOptions.runStudentTests = true
//   test()
//   LurchOptions.runStudentTests = saved
// }

// ///////////////////////////////////////////////////////////