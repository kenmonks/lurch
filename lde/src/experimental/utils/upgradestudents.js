process.stdout.write(itemPen(`\nUpgrading the student test files to use chains ...\n\n`))
let start = Date.now()
////////////////////////////////////////////////////////////////////////////

const verbose = true
// Note that you can specify the start and end student files for smaller tests

const studentFolder = 'proofs/math299/studentfiles299'
const getStudentFiles = () => {
    return fs.readdirSync( studentFolder )
             .filter(x=>x.endsWith('.txt')) 
}
const studentFiles = getStudentFiles()

studentFiles.forEach( (filename,i) => {
    let lasttime = Date.now()
    const numfiles = studentFiles.length
    process.stdout.write(defaultPen(
      `Loading student test file ${filename}: ${i+1} of ${numfiles}`.padEnd(50,'.')))
    let oldstr = loadStr(filename, studentFolder, 'txt')
    let newstr = upgradeChains(lc(oldstr)).toPutdown()
    fs.writeFileSync(`proofs/math299/studentfiles299/newstudentfiles299/new ${filename}`,newstr)
    console.log(attributePen(
      `${msToTime(Date.now()-lasttime).padStart(11,' ')} (${msToTime(Date.now()-start)} total)`))
})

///////////////////////////////////////////////////////////
// closing
console.log(defaultPen(`done! (${msToTime(Date.now()-start)})`))
// don't echo anything
undefined
///////////////////////////////////////////////////////////