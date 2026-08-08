# The Lurch Notation File — Format Specification

The complete current notation in this format lives in
[`lurch-notation.txt`](lurch-notation.txt), which is both the working
example for this spec and the acid test that shaped it.

This is the *developer* specification, precise enough to reimplement the
loader and linter. The instructor tutorial is
[`customizing-lurch-notation.md`](customizing-lurch-notation.md).

## 1. Purpose and scope

One plain-text file declares the notation table; the loader compiles it
into the internal row structures the expression-core machinery consumes.
Adding a typical notation is one declaration: no JS edits, no peggy
recompile.

Declarable: relations (incl. mixfix patterns and parameterized operators),
infix operators on the existing precedence ladder, chain families, big
operators (selecting registered form shapes), constants/phrases/renamings,
glyph aliases, LaTeX renderings, examples, and fixed-arity **delimited
forms** (`[G:H]`, floor/ceiling —
see §9). Not declarable (engine work, linted with instructive messages):
structural keywords, quantifiers, precedence anchors and their order
(including which levels have tight holes), big-operator form *shapes*,
desugar shapes beyond §5, binding forms (setbuilder, EFA), the tokenizer.
**No raw JS in the file, ever** — the closed vocabularies are what make
the linter's guarantees and the derived property tests possible.

## 2. File identity and loading

- Source of truth: `lurch-notation.txt`, sibling to the parsers.
- Transport: Lode `.compilenotation` regenerates a small ES-module wrapper
  (static import chain stays synchronous everywhere); the wrapper embeds a
  content hash; the golden suite and load-time linter fail loudly on
  staleness.
- Errors: the table linter, with file/line positions. A bad
  line refuses to load; nothing silently reorders parses.

## 3. Lexical structure

Line-oriented UTF-8; `//` comments; blank lines ignored. A declaration
starts at its first line; more-indented following lines continue it
(`also:` surfaces, additional fields). `group`/`bigop`/`chain family`
lines open sections whose fields are defaults for their rows. Fields are
`name: value`; names are a closed set, so a value ends at the next
recognized field token or end of line. Lists are comma-separated.

## 4. Patterns and holes

A declaration's primary line is **what the user types**, with holes:

```
K is a subgroup of G   -> (⊑ K G)
a cong b mod m         -> ((≅ m) a b)      tex: a\cong b\pmod{m}
a ⊕ b                  word: oplus         tex: \oplus
```

- **Hole rule**: when a `->` RHS is present, the holes are exactly the
  single-letter pattern tokens **referenced in the RHS**; unreferenced
  single letters are literal keywords (so the article in `is a subset of`
  is a word, not a hole). Arrow-less lines must be degenerate infix
  (`a OP b`, one keyword): the two letters are holes and the meaning is
  `(OP a b)` with the keyword as head. The linter warns when `a`/`an` is
  used as a hole name (almost certainly a mistaken article).
- **`->` RHS**: putdown over the hole names; hole order in the RHS fixes
  AST argument order. The arrow token is reserved (the `→` glyph is
  ordinary notation). The RHS vocabulary is closed (§5).
- **Synonyms**: `also:` lines are additional surfaces of the same
  declaration (full patterns, own optional `->` and `tex:`);
  `word:`/`words:` list one-word synonyms of the pattern's keyword.
- **Case**: all words case-sensitive by default; `case: any` opts a
  name into case-insensitive matching (the sum/int families).
- **Boundaries**: word keywords match at word boundaries and never
  directly abut a `(` — a name immediately followed by `(` reads as
  function application, so `a is(b)` splits into an
  operand plus a mention-headed application while `a is (b)` is the
  relation; glyph keywords match anywhere (`0<(x+1)` needs no space).
  (One engine
  fact rides on top: an alias ending in `/` never matches immediately
  before another `/`, so `//` comments survive the climb.)

## 5. The closed desugar vocabulary (RHS shapes)

| Shape                  | Example              | Semantics                 |
|------------------------|----------------------|---------------------------|
| `(head holes...)`      | `(⊑ K G)`            | plain application         |
| `(¬ (head holes...))`  | `(¬ (= a b))`        | negation wrap             |
| `((head p...) a b)`    | `((≅ m) a b)`        | parameterized operator    |
| `(op a (inv b))`       | `(+ a (- b))`, `(⋅ a (/ b))` | inverse-pair (surface `-`/`/`) |

Anything else is a lint error naming this table. (Recognizing the
inverse-pair shape needs no flag.)

## 6. Rendering (the English-vs-symbolic rule)

The `tex:` field is the switch — no separate formatting field:

- A declaration **with `tex:`** renders its one-word surfaces (words and
  glyphs alike) symbolically: `subset`, `vdash`, and `proves` all print
  `\vdash`-style symbols because their rows say so.
