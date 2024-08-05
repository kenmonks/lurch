# Global $n$-compact Validation

Welcome to the [experimental](../) folder of this branch of the Lurch LDE project.  Here we gather code and content for rapidly testing, benchmarking, and prototyping design ideas for the LDE.  For details about the rest of the LDE, and in particular the LogicConcept class and Matching package that this algorithm is built on, see [the LDE documentation](https://lurchmath.github.io/lde).

The main experiment currently in progress is an implementation of the $n$-_compact polynomial time global validation algorithm_. This is accessible via the function `validate()` and its supporting tools and options. 

A _document_ is any LC environment. It may (and usually will) additionally contain declarations of type `Declare` and environments of type `Rule`, `Proof`, `Theorem`, `BIH`, `Substitution` and `Cases`, all of which are specified by the user as part of the document. An _inference_ is a descendant of a document that is either an environment, outermost expression, or declaration all of whose ancestors (including itself) are claims.  The `validate()` routine can validate any specified inference in any document.

This routine and supporting infrastructure is contained primarily in the following files.
   1. [lode.js](../lode.js) - All lurch documents, libraries, rules, theorems, and proofs begin essentially as a string (or more generally, text).  Each UI provides some way for the users and library authors to enter, save, store, load, and merge such text.  
   
      𝕃𝕠𝕕𝕖 is a node.js command line UI intended for developers. Document text is created either directly at the command prompt as short test strings, or in an external editor and saved as a file for larger documents.  This file defines the 𝕃𝕠𝕕𝕖 repl and contains utilities for listing, loading, and merging such strings.

   2. [parsing.js](../parsing.js) - If the UI produces a string representing user's content it must be parsed into an LC before validation.  Currently available parsers are for `putdown` and an [asciimath](parsers/asciimath.peggy) extension of putdown that supports a small but useful subset of asciimath (http://asciimath.org) and LaTeX, which we will call `Lurch Notation`. In some cases it may be easier to obtain the desired LC by first parsing the string to an intermediate LC which is then converted to a different LC by post processing what we refer to as `Shorthands` - special LC content that indicate some way in which the LC needs further modification before proceeding.

   3. [interpret.js](interpret.js) - Any LC environment can be validated by $n$-_compact validation_, but will usually need to be modified extensively to prepare it for validation by calling the `interpret()` routine defined in this file.  In particular, it will add global system declarations to the document, process all shorthands, move all global constant declarations to the top of the environment, create a rule associated with each user _Theorem_, move declaration bodies after the declaration, wrap all `Let` declarations in an environment as needed to form _Let environments_, give all bound variables a canonical alpha-equivalent name, convert all rules into formulas and store information about their domains, assign unique names to symbols declared with a body, and mark all global constants throughout the document. These must all be performed in order before validation.

   4. [global-validation.js](global-validation.js) - this is the main part of the validation routine.  It constructs all of the relevant instantiations, both for the $n$-compact global validation algorithm and for other validation tools that are compatible with $n$-compact validation. Currently these tools are for BIHs, Equations, Cases, Arithmetic, Algebra, and Scoping.  Each of these validation tools is run and it's validation results stored in the relevant locations in the document. Additional information, such as which user espressions lead to a particular instantiation, is stored in the instantiations as well for future reporting.  Once that information is available, it is easy to validate a particular target or validate things in different ways that are determined by the options stored in the object `LurchOptions`.

   5. [reporting.js](reporting.js) - once a document is fully instanted, we can generate reports about the results.  This can be as simple as putting a green checkmark or red ✗ after a conclusion, to giving entire reports about how a particular instantiation is found or what rules had something to say about a particular conclusion.  The routines in this file can mine a validated document for various information, and report it in a way that is compatible with 𝕃𝕠𝕕𝕖 (terminal output).

   6. [extensions.js](extensions.js) - contains numerous miscellaneous extensions to the LC class and subclasses that are either convenient or necessary for this code.

   7. [utils.js](utils.js) - contains miscellaneous generic js utilities that are not specific to this application.

   8. [CNFProp.js](CNFProp.js) - Defines the CNFProp class that is necessary for converting a document into the conjunctive normal form required for checking the boolean satisfiability of the propositional form of all or part of a document. For more information see the [Propositional Form](tutorials/Propositional Form.md) tutorial.


## n-compact Documents
 
An LC is a *$n$-compact Document* (or simply a *doc*) if it is a claim environment that has been processed and transformed as follows.
   - `addSystemDeclaration()` - add system declarations to the document
   - `processShorthands()` - process all shortHands
   - `moveDeclaresToTop()` - move all `Declare`'s to the top (i.e., make them be the first children of the document)
   - `processTheorems()` - put a copy of every `Theorem` after it as a next sibling and mark it as a `Rule` and a `.userRule` (unless such a copy would have no metavars).
   - `processDeclarationBodies()` - put a copy of the body of every declaration which has a body after it as a next sibling and store the declaration in the `.bodyOf` attribute of the copy.
   - `processLetEnvironments()` - check that every Let (i.e. given) declaration that is not the first child of its parent is wrapped in an environment containing its scope (a *Let-environment*).
   - `processBindings` - assign `ProperNames` `x₀,x₁,x₂,...` to all bound variables to allow alpha-equivalent expressions to have the same propositional form.
   - `processRules()` - convert every `Rule` to a formula and mark it `.ignore` if it contains metavariables. Also rename any bound variables in it to something that cannot be entered by the user (currently, `y₀,y₁,y₂...`).
   - `assignProperNames()` - assign `ProperNames` to any symbol, `c` in the scope of a declaration with body by appending `#` followed by the putdown form of the body, e.g., `c#body` (then renamed to a sequence number like `c#12` for legibility).  This applies to both `Let` and `ForSome` declarations with body. 
   - `markDeclaredSymbols` - mark every symbol declared by a global `Declare` declaration as a `.constant`.

This processing should be generally useful to any validation tool. Additionally, the following processing of the document is more specific to the $n$-compact validation algorithm.   
   - `processDomains()` - for each formula (`Rule` or `Part`) and each proposition they contain, store the domain (=set of metavariable names), whether or not the formula is a Weeny (contains a non-forbidden proposition containing all of the metavariables), and what its weenies are, if any (propositions containing the maximal number of metavariables, even if the formula isn't itself a weeny formula). The only part of this that is specified by the $n$-compact validation algorithm is the definition of what is 'forbidden'. So if we consider that to be a parameter, then this can be moved up with the previous collection of utilities that pre-process the document before validation. 

This algorithm and related utilties can be tested using the files in the following subfolders:
 * [libs](../libs) - libraries that can be loaded at the top of documents
 * [parsers](../parsers) - parsers to convert user friendly text to LCs
 * [proofs](../proofs) - example proofs to add after the libraries in a document
   - [acid tests](../proofs/acid%20tests/) - proofs used to test basic functionality
   - [math299](../proofs/math299/) - some example proofs assigned for homework in Math 299 at the University of Scranton

In addition to the files mentioned above, there are also some useful supporting utilities. 
  * [lode.js](../lode.js) - LODE, the Lurch Node app.  Used with the node REPL for testing.
  * [acidtests.js](../utils/acidtests.js) - runs all of the acid tests by typing `.test` in Lode
  * [init.js](../init.js) - an initialization file for Lode that is run at startup.
  * [initproofs.js](../initproofs.js) - the default initialization file that is loaded when you enter the `initialize()` command in Lode.
  * [disable-event-target.js](../disable-event-target.js) - disables the event-target content in LCs since they are not needed for Lode.

## The n-compact Algorithm

Here we describe the n-compact algorithm in detail as currently implemented.  This is subject to a lot of change, but we will attempt to keep it up to date.

**Document** - an LC is considered to be a document if it consists of a single LC environment, whose children are either 
  1. `Declare` - Declarations of symbols that cannot be metavariables.
  2. `Rules` - given environments used as formulas.
  3. `User's content` - the user's theorems, definitions, and proofs.

The Lode command `loadStr(filename)` loads the file specified by `filename` as a string.  The file extension '.lurch' can be omitted. The command `loadDoc(filename)` loads the string, parses it with the Lurch Notation  parser, interprets it, and validates it. Each such file can contain lines of the form `include file-to-include`, which must be on a line by themselves, to recursively include other files.  This is useful for specifying, e.g. what libraries to load at the top of a proof document.

To construct and validate a document it does the following.

### I. Load the text document
1. This can be a string typed at the console, created in a text editor and saved, then loaded with `loadStr(filename)`, or provided by a UI.
2. The user is responsible for marking environments as a `Rule`, `Declare`,   `Theorem`, `Proof`, and so on i.e., that is part of user content, not interpreted from his document.

### II. Parse the document
1. Run the string through the parser to produce a 'raw' LC environment.
2. Process the shorthands in the resulting LC to produce a 'cooked' LC environment.

### III. Interpret the document
1. Add the Declare for reserved _system constants_ on top (e.g. `LDE EFA` and `➤`)
2. Move all global constant `Declare` declarations to the top of the document.
3. Create a rule associated with each user `Theorem` and insert it below the theorem.
4. Create copies of the bodies of declarations and insert them after the declaration.
5. Wrap `Let` declarations in an environment as needed to form _Let environments_ (so every `Let` is a first-child and its scope is the same).
6. Assign all bound vars ProperNames to `x₀, x₁, ...` so that Propositional Forms are canonical for alpha-equivalence.
7. Convert all `Rules` into formulas and cache all of the information about their domains.
8. Mark `.ignore` on all Rules containing metavariables so they don't get a prop form.
9. Replace all bound variables in `Rules` with `y₀, y₁, ...` which cannot be entered as part of a user's document. (This is needed because Matching checks for variable capture, but `Formula.instantiate()` does not.)
10. Assign unique names to symbols declared with a body.
11. Add tick marks to symbols in the scope of, and declared by, a `Let` declaration.
12. Mark all global constants thoughout the document.

### IV. Validate all or part of the document
1. Check that the document has been interpreted, and interpret it if it hasn't.

#### Process Hints
   1. Check if `LurchOptions.processBIHs` is true, and if so do the following.
   2. Process all Blatant Instantiation Hints (BIH's)
   3. If a BIH is valid, create its instantiation, and mark it as an 'Inst' and set its `.rule` attribute to the 'Rule' it instantiates.
   4. If a BIH is valid as a BIH, it has to be valid propositionally by definition, and will be marked with a gold star and green check after validation, but if it is not a valid BIH, it might still be propositionally valid or invalid, so in that case it will receive both a propositional green check or red &cross; in addition to a red star.

#### Process Equations
   1. Check if `LurchOptions.processEquations` is true, and if so, do the following.
   2. For every equation with more than two arguments, split it into a sequence of binary equations which are inserted after it. For example, `(= A B C D)` results in
   ```
     (= A B C D)
     (= A B)
     (= B C)
     (= C D)
   ```
   3. Check if the document contains the rule `:{ :EquationsRule }`.  If not, exit.
   4. For every binary equation `x=y` in the user's content (e.g. not inside a Rule), insert the _symmetric equivalences_ after the Equations Rule, `:{ :x=y y=x }` `:{ :y=x x=y }`.  
   5. Get all of the binary equations that are conclusions (including those produced by splitting), and for each equation `LHS=RHS` compute the difference between the LHS and RHS, i.e., compute `diff(LHS,RHS)`.
   6. If the diff is nontrivial there exists `f`, `x`, and `y` such that `LHS=f(x)` and  `RHS=f(y)`. For each such case, insert the instantiation `:{ :x=y f(x)=f(y) }` after the Equations Rule.  Additionally insert `:x=y` and `:y=x` as `Consider`'s and the symmetric equivalences `:{ :x=y y=x }` `:{ :y=x x=y }`.
   7. Finally, for each equation with more than two arguments, insert the _transitive conclusion_ that says that if all of the binary equations hold, the first and last argument are equivalent.  So in the above example of `(= A B C D)` it would insert the transitive conclusion `:{ :(= A B) :(= B C) :(= C D) (= A D) }`.

#### Process Cases
   1. Check if `LurchOptions.processCases` is true, and if so, do the following.
   2. Find the first rule marked as a `Cases` by the library author.
   3. Get all of the user conclusions with attribute `.by` equal to `cases`.
   4. For each such conclusion, match the last child of the Cases rule to the conclusion.  Create and insert any `Inst`s or `Part`s found after the rule.
   5. Check if `LurchOptions.autoCases` is true, and if so, do the following.
   6. Get every case-like rule (i.e., a rule with a single metavariable as its last child which only appears in the rule as an outermost expression) and match every user conclusion to it, inserting any `Inst`s or `Part`s found after the corresponding rule. (Note: this is generally slow except for small documents or documents with no caselike rules.)

#### Process Arithmetic
   1. Check if `LurchOptions.processArithmetic` is true, and if so, do the following.
   2. Find the first rule marked as a `ArithmeticRule(ring)`  by the library author, where `ring` is one of ℕ, ℤ, or ℚ.
   3. Get all of the user conclusions with attribute `.by` equal to `arithmetic`.
   4. For each such conclusion, $e$, check if it represents a valid statement of arithmetic in the given ring, using the `isArithmetic[ring](e)` command in [parsing.js](../parsing.js).  If it does not, mark its validation result for `arithmetic` to `inapplicable` and return without doing anything further.
   5. If $e$ does represent an allowed statement of arithmetic in the given ring, convert it to the appropriate CAS notation and ask the Algebrite CAS to check if it is true. Mark its validation result for `arithmetic` to `valid` or `invalid` accordingly.
   6. Either way, insert an instantiation of the form `:{ e }` after the Arithmetic rule found in step 2.

#### Process Algebra
   1. Check if `LurchOptions.processAlgebra` is true, and if so, do the following.
   2. Find the first rule marked as a `ArithmeticRule(ring)`  by the library author, where `ring` is one of ℕ, ℤ, or ℚ.
   3. Get all of the user conclusions with attribute `.by` equal to `algebra`.
   4. For each such conclusion, $e$, see if it has a `lurchNotation` attribute, and let $s$ be its content (should be a string).
   5. Do a simple regex check to ensure that $s$ is of the form `LHS=RHS` where `LHS` and `RHS` do not contain `=`, and mark it as return if it doesn't because we only allow identities for now.
   6. Ask the CAS to evaluate `simplify(LHS-RHS)`.  If it returns $0$, mark the validation result for `algebra` on $e$ to `valid`.  Otherwise set it to `invalid`.
   6. Either way, insert an instantiation of the form `:{ e }` after the Arithmetic rule found in step 2.

#### Instantiate (for $n$-compact validation)
   1. Get the set of propositions, `E`, in the user's document.
   2. Get the set, `F`, of all unfinished formulas with any max weenies.
   3. For each `f` in `F`, 
      1. Match each maximally weeny `p` in `f` to each `e` in `E`. 
      2. Every time a match is found.
         1. Create the instantiation.
         2. Insert it after `f`.
         3. Update its Proper Names.
         4. Store `f` in its `.rule` attribute.
         5. Add `e` to it's `.creators` list.
         6. Make it a `given` and a `LDE CI`.
         7. Rename its bound variables.
         8. Mark its declared constants.
         9. Cache its domain information.
         10. If it contains metavariables, mark it asA `Part` with  `.ignore` true.
         11. Otherwise mark it as an `Inst` with no `.ignore` attribute.
   4. Mark `f` as `.finished`.  It cannot be instantiated again on future
      passes because while the number of available formulas can go up on each
      pass, the set of user expressions `E` cannot.
   5. Iterate until every instantiation attempt has been exhausted.
 
#### Propositionally Validate Everything 
   1. to validate the entire document at this point we just compute its propositional form and ask SAT if it is a tautology
   2. define an _inference_ to be any claim expression or environment in the document, all of whose ancestors are claims, and have a propositional form
   3. to validate a particular inference in the document the prop form computation ignores anything that is not relevant to the propositional validation of the inference (for example anything not accessible to it)
   4. to validate every inference in the document, first validate the entire document - if it is valid mark every inference as valid and we are done
   5. if not valid recurse on the children - any valid child can have all of its inferences marked as valid immediately, and invalid ones are recursed into and their children checked until the everything is checked

#### Preemie Check
   1. If the document contains any inference `Let` environments, fetch them and sort them by the number of `Let`s in their scope so we can check them from the inside out
   2. for each such `Let` validate it's parent as a preemie 
      1. if it's not already validated propositionally, check it, and don't check it for preemies unless it is `valid` by `n-compact`
      2. check if it is still propositionally valid when its `Let` is deleted and all occurrences of the symbols it declares in either the scope of the deleted `Let` or instantiations that do not themselves have their own copy of `Let` use their ordinary symbol name instead of their ProperName (i.e., instantiation proper names are ignored for symbols that have the same `.text` name as one of the symbols in the deleted `Let` but aren't in the scope of a declaration of that symbols that is, itself, inside the instantiation)
      3. if it is no longer propositionally valid, it is a preemie, so mark it and all of its ancestors as a preemie
      4. to narrow down specifically what inside the `Let` environment is a preemie, check all of it's conclusions to see if they are a preemie, and mark all of their ancestors as one if one or more is found. 

This completess the validation algorithm.

---
## Attributes

Any LC in a document can have two kinds of attributes - LC attributes and ordinary js attributes. This validation algorithm uses many different attributes of both kinds to carry out its work in addition to those already defined for all LCs. Attributes which must be supplied by the user are saved as LC attributes as part of the document content.  Attributes which can be computed from the user's content are stored in js attributes.  There are exceptions to this however, because the `LC.copy()` function only copies LC attributes, not js attributes, so sometimes we use an LC attribute when having that functionality available makes the code simpler or is necessary.

### LC Attributes

The following attributes set the type of the LC.
* `Declare` - an LC used to define global constants.  Always appears at the top of the document.
* `Rule` - an LC that defines a rule. It must be a given environment.
* `Theorem` - a claim environment that the user wants to prove, and then use as a new rule after that.
* `Proof` - a claim environment that the user wants to have validate.  If a Theorem immediately precedes a Proof, their order is interchanged before validation.
* `Subs` - a special rule marked for use with the Substitution tool.
* `BIH` - a blatant instantiation hint. Allows the user to provide an explicit instantiation of some rule in the document.
* `Cases` - a special rule marked for use with the Cases tool.
* `Consider` - this proposition should be added to the list of user propositions for the purpose of creating instantiations, but it has no propositional form itself, so it is neither claimed or assumed as part of the document's propositional meaning.

In addition, these LC attributes store a value.

* `ExpectedResult` - Stores the expected result from validating this LC.  Intended primarily for testing, where the actual validation result can be compared to the expected one.  Typical results are 'valid', 'indeterminate', and 'invalid'.
* `ID` - stores an ID number associated with this LC.  Can be used by a UI to map LC feedback results to entities in the user's original content that produced the document.
* `ProperName` - the alternate name of a symbol used when computing propositional form. 
   - Bound symbols have `ProperName` `x₀,x₁,x₂,...` so alpha equivalent expressions have the same propositional form.
   - Free symbols, `c`, in the scope of a declaration of `c` with a body have `ProperName` formed by appending the putdown form of the body to the symbol name separated by a `#` character, e.g., `c#body`, so symbols with the same name that are defined differently have different propositional forms.  These are then replaced by a numerical value, e.g. `C#12`, for legibility.
* `Part` - indicates this is a partial instantiation constructed during validation (still contains metavariables).  It is ignored for propositional form.
* `Inst` - indicates this is an instantiation and should be used for propositional form.
* `validation results` - a upgraded replacement for `validation result` set by the [validation engine](.../validation/engine.js).

### js Attributes

The following js attributes store data that is computed from the user's content, and needed for validation and reporting feedback.
* `.userRule` - true for the Rule copies of Theorems.
* `.bodyOf` - true for the copies of declaration bodies
* `.domain` - stores the domain of a non-forbidden proposition or a formula (`Rule`s or `Part`s) containing at least one non-forbidden proposition whose domain is nonempty.
* `.isWeeny` - true for a formula that contains one or more propositions containing all of the metavariables in the formula
* `.weenies` - the set of all maximally weeny propositions in a formula (i.e., containing the largest number of metavariables), whether or not the formula itself is weeny.
* `.domainsProcessed` - true if this document has already had all of its domain information processed and stored.  Should only appear on an entire document, not on any target inside the document.
* `.rule` - the rule that this `Part` or `Inst` is an instantiation of.
* `.creators` - the list of user expressions that created this `Part` or `Inst`.
* `.pass` - which instantiation pass created the `Part` or `Inst`.
* `.finished` - true if the Rule or Part has been fully instantiated and is no longer available on the next pass.
* `.ignore` - true for anything that should be ignored when computing the propositional form (e.g., expressions or rules containing metavariables)
* `.numsolns` - the number of solutions found when matching the expression and formula proposition that created this `Part` or `Inst`
* `.letScopes` - caches the Let scopes in the document (not targets)
* `.cat` - caches the docuement catalog in the document (not targets)
* `.userPropositions` - caches the user's propositions (things that have a propositional form, do not contain metavariables, and are not inside a `Rule`).
* `.equation` - true if this is a binary equation (A=B) either from the user or created by the `splitEquations` command
* `.by` - currently should have the value 'cases' to indicate that this conclusion is a conclusion of the proof by cases rule.
*  `.label` - currently should only have the value 'cases' on a rule to indicate that that rule is the proof by cases rule in this document.
