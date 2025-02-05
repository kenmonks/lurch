
This tutorial assumes you know how to construct LC instances; if not, see
the tutorial on {@tutorial Constructing LCs}.  This tutorial covers how to use
{@link module:Matching the Matching module} to do pattern matching on LCs.  If
you are unfamiliar with the concept of pattern matching, follow that link to
the Matching module and read that entire page of documentation first (although
you can skip the final section, entitled "Technical details").

(Each piece of sample code below is written as if it were a script sitting in
the root folder of this source code repository, and run from there with the
command-line tools `node`.  If you place your scripts in another folder, you
will need to adjust the path in each `import` statement accordingly.  If you
have not yet set up a copy of this repository with the appropriate Node.js
version installed, see [our GitHub README](https://github.com/lurchmath/lde),
which explains how to do so.)

## Constructing patterns and expressions

A matching problem is built from a set of pattern-expression pairs.  We thus
need to be able to construct both patterns and expressions.  Expressions, of
course, we already know how to construct; they are instance of the subclass
of {@link LogicConcept LogicConcept} that is called
{@link Expression Expression}!  More specifically, if you construct an LC
using the {@link LogicConcept.fromPutdown fromPutdown()} function and simply
don't use any of the notation for {@link Environment Environments} or 
{@link Declaration Declarations}, you are guaranteed to get only (an array of)
{@link Expression Expressions} as the result.

<br/>
<hr/>

```js
import { LogicConcept } from './lde/src/index.js'

const [ expr1, expr2 ] = LogicConcept.fromPutdown( 'atomic   (not atomic)' )
console.log( expr1.toPutdown() )
console.log( expr2.toPutdown() )
```


```text
// Console output:
node:internal/modules/esm/resolve:275
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/monks/Dropbox/files/monkware/git/lurch/lde/lde/src/index.js' imported from /Users/monks/Dropbox/files/monkware/git/lurch/lde/tutorial-tmp-file-Pattern matching.md.js
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

To construct a pattern, first build it as an expression, and then mark zero or
more of its descendants as metavariables.  For example, if you want the
pattern $f(x)$, where both $f$ and $x$ are metavariables, you could proceed as
follows.

```js
import { Matching } from './lde/src/index.js'

const pat = LogicConcept.fromPutdown( '(f x)' )[0]
pat.child( 0 ).makeIntoA( Matching.metavariable )
pat.child( 1 ).makeIntoA( Matching.metavariable )
console.log( pat.toPutdown() )
```

If you wanted every instance of a certain symbol in a large expression to be
marked as a metavariable, you could use code like the following to be concise
about it.

```js
const f = LogicConcept.fromPutdown( 'f' )[0]
pat.descendantsSatisfying( d => d.equals( f ) )
   .map( d => d.makeIntoA( Matching.metavariable ) )
```

## Building a matching problem

A matching problem is a set of constraints.  Let's build a small matching
problem from just one constraint, the pattern $f(x)$ from above matched with
the expression `expr2`, which was `(not atomic)`.  Since they are both a unary
function applied to one argument, and both $f$ and $x$ were marked as
metavariables, the problem should have exactly one solution.

```js
let P = new Matching.Problem( pat, expr2 )
console.log( P )
```

Notice that the output above is not so helpful, because it just classifies the
pattern and expression as instances of the {@link Application Application}
class, which is accurate but not very specific.  We can get a more helpful and
more compact rendering of the {@link Problem Problem} using its
{@link Problem#toString toString()} member function, explicitly or implicitly.

```js
console.log( P.toString() ) // explicit toString() call
console.log( `P = ${P}` )   // implicit toString() call
```

The notation is mostly straightforward; we have a set `{...}` of
{@link Constraint Constraints}, containing just one member, the
pattern-expression pair ($f(x)$,`(not atomic)`).  But the notation for $f(x)$
is not `(f x)` as one might expect, but rather `(f__ x__)`, for the following
reason.  As you can see from earlier output, metavariables are marked as such
using an attribute that makes their putdown notation cumbersome.  The
{@link Problem#toString toString()} method for the {@link Problem Problem}
class replaces that cumbersome notation with a double underscore, to make it
easy to identify metavariables on sight without taking up much space in the
output.

We now have a matching problem that we can ask to solve itself.

## Solving matching problems

Because solving matching problems can be a slow process, it would not be a
good design if you were forced to compute *all* solutions at once.  Thus the
{@link Problem Problem} class gives you the opportunity to compute solutions
one at a time, and you can stop at any point, using the standard JavaScript
feature of a "generator."

If you're unfamiliar with the idea of generators, you can fall back on the
simpler method of computing all solutions at once and placing them in a
standard JavaScript array.  Simply apply the built-in JavaScript
`Array.from()` function to convert the solution generator to an array of all
of its results.  Notice how solutions also have a more helpful output
notation if you use their {@link Solution#toString toString()} function,
either implicitly or explicitly.  (Later we will see how to generate
solutions one at a time.)

```js
let sols = Array.from( P.solutions() )
console.log( `P -> [${sols}]` )
```

The above notation means that there is one solution, the substitution function
expressed as the set of ordered pairs `{ (f__,not), (x__,atomic) }`.  (The
suffix `/cc{}` means that there are no {@link CaptureConstraints
CaptureConstraints} that apply to this solution.)

You can, of course, query the individual components of the
{@link Solution Solution}, with its API, as in the following example.

```js
console.log( 'Number of solutions to P:', sols.length )
const sol1 = sols[0]
console.log( 'Metavariables in the solution:', sol1.domain() )
console.log( 'Instantiation for f:', sol1.get( 'f' ).toPutdown() )
console.log( 'Instantiation for x:', sol1.get( 'x' ).toPutdown() )
```

## When there are no solutions

Of course, we can also form matching problems that have no solutions.  For
example, the form $f(x)$ would not match the atomic expression `expr1` above.

```js
sols = new Matching.Problem( pat, expr1 ).solutions()
console.log( 'Solutions:', Array.from( sols ) )
```

## A more complex example

The main functionality of {@link module:Matching the Matching module} is
covered above, but we do a more substantial example here in order to show the
full functionality and complexity of the module.

We would like to match the pattern $P(x)$ to the expression $f(a,a)$, but we
are now no longer considering $P(x)$ to mean "a metavariable $P$ applied to a
metavariable $x$," but rather "an expression function $P$ applied to a
metavariable $x$."  (Recall the notion of expression functions defined in the
{@link module:Matching documentation for the Matching module}).  We thus
cannot simply parse the putdown notation `(P x)`, flag `P` and `x` as
metavariables, and move on, because that would have the wrong meaning.  There
is a special function in {@link module:Matching the Matching module} for
creating expressions like $P(x)$, which do not mean regular function
application of $P$ to $x$, but application of $P$ as an expression function to
the expression $x$.  The function is called
{@link module:ExpressionFunctions.newEFA newEFA()}, for "new expression function
application."

```js
// pattern
const mvP = LogicConcept.fromPutdown( 'P' )[0].asA( Matching.metavariable )
const mvx = LogicConcept.fromPutdown( 'x' )[0].asA( Matching.metavariable )
const Pofx = Matching.newEFA( mvP, mvx )

// expression
const faa = LogicConcept.fromPutdown( '(f a a)' )[0]

// problem
P = new Matching.Problem( Pofx, faa )
console.log( P.toString() )
```

It's a fun puzzle to stop at this point and try to figure out what all the
valid solutions to this matching problem are!  Once you're ready for the
spoiler, scroll down.

We will also use this opportunity to see how to generate solutions one at a
time, rather than forcing the Matching module to compute all of them before we
get to see any of them.  We will use a loop, which computes one solution for
each iteration of the loop, right before that iteration of the loop.  If you
need only one or two of the solutions, you could use `break` to terminate the
loop early, and the remainder of the solutions would not be computed, thus not
wasting any computation time.

```js
let counter = 0
for ( let solution of P.solutions() ) {
    console.log( `Solution ${++counter}: ${solution}` )
    // For example, if you needed only two solutions, we could do:
    // if ( counter == 2 ) break
}
```

To clarify the meaning of the notation used in the output above, we repeat the
same 6 solutions here, in more natural mathematical notation:

 * $P$ could be the constant function that always returns $f(a,a)$
 * $P$ could be the identity function and $x$ would be $f(a,a)$
 * $P$ could be the function $v\mapsto v(a,a)$ and $x$ would be $f$
 * $P$ could be the function $v\mapsto f(v,a)$ and $x$ would be $a$
 * $P$ could be the function $v\mapsto f(a,v)$ and $x$ would be $a$
 * $P$ could be the function $v\mapsto f(v,v)$ and $x$ would be $a$