- A declaration **without `tex:`** renders its keyword as English text:
  `loves` → `a\text{ loves }b`; likewise the `is` family.
- **Multi-word surfaces** (`K is a subgroup of G`) echo as English by
  default even on rows with `tex:` — the user chose the sentence form —
  unless that surface line carries its own `tex:` template.
- **Per-surface `tex:`** refines the rule to surface level:
  an `also:` line may carry its own `tex:` (`also: P vee Q  tex: \vee`),
  in which case THAT surface renders symbolically while the row's other
  surfaces keep their disposition.  This is how `P and Q` echoes English
  while `P wedge Q` and `P ∧ Q` print `\wedge` (the per-joint fmt.srcs
  echo), and how a standalone `a divides b` step echoes English while
  `a | b` and all multi-step chains print `\mid`.
- Multi-hole `tex:` templates reference hole names verbatim
  (`f\colon A\to B`, `\binom{n}{k}`, `a\cong b\pmod{m}`).
- One `tex:` feeds every derived map: word→tex leaves for each alias,
  head→tex for mentions, the infix/mixfix template, and Declare-name
  rendering.

## 7. Groups, schemas, fields

Groups: `infix`, `relation`, `chain family ⟨name⟩`, `bigop ⟨name⟩`,
`constant`, `delimited` (§9); directives `latex names:` (each word
renders `\word`) and
`unicode` (glyph→word rewrites for glyphs belonging to no row — row
glyphs are declared as `also:` surfaces and their rewrites are derived).

Schemas applied automatically:

- **isa**: any relation surface shaped `x is a|an ⟨noun...⟩ ⟨prep⟩ y`
  gets its `is not` twin (¬-wrapped) and ranks above the bare `is` row.
  The declared article is used verbatim in both rows (no English
  policing — `a unit` is correct despite the vowel letter).
- **chain family**: rows are member operators in strength order (the
  conclusion policy); `param` marks a family whose operator requires a
  `_(...)` group with equal parameters across the chain; `bare: left`
  admits a bare mention as first operand. One machinery per operator
  (linted): a family member cannot also be a climb/relation row.
- **parameterized surfaces**: a pattern containing `op_(p)` declares the
  subscripted parameterized form (`a ~_(u) b -> ((~ u) a b)`); the loader
  routes relation-level vs star-level params to the right machinery.

Fields:

| Field       | Where      | Meaning |
|-------------|------------|---------|
| `assoc:`    | infix (G)  | `nary` \| `left` \| `right` \| `none` |
| `level:`    | infix (G)  | `like ⟨op⟩` — existing anchors only |
| `params:`   | infix (G)  | `ok` — operator may carry `_(...)` |
| `bare:`     | relation / chain family | `right` / `left` bare-mention holes |
| `case:`     | any name   | `any` — case-insensitive matching |
| `names:`    | bigop      | additional leading names |
| `body:`     | bigop      | `set` — body hole admits set expressions |
| `tex:`      | any        | §6 |
| `tex-open:` | bigop      | override the open-template wrap contexts; default `postfix, factor` for rows with open English forms |
| `example:`  | any        | docs page + golden corpus line |

Big-operator form lines state their head after `->` whenever it differs
from the obvious one (`int(f,x) -> integral`; `sum k in S of f ->
sumOver`); there is no inherited-default subtlety and no `only:` field —
a restricted name (defint) simply appears on exactly the lines it
supports. Every bigop head incl. overrides is auto-declared constant
(derived; linter-guarded).

## 8. Derived by the loader (never hand-maintained)

Token classification (operator words; "reserved" stays derived), the
Declare name map (any alias word declares its row's head; a
case-insensitive big-operator name additionally normalizes its case, so
`Declare Sum` names the same `sum` the uses parse
to), Declare-name tex (every single-word alias of a leaf-tex
row, glyph or word — `*` gets `\cdot` by the same rule as `cdot` — and
a big-operator section's `tex:` feeds all its declared names, so
`Declare Cup` renders `\bigcup`), glyph→word tokenizer rewrites from
`also:` glyph surfaces (linted for double claims; the target is the
first one-word synonym, including single-keyword word `also:` surfaces
like `vee`), fmt recording (a relation row with no `tex:` records the
typed surface as fmt src; a ¬-wrapped desugar of a symbolic row records
its fixed marker, e.g. `neq`; an inverse-pair row with no `tex:`
records surface signs), `autoDeclaredConstants`, and the table property
tests (alias consistency, round-trip) over every declared row.

