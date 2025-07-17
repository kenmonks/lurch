///////////////////////////////////////////////////////////////////////////
// Acid Test Harness for Lurch
//
// Runs all configured tests for Lurch, including:
//   - Acid tests
//   - Student tests (optional)
//   - A single test specified by global TestIndex
//
// Output includes pass/fail counts and timing details.
//
// Dependencies: LurchOptions, Validation, LogicConcept utilities
///////////////////////////////////////////////////////////////////////////

process.stdout.write(itemPen(`\nLoading the acid tests ...\n\n`))
const startTime = Date.now()

////////////////////////////////////////////////////////////////////////////
// Configuration
////////////////////////////////////////////////////////////////////////////

const verbose = true
const startTest = LurchOptions.startStudentTest
const endTest = LurchOptions.endStudentTest
const runStudentTests = LurchOptions.runStudentTests
const runAcidTests = LurchOptions.runAcidTests
const singleTestIndex = typeof TestIndex === 'number' ? TestIndex : null

// Internal state
const acidRawStrings = []   // Holds raw source strings for single-test mode
const acidDocs = []         // Holds compiled LogicConcept documents

////////////////////////////////////////////////////////////////////////////
// Utility Functions
////////////////////////////////////////////////////////////////////////////

/**
 * Format elapsed time in ms to human-readable string.
 */
const elapsedTime = ms => msToTime(ms)

/**
 * Safely run a function and log errors.
 */
const safeExecute = (fn, errorMessage) => {
  try {
    fn()
  } catch (e) {
    console.log(xPen(errorMessage))
  }
}

/**
 * Compute the validation result for an equation chain with _id.
 */
const computeChainResult = chain => {
  const id = chain.getAttribute('_id')
  if (!id) return
  const matches = result => chain.root().some(eq =>
    eq.getAttribute('_id') === id &&
    Validation.result(eq)?.result === result
  )
  if (matches('invalid')) return 'invalid'
  if (matches('indeterminate')) return 'indeterminate'
  if (matches('valid')) return 'valid'
  return
}

////////////////////////////////////////////////////////////////////////////
// Test Loading
////////////////////////////////////////////////////////////////////////////

/**
 * Load a single test document (compiled or raw string).
 */
const loadTest = (name, folder = 'acid tests', ext = 'lurch', language = 'lurch', desc = '') => {
  const showFile = verbose && !/studentfiles/.test(folder)
  const displayIndex = acidDocs.length
  const label = `${displayIndex}. Loading ${folder}/${name}`

  if (showFile && singleTestIndex === null) 
    process.stdout.write(defaultPen(label.padEnd(50, '.')))
  const lastTime = Date.now()

  try {
    if (singleTestIndex !== null) {
      const content = loadDocStr(name, `proofs/${folder}`, ext, language)
      acidRawStrings.push([content, language])
    } else {
      const doc = loadDoc(name, `proofs/${folder}`, ext, language)
      if (desc) doc.desc = desc
      acidDocs.push(doc)
    }
  } catch {
    console.log(xPen(`\nError loading test: ${name}`))
    acidDocs.push(`Error loading test: ${name}`)
  }

  if (showFile && singleTestIndex === null)
    console.log(attributePen(`  ${elapsedTime(Date.now() - lastTime)} (${elapsedTime(Date.now() - startTime)} total)`))
}

/**
 * Load all student tests if enabled.
 */
const loadStudentTests = () => {
  const studentFolder = 'math299/studentfiles299'
  const studentFiles = fs.readdirSync(`./proofs/${studentFolder}`)
    .filter(f => f.endsWith('.txt'))
    .slice(startTest, endTest + 1)

  studentFiles.forEach((filename, i) => {
    const numFiles = Math.min(studentFiles.length, endTest - startTest + 1)
    const lastTime = Date.now()

    if (singleTestIndex === null) {
      process.stdout.write(defaultPen(`Loading student file ${i + 1} of ${numFiles}`.padEnd(50, '.')))
    }

    loadTest(filename, studentFolder, 'txt', 'putdown', filename)

    if (singleTestIndex === null)
      console.log(attributePen(`${elapsedTime(Date.now() - lastTime).padStart(11, ' ')} (${elapsedTime(Date.now() - startTime)} total)`))
  })
}

/**
 * Load all acid tests.
 */
const loadAcidTests = () => {
  if (LurchOptions.onetest !== undefined) {
    loadTest(`acid ${LurchOptions.onetest}`)
  } else {
    Array.seq(k => k, 0, 13).forEach(k => loadTest(`acid ${k}`))
    ;[
      'Transitive Chains', 'Cases', 'BIH Cases', 'user-thms',
      'ArithmeticNatural', 'ArithmeticInteger', 'ArithmeticRational',
      ['prop', 'math299'], ['pred', 'math299'], ['peanoBIH', 'math299'],
      ['peano', 'math299'], ['midterm', 'math299'], ['recursion', 'math299'],
      ['reals', 'math299'], ['sets', 'math299'],
      ['BIHchain', 'math299', 'txt', 'putdown', 'small BIH & trans chain test'],
      ['inapplicable', 'math299', 'txt', 'putdown', 'testing an inapplicable']
    ].forEach(args => Array.isArray(args) ? loadTest(...args) : loadTest(args))
  }
}

