/**
 * Lurch integration with z3
 * 
 * @module z3
 */
import Algebrite from '../../dependencies/algebrite.js'

// convert Algebrite string to printlist() and parse it to an array
const parseAlgebrite = str => {
  const tokens = Algebrite.run(`printlist(${str})`)
                 .replace(/\(/g, ' ( ').replace(/\)/g, ' ) ')
                 .trim().split(/\s+/)
  let i = 0

  function parse() {
    if (tokens[i] === '(') {
      i++
      const list = []
      while (tokens[i] !== ')') {
        list.push(parse())
      }
      i++
      return list
    } else if (tokens[i] === ')') {
      throw new SyntaxError("Unexpected ')'")
    } else {
      // Parse numbers as numbers, otherwise keep as string
      const token = tokens[i++]
      const num = Number(token)
      return isNaN(num) ? token : num
    }
  }

  return parse()
}

// convert algebrite expression to Z3
//
// ctx - the z3 Context to use
// arg - the output of algebriteToZ3
//
const algebriteToZ3 =  (arg,ctx = Z3) => {

  // the recursive call, so ctx acts like a global
  const convert = (x) => {
    // algebrite relation operators (for inequalities)
    const relations = { 
      'testeq': (a,b) => a.eq(b), 
      'testlt': (a,b) => a.lt(b), 
      'testle': (a,b) => a.le(b), 
      'testgt': (a,b) => a.gt(b), 
      'testge': (a,b) => a.ge(b),
      // neq is special
      'not': r => ctx.Not(r)
    }
    // algebrite arithmetic operations (must be converted to binary for z3)
    const arithops = {
      'add': (a,b) => a.add(b),
      'multiply': (a,b) => a.mul(b),
      'power': (a,b) => a.pow(b)
    }

    // if it is an array, get the op, and force it to be binary
    if (Array.isArray(x)) {
      let op = x[0]
      // relations
      if (Object.hasOwn(relations,op)) { 
        // console.log(`Found relation ${op}`)
        return relations[op](convert(x[1]),convert(x[2]))
      // arithmetic ops - convert to binary
      } else if (Object.hasOwn(arithops,op)) {
        // powers are a special case because algebrite writes 1/x^2 as 
        // (power x -2) and we want z3 to use div for that when the exponent is negative
        // TODO: maybe not needed?
        if (op=='power' && x[2]<0) {
          // simplify (^ x 1)
          if (x[2]==-1) return ctx.Real.val(1).div(convert(x[1])) 
          // otherwise use the positive exponent
          return ctx.Real.val(1).div(convert(x[1]).pow(convert(Math.abs(x[2]))))
        }
        // the other ops can be n-ary
        return x.slice(2).reduce( 
          (a,b) => arithops[op](a,convert(b)),
          convert(x[1]) 
        )
      // uninterpreted ops - can have multiple args
      } else {
        return ctx.Function.declare(
                    op,
                    ...Array(x.length-1).fill(ctx.Real.sort()),
                    ctx.Real.sort())
                  .call(...x.slice(1).map(convert))
      }
    // otherwise it's not an array, so either a symbol or a number.  We only allow integer constants
    } else {
      if (typeof x === 'string') return ctx.Real.const(x)
      if (typeof x === 'number') return ctx.Real.val(x)
    }
  }

  return convert(arg)
}

// syntactic sugar
const z3 = (str, ctx = Z3) => {
  return algebriteToZ3(parseAlgebrite(str),ctx)
}

export default { z3, parseAlgebrite, algebriteToZ3 }