The tex printer's operator tables are derived too: every band's
leaf `tex:` becomes an infix joiner (`headJoinTex` — the printer's
default for any head its structural cases do not own, and the chain
operators' rendering), tex-less infix rows join as English text
(`englishInfixJoin`), tex-less relation rows echo the typed synonym
(`englishRelationHeads`), a surface's own `tex:` renders per joint
(`srcJointTex` — vee/wedge), a word `also:` surface with no `tex:` on a
symbolic row echoes standalone (`srcEchoTex` — the divides rule), and a
¬-wrapped row's `tex:` renders its fixed marker (`negFixedTex` — neq,
notin).

The docs syntax page and golden corpus derive from the
declarations: each declaration (chain family, big-operator section)
contributes a surface pool — primary pattern, `word:` substitutions,
`also:` surfaces, automatic `is not` twins, `names:` variants, and the
`example:` instances — which makedoc.js groups into docs boxes by
identical tex rendering (the dedup policy, enforced by construction)
and parsertests.js locks input-by-input in the MakedocExamples suite.
Constants with neither synonyms nor an `example:` get no docs box.

## 9. Delimited forms

A `group delimited` declares fixed-arity closed forms — patterns
beginning and ending with non-word delimiter tokens:

```
group delimited
  [ G : H ]   -> (index G H)   tex: \left[G:H\right]
  ⌊ x ⌋       -> (floor x)     tex: \lfloor x\rfloor
```

Closedness is the group's definition (no field): members join the
`Closed` class — valid in every hole, take the postfixes, serve as
exponent bases. The `->` rewrite is required (it names the head, whose
call form is ordinary function application). The grammar's
`TableDelimited` rule matches openers ranked in file order (rows may
share an opener), and the linter enforces the rules: delimiters must
be non-word tokens; `«»`, quotes, `｛｝` reserved. Later tiers, in
priority order: variadic list-holes (tuples, set literals), then binding
forms (engine-side by design — binding errors are soundness hazards).

## 10. Current ceilings (linted, instructive messages)

Relation mixfix tails: one interior keyword group (`h KWS h KWS h` max).
Bigop lines select registered shapes; new shapes are engine work. One
machinery per operator. Prop-level rows take no `params`. `level:`
references anchors, never defines them. No raw JS.

Known bigop ceiling: a 3-arg call line `op(f, k, S) -> opOver` on a NEW section
does not route to the over-head — it matches the 4-arg limits shape
with the lower limit defaulting to 0 (`(op (k , f) 0 S)`). The
set-domain call form is currently special to the Union/Intersect
sections' `f: set` shape config. New sections should declare only the
4-arg call, `eq`, `inOf`, and `forIn` forms; anything needing a
set-domain call waits for the future shape-category work.

## 11. Escape hatch

Any row may use explicit fields where a pattern would be strained; the
transliteration needed this only in the constants/directives sections.

## 12. The loader

Implemented in [`notation-loader.js`](notation-loader.js); the freshness
gate [`notation-parity.js`](notation-parity.js)
(run by the golden suite) vets the file on disk.  Contract points:

- **Order is data.** Declarations compile in file order, and that order
  is the ranked matcher's rank order (the PEG ordered-choice heritage) —
  so overlapping patterns (`a is not b` before `a is b`) are written
  longest-first in the file, and the linter catches mistakes.  The one
  systematic exception: the surfaces of a *single* declaration are
  matched longest-first (by word count, stable), the trie
  convention.  The is-a registry rows are hoisted into one block
  at the first isa surface's declaration position (all must outrank the
  bare `is` rows).
- **Heads.** A declaration's head is its rewrite's head; with no
  rewrite, the glyph among its surfaces (also-glyphs that the tokenizer
  rewrites still count — `a subgroup b / a ⊑ b` has head `⊑`); with no
  glyph, the keyword.  `or`/`and` carry explicit rewrites because their
  putdown heads are the English words.
- **Glyph routing.** A glyph surface stays a grammar-level alias when
  the glyph is an operator token of the grammar (`⊢ ~ ★ ⊕ ⊗ ⊙ ⋅ = < |
  …`); every other glyph surface derives a tokenizer rewrite to a word
  alias of the same row (first `word:` synonym, else the primary
  keyword).
- **Errors carry lines.** Loader errors name their file line; the
  structural linter (`table-linter.js`, now parameterized over the
  tables it checks) appends `[lurch-notation.txt:N]` to every message
  naming a row, via the loader's provenance map.
- **Transport.** Lode's `.compilenotation` runs
  [`compile-notation.js`](compile-notation.js), regenerating
  `lurch-notation-compiled.js` (embedded text + sha256; compiles through
  the loader at import time, browser-compatible).  The golden suite
  fails loudly when the wrapper's hash no longer matches the `.txt`.
- **Engine-owned entries.** The only hand data in the loader are
  documented engine facts (`engineUnicodeRewrites`,
  `engineTexSymbols`, `engineOperatorHeadTex`, `engineInternalNames`).
