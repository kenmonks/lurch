////////////////////////////////////////////////////////////////////////////
// Script to run the Lode .test suite from the command line with
// 
// node lode test
//
// from the command line for profiling.
//
////////////////////////////////////////////////////////////////////////////

let times = []

LurchOptions.runStudentTests = false
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)
initialize('utils/acidtests')
times.push(globalThis.runtimeMS)

times.sort()
times = times.slice(1, -1)

console.log(times)

let avg = Math.round(times.reduce( (sum, val) => sum + val, 0) / times.length)

console.log(avg)

process.exit()

// don't echo anything
undefined
///////////////////////////////////////////////////////////