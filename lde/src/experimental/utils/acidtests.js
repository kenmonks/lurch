///////////////////////////////////////////////////////////////////////////
//  Acid Tests
//
// opening
process.stdout.write(itemPen(`\nLoading the acid tests ...\n\n`))
let start = Date.now()
////////////////////////////////////////////////////////////////////////////

const verbose = true
// Note that you can specify the start and end student files for smaller tests
const startTest = LurchOptions.startStudentTest
const endTest = LurchOptions.endStudentTest
// const startTest = 1
// const endTest = 10

// declare the acid array
acid=[]
// define a nice utility for loading a test
const loadtest = (name, folder='acid tests', extension='lurch',
                  language='lurch', desc = '') => { 
  let lasttime = Date.now()
  const showFile = verbose && !/studentfiles/.test(folder)
  // student files have their own verbose mode
  if ( showFile ) 
    // avoid newline at the end of this by not using console.log
    process.stdout.write(defaultPen(`Loading ${folder}/${name}`.padEnd(50,'.')))
  try {
    let a = loadDoc(name,`proofs/${folder}`, extension, language)
    if (desc) a.desc=desc
    acid.push(a) 
  } catch {
    console.log(`Error loading acid test: ${name}`)
    acid.push(xPen(`Error loading acid test: ${name}`))
  }
  if ( showFile ) console.log(attributePen(
    `  ${msToTime(Date.now()-lasttime)} (${msToTime(Date.now()-start)} total)`))
}

// compute the final feedback result for a transitive chain of = in the case
// where it has an _id
const getChainResult = chain => {
  const id = chain.getAttribute('_id')
  // for now we only need this for the case where a chain has an ID from web files
  if (!id) return  
  const someHas = result => {
    return chain.root().some( eq => eq.getAttribute('_id')==id &&
                         Validation.result(eq) &&
                         Validation.result(eq).result==result)
  }
  // check the results in order
  if (someHas('invalid')) return 'invalid'
  if (someHas('indeterminate')) return 'indeterminate'
  if (someHas('valid')) return 'valid'
  // return nothing if none of these hold
  return 
}

// compute the final feedback result for a transitive chain of = in the case
// where it has an _id
const getEquationResult = chain => {
  const id = chain.getAttribute('_id')
  // for now we only need this for the case where a chain has an ID from web files
  if (!id) return  
  const someHas = result => {
    return chain.root().some( eq => eq.getAttribute('_id')==id &&
                         Validation.result(eq) &&
                         Validation.result(eq).result==result)
  }
  // check the results in order
  if (someHas('invalid')) return 'invalid'
  if (someHas('indeterminate')) return 'indeterminate'
  if (someHas('valid')) return 'valid'
  // return nothing if none of these hold
  return 
}

// Load student test files iff requested
if (LurchOptions.runStudentTests) {
  const studentFolder = 'math299/studentfiles299'
  const getStudentFiles = () => {
    return fs.readdirSync( './proofs/'+studentFolder )
             .filter(x=>x.endsWith('.txt')) 
  }
  const studentFiles = getStudentFiles().slice(startTest,endTest+1)
  studentFiles.forEach( (filename,i) => {
    let lasttime = Date.now()
    const numfiles = Math.min(studentFiles.length,endTest-startTest+1)
    process.stdout.write(defaultPen(
      `Loading student test file ${i+1} of ${numfiles}`.padEnd(50,'.')))
    loadtest(filename, studentFolder, 'txt', 'putdown', filename)
    console.log(attributePen(
      `${msToTime(Date.now()-lasttime).padStart(11,' ')} (${msToTime(Date.now()-start)} total)`))
  })
}

