<span hidden>$\newcommand{\lode}{\mathbb{LODE}}$</span>\lode is an instance of
the node command line REPL which has all of the LDE commands and supporting
utilities preloaded.  This is useful for debugging and experimenting with the
functions and classes defined in the repository. This initialized version of
`node` can be thought of as `Lurch node`, or simply $\lode$ for short.

## Running $\lode$

To run $\lode$ from the command line in a terminal from the `src/experimental/` subfolder the command `node lode`. (If you have not yet set up a copy
of this repository with the appropriate Node.js version installed, see
<a href='https://github.com/lurchmath/lde'>our GitHub README</a>, which explains
how to do so.)

```
> node lode

Welcome to 𝕃𝕠𝕕𝕖 - the Lurch Node app
(type .help for help)
▶︎ 
```

You are now at the Lurch Node REPL command prompt.  All of the exported modules in
the [src/index.js file]{@link https://github.com/lurchmath/lde/blob/main/src/index.js} in this repository and all of the utilities useful tools from the `experimental` folder are available at the $\lode$ prompt.  For example, you can now do things like this (see {@link LogicConcept LogicConcept} and {@link LogicConcept#toPutdown toPutdown}):

```
Welcome to 𝕃𝕠𝕕𝕖 - the Lurch Node app
(type .help for help)
▶︎ LogicConcept.fromPutdown(`{ :Hello ( World ! ) }`)[0].toPutdown()
'{ :Hello (World !) }'
▶︎
```
Since creating and viewing LogicConcepts in putdown notation is often what we want, $\lode$ provides a shortcut for constructing LCs and displays LCs in Putdown notation by default.
```
▶︎ LogicConcept.fromPutdown(`{ :Hello ( World ! ) }`)[0].toPutdown()
'{ :Hello (World !) }'
▶︎ lc(`{ :Hello ( World ! ) }`)  // constructs the same thing
{ :Hello (World !) }
```
There is also a more user friendly parser that supports features of asciimath {@link http://asciimath.org}.  This allows you to construct LogicConstructs like this
```
▶︎ $(`forall x. 0 leq x  implies x^2+1 leq (x+1)^2`)
(∀ x , (⇒ (< 0 x) (≤ (+ (^ x 2) 1) (^ (+ x 1) 2))))
``` 
and also accepts unicode input
```
▶︎ $(`∀x. 0≤x ⇒ x^2+1≤(x+1)^2`)
(∀ x , (⇒ (< 0 x) (≤ (+ (^ x 2) 1) (^ (+ x 1) 2))))
```
If you validate a document in $\lode$ the result can be displayed in many different ways, including syntax highlighting.

To run the test suite simply type the command `.test`.  This loads numerous example documents in the array `acid`.
```
▶︎ .test
Loading the acid tests ...

Parser Test: → ok
Test 0: (END Example 1) If P⇒Q then ¬P∨Q.
  Test 0.0 → ok
Test 1: (END Example 4) If ∃x,∀y,Q(x,y) then ∀y,∃x,Q(x,y)
  Test 1.0 → ok
     :
 (omitted)
     :
Test 22: Math 299 Midterm Exam Proofs 2023
  Test 22.0 → ok

50 tests passed - 0 tests failed

904 green checks
58 red marks
Test result stored in the array 'acid'
```

To view a document in various formats you can use the `.report()` command with various options (`all`)
```
▶︎ acid[1].report(user)
  {
42  (END Example 4) If ∃x,∀y,Q(x,y) then ∀y,∃x,Q(x,y)
43  {
      Thm 4: If ∃x,∀y,Q(x,y) then ∀y,∃x,Q(x,y)
      { :(∃ x , (∀ y , (Q x y))) (∀ y , (∃ x , (Q x y)))✔︎ }✔︎
      Proof:
      {
        :(∃ x , (∀ y , (Q x y)))
        {
          :Let[z]
          ForSome[c , (∀ y , (Q c y))]✔︎
          (Q c z)✔︎
          (∃ x , (Q x z))✔︎
        }✔︎
        (∀ y , (∃ x , (Q x y)))✔︎
      }✔︎
    }✔︎
  }✔︎
```

You can use `.list` to see a list of current files and libraries and load a document with the commands `loadDoc()` and `initialize()`.
```
▶︎ doc = loadDoc('proofs/math299/midterm')
{
  :Declare[𝜆 ➤]
  :Declare[and or ⇒ ⇔ ¬ →←]
  :Declare[∀ ∃ ∃! =]
  :Declare[0 σ + ⋅ ≤]
  :Declare[1 2 3 4 5 | prime]
  :{ { :{ W V } (and W V) } { :(and W V) { W V } } }
  :{ { :{ :W V } (⇒ W V) } { :(⇒ W V) { :W V } } }
           :
       (omitted)
           :
          (⇒ (∀ y , (¬ (loves y s))) (∀ y , (¬ (loves s y))))✔︎
        }✔︎
        (∀ x , (⇒ (∀ y , (¬ (loves y x))) (∀ y , (¬ (loves x y)))))✔︎
      }✔︎
    }✔︎
  }✔︎
}✔︎
  
  ```

The command `.makedocs` builds the jsdoc documentation for the `experimental`, `lde`, and `lurchmath` folders.

There are many other features available. You can type `.features` in $\lode$ to see the current list of features.