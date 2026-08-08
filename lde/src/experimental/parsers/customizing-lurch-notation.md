# Customizing Lurch Notation

*An instructor's guide to the notation file*

Lurch's design goal for notation is **markdown for math**: if you know the
LaTeX, ASCIIMath, or computer-algebra name for something, typing the obvious
thing should just work. All of the notation that makes that possible — the
operators, relations, phrases, constants, and their LaTeX renderings — is
declared in a single plain-text file, `lurch-notation.txt`. This guide
explains how to read that file and how to add notation of your own.

You do not need to be a programmer. Declaring a typical new notation —
a relation, an operation, a named constant, a synonym for something that
already exists — is **one line in one file**. From that one line, Lurch
derives everything else automatically:

- the parser accepts the new notation (in every synonym you list),
- expressions render correctly in LaTeX,
- the notation appears on the generated syntax documentation page,
- `Declare` statements recognize the new names,
- and the automatic test suite covers it.

No JavaScript is edited, no grammar is recompiled, and a built-in checker
(the *linter*) refuses to load a file with a mistake in it, telling you the
line number and what went wrong — a bad line can never silently change how
other notation parses.

This guide documents the *kinds* of declarations the file supports. For a
catalog of the notation Lurch *currently* accepts, see the generated syntax
reference page (`lurch-parser-docs.html`), which is itself produced from
this same file.

---

## 1. Getting set up

The notation file is uniform for all Lurch users — it is not a per-document
or per-course setting. To customize it you work with your own copy of the
Lurch repository:

1. Clone the Lurch repository and set up a locally served copy of Lurch.
2. The file lives at `lde/src/experimental/parsers/lurch-notation.txt`.
   Edit it with any text editor.
3. Apply your changes by running, from that same `parsers` folder:

   ```sh
   node compile-notation.js
   ```

   This checks the file and regenerates a small companion file
   (`lurch-notation-compiled.js`) that the application actually loads. If
   your file has a problem, nothing is written and you get a message naming
   the offending line, for example:

   ```
   lurch-notation.txt does not compile; wrapper NOT written:
     line 111: 'a unit' has the wrong article (expected 'an')
   ```

   A second, deeper checker runs when the parser first loads; its
   messages also name the file and line. Fix the line and rerun.
4. Reload your locally served Lurch. The expression editor now accepts
   your notation.

**Trying notation quickly.** Lode, the Lurch command-line REPL, is the
fastest way to test a declaration without opening the browser app. From
`lde/src/experimental`:

```sh
node lode
```

then at the `▶︎` prompt:

```
parse('x perp y')      // shows the internal (putdown) form:  (⊥ x y)
tex('x perp y')        // shows the LaTeX rendering:  x\perp y
makedoc()              // regenerates the syntax documentation page
```

(If you use Lode anyway, the command `.compilenotation` does the same thing
as running `node compile-notation.js` yourself.)

**Deploying.** The application loads the compiled companion file, so when
you publish your copy of Lurch, both `lurch-notation.txt` and
`lurch-notation-compiled.js` must be the versions you compiled together.
If they ever drift apart, the test suite and the loader complain loudly
rather than serving stale notation.

---

## 2. A one-minute primer on putdown

You will see the word *putdown* throughout this guide. Putdown is Lurch's
compact internal notation: every expression is written with the operator
first, in parentheses. So

| you type          | putdown            | meaning        |
|-------------------|--------------------|----------------|
| `x+y+z`           | `(+ x y z)`        | a sum          |
| `A subset B`      | `(⊆ A B)`          | A ⊆ B          |
| `not P`           | `(¬ P)`            | negation       |
| `x neq 0`         | `(¬ (= x 0))`      | ¬(x = 0)       |

The first symbol inside the parentheses — the operator — is called the
**head**. When you declare notation, you are telling Lurch two things: what
the user may *type*, and what putdown expression it *means*. The head you
choose is the name the validation engine, your Rules, and `Declare`
statements will use for that concept.

