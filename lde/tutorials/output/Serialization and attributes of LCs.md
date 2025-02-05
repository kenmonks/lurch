
This tutorial assumes you know how to construct LC instances; if not, see
the tutorial on {@tutorial Constructing LCs}.  This tutorial covers how to
read and write attributes of LCs, plus how to serialize and deserialize them.

(Each piece of sample code below is written as if it were a script sitting in
the root folder of this source code repository, and run from there with the
command-line tools `node`.  If you place your scripts in another folder, you
will need to adjust the path in each `import` statement accordingly.  If you
have not yet set up a copy of this repository with the appropriate Node.js
version installed, see [our GitHub README](https://github.com/lurchmath/lde),
which explains how to do so.)

## Reading and writing attributes

Every LC contains a mapping from strings to arbitrary JSON data.  By default,
this mapping is empty, but you can extend it as much as you like.

<br/>
<hr/>

```js
import { LogicConcept } from './lde/src/index.js'

const L1 = LogicConcept.fromPutdown( '(just some expression)' )[0]
const L2 = LogicConcept.fromPutdown( '{ just some environment }' )[0]
L1.setAttribute( 'color', 'green' )
L2.setAttribute( 'height in cm', 100 )
console.log( L1.getAttribute( 'color' ) )
console.log( L2.getAttribute( 'color' ) )
console.log( L2.getAttributeKeys() )
```


```text
// Console output:
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js' imported from /Users/monks/Dropbox/files/monkware/git/lurch/lde/tutorial-tmp-file-Serialization and attributes of LCs.md.js
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

Although large amounts of attribute data are awkward to write in putdown
notation, it is possible to do so.  The
{@link LogicConcept#toPutdown toPutdown()} function supports the notation, as
you can see below.  Refer to the documentation for
{@link LogicConcept.fromPutdown fromPutdown()} for a full specification of the
attribute notation.

```js
console.log( L1.toPutdown() )
console.log( L2.toPutdown() )
```

It is often useful to be able to construct an LC and assign attributes to it
in a single line of code.  Thus the {@link MathConcept#attr attr()} function
lets us add a whole dictionary of attributes at once, and it returns the
original LC, for use in code like the following.

```js
import { LurchSymbol, Environment } from './lde/src/index.js'

const mushroom = new LurchSymbol( 'mushroom' )
const cluster = new Environment(
    mushroom.copy().attr( { 'size': 3, 'color': 'blue' } ),
    mushroom.copy().attr( { 'size': 1, 'color': 'pink' } ),
    mushroom.copy().attr( { 'size': 5, 'color': 'gray' } )
)
console.log( cluster.toPutdown() )
```

## Boolean attributes

It is also common to add a boolean property to an LC by setting an attribute
with that name to "true," as in `myLC.setAttribute( 'constant', 'true' )`.
Becauase this is common, we have convenience functions for adding, removing,
and querying boolean attributes.

```js
const ironMan = new LurchSymbol( 'Tony Stark' )
console.log( 'Before:', ironMan.isA( 'super hero' ) )
ironMan.makeIntoA( 'super hero' )
console.log( 'After:', ironMan.isA( 'super hero' ) )
ironMan.unmakeIntoA( 'super hero' )
console.log( 'Even later:', ironMan.isA( 'super hero' ) )
```

There's also `myLC.asA( 'foo' )` that makes a copy and adds the attribute to
the copy, returning the copy.

## Serialization and deserialization

We will often want to be able to save LCs somewhere, such as onto a user's
filesystem, or into a browser's storage, or an online database.  Thus we need
a way to convert an LC tree into static data for saving, and then be able to
later recreate the tree in memory from that static data.  The static data
format we choose is (naturally, since we're working in JavaScript) JSON.

```js
import { MathConcept } from './lde/src/index.js'

const saved = ironMan.toJSON()
console.log( saved )
const ironManCopy = MathConcept.fromJSON( saved )
console.log( ironManCopy.toPutdown() )
```

Of course, we would use serialization for the saving and loading purposes
mentioned above, which allow data to persist even when the app is not running.
To just make a copy of an LC, we do not need to convert to and from JSON data;
there is a {@link MathConcept#copy copy()} method for that purpose.  Because
two different LC trees can have the same structure, there is also a structural
equality comparison method, {@link MathConcept#equals equals()}.

```js
const ironManCopy2 = ironMan.copy()
console.log( 'Same exact object?', ironMan == ironManCopy )
console.log( 'Same structure?', ironMan.equals( ironManCopy ) )
console.log( 'Same exact object?', ironMan == ironManCopy2 )
console.log( 'Same structure?', ironMan.equals( ironManCopy2 ) )
```
