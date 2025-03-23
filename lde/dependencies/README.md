
# Where did these come from?

## LSAT.js

A simple JavaScript SAT solver.  See http://www.comp.nus.edu.sg/~gregory/sat/ for a live demo and more information.

## algebrite.js

A JavaScript CAS.  See http://algebrite.org for a live demo and documentation.

We made the following modifications when importing Algebrite into this repository.

 - Recompiled it with the command 
   ```
   cat runtime/defs.coffee \
       sources/*.coffee \
       runtime/alloc.coffee \
       runtime/find.coffee \
       runtime/init.coffee \
       runtime/mcmp.coffee \
       runtime/otherCFunctions.coffee \
       runtime/count.coffee \
       runtime/run.coffee \
       runtime/stack.coffee \
       runtime/symbol.coffee \
       runtime/zombocom.coffee \
       runtime/freeze.coffee | \
       ../coffeescript/bin/coffee -sc --bare > \
       ../../dependencies/algebrite.js
   ```
   (run from within `node_modules/algebrite`) to create a bare version.
 - Added the following line to the top of the file, to support ES6 module style.
   ```
   const exports = { }
   ``` 
 - Changed 
   ```
   bigInt = require('big-integer');
   ```
   to 
   ```
   import bigInt from './BigInteger.js'
   ```
   for the same reason.  (Note the necessary corresponding change to `BigInteger.js`, below.)
 - Added 
   ```
   export default exports
   ``` 
   to the bottom of the file for the same reason.
 - Commented out the declaration of the variable, `bigInt`, since it's now `import`ed instead of `require`d.

Note that there is no need to do any of this if you use the version that
is in this folder, which has all these modifications included.
 
## BigInteger.js

Algebrite depends on the module `big-integer`, for arbitrary precision integers.
See https://www.npmjs.com/package/big-integer for details.

We made the following modifications when importing `big-integer` into this repository.

 - Added 
   ```
   export default bigInt
   ```
   to the bottom of the file so it can be imported by our modified Algebrite.

## mathlive

A LaTeX math rendered for web pages from https://cortexjs.io/mathfield.  It has been renamed to MathField now, but we are using this fixed version for now.