---

## 3. The shape of the file

The file is line-oriented and reads top to bottom:

- `//` starts a comment (to the end of the line); blank lines are ignored.
- A **declaration** starts at its first line. Lines that are *indented
  further* continue the same declaration — that is where synonym lines and
  extra fields go.
- A line like `group infix`, `group relation`, `chain family ineq`, or
  `bigop sum` opens a **section**; the declarations under it belong to that
  section, and any fields written on the section line itself become
  defaults for all of them.
- Everything else on a line is either the **pattern** (what the user
  types) or a **field** of the form `name: value`. The field names are a
  fixed set (`tex:`, `also:`, `word:`, `words:`, `assoc:`, `level:`,
  `params:`, `bare:`, `case:`, `names:`, `body:`, `tex-open:`,
  `example:`), so a field's value simply runs until the next field name or
  the end of the line. Lists are comma-separated.

Here is a complete declaration, from the file:

```
  a subgroup b  word: sqsubseteq                 tex: \sqsubseteq
    also: a ⊑ b
    also: K is a subgroup of G
```

Reading it: users may type `H subgroup G`, or `H sqsubseteq G`, or `H ⊑ G`,
or `H is a subgroup of G`, and all four parse to the same putdown
expression `(⊑ H G)`. The symbolic forms render as `H \sqsubseteq G` in
LaTeX; the English sentence renders as English. One declaration, four
surfaces, everything else derived.

---

## 4. Patterns and holes

A declaration's primary line is **what the user types**, written as a
*pattern*: a mixture of literal words and **holes** where subexpressions
go. Holes are written as single letters.

The rule that separates holes from words is simple:

> **If the declaration has a `->` rewrite, the holes are exactly the
> single letters that appear in the rewrite.** Any other single letter in
> the pattern is an ordinary word.

For example:

```
  P is a partition of S  -> (partition P S)
```

`P` and `S` appear in the rewrite, so they are holes; the article `a` does
not, so it is just the English word "a". The user types
`X is a partition of A` and Lurch produces `(partition X A)`.

The order of the letters in the rewrite fixes the argument order of the
result — the pattern `a cong b mod m -> ((≅ m) a b)` puts the modulus
first because that is the argument order the concept uses internally, even
though the user types it last.

**Declarations without an arrow** must be the simple two-hole form
`a OP b` — two letters around one keyword — and mean `(OP a b)` with the
keyword (or its symbol; see below) as the head:

```
  a ~ b                                          tex: \sim
```

**What can appear on the right of `->`.** The rewrite language is
deliberately small — this is what lets the checker verify your file and
generate tests from it. The allowed shapes are:

| shape                    | example              | use                              |
|--------------------------|----------------------|----------------------------------|
| `(head holes...)`        | `(⊑ K G)`            | ordinary application             |
| `(¬ (head holes...))`    | `(¬ (= a b))`        | a built-in negative form         |
| `((head p...) a b)`      | `((≅ m) a b)`        | a parameterized operator         |

Anything else is refused with a message pointing at this table. (You may
notice one further shape in the file itself, used by subtraction and
division; it is part of the arithmetic engine and not something course
notation needs.)

**Word boundaries.** Keywords made of letters match at word boundaries:
`x subset y` works, `xsubsety` is just a symbol name. A word immediately
followed by `(` is always read as function application — `R(x)` is "R
applied to x" — so if you mean a relation applied to a parenthesized
operand, put a space: `a is (b)`. Symbolic keywords (glyphs like `<` or
`⊆`) match anywhere; `0<(x+1)` needs no spaces.

**Case.** All names are case-sensitive unless a declaration says
`case: any` (the summation and integral families do this, so `Sum` and
`sum` both work). Under `case: any`, write the names themselves in
lowercase.

---

## 5. Synonyms

Most notation has several equally natural spellings. A declaration lists
them all:

