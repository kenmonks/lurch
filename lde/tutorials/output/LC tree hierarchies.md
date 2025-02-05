
This tutorial assumes you know how to construct LC instances; if not, see
the tutorial on {@tutorial Constructing LCs}.  This tutorial covers the
essential read/write operations available on a hierarchy of nested LC
structures.

Every method documented here is actually defined not in the
{@link LogicConcept LogicConcept class}, but in the
{@link MathConcept MathConcept class}, which is a more general concept than an
LC.  Once interpretation of syntax has been built into the LDE, we will use it
to "interpret" {@link MathConcept MathConcepts} into
{@link LogicConcept LogicConcepts}.  Although that feature of the LDE has not
yet been built, the {@link MathConcept MathConcept class} remains the most
general class from which most others inherit.

(Each piece of sample code below is written as if it were a script sitting in
the root folder of this source code repository, and run from there with the
command-line tools `node`.  If you place your scripts in another folder, you
will need to adjust the path in each `import` statement accordingly.  If you
have not yet set up a copy of this repository with the appropriate Node.js
version installed, see [our GitHub README](https://github.com/lurchmath/lde),
which explains how to do so.)

## Preparing by building some LCs

Let's build a few nested LCs, so that we can use them as recurring examples in
the code below.

<br/>
<hr/>

```js
import { LogicConcept } from './lde/src/index.js'

const famous = LogicConcept.fromPutdown( '(= (+ (^ e (* i pi)) 1) 0)' )[0]
const env = LogicConcept.fromPutdown( '{ :A B :C D :E F }' )[0]
```


```text
// Console output:
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js' imported from /Users/monks/Dropbox/files/monkware/git/lurch/lde/tutorial-tmp-file-LC tree hierarchies.md.js
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

## Reading parent, child, and sibling relationships

Parents and children can be looked up in the ways you would expect.

```js
const lhs = famous.child( 1 )
const rhs = famous.child( 2 )
console.log( 'LHS:', lhs.toPutdown(), 'RHS:', rhs.toPutdown() )
console.log( 'LHS parent is whole equation?', lhs.parent() === famous )
console.log( 'Operator and both sides:', famous.children().map( x => x.toPutdown() ) )
console.log( 'In total, this many children:', famous.numChildren() )
```

There are also convenience functions for getting the first or last child, or
for getting the array of children without the first or last child.

```js
console.log( env.firstChild().toPutdown() )
console.log( env.lastChild().toPutdown() )
console.log( env.allButFirstChild().map( x => x.toPutdown() ) )
console.log( env.allButLastChild().map( x => x.toPutdown() ) )
```

You can also ask for the {@link MathConcept#nextSibling next} or
{@link MathConcept#previousSibling previous} sibling (child of same parent).

```js
const C = env.child( 2 )
console.log( 'Third child:', C.toPutdown() )
console.log( 'Right before it:', C.previousSibling().toPutdown() )
console.log( 'Right after it:', C.nextSibling().toPutdown() )
```

## Reading more deeply: descendants and ancestors

Parent and child relationships are just one step up or down the LC hierarchy.
We can represent several steps down into children of children using an array
of child indices called an {@link MathConcept#address address}.  We look up
descendants by address using a method called {@link MathConcept#index index()}.

```js
const pi = famous.index( [ 1, 1, 2, 2 ] )
console.log( 'Name of that descendant:', pi.toPutdown() )
console.log( 'Address in the equation:', pi.address() )
```

We can also get a list of all the {@link MathConcept#ancestors ancestors} of a
descendant LC, in order from bottom upwards.

```js
console.log( pi.ancestors().map( x => x.toPutdown() ) )
```

## Filtering for only some results

It's also common to want to find just those children, descendants, or
ancestors satisfying a certain condition (whatever that condition may be).
There are therefore functions
{@link MathConcept#childrenSatisfying childrenSatisfying()},
{@link MathConcept#descendantsSatisfying descendantsSatisfying()}, and
{@link MathConcept#ancestorsSatisfying ancestorsSatisfying()}, which take a
unary predicate on LCs as their argument and return results filtered using
that predicate.  Here is one example.

```js
// Get every descendants of the famous equation that is atomic.
const leaves = famous.descendantsSatisfying( x => x.isAtomic() )
console.log( leaves.map( x => x.toPutdown() ) )
```

Sometimes, you just want to check to see if there exists a child, descendant,
or ancestor with the given property, rather than fetch all of them.  (It is
usually more efficient this way, because you can stop looking when you've
found one, rather than continuing to find all of them and assemble the results
into an array.)  There are thus corresponding methods
{@link MathConcept#hasChildSatisfying hasChildSatisfying()},
{@link MathConcept#hasDescendantSatisfying hasDescendantSatisfying()}, and
{@link MathConcept#hasAncestorSatisfying hasAncestorSatisfying()}, which take
the same unary predicate and return a boolean.

## Altering the list of children of an LC

You can insert and remove children using zero-based indexing.  This modifies
the original LC in place; it does not create a copy.

```js
console.log( 'Before:', env.toPutdown() )
env.removeChild( 2 )
env.insertChild( new LurchSymbol( 'YO' ), 0 )
console.log( 'After:', env.toPutdown() )
```

Because one often wants to insert or remove a child from the beginning or
ending of the list of children, there are four methods whose names correspond
to the methods of the same names on JavaScript arrays:
{@link MathConcept#pushChild pushChild()},
{@link MathConcept#popChild popChild()},
{@link MathConcept#shiftChild shiftChild()}, and
{@link MathConcept#unshiftChild unshiftChild()}.

You can also replace all the children at once with a call to
{@link MathConcept#setChildren setChildren()}, which takes an array of any
length as argument; it need not be the same number of children.

## Warning: moving an LC to a new location removes it from its old location!

If you use any of the tools described above for inserting a new child into an
LC, if that child was formerly a child of a different LC, it will be removed
from its original location before being placed in the new location!  This can
sometimes be surprising, if you forget that each LC can exist in only one
location in one LC tree at a time.

Consider the following example.  The goal is to write the equation
$6x-5=6x-5$, but using the wrong technique produces an incorrect result.

```js
import { LurchSymbol, Application } from './lde/src/index.js'

// Construct the term that should appear on each side:
const term = LogicConcept.fromPutdown( '(- (* 6 x) 5)' )[0]

// The following step seems correct, but tries to place the same exact term
// object on both sides of an equation, which is two distinct places in an LC
// tree, and will not work as expected:
let equation = new Application( new LurchSymbol( '=' ), term, term )

// The (surprising and unintended) result:
console.log( equation.toPutdown() )
```

The correct way:

```js
equation = new Application( new LurchSymbol( '=' ), term, term.copy() )
console.log( equation.toPutdown() )
```

## Removing and replacing LCs

To remove an LC from a hierarchy, simply call its
{@link MathConcept#remove remove()} method.  Note that this will alter its
parent (and, indirectly, grandparent, etc.) LC by removing one of its
descendants.

```js
console.log( 'Before:', equation.toPutdown() ) // See equation, above.
term.remove() // Recall that term is the left hand side of the equation.
console.log( 'After:', equation.toPutdown() )
```

One can remove an LC and {@link MathConcept#replaceWith replace it} with a
different one all in a single operation, as follows.

```js
console.log( 'Before:', env.toPutdown() )
env.child( 4 ).replaceWith( pi.copy() )
console.log( 'After:', env.toPutdown() )
```

If we had written `pi` instead of `pi.copy()`, it would have removed the
symbol `pi` from its original place in the `famous` equation from earlier,
rendering that equation not false so much as syntactically invalid.

## Two important relations: earlier/later and accessibility

One very important relation among nodes in an LC tree is
{@link MathConcept#isAccessibleTo accessibility}.  (See that link for the
official explanation of the concept.)  One can test it in a variety of
equivalent ways:

```js
const c1 = env.firstChild()
const c2 = env.lastChild()
console.log( c1.isAccessibleTo( c2 ) )
console.log( c2.isInTheScopeOf( c1 ) ) // equivalent to previous line
```

You can also get a list of all the things accessible to (or in the scope of)
a given LC.

```js
console.log( c2.accessibles().map( x => x.toPutdown() ) )
console.log( c1.scope().map( x => x.toPutdown() ) )
```

The second very important relationship is whether one node appears
{@link MathConcept#isEarlierThan earlier than} another in (a pre-order
traversal of) the LC tree in which both sit.

```js
console.log( c1.isEarlierThan( c2 ) )
console.log( c1.isLaterThan( env ) ) // children are later than parents
```

You can also ask for the {@link MathConcept#nextInTree next} or
{@link MathConcept#previousInTree previous} node in a pre-order tree
traversal.  This sometimes coincides with being the next or previous sibling,
but not always.  Consider the following example.

```js
let temp = famous
while ( temp ) {
    console.log( temp.toPutdown() )
    temp = temp.nextInTree()
}
```