////////////////////////////////////////////////////////////////////////////
// Test Execution
////////////////////////////////////////////////////////////////////////////

/**
 * Compile a single test when TestIndex is set.
 */
const compileSingleTest = index => {
  const [source, language] = acidRawStrings[index]
  return validate((language === 'lurch') ? $('{' + source + '}') : lc(source))
}

/**
 * Run validation on all loaded tests.
 */
const runTests = () => {
  let passed = 0, failed = 0, failedTests = new Set()
  let numChecks = 0, numIndets = 0, numInvalids = 0, numInapps = 0

  acidDocs.forEach((doc, k) => {
    if (typeof doc === 'string') {
      write(doc)
      failed++
      return
    }

    const desc = doc.desc || doc.find(x => x.isAComment())?.child(1) || ''
    console.log(itemPen(`\nTest ${k}: ${stringPen(desc)}`))

    doc.descendantsSatisfying(x => x.ExpectedResult).forEach((s, i) => {
      const resultMatches =
        (Validation.result(s)?.result === s.ExpectedResult) ||
        (s.results('arithmetic')?.result === s.ExpectedResult) ||
        (s.badBIH && s.ExpectedResult === 'invalid') ||
        (s.getAttribute('scope errors')?.redeclared && s.ExpectedResult === 'invalid') ||
        (s.isAChain() && computeChainResult(s) === s.ExpectedResult)

      if (resultMatches) {
        const pad = 11+Math.floor(Math.log10(k))
        process.stdout.write(`  Test ${k}.${i}`.padEnd(pad, ' ') + ' → ok')
        process.stdout.write(((i + 1) % 4) ? '' : '\n')
        passed++
      } else {
        console.log(xPen(`\n  Test ${k}.${i} → FAIL!!\n`))
        write(s)
        write(`at address ${s.address()}\n\n`)
        failed++
        failedTests.add(k)
      }
    })

    doc.descendantsSatisfying(x => x.ExpectedResult).forEach(r => {
      const res = r.ExpectedResult
      if (res === 'valid') numChecks++
      if (res === 'indeterminate') numIndets++
      if (res === 'invalid') numInvalids++
      if (res === 'inapplicable') numInapps++
    })
  })

  return { passed, failed, failedTests, numChecks, numIndets, numInvalids, numInapps }
}

////////////////////////////////////////////////////////////////////////////
// Main Flow
////////////////////////////////////////////////////////////////////////////

// load the files
if (runStudentTests) loadStudentTests()
if (runAcidTests) loadAcidTests()
// store the parser test result
let parserresult = false  

// in the single test case, all test strings should be in acidRawStrings array
// so select and compile the one we want
if (singleTestIndex !== null) {
  acidDocs.push(compileSingleTest(singleTestIndex))
} else {
  // run the parser test iff its not a single test
  try {
    const parserTest = lc(parse(loadStr('parsers/LurchParserTests')))
    console.log(`\n${itemPen('Parser Test:')} → ok`)
    parserresult = true
  } catch (e) { 
    console.log(xPen('ERROR: asciimath parser test failed.')) 
  }
}

let { passed, failed, failedTests, numChecks, 
      numIndets, numInvalids, numInapps } = runTests()

// adjust for the parser test
if (singleTestIndex === null)  (parserresult) ? passed++ : failed++

// export the results
global.acidStrings = acidRawStrings
global.acid = acidDocs
if (singleTestIndex) global.doc = acid[0]

////////////////////////////////////////////////////////////////////////////
// Summary
////////////////////////////////////////////////////////////////////////////

const color = failed ? chalk.ansi256(9) : chalk.ansi256(40)
const ptest = (singleTestIndex === null) ? '    1' : '    0'
console.log(color(`\n${passed} tests passed - ${failed} tests failed\n`))
if (failedTests.size) 
  console.log(itemPen(`Failed tests:`),...[...failedTests].sort((x,y)=>x-y),'\n')
console.log(`
${checkPen(numChecks.toString().padStart(5, ' '))} ${checkPen('✔︎')}'s
${checkPen(numIndets.toString().padStart(5, ' '))} ${itemPen('?')}'s
${checkPen(numInvalids.toString().padStart(5, ' '))} ${xPen('✗')}'s
${checkPen(numInapps.toString().padStart(5, ' '))} ${xPen('⊘')}'s
${checkPen(ptest)} ${stringPen('parser test')}
`)

console.log(`Test result stored in the array 'acid'\n`)
console.log(defaultPen(`done! (${elapsedTime(Date.now() - startTime)})`))
undefined