- **`also:`** lines give additional full patterns for the same
  declaration — including glyph versions (`also: a ⊑ b`) and English
  sentence versions (`also: K is a subgroup of G`). An `also:` line may
  carry its own `->` (if its holes differ) and its own `tex:`.
- **`word:` / `words:`** list alternative names for the keyword itself —
  one word each for operators (`word: sqsubseteq`), possibly multi-word
  phrases for constants (`words: for all, for each, for every, forall`).

When a synonym is a Unicode glyph (`⊑`, `≠`, `∈`, …), Lurch automatically
teaches its input machinery to accept the pasted character — you declare
the glyph as a surface and the rest is derived. Students can then type
either the word or the symbol.

Within a single declaration you never need to worry about the order of its
surfaces; Lurch automatically tries the longest ones first. *Between*
declarations, order matters — see §8.

---

## 6. Rendering: how Lurch chooses the LaTeX

One field controls rendering: **`tex:`**.

- A declaration **with** `tex:` renders its one-word surfaces
  symbolically. The `a subgroup b` row above has `tex: \sqsubseteq`, so
  `H subgroup G`, `H sqsubseteq G`, and `H ⊑ G` all render as
  `H \sqsubseteq G`.
- A declaration **without** `tex:` renders its keyword as English text:
  the file's `a loves b` row renders as `a\text{ loves }b`. This is the
  natural choice for predicates that *are* English words.
- **Multi-word surfaces echo as English either way.** If the user typed
  `K is a subgroup of G`, they chose the sentence form, and Lurch renders
  the sentence — even though the row has a `tex:`. (A multi-word surface
  can override this by carrying its own `tex:` template.)
- **A synonym line may carry its own `tex:`**, giving per-surface
  rendering. This is how `P and Q` echoes as English while its synonyms
  `P wedge Q` and `P ∧ Q` render as `\wedge`:

  ```
    P and Q    -> (and P Q)  assoc: nary
      also: P wedge Q        tex: \wedge
      also: P ∧ Q
  ```

- A `tex:` value may be a **template mentioning the hole names**, for
  notation whose LaTeX is not a simple infix symbol:

  ```
    n choose k              assoc: none            tex: \binom{n}{k}
    f : A to B             -> (maps f A B)         tex: f\colon A\to B
  ```

The one `tex:` value also feeds everything downstream: how the bare
operator renders when mentioned by name, how `Declare` statements render
the name, and how the documentation page displays it.

---

## 7. The kinds of declarations

### 7.1 Relations (`group relation`)

Relations — statements like `a < b`, `x ∈ S`, `H ⊑ G` — are the most
common thing an instructor adds, and the most flexible. A new relation is
one line in the `group relation` section:

```
  a perp b               word: perp              tex: \perp
    also: a ⊥ b
```

Now `x perp y` and `x ⊥ y` parse to `(⊥ x y)` and render `x\perp y`.

**"is a ⟨noun⟩ of" sentences.** Any surface shaped like
`x is a ⟨noun⟩ of y` (or `is an`, or ending `on y`) gets special
treatment automatically:

```
  z is a zero of f       -> (zero z f)
```

This one line gives you `z is a zero of f`, **and** its negative twin
`z is not a zero of f` (meaning `(¬ (zero z f))`) — both ranked
correctly relative to the general-purpose `is` so the noun phrase wins.
The noun may be several words (`N is a normal subgroup of G`), and the
article is yours to choose: whichever of `a`/`an` you write is what
users type, and the negative twin reuses it.

**Other English phrasings.** A relation surface does not have to fit the
`is a … of` mold — patterns may have one interior run of words:

```
  x is not coprime to y  -> (¬ (coprime x y))
  x is coprime to y      -> (coprime x y)
```

Note both lines: only the `is a ⟨noun⟩ of/on` shape gets its negative
twin for free, so here the negative form is declared explicitly, and
*before* the positive one (see §8 on ordering).

