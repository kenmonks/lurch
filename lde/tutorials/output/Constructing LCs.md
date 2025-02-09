
This tutorial covers how to construct {@link LogicConcept Logic Concepts}
(LCs) in your own code, in a variety of ways.  Other tutorials cover what you
can do with LC instances once you've created them:

 * {@tutorial Methods in each LC subclass}
 * {@tutorial LC tree hierarchies}
 * {@tutorial Serialization and attributes of LCs}
 * {@tutorial Free and bound variables}
 * {@tutorial Connections among LCs}
 * {@tutorial Pattern matching}

(Each piece of sample code below is written as if it were a script sitting in
the root folder of this source code repository, and run from there with the
command-line tools `node`.  If you place your scripts in another folder, you
will need to adjust the path in each `import` statement accordingly.  If you
have not yet set up a copy of this repository with the appropriate Node.js
version installed, see [our GitHub README](https://github.com/lurchmath/lde),
which explains how to do so.)

## Putdown notation

The standard way to write an LC is in "putdown" notation, the details of which
are {@link LogicConcept.fromPutdown documented here}.  The following code
shows how you can use that notation to create LCs, and use that same notation
to print them as well.

<br/>
<hr/>

```js
import { LogicConcept } from './lde/src/index.js'

const threeLCs = LogicConcept.fromPutdown( 'x (f x y) { :A B C }' )
console.log( threeLCs[0].toPutdown() )
console.log( threeLCs[1].toPutdown() )
console.log( threeLCs[2].toPutdown() )
```


```text
// Console output:
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js' imported from /Users/monks/Dropbox/files/monkware/git/lurch/lde/tutorial-tmp-file-Constructing LCs.md.js
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)
    at moduleResolve (node:internal/modules/esm/resolve:860:10)
    at defaultResolve (node:internal/modules/esm/resolve:984:11)
    at ModuleLoader.defaultResolve (node:internal/modules/esm/loader:688:12)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:612:25)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:595:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:248:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:136:49) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js'
}

Node.js v23.5.0
```



<hr/>
<br/>

Notice that {@link LogicConcept.fromPutdown fromPutdown()} return an *array*
of results.  It's very tempting, when constructing just one LC, to forget
this, and write some code like this:

```js
// MISTAKE!  DO NOT DO THIS!  SEE THE WARNING ABOVE.
let x = LogicConcept.fromPutdown( 'x' )  // oops!  x is an array!

// This is the correct way instead:
x = LogicConcept.fromPutdown( 'x' )[0]  // lift out the first result
```

But it is also possible to construct specific types of {@link LogicConcept
Logic Concepts} directly, using constructors for subclasses, as shown below.

Of course, if you would like to use the common abbreviation `LC` instead of
the lengthier `LogicConcept`, you can either assign `const LC = LogicConcept`
after importing, or use the JavaScript syntax
`import { LogicConcept as LC } from './lde/src/index.js'` in the first place.

## Constructing specific subclasses

The only unexpected thing here is that the `src/index.js` file does not expose
the {@link Symbol Symbol} class with the name `Symbol`, because there is
already a `Symbol` concept defined in JavaScript that means something entirely
different.  So while we do define a {@link Symbol Symbol} class, as you can
see by following that link to its documentation, we expose it under the name
`LurchSymbol` instead, so that both the original JavaScript notion and our
Lurch-specific notion both remain available, neither overwriting the other.

The code below shows how to create every specific type of LC.  We print them
using the {@link LogicConcept#toPutdown toPutdown()} member function, because
the generic string representation of JavaScript objects is not useful here.

As you can see, the code is much less concise than creating LCs from putdown
notation, as above.  Hence this method is less elegant, but sometimes useful
when you need to put a specific object that you've already created into a new
LC hierarchy at a specific location.

```js
import { LurchSymbol } from './lde/src/index.js'

// Make a rather large symbol
const S = new LurchSymbol( 'any text can be a symbol' )
console.log( S.toPutdown() )
```

```js
import { Application } from './lde/src/index.js'

// Make the mathematical expression f(y)
const f = new LurchSymbol( 'f' )
const y = new LurchSymbol( 'y' )
const A = new Application( f, y )
console.log( A.toPutdown() )
```

```js
import { BindingExpression } from './lde/src/index.js'

// Make the mathematical expression ∀y.P
const forall = new LurchSymbol( 'forall' )
const P = new LurchSymbol( 'P' )
const B = new Application( forall,
    new BindingExpression( y.copy(), P ) ) // see comment below
console.log( B.toPutdown() )
```

Why did we use `y.copy()` when creating the binding above, rather than just
`y`?  Note that `y` is a specific symbol that is already sitting in the LC
tree called `A` declared earlier.  If we were to construct a new
{@link Binding Binding} `B` containing `y`, then we would necessarily be
removing `y` from the `A` hierarchy in which it sits to place it inside the
`B` hierarchy.  Thus `A` would inadvertently (and somewhat surprisingly) be
modified just by our creation of `B`!  This is obviously not desired, so we
make a copy of `y` instead.  This is another pitfall that can be avoided by
using putdown notation, except of course in those cases where you actually
want to put a specific instance of `x` into a specific hierarchy.

```js
import { Declaration } from './lde/src/index.js'

// Make the mathematical phrase "Let y be such that P(y)."
const D = new Declaration(
    [ y.copy() ], // can be an array of several variables to declare at once
    new Application( P.copy(), y.copy() ) )
console.log( D.toPutdown() )
```

```js
import { Environment } from './lde/src/index.js'

// Place copies of the preceding four expressions in an environment
const E = new Environment( S.copy(), A.copy(), B.copy(), D.copy() )
console.log( E.toPutdown() )
```
