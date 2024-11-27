/**
 * Generic javascript utilities.
 * 
 * @module Utilities
 */

/**
 * Find the longest common initial slice of a set of arrays.
 * 
 * @function
 * @param  {...Array} arrays - The arrays to compare.
 * @returns {Array} - The longest common initial slice of the arrays.
 */
const commonInitialSlice = (...arg) => {
  if (!arg.length) return
  let k=0; while (arg.every( A => A[k] === arg[0][k] && k<arg[0].length )) k++
  return arg[0].slice(0,k)
}

/**
 * Checks a filename to see if it has the right extension and adds the extension
 * if it doesn't. The default extension is 'js'.
 * 
 * @function
 * @param {string} name - The filename to check.
 * @param {string} [ext='js'] - The extension to add if missing.
 * @returns {string} - The filename with the correct extension.
 */
const checkExtension = ( name , ext = 'js' ) => {
  ext = (ext.startsWith('.')) ? ext : '.'+ext
  return ( name.endsWith(ext)) ? name : name + ext 
}

/**
 * Checks a foldername to see if it has a trailing '/' and adds it if
 * if it doesn't.
 * 
 * @function
 * @param {string} folder - The folder name to check.
 * @returns {string} - The foldername with the correct extension.
 */
const checkFolder = ( folder ) => 
  ( folder.endsWith('/')) ? folder : folder+'/'

/**
 * Return a string of $n$ spaces (or other character). 
 * 
 * @function
 * @param {number} n - the length of the string
 * @param {string} [char=' '] - the character to use
 * @returns {string} the resulting string
 */
const tab = (n , char=' ') => { return Array.seq(()=>'',1,n+1).join(char) }

/**
 * Indent string $s$ with a tab of $n$ spaces. If $s$ contains multiple lines,
 * indent each line.
 *
 * @function
 * @param {string} s - the string to indent
 * @param {number} n - the number of spaces to indent
 * @returns {string} the resulting string   
 */ 
const indent = (s,n) => {
  const t = tab(n)
  return t+s.replaceAll(/\n(.)/g,'\n'+t+'$1')
}    

// make a right justified line number consisting of a minimum width padded on
// the right with a given suffix

/**
 * Returns a right justified line number consisting of a minimum width padded on
 * the right with a given suffix.
 * 
 * @function
 * @param {number} n - The line number.
 * @param {number} [width=4] - The minimum width of the line number.
 * @param {string} [suffix=': '] - The suffix to be added to the line number.
 * @returns {string} The right justified line number.
 */
const lineNum = (n,width=4,suffix=': ') => { 
    const num = String(n)
    return String(n).padStart(width-num.length-1, ' ')+suffix
}

// The string of unicode numerical subscripts, '₀₁₂₃₄₅₆₇₈₉'. 
const subscriptDigits = '₀₁₂₃₄₅₆₇₈₉'

/**
 * Convert the integer $n$ to a string consisting of the corresponding unicode
 * subscript.
 * 
 * @function
 * @param {number} n - The integer to be converted.
 */
const subscript = n => [...n.toString()].map(d => subscriptDigits[d]).join('')

/** 
 * Convert RGB to HEX
 */ 
const rgb2hex = (r, g, b) => {
  const hexR = r.toString(16).padStart(2, '0').toUpperCase()
  const hexG = g.toString(16).padStart(2, '0').toUpperCase()
  const hexB = b.toString(16).padStart(2, '0').toUpperCase()
  return `#${hexR}${hexG}${hexB}`;
}

const msToTime = ms => {
  // Calculate hours, minutes, and seconds
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60))) / 1000
  const Hours = (hours>0) ? `${hours} hr ` : ''
  const Minutes = (minutes>0) ? `${minutes} min ` : ''
  const Seconds = `${(minutes>0) ? Math.round(seconds) : seconds.toFixed(3)} sec`
  return Hours+Minutes+Seconds
}

/** 
 * Report the time it took to execute function `f`, passed as an argument. 
 */
const timer = (f,msg='') => {
  let start = Date.now()
  f()
  console.log(`${msg} ${(Date.now()-start)} ms`)
}

/** 
 * Report the time it took to execute function `f`, passed as an argument. 
 */
globalThis.Accumulator = globalThis.Accumulator || { }
const profile = (f,name) => {
  if (!Accumulator[name]) Accumulator[name] = { count: 0, time:0 }
  let start = Date.now()
  const ans = f()
  Accumulator[name].count++
  Accumulator[name].time += Date.now()-start
  return ans
}
// Run any code in Lode (validate something, run the test suite, etc.) and then call
// `benchmark(Accumulator)` to see a report.
const benchmark = data => {
  console.log(`| Function Name            | Count | Time (ms) |`);
  console.log(`|--------------------------|-------|-----------|`);

  // Iterate over each key in the object
  for (const key in data) {
      if (data.hasOwnProperty(key)) {
          const { count, time } = data[key];
          console.log(`| ${key.padEnd(24)} | ${String(count).padStart(5)} | ${String(time).padStart(9)} |`);
      }
  }
}

export default {
  commonInitialSlice, checkExtension, checkFolder, tab, indent, 
  lineNum, subscript, rgb2hex, msToTime, timer, profile, benchmark
}