**Parameterized relations.** A pattern may attach a parameter to the
operator with a subscript group, meaning "the relation determined by u":

```
  a ~_(u) b              -> ((~ u) a b)
```

Users then write `x ~_(S) y` for equivalence modulo whatever `u` names.
The file's generic rows `~`, `approx`, `rel`, and `=_(u)` are provided
exactly so a course can use them as ready-made relation symbols without
touching the file at all.

**English verbs.** For toy logic examples, a verb is a relation with no
`tex:`:

```
  a loves b    word: love
  a does not love b      -> (¬ (loves a b))
```

### 7.2 Infix operations (`group infix`)

Binary operations — things like `∪`, `×`, `⊕` — live in `group infix`
sections. One important constraint before you add one:

> **Do not insert or reorder rows in the two main infix sections.** Their
> rows correspond one-to-one, in order, with Lurch's fixed precedence
> ladder (which connective binds tighter than which). The checker will
> refuse the file if the count changes — but don't fight it; it is
> protecting the meaning of every expression students type.

New operations instead go in the **generic-operator family**, the section
marked `level: like ★` — four rows (`★ ⊕ ⊗ ⊙`) that all share one
precedence level, sitting just tighter than `⋅`. This family exists
precisely as the instructor extension point, and its operators are
already the standard choices for a course's "define a new operation on
G". To add another:

```
group infix    level: like ★    assoc: left    params: ok
  a ★ b        word: star                        tex: \star
  a ⊕ b        word: oplus                       tex: \oplus
  a ⊗ b        word: otimes                      tex: \otimes
  a ⊙ b        word: odot                        tex: \odot
  a diamond b                                    tex: \diamond    // ← new
```

Now `x diamond y` parses to `(diamond x y)`, chains left
(`x diamond y diamond z` is `(diamond (diamond x y) z)`), renders
`x\diamond y`, and — because the section says `params: ok` — supports the
subscripted parameterized form `x diamond_(n) y` too.

The `assoc:` field says how repeated use groups: `nary` (flattens:
`a+b+c` is one sum `(+ a b c)`), `left`, `right`, or `none` (repetition
requires parentheses).

### 7.3 Transitive chains (`chain family`)

A *chain family* is a set of relations that students may run together in
a multi-step calculation, with Lurch computing the conclusion:

```
1 < 2 = 1+1 leq 3
```

A family's member rows are listed in **strength order**: the conclusion
of a mixed chain uses the first-listed member that occurs in it (and `=`
is neutral in every family — it may appear in any chain without changing
the conclusion). A new family is a section:

```
chain family ≺
  a prec b                                       tex: \prec
    also: a ≺ b
  a preceq b                                     tex: \preceq
```

With this, `a prec b preceq c` is a chain whose steps validate
individually and whose conclusion is `a ≺ c`. Two options appear on
family lines in the file: `param` (every step's operator must carry the
same `_( )` parameter — the congruence-mod-m family) and `bare: left`
(the first operand may be a bare operator name, as in `⊆ is transitive`
style statements about the relation itself).

One rule to respect: each operator belongs to **one** machinery. A word
cannot be both a chain member and an ordinary relation row — the checker
will tell you if you try. (The file's congruence rows show the pattern
for wanting both: distinct surfaces route to the chaining and
non-chaining forms.)

### 7.4 Big operators (`bigop`)

Summation-style operators — Σ, Π, ∫, big unions and intersections — are
declared as sections whose lines *select from a fixed menu of input
shapes*. You choose the operator's name, symbol, and which shapes it
supports; the shapes themselves (and the 2-D layout, limits, and
parsing) are built in. A complete new example:

```
bigop bigmax   names: max    case: any        tex: \max
  bigmax(f, k, a, b)
  bigmax k = a to b of f
  bigmax k in S of f     -> bigmaxOver
```

This gives, with any capitalization (`case: any`):

