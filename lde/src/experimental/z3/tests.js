/* Lurch Z3 integration tests
 *  
 * Currently this is only integrated with Lode.
 * TODO: integrate with browser and validation algorithm.
*/
z3('x').toString()
z3('1').toString()
z3('x+1').toString()
z3('x*y').toString()
z3('x^3').toString()
z3('-x').toString()
// n-ary
z3('x+y+1').toString()
z3('2*x*y*z').toString()
// custom n-ary functions
z3('f(x,y,z)').toString()
// inequalities
z3('2*x*y-1<x-z').toString()
z3('2*x*y-1<=x-z').toString()
z3('2*x*y-1==x-z').toString()
// solving
solver.add(z3('c!=0'))
solver.add(z3('a==b/c'))
solver.add(z3('a*c!=b'))
await solver.check()
// in Lurch we want it to allow several single steps of algebra in one go.
// Then we can have a setting for n that just has it assume just the previous
// n-equations or inequalities for efficiency (and legibility).
solver.add(z3('y-2*x^2+4*x==0'))
solver.add(z3('y+2!=2*(x-1)^2'))
await solver.check()