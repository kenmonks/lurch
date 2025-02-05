
This tutorial assumes you know how to construct LC instances; if not, see
the tutorial on {@tutorial Constructing LCs}.  This tutorial covers how to
make, look up, modify, and remove connections among LCs.

(Each piece of sample code below is written as if it were a script sitting in
the root folder of this source code repository, and run from there with the
command-line tools `node`.  If you place your scripts in another folder, you
will need to adjust the path in each `import` statement accordingly.  If you
have not yet set up a copy of this repository with the appropriate Node.js
version installed, see [our GitHub README](https://github.com/lurchmath/lde),
which explains how to do so.)

## Motivation

LCs always sit in trees/hierarchies, and there are several important relations
among LCs in the same tree, such as which comes earlier, or which is
accessible to which, but the structure is always a tree.  Sometimes, however,
we want one LC in a tree to be able to refer to another one anywhere else in
the hierarchy.

For instance, a step in a proof may want to refer back to a step earlier in
the proof, or a subproof earlier in the proof, or a lemma several paragraphs
earlier.  One way to make those references is with *connections.*  (It is not
required that such references happen via connections, but connections make
references easy to use, so they are good to use when possible.)

## Tracking IDs

Before we can put connections into an LC tree, that tree needs to give an ID
to each LC in the hierarchy, and enable "tracking" for such IDs, meaning that
the LC class itself will record the fact that those IDs are being used for
those LCs.  Here we create an LC hierarchy and assign IDs to each of its
nodes.

<br/>
<hr/>

```js
import { LogicConcept } from './lde/src/index.js'

const env = LogicConcept.fromPutdown( '{ A { :B C } { :D E } }' )[0]
const A = env.firstChild()          
const B = env.index( [ 1, 0 ] )     
const C = env.index( [ 1, 1 ] )     
const D = env.index( [ 2, 0 ] )     
const E = env.index( [ 2, 1 ] )     

A.setID( 'A' )
B.setID( 'B' )
C.setID( 'C' )
D.setID( 'D' )
E.setID( 'E' )
env.trackIDs()

console.log( env.toPutdown() )
```


```text
// Console output:
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js' imported from /Users/monks/Dropbox/files/monkware/git/lurch/lde/tutorial-tmp-file-Connections among LCs.md.js
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

## Where connections live

Connections exist in the LC hierarchy only as attributes stored in the LCs
themselves.  That is, if you want to know whether there's a connection from an
LC $A$ to an LC $B$, you look at the attributes of $A$ and $B$ and see if they
contain data about a connection between the two LCs.  There are, of course, a
whole host of methods for looking up and manipulating such attributes, so that
the developer does not need to dig into the specific format of connection data
storage and manipulate it.

But the point here is that connections are *not* a separate collection of
objects that live outside the LC hierarchy.  Rather, they are second-class
citizens stored inside the attributes in the LC hierarchy.  However, you can
create JavaScript {@link Connection Connection} objects *based on that data,*
that make it easy to manipulate that data, and treat connections *as if* they
were first-class citizens in the LC world.  For more informations about the
subtleties of how this works, {@link Connection see here}.

Let's see an example.

## Creating a connection

Let's pretend that $E$ needs to refer back to $A$ for some reason.  Maybe $E$
is citing $A$ as a theorem that supports $E$, for example.  Here's how to form
a connection between them.  We give the connection a globally unique ID (here
we chose `"con1"`) and some attributes (here just one attribute, that the type
of the connection is `"citation"`).

```js
// Now let's pretend E needs to refer back to A for some reason.
// Maybe E is citing A as a theorem that supports E, for example.
// Here's how to form a connection between them; explanation below.
E.connectTo( A, 'con1', { 'type': 'citation' } )
```

This example is *not* intended to legislate any format for how theorem
citations must be stored in the LDE.  Rather, this is just a made-up example
for the purposes of this tutorial.  One should not assume, for example, that
all connections must have a `"type"` attribute; it's just an example.

Note that all connection IDs must be globally unique.  If you try to re-use a
connection ID when creating a new connection, the attempt will fail and you
will not actually create a connection after all.

## Querying and altering connections

We can see that the connection was successfully created by querying it in
various ways.  Note that because the connection is stored as data inside LCs,
it is guaranteed to get stored with those LCs if they are
{@link MathConcept#toJSON serialized} for saving to disk or some online
database.  That is, if you have an LC hierarchy, you automatically have all
connections within it as well.

```js
// From E, we can ask which connections go outward to other LCs:
const outs = E.getConnectionsOut()
console.log( 'What connections exit E?', outs )
// From A, we can ask which connections come inward from other LCs:
const ins = A.getConnectionsIn()
console.log( 'What connections enter A?', ins )
// We can look up various things about any given connection:
const connection = outs[0]
console.log( 'Connection attribute keys:', connection.getAttributeKeys() )
console.log( 'Connection type:', connection.getAttribute( 'type' ) )
```

See also {@link MathConcept#getConnectionIDs getConnectionIDs()},
{@link MathConcept#getConnectionIDsIn getConnectionIDsIn()},
{@link MathConcept#getConnectionIDsOut getConnectionIDsOut()},
{@link MathConcept#getConnections getConnections()},
{@link MathConcept#getConnectionsIn getConnectionsIn()}, and
{@link MathConcept#getConnectionsOut getConnectionsOut()}.

As you can see in the code above, a {@link Connection Connection} is a real
JavaScript class.  You don't have to build them using the
{@link MathConcept#connectTo connectTo()} function in LCs; you can instead use
the {@link Connection.create create()} function in the
{@link Connection Connection} class, though that is typically less convenient.

If you have a connection, you can change its attributes with
{@link Connection#setAttribute setAttribute()} and
{@link Connection#attr attr()}, which behave analogously to the functions of
the same name in the LC class.

```js
connection.attr( { 'color': 'blue' } )
console.log( 'Keys are now:', connection.getAttributeKeys() )
```

You can also query a connection's source and target LCs.  In the output shown
below, notice that there are connection-related attributes hidden inside both
$A$ and $E$.  You as the developer do not need to bother with these
attributes, nor understand their format.  The API documented in this tutorial
handles that for you.  But the attributes you see below are the means by which
connections are stored in an LC hierarchy.

```js
console.log( 'Connection goes out from:' )
console.log( connection.source().toPutdown() )
console.log( 'Connection goes into:' )
console.log( connection.target().toPutdown() )
```

We can also tell a connection to {@link Connection#remove remove()} itself,
and it alters the data shown above so that both the source and target LCs know
that they are no longer connected, as shown below.

```js
connection.remove()
console.log( E.getConnections(), A.getConnections() )
```