| input                     | putdown                    | LaTeX                              |
|---------------------------|----------------------------|------------------------------------|
| `bigmax(k^2, k, 1, n)`    | `(bigmax (k , (^ k 2)) 1 n)` | `\displaystyle\max_{k=1}^{n} k^2` |
| `Max k = 1 to n of k^2`   | same                       | same                               |
| `bigmax k in S of k^2`    | `(bigmaxOver (k , (^ k 2)) S)` | `\displaystyle\max_{k\in S} k^2` |

The reliable shape menu (write your lines to match these, with your
operator's name in front):

- `op(f, k, a, b)` — the function-call form with limits,
- `op k = a to b of f` — with `also: op k to b of f` if you want the
  lower limit to default to 0,
- `op k in S of f` — indexed over a set,
- `op of f for k in S` — the same, worded the other way.

Give the over-a-set forms their own head with `-> name` (as `bigmaxOver`
above): a sum with limits and a sum over a set are different operations
and should have different heads. Other notes:

- `names:` lists alternative leading names (`names: integral` on the
  `int` section). Under `case: any`, write them in lowercase.
- `body: set` (on the Union/Intersect sections) lets the body be a set
  expression.
- Every head in a bigop section is automatically a **declared constant**:
  these operators' meanings are fixed by the computer-algebra system that
  checks `by algebra` steps, so they must never be treated as variables.
  For the same reason, keep the call form `op(f, k, a, b)` as the
  canonical one for anything the CAS should compute with.
- The integral's special forms (`int f dx`, `int(f, x)`) and its
  `\,\mathrm{d}x` rendering belong to the integral family specifically;
  new operators get the Σ-style rendering.

### 7.5 Constants, renamings, and phrases (`group constant`)

The simplest declarations. A constant is a symbol plus its names plus its
rendering:

```
  ℘   word: wp                                   tex: \wp
  ℕ     word: NN                                 tex: \mathbb{N}
  ∞     words: infty, infinity                   tex: \infty
```

Typing `wp` (or pasting `℘`) gives the symbol `℘`, rendered `\wp`; and
`Declare wp` works and renders `\wp` too.

A **phrase** is just a constant whose alias contains spaces — this is how
multi-word mathematical terms become single symbols:

```
  equivalenceRelation   words: equivalence relation
```

so `~ is an equivalence relation` parses with the single internal symbol
`equivalenceRelation` — which is the name your Rules should use.

A constant can also be *only* a rendering, with no renaming — the file's
`Fib  tex: F` and the fruit emoji used in teaching examples are
declarations of symbols that render specially.

### 7.6 LaTeX letter names (`latex names:`)

One directive line lists every word that should render as its own LaTeX
command — the Greek alphabet lives here:

```
latex names: alpha, beta, gamma, Gamma, delta, ...
```

Any word on this list renders as `\word`. Adding a new one is just
extending the list.

### 7.7 The `unicode` section

The final section maps stray Unicode characters to their meanings
(`→ -> to`, `¬ -> neg`, …). You will rarely touch it: a glyph that
belongs to *your* notation should be declared as an `also:` surface of
your row (§5), which handles the input rewrite automatically. This
section is only for characters that belong to no row — structural arrows,
lookalike characters, and similar.

---

## 8. Order matters

Declarations are tried **in file order**, and the first pattern that
matches wins — that is why the file puts:

- `a is not b` before `a is b`,
- the quoted `"algebra rule"` before the unquoted `algebra rule`,
- and every `is a ⟨noun⟩ of` sentence automatically above the bare `is`
  rows.

The rule of thumb: **more specific surfaces come before more general ones
that could swallow them**. If you add an English phrasing that begins like
an existing one (as `is coprime to` begins like `is`), place it earlier
in the relation section than the generic rows — the file's
"generic copula" block at the end of the relation section is the natural
"after everything else" landmark; put custom phrasings above it. When two
declarations genuinely collide, the checker reports it rather than letting
one silently shadow the other.

(Within one declaration you need not think about this — its own surfaces
are automatically tried longest-first.)

---

## 9. What the file cannot change

Some notation is structural and lives in the engine, not the file. Not
declarable here (and the checker says so, with instructive messages, if a
declaration strays into them):

- **structural keywords**: `assume`, `let`, `Declare`, `Rule`, `by`,
  `such that`, `for some`, and their kin;
- **the quantifier grammar** (`forall x. P`, typed quantifiers) — though
  quantifier *synonyms* are constants and freely addable;
- **the precedence ladder itself** — which levels exist and their order
  (you add operators *at* existing levels, most naturally the ★ level);
- **new big-operator input shapes** (you select from the registered menu);
- **arithmetic's special forms**: prefix `-`, reciprocal `/`, postfix
  `!` and `'`, exponentiation, function application;
- **sets, tuples, set-builder notation**, and the other bracketed forms
  (a declarable family of delimited forms — `[G:H]`, floor, ceiling — is
  designed and planned);
- **raw JavaScript** — never. The file is data by design; that is what
  makes its guarantees checkable.

If a course needs notation in one of these categories, that is a feature
request for the Lurch developers rather than a file edit.

---

## 10. Checking your work

A short checklist after editing:

1. **Compile**: `node compile-notation.js` — fix anything it reports.
   The messages name file lines (`[lurch-notation.txt:57]`).
2. **Spot-check in Lode**: `parse('…')` and `tex('…')` on a few inputs,
   including ones you did *not* change — especially neighbors of your
   edit (if you added an `is`-phrase, check plain `is` still works).
3. **Add an `example:` field** to your declaration. Examples appear on
   the generated documentation page *and* become permanent entries in
   Lurch's test corpus, so your notation is protected against future
   regressions:

   ```
     a perp b    word: perp    tex: \perp    example: x perp y
   ```

4. **Regenerate the docs page** (`makedoc()` in Lode) and look at your
   notation's entry — synonyms that render identically are grouped into
   one box automatically, so the page is also a quick visual check that
   your synonyms really do agree.

Behind the scenes, the project's test suite derives property tests from
your declarations automatically — every synonym must parse to the same
internal expression, and printing-then-reparsing must round-trip — so a
declaration that loads cleanly is already tested more thoroughly than it
looks.

---

## Appendix: field reference

| field       | where it appears     | meaning |
|-------------|----------------------|---------|
| `->`        | after a pattern      | the putdown rewrite; its single letters are the pattern's holes |
| `also:`     | continuation line    | another full surface of the same declaration (own `->`/`tex:` allowed) |
| `word:` / `words:` | any declaration | alternative names for the keyword (phrases allowed for constants) |
| `tex:`      | any declaration or surface | LaTeX rendering; presence = render symbolically (§6) |
| `example:`  | any declaration      | a worked example for the docs page and the test corpus |
| `assoc:`    | infix rows/sections  | `nary`, `left`, `right`, or `none` |
| `level:`    | infix section line   | `like ⟨op⟩` — share an existing precedence level |
| `params:`   | infix section line   | `ok` — members may take `_( )` parameters |
| `case:`     | any named row        | `any` — accept any capitalization (write names lowercase) |
| `bare:`     | relations / chain families | `right`/`left` — that side may be a bare operator name |
| `names:`    | bigop section line   | alternative leading names for the operator |
| `body:`     | bigop section line   | `set` — the body hole admits set expressions |
| `tex-open:` | bigop section line   | advanced: which following contexts the rendering stays open to |

## Appendix: workflow reference

```sh
# apply changes (from lde/src/experimental/parsers)
node compile-notation.js

# explore and test (from lde/src/experimental)
node lode
▶︎ parse('K is a subgroup of G')     # → putdown
▶︎ tex('K is a subgroup of G')       # → LaTeX
▶︎ makedoc()                         # regenerate the syntax docs page
```
