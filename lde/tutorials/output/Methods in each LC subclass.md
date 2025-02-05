
This tutorial assumes you know how to construct LC instances; if not, see
the tutorial on {@tutorial Constructing LCs}.  This tutorial covers the most
common methods available in each of the common LC subclasses, such as symbols,
declarations, etc.

(Each piece of sample code below is written as if it were a script sitting in
the root folder of this source code repository, and run from there with the
command-line tools `node`.  If you place your scripts in another folder, you
will need to adjust the path in each `import` statement accordingly.  If you
have not yet set up a copy of this repository with the appropriate Node.js
version installed, see [our GitHub README](https://github.com/lurchmath/lde),
which explains how to do so.)

## Symbols have text and sometimes a value

Every {@link Symbol Symbol} instance gives access to the text of the symbol
itself, using {@link Symbol#text the `.text()` method}.  If the
{@link Symbol Symbol} you've created can be interpreted as an integer, a real
number (floating point), or a string, you can specify this with an attribute,
as shown below, and then {@link Symbol#value the `.value()` method} will
respect that attribute and convert the {@link Symbol Symbol} into a JavaScript
atomic value.

<br/>
<hr/>

```js
import { LurchSymbol } from './lde/src/index.js'

const x = new LurchSymbol( 'x' )
console.log( 'Text of x:', x.text() )

const closeToPi = new LurchSymbol( '3.14159' )
console.log( 'Value of pi:', closeToPi.value() ) // does not work
closeToPi.setAttribute( 'evaluate as', 'real' )
console.log( 'Value of pi:', closeToPi.value() ) // now it works
```


```text
// Console output:
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js' imported from /Users/monks/Dropbox/files/monkware/git/lurch/lde/tutorial-tmp-file-Methods in each LC subclass.md.js
    at finalizeResolution (node:internal/modules/esm/resolve:275:11)
    at moduleResolve (node:internal/modules/esm/resolve:932:10)
    at defaultResolve (node:internal/modules/esm/resolve:1056:11)
    at ModuleLoader.defaultResolve (node:internal/modules/esm/loader:654:12)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:603:25)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:586:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:242:38)
    at ModuleJob._link (node:internal/modules/esm/module_job:135:49) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js'
}

Node.js v22.13.0
```



<hr/>
<br/>

## Applications have an operator and operands

The "head" (or first child) of an {@link Application Application} expression
is the {@link Application#operator operator} and all the remaining children
are the {@link Application#operands operands}.  This is because we use prefix
notation in {@link LogicConcept#putdown putdown} and throughout the LDE, in
the style of LISP and related languages.

```js
import { LogicConcept } from './lde/src/index.js'

const expr1 = LogicConcept.fromPutdown( '(- (* 2 (^ x 2)) 1)' )[0]
console.log( 'Outermost operator:', expr1.operator().toPutdown() )
console.log( 'Its operands:', expr1.operands().map( x => x.toPutdown() ) )
const expr2 = expr1.child( 1 )
console.log( 'Next operator:', expr2.operator().toPutdown() )
console.log( 'Its operands:', expr2.operands().map( x => x.toPutdown() ) )
const expr3 = expr2.child( 2 )
console.log( 'Innermost operator:', expr3.operator().toPutdown() )
console.log( 'Its operands:', expr3.operands().map( x => x.toPutdown() ) )
```

For any expression at all, you can fetch its full list of children, which for
an {@link Appliction Application} is the operator and operands in one list.
You can also ask whether an expression is the outermost one in the tree in
which it sits (meaning it's inside an {@link Environment Environment}, or not
inside any parent), and you can fetch the outermost expression surrounding an
expression as well.

```js
console.log( 'Children of outer expression:',
             expr1.children().map( x => x.toPutdown() ) )
console.log( 'That one is outermost?', expr1.isOutermost() )
console.log( 'Is one of its children outermost?', expr2.isOutermost() )
console.log( 'Fetch outermost from within:',
             expr2.getOutermost().toPutdown() )
```

## Bindings have a bound variables and a body

You can fetch either the names of the bound variables, as shown below, or the
actual bound variable objects (as {@link Symbol Symbols}) that sit inside the
expression, using {@link Binding#boundSymbols a different function}.

Note that when a binding has multiple symbols bound, you must add parentheses
to clarify where the list of symbols ends, or it will assume just one bound
variable (`z` in the example below).

```js
const universal = LogicConcept.fromPutdown( '(forall (x y z) , (P x y z))' )[0]
const binding = universal.child( 1 ) // = x y z , (P x y z)
console.log( 'Quantifier:', universal.child( 0 ).toPutdown() )
console.log( 'Bound variables:', binding.boundSymbolNames() )
console.log( 'Body:', binding.body().toPutdown() )
```

And the list of children of a binding are the bound variables and the body,
in the order they appear in the binding.

```js
console.log( binding.children().map( x => x.toPutdown() ) )
```

## Declarations have symbols and optionally a body

A {@link Declaration Declaration} can be of one of only two types: a constant
declaration or a variable declaration.  There are two static constants in the
{@link Declaration Declaration} class for this purpose,
{@link Declaration#Constant Declaration.Constant} and
{@link Declaration#Variable Declaration.Variable}, as shown below.
You can query the {@link Declaration#type type()}, list of
{@link Declaration#symbols symbols()}, and {@link Declaration#body body()},
although not every declaration has a body.

```js
import { Declaration } from './lde/src/index.js'

const decl = LogicConcept.fromPutdown( '[a b c var , (> (+ a b) c)]' )[0]
console.log( 'Declared symbols:', decl.symbols().map( x => x.toPutdown() ) )
console.log( 'Declaration body:', decl.body().toPutdown() )
```

If there were no body, as in `[a b c var]`, then `decl.body()` would return
undefined.

## Environments have conclusions

As with any LC, you can get the children of an environment with the usual
{@link MathConcept#children children()} method, but you can also ask for its
set of {@link Environment#conclusions conclusions()}.  (See that link for the
definition of "conclusions" in an {@link Environment Environment}.)  You can
also ask whether any LC is a conclusion in one of its ancestors.

```js
const env = LogicConcept.fromPutdown( '{ A :{ B C } { :D E } }' )[0]
console.log( 'Children:', env.children().map( x => x.toPutdown() ) )
console.log( 'Conclusions:', env.conclusions().map( x => x.toPutdown() ) )
const D = env.child( 2 ).child( 0 )
console.log( 'D is a conclusion?', D.isAConclusionIn( env ) )
```