// Load Acid Tests
if (LurchOptions.runAcidTests) {
  // If LurchOptons.onetest is set, only load that test
  if (LurchOptions.onetest!==undefined) loadtest(`acid ${LurchOptions.onetest}`)
  else {
    Array.seq(k=>k,0,13).forEach( k => loadtest(`acid ${k}`) )
    // Load other tests in the acid tests folder
    loadtest('Transitive Chains')
    loadtest('Cases')
    loadtest('BIH Cases')
    loadtest('user-thms')
    loadtest('ArithmeticNatural')
    loadtest('ArithmeticInteger')
    loadtest('ArithmeticRational')
    // Load Math 299 tests
    loadtest('prop','math299')
    loadtest('pred','math299')
    loadtest('peanoBIH','math299')
    loadtest('peano','math299')
    loadtest('midterm','math299')
    loadtest('recursion','math299')
    loadtest('reals','math299')
    loadtest('sets','math299')
    loadtest('BIHchain','math299','txt','putdown','small BIH & trans chain test')
    loadtest('inapplicable','math299','txt','putdown','testing an inapplicable')
  }
}
// Misc test zone - edit for one-off tests
// loadtest(filename, studentFolder, ext, 'putdown/lurch', filename)

// skip a space
console.log()

// run the tests
let passed = 0
let failed = 0

// test the asciimath Peggy parser by itself
try { 
  const s=lc(parse(loadStr('parsers/LurchParserTests')))
  passed++
  console.log(`${itemPen('Parser Test:')} → ok`)
} catch (e) { 
  failed++
  console.log(xPen(`ERROR: asciimath peggy parser test failed.`)) 
}

// and the rest of the acid tests
let numchecks = 0
let numindets = 0
let numinvalids = 0
let numinapps = 0

acid.forEach( (T,k) => {
  if (typeof T === 'string') { write(T) ; failed++; return }
  // for each test, if a description was provided, use that, otherwise find the first comment, if any, in the test file.
  desc = T.desc || T.find(x=>x.isAComment())?.child(1) || ''
  console.log((itemPen(`\nTest ${k}: ${stringPen(desc)}`)))

  T.descendantsSatisfying( x => x.ExpectedResult).forEach( (s,i) => {
    if ((Validation.result(s) && 
        (Validation.result(s).result==s.ExpectedResult ||
        // handle the inapplicable arithmetic case
        s.results('arithmetic')?.result==s.ExpectedResult ||
        // handle the bad BIH case
        (s.badBIH && s.ExpectedResult == 'invalid') ) ) ||
        // handle the redeclared variable case
        (s.getAttribute('scope errors')?.redeclared && s.ExpectedResult=='invalid') ||
        // handle the transitive chain case - see if some equation derived
        // from the transitive chain has the matching validation result, and nothing 
        // has a worse result
        (s.isAChain() && getChainResult(s)==s.ExpectedResult)
        // TODO: there is an edge case where the document has a bad variable
        // declaration inside a Rule environment, but we currently do not check for that.
      ) {
      process.stdout.write(`  Test ${k}.${i}`.padEnd(12,' ')+' → ok')
      process.stdout.write( ((i+1) % 4) ? '' : '\n' )
      ++passed
    } else {
      console.log(xPen(`\n  Test ${k}.${i} → FAIL!!\n`))
      write(s)
      write(`at address ${s.address()}\n\n`)
      ++failed
    }
  })
  T.descendantsSatisfying( x => x.ExpectedResult ).forEach( r => {
    result = r.ExpectedResult
    if (result==='valid') ++numchecks  
    if (result==='indeterminate') ++numindets
    if (result==='invalid') ++numinvalids
    if (result==='inapplicable') ++numinapps 
  })
})

const pen = (!failed) ? chalk.ansi256(40) : chalk.ansi256(9)
console.log(pen(`\n${passed} tests passed - ${failed} tests failed\n`))
console.log(
`${checkPen(numchecks.toString().padStart(5,' '))} ${checkPen('✔︎')}'s
${checkPen(numindets.toString().padStart(5,' '))} ${itemPen('?')}'s
${checkPen(numinvalids.toString().padStart(5,' '))} ${xPen('✗')}'s
${checkPen(numinapps.toString().padStart(5,' '))} ${xPen('⊘')}'s
${checkPen('    1')} ${stringPen('parser test')}
`)

console.log(`Test result stored in the array 'acid'\n`)

///////////////////////////////////////////////////////////
// closing
runtimeMS = Date.now()-start
console.log(defaultPen(`done! (${msToTime(runtimeMS)})`))
// don't echo anything
undefined
///////////////////////////////////////////////////////////