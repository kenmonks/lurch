
This tutorial assumes you know how to construct LC instances; if not, see
the tutorial on {@tutorial Constructing LCs}.  This tutorial covers what it
means for a symbol to be free or bound inside an LC tree.

(Each piece of sample code below is written as if it were a script sitting in
the root folder of this source code repository, and run from there with the
command-line tools `node`.  If you place your scripts in another folder, you
will need to adjust the path in each `import` statement accordingly.  If you
have not yet set up a copy of this repository with the appropriate Node.js
version installed, see [our GitHub README](https://github.com/lurchmath/lde),
which explains how to do so.)

## Free variables vs. free symbols

Most situations that deal with the concepts of free/bound with respect to
binding expressions speak of free and bound *variables.*  But in the world of
LCs, we do not have variables as a specific category; we have only the
general category of *symbols* that can be used as variables or constants.
Thus here we will speak of free and bound symbols.

The concept of a bound variable has the usual meaning:  Inside any
{@link Binding Binding} expression `(head sym1 sym2 ... symN , body)`, the
symbols `sym1` through `symN` are bound.  Outside of that expression (assuming
there is no containing binding expression of the same symbol(s)), they are not
bound, and are thus called free.

However, in Lurch, we separate the operator (`head` in the above example) from
the binding itself, so the code written above, `(head sym1 sym2 ... symN , body)`
is equivalent to the more explicit version `(head (sym1 sym2 ... symN , body))`.
The outer expression is a unary application of operator in question (here called
`head`) and the inner expression is a "binding" that is equivalent to `body` but
with several variables now bound.

<br/>
<hr/>

```js
import { LogicConcept } from './lde/src/index.js'

const universalExample = LogicConcept.fromPutdown( '(forall x , (P x))' )[0]
universalExample.descendantsSatisfying( d => d.isAtomic() ).map( d => {
    console.log( 'Is', d.toPutdown(), 'free?', d.isFree() )
} )
```


```text
// Console output:
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js' imported from /Users/monks/Dropbox/files/monkware/git/lurch/lde/tutorial-tmp-file-Free and bound variables.md.js
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

You can also ask the question relatively:  Is a symbol free in a specific
ancestor?

```js
const outer = LogicConcept.fromPutdown( '(exists x , (forall y , (> x y)))' )[0]
const inner = outer.child( 1 ).body() // = (forall y , (> x y))
const secondX = inner.child( 1 ).body().child( 1 ) // = (> x y)
console.log( 'Is x free in the inner binding?', secondX.isFree( inner ) )
console.log( 'Is x free in the outer binding?', secondX.isFree( outer ) )
```

The {@link MathConcept#isFree isFree()} method works not only for symbols.
You can ask whether a nonatomic expression is free, and it will be free if and
only if all of the symbols free within it are free in the given context.

```js
// Is the (> x y) free in the (forall y , (> x y)) from above?
console.log( inner.child( 1 ).body().isFree( inner ) )
```

## Free occurrences

We can also ask whether a symbol {@link MathConcept#occursFree occurs free}
anywhere in an expression.  Note the difference between `x.occursFree(y)` and
`y.occursFree(x)` and that the order may be different from what you expect.

```js
import { LurchSymbol } from './lde/src/index.js'

const example = LogicConcept.fromPutdown( '(and (> x 1) (forall x , (R x x)))' )[0]
console.log( 'Last x free?', example.child( 2 ).child( 1 ).body().child( 2 ).isFree() )
console.log( 'Any x free?', example.occursFree( new LurchSymbol( 'x' ) ) )
```

You can get all free occurrences by combining
{@link MathConcept#descendantsSatisfying descendantsSatisfying()} with
{@link MathConcept#isFree isFree()}.

## Variable capture and replacing free occurrences

The usual notion of variable capture exists when considering substitution into
a binding, and you can check to see if it will happen using
{@link MathConcept#isFreeToReplace isFreeToReplace()}.  You can do all of the
free replacements with {@link MathConcept#replaceFree replaceFree()}.

```js
console.log( 'Before:', example.toPutdown() )
example.replaceFree(
    new LurchSymbol( 'x' ),
    LogicConcept.fromPutdown( '(- 3 x)' )[0] )
console.log( 'After:', example.toPutdown() )
```
