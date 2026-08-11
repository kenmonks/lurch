///////////////////////////////////////////////////////////////////////////
// Math 299 Lurch Peggy Grammar and Parser
//
// A peggy grammar definition file to generate a parser for converting
// AsciiMath expression to an LC.
//
// For now we encode negative numbers as compound expressions e.g. -3 is
// encoded as (- 3). We also encode rational fractions as a product of the
// numerator times the multiplicative inverse of the denominator where / is the
// unary inverse operator, e.g. 2/3 parses as (⋅ 2 (/ 3)).  This is consistent
// with the way negation is handled, and just as -x alone is (- x), /x alone
// is the multiplicative inverse (/ x) (so '/2' is the compound expression
// (/ 2), not a rational constant - we do not have an Integer or Rational
// constant type).
//
// To make the parser more robust, all symbols can only consist of upper and 
// lower case letters A-Z and a-z and digits 0-9, but cannot start with a digit.
//
// To save the resulting parser to a standalone .js file use:
//   peggy --cache --format es -o outfilename.js infilename.peggy
//

{{

  /////////////////////////////////////////////////////////////////
  // Shared notation tables and the tokenizer
  //
  // The data tables shared across the parser and printers (phrases,
  // unicode replacements, internal names, reserved words, Symbol renames)
  // live in notation-tables.js so there is a single source of truth;
  // peggy hoists these imports to the top of the generated parser module.
  // All input normalization is performed by the tokenizer (tokenizer.js),
  // which consumes those tables and leaves «» escapes, string literals,
  // and // comments untouched - see the per-parse initializer below.
  import {
    matchOrderedLiteral, putdownLeadingSymbolRenames
  } from './notation-tables.js'
  import { tokenize } from './tokenizer.js'

  // The grammar actions build a plain-object AST (the node vocabulary is
  // documented in ast-to-putdown.js).  The Start rule renders the tree with
  // astToPutdown by default and astToTex when options.tex is set, so this
  // single grammar serves both output notations; pass options.ast to get
  // the raw tree instead.  Formatting-only notation that putdown ignores
  // (parentheses, subscripts, tick marks, keyword case, comments, chain
  // line breaks) is recorded in fmt annotations for the tex printer.
  import { astToPutdown } from './ast-to-putdown.js'
  import { astToTex } from './ast-to-tex.js'

  // The table-driven expression core: the op AST builder,
  // the ranked relation-token matcher and resolver driven by the
  // relationRows table (see the TableRelation rule), the tail-keyword
  // matcher for the multi-hole mixfix rows (maps, ≅ - see the RelStep
  // rules), the precedence-climbing machinery driven by the
  // propRows/setAlgRows tables and the named precedence levels (see the
  // Prop and SetAlg rules), and the big-operator name matchers and helpers
  // driven by the bigOpRows table (see the BigOpen/BigClosed shapes)
  import {
    op, matchRelationToken, resolveRelation, matchTailKw,
    matchPropToken, matchSetAlgToken, matchParamOpToken,
    matchChainOpToken,
    matchBigLimName, matchBigOverName, matchBigPrefixName,
    bigAllows, bigHole, bigHead, bigFormClosed, takesExponent,
    climbEnter, climbAccepts, climbTake, resolveClimb,
    chainEnter, chainAccepts, chainBareAccepts, chainTake, resolveChain,
    classifyWordAt, matchMentionName, matchDeclarableName,
    matchDelimitedOpener, matchDelimitedLit, resolveDelimited
  } from './expression-core.js'
  import { precedence } from './notation-tables.js'

  // The load-time table linter: check the notation tables
  // against the structural assumptions of the matching machinery (alias
  // reachability, rank capacity, classification collisions,
  // Declare/mention agreement - see table-linter.js) once, when the
  // parser loads, so a bad table edit throws here instead of silently
  // reordering parses
  import { lintNotationTablesOrThrow } from './table-linter.js'
  lintNotationTablesOrThrow()

  // match state for the table-driven literal rules near the bottom of the
  // grammar: each is set by a & predicate and consumed in the same rule,
  // with no rule call in between (see matchOrderedLiteral's doc comment)
  let renameMatch = null
  // ditto for the word classification and mention rules
  let declNameMatch = null
  let mentionMatch = null
  let bareMentionMatch = null
  // ditto for the ranked relation-token rules (RelTok0/1/2), the pattern
  // tail keyword in the RelStep rules, the climb-token rules (PropTok,
  // SATok), and the big-operator name rules
  let relTokMatch0 = null
  let relTokMatch1 = null
  let relTokMatch2 = null
  let relTailMatch = null
  let paramTokMatch = null
  let chainTokMatch0 = null
  let chainTokMatch1 = null
  let propTokMatch = null
  let saTokMatch = null
  let bigLimNameMatch = null
  let bigOverNameMatch = null
  let bigPreNameMatch = null
  // ditto for the delimited-form shapes (TableDelimited)
  let delimOpenMatch = null
  let delimLitMatch = null

  /////////////////////////////////////////////////////////////////
  // Peggy-specific utilities

  // It is essential to understand how peggy parses a rule into strings and
  // nested so that these can be processed appropriately.  We list here some
  // notes for quick reference.  Let A, B, C ... denote rule names and 
  // A',B',.. the result of parsing those.
  // 
  // Rule Form                 Returns
  // A                         A'
  // (A)                       A'
  // A B C                     [ A' , B' , C']
  // (A B C)                   [ A', B' , C' ]
  // (A B) C                   [ [A',B'] , C' ]
  // A (B C)                   [ A' , [B',C'] ]
  // A* or A+                  [A',A',...]
  // A|m..n,separator|         [A',A',...]
  // !anything or &anything    undefined
  // A?                        null or A' 

  // AST node builders.  The full node vocabulary is documented in
  // ast-to-putdown.js; most nodes are built as object literals directly in
  // the actions, and only the shapes used in many places get builders here
  // (op and opSeq now live in expression-core.js, imported above, so the
  // grammar and the table resolver build identical nodes).  The optional
  // fmt argument carries formatting-only data (which surface synonym was
  // typed, subscripts, ticks, ...) that the putdown printer ignores and the
  // tex printer honors.

  // a bare shorthand token, post-processed by the LDE (given>, rule>, ...);
  // src records the source text the user typed for the tex printer
  const sh = (text, src) => { return { type:'shorthand', text, fmt:{ src } } }

  // a set-builder node: v the bound variable, dom the optional domain
  // expression (from `v in S`), preds the nonempty condition list.  The
  // classic single-condition domainless form { x : P(x) } keeps its
  // original one-predicate shape so existing rules and documents are
  // unaffected; every richer form - a domain, or several comma-separated
  // conditions - carries { dom, preds }, and ast-to-putdown.js folds the
  // domain into a leading ∈-condition and wraps the resulting sequence
  // (always ≥ 2 conditions) in the invisible seq> head, keeping the
  // binding's body a single Expression
  const setBuilder = ( v, dom, preds, fmt ) => {
    const node = ( !dom && preds.length === 1 )
      ? { type:'setbuilder', v, pred:preds[0] }
      : { type:'setbuilder', v, dom, preds }
    if ( fmt ) node.fmt = fmt
    return node
  }

  /////////////////////////////////////////////////////////////////
  // Parser specific utilities

  // a multi-step transitive chain asserts several claims at once, so it
  // cannot be a single sequent premise or conclusion (its trans_chain
  // shorthand would also be trapped inside the sequent's tuple, where
  // the post-processor cannot expand it); the Sequent rules reject it
  // with a targeted error.  Single-step chains are ordinary relations
  // (x = y) and pass
  const multiStepChain = n =>
    typeof n === 'object' && n?.type === 'chain' && n.steps?.length > 1

  // for debugging, echo a string with line numbers
  const say = s => {
    const lines = s.split('\n')
    const lineNumberWidth = String(lines.length).length
    lines.forEach( (line, index) => {
      const lineNumber = String(index + 1).padStart(lineNumberWidth, ' ')
      console.log(`${lineNumber}: ${line}`)
    })
  }

}}

// Preprocess the input string
{
  // All input normalization is one call to the tokenizer (tokenizer.js):
  // lone-➤ lines, tabs, comma and colon padding, the phrase and unicode
  // tables, '~' quoting, the label/by set-bracket-to-parenthesis
  // protection (division needs no rewrite here: y/x is the ⋅ row's
  // inverse-pair alias in the climb, and bare /x is the unary inverse
  // (/ x) via the Denom prefix form),
  // and - when options.enableSets is set - the set-bracket replacement
  // { } → ｛ ｝ that lets students type sets with curly braces while the
  // testing suite keeps them for environments (rule labels and citations
  // may use set brackets even then: 'by ｛L｝' would not parse, so the
  // tokenizer converts a label/by bracket pair to parentheses first).
  // The tokenizer leaves «raw putdown escapes», "string literals", and
  // // comments untouched (comments are grammar content: they parse as
  // linecomment nodes and chain-step comments, which the putdown printer
  // drops and the tex printer renders).
  input = tokenize(input, options)

  // set options.debug to true for debugging
  if (options.debug) say(input)

  // Hand the normalized input to an external tracer, if provided
  if (options && typeof options.__setTraceInput === 'function') options.__setTraceInput(input)

}

///////////////////////////////////////////////////////////////////////////////
// LCs
//
// The philosophy behind this parser design is as follows.  Peggy parsing only
// can implement precedence by testing all of the lower precedent rules before
// the higher ones. 
//
// * For space sparated sequences of LCs and environments things are rather
//   straightforward.  Expressions are more nuanced.  
// * Meta content like comments and «» escaped raw putdown are easily handled
//   right up front as they are nevey part of other expressions.
// * Declarations are also not considered to be Expressions here, because we do
//   not allow them to be part of larger compound expressions or other
//   Declarations, and so they too can be handled separately up front right
//   after Meta.
// * Expressions are then processed in a strict order from lowest to highest
//   precedence. Because of this all compound expressions are processed first,
//   and atomic ones like symbols, numbers, and things in parentheses are
//   handled last.  Thus, even though a single symbol like P might be a
//   Proposiiton, or a Set, or a Relation, or an Algebraic, we only define those
//   to be compound expressions for each of their operators, and save the atomic
//   ones to be checked for last, with the arguments to lower precendence
//   operations coming from the category of expressions that are higher than it
//   in precedence.  The order we define here is roughly as follows from lowest
//   to highest.
//
//     - Sequent    :
//     - Quantified :
//     - Binding    :
//     - Prop       :
//     - Relations  :
//     - Set        :
//     - Prefix     :
//     - Algebraic  :
//     - Atomic     :
//
// The start rule for a Peggy grammar is the first rule.  It parses a
// sequence of LCs to an AST and renders it as putdown by default, or as
// LaTeX when options.tex is set (both printers consume the same tree), so
// the parser's callers are unchanged by the AST refactor; pass options.ast
// to get the raw tree.
Start = a:LCs { return options.ast ? a
              : options.tex ? astToTex(a)
              : astToPutdown(a) }

// A sequence of LCs (this consumes all of the inter-LC spaces).  Two LCs
// are separated by whitespace, except that a // comment needs none
// (comments are LCs themselves, so things like '}// note' parse)
LCs "LC" = _ h:LC t:( __ @LC / @LineComment )* _
             { return { type:'seq', items:[h, ...t] } } /
           _ { return { type:'seq', items:[] } }

///////////////////////////////////////////////////////////////////////////////
// Overview
//
// Here we just put a high level overview that shows the precedence of
// operations. All of these are defined below.
//
// A single LC
LC = Meta / Given / Environment / Declaration / Expression
  // Things it searches for and replaces up front
  Meta = Putdown / Comment / Label / Ref / Shorthand 
  // Declarations
  Declaration = Declare / ForSome / Let 
  // Expressions.  The sequent turnstile (⊢/vdash/proves - see the
  // Sequents section below) is the loosest operator of all: a bare
  // sequent is tried first, and its sides are InnerExpressions, so a
  // side can never swallow a turnstile (nested sequents must be
  // parenthesized)
  Expression =  Sequent / InnerExpression
    InnerExpression = Quantified / Binding / Prop / PropArg
    // higher precedence than Prop ops for use in Props
    PropArg  = Relations / RelArg
      // higher precedence than Relations for use in Relations: the whole
      // set/algebraic tower, one table-driven climb
      RelArg = SetAlg
  
  // It is often useful to have a sequence of one or more expressions separated
  // by commas (returned as an array of AST nodes)
  ExpressionSeq = a:Expression|..,comma| { return a }
  // Function-application argument groups and class(...) use this variant:
  // each element may also be a LONE bare operator name (a bare-mention
  // hole - P_(~) and class(a,~) name an operator where no infix reading
  // exists).  Expression is tried first, so the bare-operator reading
  // never preempts an ordinary expression.
  MentionableSeq = a:(Expression / BareOpName)|..,comma| { return a }

///////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////
// Meta
//
// Unprocessed putdown notation (cannot include // comments)
Putdown = '«' a:$([^»]*) '»' { return { type:'raw', text:a } }
// Insert a comment that gets echoed in Lode, or a // line comment (kept in
// the tree for the tex printer; the putdown printer drops it)
Comment = ( '%' / 'Comment'i ) __ a:StringLiteral
          { return { type:'comment', str:a } } /
          LineComment
LineComment = '//' a:$[^\n\r]* { return { type:'linecomment', text:a.trim() } }
// A string literal is anything enclosed in double quotes
// Currently only used for comments
StringLiteral = $('"' [^"]* '"')
// Labels - generalization of LaTeX \label{} command (including that syntax)
Label = 'label'i _ [(\[{"] _ a:([^)\]}"]+) _ [)\]}"] { return { type:'label', text:a.join('') } }
// Refs - generalization of LaTeX \ref{} command (including that syntax)
Ref = k:RefLabel _ [(\[{"] _ a:([^)\]}"]+) _ [)\]}"]
      { return { type:'ref', label:a.join(''), fmt:{ kw:k } } } /
      // But it might be split between atoms, in which case we handle it this
      // way In this case it has to be followed by a symbol (which can have
      // spaces if wrapped in " ").
      k:RefLabel !alphanum { return sh('by', k) }
  RefLabel = $('ref'i/'by'i)
// Shorthands are special symbols which are not allowed to be part
// of a larger expression and are post-processed by the LDE
// They cannot be part of a longer symbol
// Each returns its LDE token plus the source text typed (for the tex printer)
Shorthand = a:(BIH / Ruleset / Rule / Thm / Proof / Cases / Subs / Equiv / Comma)
              !alphanum { return sh(a.text, a.src) }
  // Shorthands
  Equiv = s:$'equiv'i { return { text:'≡', src:s } }
  BIH = s:$('since'i / 'because'i / 'recall'i) { return { text:'>>', src:s } }
  Ruleset = s:$(('rules'i / 'axioms'i / 'definitions'i) ':'?) { return { text:'rules>', src:s } }
  Rule = s:$(('rule'i / 'axiom'i / 'definition'i) ':'?) { return { text:'rule>', src:s } }
  Thm = s:$(('theorem'i / 'thm'i / 'lemma'i / 'corollary'i) ':'?) { return { text:'thm>', src:s } }
  Proof = s:$('proof'i ':'?) { return { text:'proof>', src:s } }
  Cases = s:$('CasesRule'i ':'?) { return { text:'cases>', src:s } }
  Subs = s:$('SubsRule'i ':'?) { return { text:'subs>', src:s } }
  Comma = ',' { return { text:'<comma', src:',' } }

///////////////////////////////////////////////////////////////////////////////
// Givens
//
// A Given label that is not part of a longer symbol or followed by another :
// character.  The label absorbs a following comma-separated expression
// sequence when one is present (so the tex printer can render
// 'Assume P, Q' as a phrase); the putdown printer flattens the node back
// to 'given> P <comma Q'.  The label source text is kept for the tex
// printer.
// (the absorbed list's elements are bare-mention holes, like application
// arguments: 'define Alice, Bob, loves' names the operator bare)
Given = a:GivenLabel _ !Declaration b:(Expression / BareOpName)|1..,comma| !comma
          { return { type:'given', label:a, exprs:b } } /
        a:GivenLabel { return { type:'given', label:a, exprs:[] } }
  GivenLabel = $':' / $(('assume'i / 'given'i / 'suppose'i /
                         'if'i / 'from'i / 'define'i ) !alphanum)

///////////////////////////////////////////////////////////////////////////////
// Environments
//
Environment =  '{' a:LCs '}' { return { type:'env', body:a } }

///////////////////////////////////////////////////////////////////////////////
// Declarations
//
// Declare constants (cannot have a body and is a given)
Declare = k:$'declare'i __ a:DeclareSeq
            { return { type:'declare', names:a, fmt:{ kw:k } } }
// ForSome declaration (always a claim)
// We also allow the special shorthand `for some x in A` since it is so common.
// upgrade some> to a shorthand to allow environment bodies
// TODO: upgrade this to support `for some x in A, y in B`
// (The interior keywords 'in', 'be', 'such', 'that' are case-sensitive
// lowercase; the leading 'for some' and 'Let' are case-insensitive.
// Declared names are bare-mention holes - a name slot has no infix
// reading, so 'Let otimes' declares the operator symbol ⊗.)
ForSome = 'for'i __ 'some'i __ a:(DeclaredName)|1..,comma| __ 'in' __ b:Expression
            { return { type:'forsome', names:a, set:b } } /
          'for'i __ 'some'i __ a:SymbolSeq
            { return { type:'forsome', names:a, set:null } }
// the 'given' colon is optional since these are always 'given'. We also
// allow the special shorthand `Let x∈A` since it is so common.
// The `in ⟨set⟩` and `(be) such that` forms may be combined; the membership
// body prints inside the declaration and the such-that conditions follow via
// the <be shorthand, which merges them into an environment body.
Let = k:$'Let'i __ a:(DeclaredName)|1..,comma| __ 'in' __ b:Expression __
      e:($('be' __))? 'such' __ 'that'
                            { return { type:'let', names:a, set:b, be:true,
                                       fmt:{ kw:k, be:!!e } } } /
      k:$'Let'i __ a:(DeclaredName)|1..,comma| __ 'in' __ b:Expression
                            { return { type:'let', names:a, set:b, fmt:{ kw:k } } } /
      // upgrade <be to a shorthand to allow environment bodies
      k:$'Let'i __ a:SymbolSeq __ e:($('be' __))? 'such' __ 'that' // __ b:Expression
                            { return { type:'let', names:a, be:true, fmt:{ kw:k, be:!!e } } } /
      k:$'Let'i __ a:SymbolSeq { return { type:'let', names:a, fmt:{ kw:k } } }
  // a declarable name: an ordinary Symbol, or a bare operator mention
  DeclaredName = Symbol / BareOpName
  // Comma separated symbols, numbers, and classified keywords - any
  // structural keyword, operator word, or operator glyph may be declared
  // (the raw matched names; the printer maps them through the putdown
  // internal-name table).  A declared division is the bare '/' glyph,
  // covered by ClassifiedName via the operator-glyph table.
  DeclareSeq = a:(Symbol / Number / ClassifiedName)|1..,comma|
                { return a }
  // We allow structural keywords and Numbers to be declared by a Declare,
  // but not by a Let or ForSome (whose name slots do accept operator
  // mentions, via DeclaredName above).
  SymbolSeq  = a:(DeclaredName)|1..,comma| { return a }

///////////////////////////////////////////////////////////////////////////////
// Expressions 
//
// The trick here is that we want long, complex, compound expressions to be
// matched before simpler, more atomic ones. We basically have three current
// collections of related expressions: Propositions, Sets, and Algebraic.
// However a single atomic Symbol could be any of those, e.g. P might be a
// proposition, or a set, or a number because the symbols are not typed. Thus we
// need to be careful to check for all compound propositions, sets, and
// algebraic expressions before checking any of them for propositional variable
// so that e.g. checking for Propositions doesn't skip over the checks for
// compound sets or algebraic expressions that begin with an atomic. To do this,
// we think of each category above Atomic as representing compound expressions
// only of that category and order everything in terms of precedence.

///////////////////////////////////////////////////////////////////////////////
// Sequents
//
// A sequent is `A_1, ..., A_n ⊢ B_1, ..., B_m` (n ≥ 0, m ≥ 1): the
// turnstile (⊢, vdash, proves, and the English negative `does not
// prove`) with an optional formal-system subscript, `⊢_(Gamma)`.
// Putdown wraps BOTH sides in tuples -
//
//     (⊢ (tuple A_1 ... A_n) (tuple B_1 ... B_m))
//     ((⊢ Gamma) (tuple ...) (tuple ...))     for the subscripted form
//
// - even when a side is a singleton or empty, so the small-cases Rule
// shapes are uniform across arities and a single pair premise
// `⟨a,b⟩ ⊢ C` stays distinct from the two-premise `(a, b ⊢ C)`.  An
// application with no operands, (tuple), is legal putdown, so n = 0
// needs no special head.  The English negative ¬-wraps the sequent and
// takes no subscript.
//
// The turnstile is the LOOSEST operator: a bare sequent is the first
// Expression alternative, and its sides are InnerExpressions, so
// `A and B ⊢ C or D` is ((A∧B) ⊢ (C∨D)) and a side can never swallow a
// turnstile - a nested sequent must be parenthesized, ((A ⊢ B) ⊢ C).  A
// LEADING quantifier or binding still has maximal scope, as with every
// other operator: `forall x. P(x) ⊢ Q` puts the sequent inside the
// binding's body; parenthesize the quantifier to make it a premise.
//
// Comma-separated sides live ONLY in the parenthesized form
// (ParenSequent, an Atomic).  A bare top-level comma keeps its meaning
// as the <comma continuation shorthand, so `Assume A, B, D ⊢ E` chains
// three assumptions of which the last is the sequent D ⊢ E, and a
// multi-premise sequent in such a chain is written `Assume A, (D, D' ⊢ E)`.
// The prefix form also works bare (`⊢ true`), but `not` binds a PropArg,
// so negating a sequent always requires the parens: `not (⊢ false)`,
// `not (A ⊢ B)`.  (A consequence of the bare prefix form: `a ⊢ b ⊢ c`
// is not an error but TWO LCs, the sequent a ⊢ b and then the prefix
// sequent ⊢ c, exactly as top-level juxtaposition always parses.)
Sequent = a:InnerExpression _ t:Turnstile _ b:InnerExpression
            { if ( [a, b].some(multiStepChain) ) error(
                'A transitive chain cannot be a sequent premise or ' +
                'conclusion; state the chain separately' )
              return { type:'sequent', lhs:[a], rhs:[b], param:t.param,
                       neg:t.neg, fmt:{ src:t.src } } } /
          t:Turnstile _ b:InnerExpression
            { if ( multiStepChain(b) ) error(
                'A transitive chain cannot be a sequent conclusion; ' +
                'state the chain separately' )
              return { type:'sequent', lhs:[], rhs:[b], param:t.param,
                       neg:t.neg, fmt:{ src:t.src } } }

  // the general parenthesized form, an Atomic (tried before ParenMention
  // and Parenthesized, which cannot match it: `(A, B)` without a
  // turnstile stays the parse error it always was)
  ParenSequent = '('_ a:InnerExpression|..,comma|
                 _ t:Turnstile _ b:InnerExpression|1..,comma| _')'
                 { if ( [...a, ...b].some(multiStepChain) ) error(
                     'A transitive chain cannot be a sequent premise or ' +
                     'conclusion; state the chain separately' )
                   return { type:'sequent', lhs:a, rhs:b, param:t.param,
                            neg:t.neg, fmt:{ src:t.src, paren:true } } }

  // the turnstile token: the glyph or its word synonyms, optionally
  // subscripted on the ParamRel pattern, or the English negative phrase
  // (which takes no subscript, like the other `does not ⟨verb⟩` surfaces)
  Turnstile = s:$('⊢' / ('vdash' / 'proves') !alphanum) g:TurnstileParam?
                { return { src:s, neg:false, param:g ?? null } } /
              'does' __ 'not' __ 'prove' !alphanum
                { return { src:'does not prove', neg:true, param:null } }
  TurnstileParam = _'_' '('_ @Expression _')'

///////////////////////////////////////////////////////////////////////////////
// Quantified and Binding
//
// quantified binding expressions (the interior 'in' is case-sensitive
// lowercase, like the Let/ForSome and big-operator forms)
// bound-variable slots are bare-mention holes like the Let/ForSome name
// slots ('forall otimes. P' binds the operator symbol ⊗)
Quantified = 'forall' _x a:DeclaredName __ 'in' __ b:SetAlg _ period _ c:Expression
                    { return { type:'quant', q:'∀', v:a, set:b, body:c }  } /
             'forall' _x b:Binding           { return { type:'quant', q:'∀', bind:b }  } /
             'exists' _x a:DeclaredName __ 'in' __ b:SetAlg _ period _ c:Expression
                    { return { type:'quant', q:'∃', v:a, set:b, body:c }  } /
             'exists' _x b:Binding           { return { type:'quant', q:'∃', bind:b }  } /
             'existsUnique' _x a:DeclaredName __ 'in' __ b:SetAlg _ period _ c:Expression
                   { return { type:'quant', q:'∃!', v:a, set:b, body:c }  } /
             'existsUnique' _x b:Binding     { return { type:'quant', q:'∃!', bind:b } }
// binding expressions / anonymous maps (fmt records which surface form)
Binding = a:DeclaredName m:(period _ { return '.' } / _'mapsto'_x { return 'mapsto' })
          b:Expression
          { return { type:'bind', v:a, body:b, fmt:{ mapsto: m==='mapsto' } } }

///////////////////////////////////////////////////////////////////////////////
// Propositional expressions
//
// The propositional connectives (iff < implies < or < and, with their
// vee/wedge synonyms) are table rows (propRows in notation-tables.js)
// consumed by a flat sequence rule: a first operand followed by
// (connective token, operand) steps, resolved into the AST by the
// precedence-climbing pass in expression-core.js.  Each step is gated
// by climbAccepts; each row's assoc field decides what a same-row run
// means: and/or are 'flat' (n-ary), implies is 'right' (P implies Q
// implies R is (⇒ P (⇒ Q R)), the logic convention), and iff is 'none'
// ('P iff Q iff R' ends before the second iff, whose leftover is a
// targeted error - parenthesize, since neither nesting is the pairwise
// chain a reader means by it).  The prefix not/neg is a grammar form in
// operand position: it binds one PropArg (or Quantified), does not
// stack ('not not P' does not parse), and sits between 'and' and the
// relations, which the operand shape encodes.
//
// A Quantified is also allowed as a connective operand: a quantifier
// binding has maximal scope (the lowest-precedence form; its body is a
// full Expression that extends rightward to the enclosing delimiter),
// so 'P implies exists y. Q' parses as (⇒ P (∃ y , Q)) and
// 'P implies exists y. Q and R' binds the 'and R' inside the body.  A
// LEADING quantifier is caught at the Expression level before Prop is
// entered, so 'exists y. Q implies P' is (∃ y , (⇒ Q P)) - the first
// operand is never a quantifier in practice.
Prop = a:PropItem
       &{ return climbEnter() }
       t:( _ o:PropTok &{ return climbAccepts(o, null, precedence.IFF) }
           _ b:PropItem &{ return climbTake(o, null) }
           { return { tok:o, arg:b, params:null } } )*
       { return resolveClimb(a, t) }

  PropItem = _ n:$('not'/'neg') _x b:(PropArg/Quantified)
               { return op('¬',[b],{ src:n }) } /
             Quantified /
             PropArg

  // the climb-token rules follow the RelTok0 pattern: the & predicate
  // consults the table matcher and the rule consumes exactly the match's
  // length, with no rule call in between, so the match variable is safe
  // with --cache
  PropTok = &{ propTokMatch = matchPropToken(input, offset(), 0)
               return propTokMatch !== null }
            . .|{ return propTokMatch.len - 1 }|
            { return propTokMatch }

///////////////////////////////////////////////////////////////////////////////
// Relations
//
// The single-keyword relations (proves/⊢/vdash, the is a
// ⟨noun⟩ ⟨prep⟩ phrases, ⊑ and its word aliases, in/notin, neq/ne,
// ~/sim/rel, loves/fears, and the is/is a/is not/are zoo) are
// table-driven: rows in notation-tables.js (relationRows), matched and
// resolved by expression-core.js.  The multi-hole mixfix relations -
// Maps (the pattern `_ : _ to _`) and Congruent (`_ cong _ mod _`) -
// are table rows too, with the pattern's tail (keyword, hole) parts
// carried in the row and consumed by the RelStep rules below.  ParamRel
// and Chain are grammar rules; their committing tokens are not in the
// relation table, so the order of the alternatives below is immaterial
// (ParamRel's '~_(' is checked before the table's '~' row ever could be).
// BareRelation: the FIRST operand of a table
// relation is a bare-mention hole - a lone operator name there has no
// infix reading, so 'star is associative', '~ is a relation on A', and
// '~ subset A cross A' parse with the operator's canonical head as the
// operand, no (op) marker needed.  It is tried only after TableRelation
// (whose RelArg quietly fails on a classified word), so a compound first
// operand that merely STARTS with an operator name (sum(f,k,1,n) in S)
// still takes the normal path.
//
// ParamRel is driven by the paramOpRows table: 'a op_(p,...) b' applies
// the compound operator (op p ...) to the operands, for op among ~,
// approx, rel, and = - so 'x =_(0) y' works like 'a ~_(u) b'.  The
// subscript marker '_(' is what commits the rule (a plain '=' backtracks
// immediately to the other relation machinery and chains).  cong_(m) is
// deliberately NOT a ParamRel: a committed ParamRel could never continue
// as a chain, so the whole subscripted-congruence surface lives in
// ChainOp - see the Chain rule.
// BareChain is the bare-first-operand chain: the | and ⊆ families accept
// a bare operator mention as their first operand ('~ | b',
// '~ subset A cross A'), gated to exactly those families by
// chainBareAccepts.
Relations = ParamRel / TableRelation / BareRelation / BareChain / Chain

  ParamRel   = a:RelArg _ t:ParamOpTok _ '_' '('_ n:ExpressionSeq _')' _ b:RelArg
                 { return { type:'paramop', op:t.row.head, params:n, args:[a,b] } }
  ParamOpTok = &{ paramTokMatch = matchParamOpToken(input, offset(), 0)
                  return paramTokMatch !== null }
               . .|{ return paramTokMatch.len - 1 }|
               { return paramTokMatch }

  // A first operand followed by ONE (relation token, arguments) step.
  // The token rules consult the ranked matcher: RelTok0 takes the
  // first table ROW with an alias matching at the position (rows and
  // their aliases in table order), and if the rest of the
  // step fails to parse, RelTok1/RelTok2 give the next matching rows
  // their turn - so 'x is a partition of, P' falls back from the
  // partition row to the is row, but 'x is a, y is b' does NOT fall back
  // from 'is a' to 'is': retries cross ROWS only, and within a row the
  // longest matching alias is committed (see the rank notes in
  // expression-core.js).  A multi-hole pattern row (maps, ≅)
  // continues its step past the first hole with the tail parts the row
  // carries - one keyword (consumed with matchTailKw on the RelTok0
  // pattern: the predicate and the consumption are adjacent, so the
  // match variable is safe with --cache, and it is set after the hole
  // before it has finished parsing, so nested patterns inside holes
  // cannot clobber it) followed by one hole; a failed tail fails the
  // whole step, handing the position to the next matching row.  Every
  // relation consumes exactly one step ('a is b is c' leaves ' is c' to
  // parse as further LCs); transitive chains (the Chain rule below) are
  // the only multi-step relation mechanism.  Naked bindings are NOT
  // relation arguments: 'a ~ x.y' is a parse error - a binding used as
  // a relation operand must be parenthesized to keep its scope legible,
  // as in (x.f(x)) ~ (y.f(y)), which parses via the ordinary paren
  // operand.
  TableRelation =
    a:RelArg s:RelStep
    { return resolveRelation(a, [s]) }

  // same shape with a bare operator mention as the first operand (see the
  // Relations comment above)
  BareRelation =
    a:BareOpName s:RelStep
    { return resolveRelation(a, [s]) }

  // The bareRight-flagged rows (the two ∈ rows) accept a bare operator
  // mention in their right-hand hole - tried after RelArg quietly fails,
  // so '⟨x,y⟩ in ~' and 'x in subset' parse without the mention marker
  RelStep = RelStep0 / RelStep1 / RelStep2
  RelStep0 = _ t:RelTok0
             _ v:( RelArg /
                   &{ return t.row.bareRight === true } @BareOpName )
             w:( &{ return t.row.tail !== undefined }
                 _ &{ relTailMatch = matchTailKw(t.row.tail[0].kws, input, offset())
                      return relTailMatch !== null }
                 . .|{ return relTailMatch.len - 1 }|
                 _ u:RelArg
                 { return [u] } /
                 &{ return t.row.tail === undefined } { return [] } )
             { return { tok:t, args:[v, ...w] } }
  // RelStep1/RelStep2 are the rank-1 and rank-2 retries: the same shape
  // as RelStep0 with the next matching row's token
  RelStep1 = _ t:RelTok1
             _ v:( RelArg /
                   &{ return t.row.bareRight === true } @BareOpName )
             w:( &{ return t.row.tail !== undefined }
                 _ &{ relTailMatch = matchTailKw(t.row.tail[0].kws, input, offset())
                      return relTailMatch !== null }
                 . .|{ return relTailMatch.len - 1 }|
                 _ u:RelArg
                 { return [u] } /
                 &{ return t.row.tail === undefined } { return [] } )
             { return { tok:t, args:[v, ...w] } }
  RelStep2 = _ t:RelTok2
             _ v:( RelArg /
                   &{ return t.row.bareRight === true } @BareOpName )
             w:( &{ return t.row.tail !== undefined }
                 _ &{ relTailMatch = matchTailKw(t.row.tail[0].kws, input, offset())
                      return relTailMatch !== null }
                 . .|{ return relTailMatch.len - 1 }|
                 _ u:RelArg
                 { return [u] } /
                 &{ return t.row.tail === undefined } { return [] } )
             { return { tok:t, args:[v, ...w] } }

  // Ranked relation-token rules, on the matchOrderedLiteral pattern: the
  // & predicate finds the rank-th longest table alias matching at the
  // current position, and the rule consumes exactly its length - one
  // character explicitly (a matched token is never empty, and this lets
  // peggy prove the TableRelation continuation loop consumes input) plus
  // a repetition for the rest.  No rule call can intervene between the
  // predicate and the consumption, so the match variables are safe with
  // --cache.
  RelTok0 = &{ relTokMatch0 = matchRelationToken(input, offset(), 0)
               return relTokMatch0 !== null }
            . .|{ return relTokMatch0.len - 1 }|
            { return relTokMatch0 }
  RelTok1 = &{ relTokMatch1 = matchRelationToken(input, offset(), 1)
               return relTokMatch1 !== null }
            . .|{ return relTokMatch1.len - 1 }|
            { return relTokMatch1 }
  RelTok2 = &{ relTokMatch2 = matchRelationToken(input, offset(), 2)
               return relTokMatch2 !== null }
            . .|{ return relTokMatch2.len - 1 }|
            { return relTokMatch2 }

  // Each chain step may carry a 'by' reason and/or a // comment (an
  // expository reason; both 'rhs by reason // comment' orders parse).
  // The putdown printer keeps the reason and drops the comment;
  // the tex printer renders both, and uses the recorded newline flags (was
  // there a newline on either side of the operator?) to choose between an
  // inline chain and an align* layout.
  //
  // A chain step's operator may also be the parameterized congruence
  // cong_(m) (see ChainOp), and the chain COMMITS to an operator family
  // at its first non-= step ('=' is neutral).  The families are the
  // chainFamilies table rows (notation-tables.js): the inequality
  // ladder =/</≤, parameterized congruence
  // =/cong_(m), bare congruence =/≅ (typed 'cong'), divisibility =/|,
  // and inclusion =/⊆.  The continuation loop is gated by the
  // frame-stack gate in expression-core.js on exactly the climb pattern:
  // the frame is pushed only after the FIRST step has fully parsed -
  // from there the rule is a min-0 repetition plus its final action, a
  // path that cannot fail, so every pushed frame is popped exactly once
  // by resolveChain (balanced under backtracking, re-entrancy, and
  // --cache).  chainAccepts commits nothing (a continuation step whose
  // rhs fails cannot commit the family); chainTake records the family
  // only after the step has parsed.  A parameterized-congruence chain
  // also commits to its MODULUS: a cong step with
  // structurally different parameters is rejected exactly like a
  // cross-family token, so a chain's transitive conclusion always
  // exists.  A rejected operator token is not consumed: the chain ends
  // before it, and the leftover either fails to parse
  // ('a cong_(m) b < c' - a lone < has no operand reading) or parses as
  // leftover LCs ('a = b < c cong_(m) d', 'a cong_(2) b cong_(3) c' -
  // the leftover reads as the subscripted mention (≅ m)); the expression
  // dialog's chain gate turns the leftover case into a refusal (a
  // trans_chain plus other LCs in one input is rejected).
  Chain      = a:(Binding/RelArg)
               s:( o:ChainOp r:(Binding/RelArg)
                   by:(__ 'by'i __ @Symbol)? c:(_ @LineComment)?
                   by2:(__ 'by'i __ @Symbol)?
                   { return { op:o.op, rhs:r, by: by !== null ? by : by2,
                              comment:c ? c.text : null, nl:o.nl,
                              fmt: { src:o.src } } } )
               &{ return chainEnter(s.op) }
               t:( o:ChainOp &{ return chainAccepts(o.op) }
                   r:(Binding/RelArg) &{ return chainTake(o.op) }
                   by:(__ 'by'i __ @Symbol)? c:(_ @LineComment)?
                   by2:(__ 'by'i __ @Symbol)?
                   { return { op:o.op, rhs:r, by: by !== null ? by : by2,
                              comment:c ? c.text : null, nl:o.nl,
                              fmt: { src:o.src } } } )*
               { return resolveChain(a, s, t) }

  // The bare-first-operand chain: a bare operator mention may open a
  // chain exactly when the first step's operator is a bareLeft family op
  // (| and ⊆: '~ | b' is (| ~ b), '~ subset A cross A' is
  // (⊆ ~ (× A A))), never the neutral '='.  chainBareAccepts is a pure
  // check consulted before the frame is pushed; from chainEnter on, the
  // rule is identical to Chain above.
  BareChain  = a:BareOpName
               s:( o:ChainOp &{ return chainBareAccepts(o.op) }
                   r:(Binding/RelArg)
                   by:(__ 'by'i __ @Symbol)? c:(_ @LineComment)?
                   by2:(__ 'by'i __ @Symbol)?
                   { return { op:o.op, rhs:r, by: by !== null ? by : by2,
                              comment:c ? c.text : null, nl:o.nl,
                              fmt: { src:o.src } } } )
               &{ return chainEnter(s.op) }
               t:( o:ChainOp &{ return chainAccepts(o.op) }
                   r:(Binding/RelArg) &{ return chainTake(o.op) }
                   by:(__ 'by'i __ @Symbol)? c:(_ @LineComment)?
                   by2:(__ 'by'i __ @Symbol)?
                   { return { op:o.op, rhs:r, by: by !== null ? by : by2,
                              comment:c ? c.text : null, nl:o.nl,
                              fmt: { src:o.src } } } )*
               { return resolveChain(a, s, t) }


///////////////////////////////////////////////////////////////////////////////
// Set and algebraic expressions
//
// The whole set/algebraic operator tower - set difference <
// cartesian product < union < intersection < composition < choose < sums
// and differences < products < the generic star family (★ ⊕ ⊗ ⊙, one
// shared level) - is table rows (setAlgRows in notation-tables.js) with
// named precedence levels, consumed by the same flat-sequence-plus-climb
// shape as Prop above.  Here the climbAccepts gate earns its keep: each
// row's assoc field decides whether a same-row token
// continues the run ('flat' n-ary for the associative operators, 'left'
// nesting for ∖ and the star family, 'none' for choose), and a same-LEVEL
// token that cannot continue - a second choose, star-family mixing
// 'a ★ b ⊕ c', a parameterized star token with different parameters -
// ends the expression before the token, whose leftover is then a targeted
// parse error; 'a ⊆ b'-style relation keywords, '=', and '<' are not
// climb tokens at all and end it too, leaving the relation machinery
// above in charge.  See the notes in expression-core.js.
//
// A star-family token may carry a subscripted parameter group:
// 'a ⊕_(n) b' applies the compound
// operator ((⊕ n) a b), on the same `_(` marker convention as ParamRel
// and x_(0) application (whitespace before the underscore is permitted;
// the marker itself is mandatory).  The group is parsed BEFORE the gate
// runs, so the gate can compare parameters; a run continues only on
// structurally equal parameters, so 'a ⊕_(n) b ⊕_(m) c' ends after the
// first application (the equal-moduli precedent from chains).
//
// The four entry rules differ only in their minimum level, giving each
// hole of the enclosing forms its precedence:
//
//   SetAlg       everything: relation and chain arguments, quantifier
//                domains, indexed-set domains
//   AlgExpr      choose and tighter: big-operator bounds
//   ProductExpr  products and tighter: summands, so
//                'sum k to n of f + 1' splits at the +
//   StarExpr     the star level only: operands of the
//                unary - and /, so '-a ★ b' is (- (★ a b)) but
//                '- a cdot b' is (⋅ (- a) b)
//
// The operand of each step is a Closed unit exactly when the row's hole
// field demands it (the star rows: no unary -, /, or greedy English
// big-operator forms after ★ ⊕ ⊗ ⊙ - the spec puts the star level above
// negation and the big operators), and otherwise a FullUnit; both guards
// are explicit so a failed Closed cannot fall back to the forms the
// star holes exclude.  Closed units (the delimited call and
// Prefix forms, the Atomics, and their postfix/exponent results) are
// valid in EVERY hole, so 'sum(f,k,1,n) star x', 'x star sum(f,k,1,n)',
// 'Union(B,k,A) cdot x', '- sum(f,k,1,n)', and 'x cdot Union k in A of
// B' all parse.

SetAlg = a:FullUnit
         &{ return climbEnter() }
         t:( _ o:SATok
             p:( &{ return o.row.params === true }
                 _ '_' '('_ @ExpressionSeq _')' )?
             &{ return climbAccepts(o, p, precedence.SETMINUS) }
             _ b:( &{ return o.row.hole === 'star' } @Closed /
                   &{ return o.row.hole !== 'star' } @FullUnit )
             &{ return climbTake(o, p) }
             { return { tok:o, arg:b, params:p } } )*
         { return resolveClimb(a, t) }

// AlgExpr, ProductExpr, and StarExpr repeat the SetAlg shape at their
// minimum levels (see the entry-rule table above)
AlgExpr = a:FullUnit
          &{ return climbEnter() }
          t:( _ o:SATok
              p:( &{ return o.row.params === true }
                  _ '_' '('_ @ExpressionSeq _')' )?
              &{ return climbAccepts(o, p, precedence.CHOOSE) }
              _ b:( &{ return o.row.hole === 'star' } @Closed /
                    &{ return o.row.hole !== 'star' } @FullUnit )
              &{ return climbTake(o, p) }
              { return { tok:o, arg:b, params:p } } )*
          { return resolveClimb(a, t) }

ProductExpr = a:FullUnit
              &{ return climbEnter() }
              t:( _ o:SATok
                  p:( &{ return o.row.params === true }
                      _ '_' '('_ @ExpressionSeq _')' )?
                  &{ return climbAccepts(o, p, precedence.PROD) }
                  _ b:( &{ return o.row.hole === 'star' } @Closed /
                        &{ return o.row.hole !== 'star' } @FullUnit )
                  &{ return climbTake(o, p) }
                  { return { tok:o, arg:b, params:p } } )*
              { return resolveClimb(a, t) }

StarExpr = a:Closed
           &{ return climbEnter() }
           t:( _ o:SATok
               p:( &{ return o.row.params === true }
                   _ '_' '('_ @ExpressionSeq _')' )?
               &{ return climbAccepts(o, p, precedence.STAR) }
               _ b:( &{ return o.row.hole === 'star' } @Closed /
                     &{ return o.row.hole !== 'star' } @FullUnit )
               &{ return climbTake(o, p) }
               { return { tok:o, arg:b, params:p } } )*
           { return resolveClimb(a, t) }

  SATok = &{ saTokMatch = matchSetAlgToken(input, offset(), 0)
             return saTokMatch !== null }
          . .|{ return saTokMatch.len - 1 }|
          { return saTokMatch }

  // Operand units.  A FullUnit is any operand form; a Closed unit (see
  // the closed-unit layer below) carries its own delimiters, so it
  // composes like an atom and is valid in every hole - the star holes
  // take exactly the Closed units, excluding the unary - and / forms and the
  // greedy English big-operator forms (per-hole precedence: the star
  // level sits above negation and the big operators in the spec).  The
  // greedy English forms (BigOpen) delimit themselves on the right
  // (their body holes absorb everything their hole precedence admits),
  // so they need no ceiling either.  The big-operator keywords are
  // classified words, so no other unit alternative can consume them and
  // their positions in these ordered choices are immaterial.
  FullUnit = BigOpen / Denom / Negated / Closed

  //////////////////////////////////////////////////////////////////////////
  // Big operators
  //
  // The variant stacks are shared form shapes instantiated per operator
  // by the bigOpRows table in
  // notation-tables.js.  Each shape starts by matching a leading operator
  // name for its unit class - the matchers check the literal only, and the
  // shape itself consumes what must follow ('(' for call forms, __ for
  // English forms), so a name inside a longer symbol ('summit') fails
  // every shape and falls through to the generic Symbol rule - then gates
  // on whether the matched row (and name alias) supports the shape's
  // form.  The forms: the Algebrite call forms
  // ⟨op⟩(f,k,[a,]b) / ⟨op⟩(f,x) / ⟨op⟩(f,k,S), the limit form
  // ⟨op⟩ k [= a] to b of f (a defaults to 0 when omitted), the two
  // over-a-set forms ⟨op⟩ k in S of f and ⟨op⟩ [of] f for k in S, and
  // the indefinite ⟨op⟩ f dx.
  //
  // Hole classes: call-form bodies are AlgExpr (fully delimited, no
  // precedence reason to restrict); English-form bodies are ProductExpr
  // (the settled precedence design: a summand binds through products and
  // stops at the first +, so 'sum k to n of f(k) + sum k to n of g(k)'
  // is the sum of two summations); the indefinite body is AlgExpr (the
  // trailing dx delimits it).  Bound holes a and b are AlgExpr, domain
  // holes SetAlg.  Keyword policy: leading names are
  // case-insensitive (sentence position; tex preserves the typed case);
  // interior keywords (=, to, of, for, in, d) are case-sensitive
  // lowercase, and the English ones (to, of, for, in) require whitespace
  // on BOTH sides so they read as words in a sentence - `k in(S)` is not
  // accepted, because function application forbids a space before its
  // parentheses and `in(S)` therefore reads as applying a function named
  // `in` ('d' abuts its variable as in dx, and '=' is symbolic; both are
  // exempt).
  //
  // The name-token rules follow the matchOrderedLiteral pattern: the &
  // predicate consults the matcher and the rule consumes exactly the
  // matched literal, with no rule call in between, so the match variables
  // are safe with --cache.

  BigLimName = &{ bigLimNameMatch = matchBigLimName(input, offset())
                  return bigLimNameMatch !== null }
               . .|{ return bigLimNameMatch.len - 1 }|
               { return bigLimNameMatch }
  BigOverName = &{ bigOverNameMatch = matchBigOverName(input, offset())
                   return bigOverNameMatch !== null }
                . .|{ return bigOverNameMatch.len - 1 }|
                { return bigOverNameMatch }
  BigPreName = &{ bigPreNameMatch = matchBigPrefixName(input, offset())
                  return bigPreNameMatch !== null }
               . .|{ return bigPreNameMatch.len - 1 }|
               { return bigPreNameMatch }

  // The big-operator forms, split by delimitation: BigOpen holds the
  // greedy English forms (right-open - their body holes absorb
  // everything their hole precedence admits, so the form self-delimits),
  // and BigClosed holds the delimited call forms plus `int f dx`
  // (right-delimited by the differential), which are closed units usable
  // in every hole.  The relative order BigEq-before-BigD is load-bearing
  // (BigOpen is tried before Closed reaches BigClosed in FullUnit).
  // Each alternative is gated on the per-form closed flag in
  // bigOpFormShapes (notation-tables.js), so the TABLE is the authority
  // on which layer a shape parses in: a flag that disagrees with the
  // grouping makes the shape fail loudly here instead of silently
  // parsing in the wrong layer.
  BigOpen   = &{ return !bigFormClosed('eq')    } @BigEq /
              &{ return !bigFormClosed('inOf')  } @BigLimInOf /
              &{ return !bigFormClosed('forIn') } @BigLimForIn /
              &{ return !bigFormClosed('inOf')  } @BigOverInOf /
              &{ return !bigFormClosed('forIn') } @BigOverForIn
  BigClosed = &{ return bigFormClosed('call')      } @BigCall /
              &{ return bigFormClosed('callIndef') } @BigCallIndef /
              &{ return bigFormClosed('d')         } @BigD /
              &{ return bigFormClosed('call')      } @BigOverCall

  // ⟨op⟩(f, k, b) / ⟨op⟩(f, k, a, b) - the Algebrite-compatible call form
  BigCall = n:BigLimName &{ return bigAllows(n, 'call') }
            '(' _ f:( &{ return bigHole(n,'call') === 'prod' } @ProductExpr /
                      &{ return bigHole(n,'call') === 'alg'  } @AlgExpr /
                      &{ return bigHole(n,'call') === 'set'  } @SetAlg )
            comma k:Symbol comma a:(@AlgExpr comma)? b:AlgExpr _ ')'
            { return { type:'bigop', op:bigHead(n,'call'), k, f, lo:a, hi:b } }

  // ⟨op⟩ k [= a] to b of f - the limit form; a omitted defaults to 0
  BigEq = n:BigLimName &{ return bigAllows(n, 'eq') }
          __ k:Symbol a:( _ '=' _ @AlgExpr )? __ 'to' __ b:AlgExpr
          __ 'of' __
          f:( &{ return bigHole(n,'eq') === 'prod' } @ProductExpr /
              &{ return bigHole(n,'eq') === 'alg'  } @AlgExpr /
              &{ return bigHole(n,'eq') === 'set'  } @SetAlg )
          { return { type:'bigop', op:bigHead(n,'eq'), k, f, lo:a, hi:b } }

  // ⟨op⟩ k in S of f - over an indexing set
  BigLimInOf = n:BigLimName &{ return bigAllows(n, 'inOf') }
               __ k:Symbol __ 'in' __ S:SetAlg __ 'of' __
               f:( &{ return bigHole(n,'inOf') === 'prod' } @ProductExpr /
                   &{ return bigHole(n,'inOf') === 'alg'  } @AlgExpr /
                   &{ return bigHole(n,'inOf') === 'set'  } @SetAlg )
               { return { type:'bigover', op:bigHead(n,'inOf'), k, f, domain:S } }

  // ⟨op⟩ [of] f for k in S
  BigLimForIn = n:BigLimName &{ return bigAllows(n, 'forIn') }
                __ ('of' __)?
                f:( &{ return bigHole(n,'forIn') === 'prod' } @ProductExpr /
                    &{ return bigHole(n,'forIn') === 'alg'  } @AlgExpr /
                    &{ return bigHole(n,'forIn') === 'set'  } @SetAlg )
                __ 'for' __ k:Symbol __ 'in' __ S:SetAlg
                { return { type:'bigover', op:bigHead(n,'forIn'), k, f, domain:S } }

  // ⟨op⟩(f, x) - the Algebrite-compatible indefinite call form
  BigCallIndef = n:BigLimName &{ return bigAllows(n, 'callIndef') }
                 '(' _ f:( &{ return bigHole(n,'callIndef') === 'prod' } @ProductExpr /
                           &{ return bigHole(n,'callIndef') === 'alg'  } @AlgExpr /
                           &{ return bigHole(n,'callIndef') === 'set'  } @SetAlg )
                 comma x:Symbol _ ')'
                 { return { type:'bigop', op:bigHead(n,'callIndef'), k:x, f, lo:null, hi:null } }

  // ⟨op⟩ f dx (the differential's variable follows 'd' immediately)
  BigD = n:BigLimName &{ return bigAllows(n, 'd') }
         __ f:( &{ return bigHole(n,'d') === 'prod' } @ProductExpr /
                &{ return bigHole(n,'d') === 'alg'  } @AlgExpr /
                &{ return bigHole(n,'d') === 'set'  } @SetAlg )
         __ 'd' x:Symbol
         { return { type:'bigop', op:bigHead(n,'d'), k:x, f, lo:null, hi:null } }

  // The indexed-set operators (Union, Intersect): same over-a-set shapes
  // and keyword regimes as BigLimInOf/BigLimForIn above, grouped into
  // BigOpen/BigClosed with the rest, so 'x cdot Union k in A of B' and
  // 'Union(B,k,A) + x' parse like their summation counterparts

  // ⟨op⟩ k in A of B
  BigOverInOf = n:BigOverName &{ return bigAllows(n, 'inOf') }
                __ k:Symbol __ 'in' __ S:SetAlg __ 'of' __
                f:( &{ return bigHole(n,'inOf') === 'prod' } @ProductExpr /
                    &{ return bigHole(n,'inOf') === 'alg'  } @AlgExpr /
                    &{ return bigHole(n,'inOf') === 'set'  } @SetAlg )
                { return { type:'bigover', op:bigHead(n,'inOf'), k, f, domain:S } }

  // ⟨op⟩ [of] B for k in A
  BigOverForIn = n:BigOverName &{ return bigAllows(n, 'forIn') }
                 __ ('of' __)?
                 f:( &{ return bigHole(n,'forIn') === 'prod' } @ProductExpr /
                     &{ return bigHole(n,'forIn') === 'alg'  } @AlgExpr /
                     &{ return bigHole(n,'forIn') === 'set'  } @SetAlg )
                 __ 'for' __ k:Symbol __ 'in' __ S:SetAlg
                 { return { type:'bigover', op:bigHead(n,'forIn'), k, f, domain:S } }

  // ⟨op⟩(B, k, A) - the Algebrite-style call form (three arguments)
  BigOverCall = n:BigOverName &{ return bigAllows(n, 'call') }
                '(' _ f:( &{ return bigHole(n,'call') === 'prod' } @ProductExpr /
                          &{ return bigHole(n,'call') === 'alg'  } @AlgExpr /
                          &{ return bigHole(n,'call') === 'set'  } @SetAlg )
                comma k:Symbol comma S:SetAlg _ ')'
                { return { type:'bigover', op:bigHead(n,'call'), k, f, domain:S } }

  // A big-operator call form for the 'prefix'-unit rows (product): same
  // shape as BigCall, an ordinary closed nucleus in ClosedBase, so
  // product(f,k,1,n)!, product(f,k,1,n)^2, and the other postfix
  // contexts all work.  Gated on the same 'call' closed flag as BigCall.
  BigPrefixCall = &{ return bigFormClosed('call') }
                  n:BigPreName &{ return bigAllows(n, 'call') }
                  '(' _ f:( &{ return bigHole(n,'call') === 'prod' } @ProductExpr /
                            &{ return bigHole(n,'call') === 'alg'  } @AlgExpr /
                            &{ return bigHole(n,'call') === 'set'  } @SetAlg )
                  comma k:Symbol comma a:(@AlgExpr comma)? b:AlgExpr _ ')'
                  { return { type:'bigop', op:bigHead(n,'call'), k, f, lo:a, hi:b } }

    Denom     = '/' _ a:StarExpr
                  { return op('/',[a]) }
    Negated   = '-' _ a:StarExpr
                  { return op('-',[a]) }

    ///////////////////////////////////////////////////////////////////////////
    // The closed-unit layer
    //
    // A Closed unit is a form that carries its own delimiters, so no
    // precedence question can arise at its edges: the Atomics, the Prefix
    // call forms, the delimited big-operator call forms, and their
    // postfix/exponent results.  The postfix layer (factorial, the
    // complement tick, and exponentiation) is defined ONCE, over the
    // whole class, by the one principled line:
    //
    //   every closed form takes the postfixes and serves as an exponent
    //   base, EXCEPT application results
    //
    // - because ^ already has a meaning on an application's LEFT (f^2(x)
    // is the head application ((^ f 2) x), the blessed surface for
    // inverse functions f^(-1)(x) - see Exp below), so admitting f(x)^2
    // would put two different trees a keystroke apart.  Users genuinely
    // read sin^2(x) / f(x)^2 / z^σ(n) ad hoc by semantics, which a
    // parser cannot do, so Lurch's design is one blessed surface per
    // meaning: f^2(x), (f(x))^2, z^(sigma(n)) - and f(x)^2 is a
    // rejection with an instructive message (see enrichParseError).
    // Under the same line set(1,2)^2, tuple(1,2)^2, [G:H]^2, x!!, x!^2,
    // f(x)!^2 etc. are ordinary parses, on the parser-gives-
    // structure-Rules-give-meaning principle (takesExponent in
    // expression-core.js implements the one exception).
    //
    // Precedence: the postfixes bind below ^, so 2^n! is (! (^ 2 n)) and
    // x^2' is (° (^ x 2)); each postfix result may take one further
    // exponent (sum(f,k,1,n)^2!, f(x)!^2), but ^ never follows ^
    // directly - x^y^z stays a targeted error, neither nesting being
    // what a reader means without parentheses - and exponents themselves
    // stay Atomic (2^sum(f,k,1,n) and 2^[G:H] still want parentheses;
    // legibility).
    //
    // Deliberate carve-outs:
    //   - the tuple/matrix transpose tick is fmt-only and consumed by
    //     the Tuple rule itself (inside Atomic), so it never reaches
    //     this layer; a SECOND tick complements the transposed tuple;
    //   - the tick must sit on the SAME LINE as its operand and never
    //     opens a quoted mention (see PostfixOp below);
    //   - application heads exclude big-operator names and the
    //     collection/literal atoms (see Prefix); closed units are NOT
    //     application heads (sum(f,k,1,n)(x) is an error - the
    //     anti-silent-degradation rule).
    Closed = a:ClosedBase
             e:( &{ return takesExponent(a) } _'^'_ @Exponent )?
             t:( o:PostfixOp e2:( _'^'_ @Exponent )? { return { o, e: e2 } } )*
             {
               let r = e === null ? a : op('^',[a,e])
               for ( const s of t ) {
                 r = op(s.o,[r])
                 if ( s.e !== null ) r = op('^',[r,s.e])
               }
               return r
             }

    // the closed nuclei: the table-driven delimited forms first (their
    // openers are non-word delimiter tokens, disjoint from every other
    // nucleus's leading token, so the position is free and the opener
    // predicate fails fastest); then the delimited big-operator call
    // forms - BEFORE Prefix, so a trailing ^ or postfix is never
    // stranded by an earlier committed choice (a succeeded PEG choice is
    // never re-entered when a later sequence element fails) - then the
    // Prefix call forms, then the Atomics.  Exp is NOT an alternative
    // here: a bare x^2 parses as the Atomic x plus the exponent above,
    // and Exp serves only its head-forming role (see below).
    ClosedBase = TableDelimited / BigClosed / BigPrefixCall / Prefix /
                 Atomic

    // Table-driven delimited forms, from the delimitedRows table
    // (`group delimited` in lurch-notation.txt): a non-word opener,
    // expression holes between literal separators, and a closer, as in
    // the index of a subgroup [ G : H ] → (index G H).  Peggy sequences
    // are static, so there is one shape rule per arity, tried widest
    // first (the shapes and the loader's hole cap grow together).  Rows
    // may share an opener - [ a : b ] and [ a ; b ] - and are tried in
    // file order: since a succeeded PEG choice is never re-entered when
    // a later element of its sequence fails, each rank is a FULL shape
    // alternative on the RelStep model (a row whose interior fails
    // hands the position to the next matching row; two ranks per arity,
    // which the table linter enforces as the capacity).  The opener
    // rules follow the RelTok pattern: the & predicate finds the
    // rank-th table row of that arity whose opener matches, the rule
    // consumes exactly its length, and the row travels forward as the
    // label t.  Each later delimiter is matched at its own position
    // AFTER the hole before it has finished parsing, on the RelStep
    // tail-keyword pattern - the predicate and consumption are
    // adjacent, so the match variables are safe with --cache, and a
    // nested delimited form inside a hole cannot clobber them.  When
    // every matching row's interior fails, the whole form backtracks,
    // so [ a , b ] falls through to the Tuple rule exactly as it would
    // if no row opened with '['.
    // one shape per arity, widest first; the R0/R1 clones below are the
    // rank-0 and rank-1 same-opener alternatives of one shape
    TableDelimited = Delimited2 / Delimited1
    Delimited1 = Delimited1R0 / Delimited1R1
    Delimited2 = Delimited2R0 / Delimited2R1
    Delimited1R0 = t:DelimOpen1R0
                   _ a:Expression
                   _ &{ delimLitMatch =
                          matchDelimitedLit(t.row.delims[1], input, offset())
                        return delimLitMatch !== null }
                   . .|{ return delimLitMatch.len - 1 }|
                   { return resolveDelimited(t.row, [a]) }
    Delimited1R1 = t:DelimOpen1R1
                   _ a:Expression
                   _ &{ delimLitMatch =
                          matchDelimitedLit(t.row.delims[1], input, offset())
                        return delimLitMatch !== null }
                   . .|{ return delimLitMatch.len - 1 }|
                   { return resolveDelimited(t.row, [a]) }
    Delimited2R0 = t:DelimOpen2R0
                   _ a:Expression
                   _ &{ delimLitMatch =
                          matchDelimitedLit(t.row.delims[1], input, offset())
                        return delimLitMatch !== null }
                   . .|{ return delimLitMatch.len - 1 }|
                   _ b:Expression
                   _ &{ delimLitMatch =
                          matchDelimitedLit(t.row.delims[2], input, offset())
                        return delimLitMatch !== null }
                   . .|{ return delimLitMatch.len - 1 }|
                   { return resolveDelimited(t.row, [a, b]) }
    Delimited2R1 = t:DelimOpen2R1
                   _ a:Expression
                   _ &{ delimLitMatch =
                          matchDelimitedLit(t.row.delims[1], input, offset())
                        return delimLitMatch !== null }
                   . .|{ return delimLitMatch.len - 1 }|
                   _ b:Expression
                   _ &{ delimLitMatch =
                          matchDelimitedLit(t.row.delims[2], input, offset())
                        return delimLitMatch !== null }
                   . .|{ return delimLitMatch.len - 1 }|
                   { return resolveDelimited(t.row, [a, b]) }
    DelimOpen1R0 = &{ delimOpenMatch =
                        matchDelimitedOpener(input, offset(), 1, 0)
                      return delimOpenMatch !== null }
                   . .|{ return delimOpenMatch.len - 1 }|
                   { return delimOpenMatch }
    DelimOpen1R1 = &{ delimOpenMatch =
                        matchDelimitedOpener(input, offset(), 1, 1)
                      return delimOpenMatch !== null }
                   . .|{ return delimOpenMatch.len - 1 }|
                   { return delimOpenMatch }
    DelimOpen2R0 = &{ delimOpenMatch =
                        matchDelimitedOpener(input, offset(), 2, 0)
                      return delimOpenMatch !== null }
                   . .|{ return delimOpenMatch.len - 1 }|
                   { return delimOpenMatch }
    DelimOpen2R1 = &{ delimOpenMatch =
                        matchDelimitedOpener(input, offset(), 2, 1)
                      return delimOpenMatch !== null }
                   . .|{ return delimOpenMatch.len - 1 }|
                   { return delimOpenMatch }

    // The postfix operators: the factorial word (the tokenizer writes !
    // as ' factorial ') and the set-complement tick/word - parser-
    // neutral structure, so a context's Rules may read (° a) as
    // complement, Newton derivative, or anything else.  The tick
    // rules: same-line whitespace only (a line
    // ending in an operand followed by a line starting with a quoted
    // mention like '~' cannot be misread as a complement reaching
    // across the break), a quote that BEGINS a quoted mention is never
    // a tick (the !QuoteMention lookahead, so 'P is reflexive '~' is
    // symmetric' reads the '~' as the next LC's mention), and !alphanum
    // keeps A'b from reading as a complement abutting a symbol (the
    // word forms allow any whitespace).
    PostfixOp = _'factorial'!alphanum { return '!' } /
                ( _s !QuoteMention '\'' / _'complement' ) !alphanum
                  { return '°' }

    // an exponent is Atomic - compound exponents want parentheses - or
    // the one-sided-limit signs (0^+ and 0^-)
    Exponent = Atomic / '-' / '+'

    ///////////////////////////////////////////////////////////////////////////////
    // Prefix operators (function application)
    //
    // n-ary, left associative, function application. Args can be any
    // Expressions but the head (function) can only have higher precedence. One
    // common situation we want to support is something like (g∘f)^(-1)(x), so
    // we allow Inverse for the head in addition to Symbols and Parenthesized.
    //
    // Since we want to allow things like (g∘f)(x), but don't want something
    // like `(x≤y) (z=0)` to parse as function application, we require that
    // function application does NOT allow a space between the function and the
    // parentheses wrapping it's arguments.  To enable this, Inverse, Symbol,
    // and Parenthesized cannot consume any spaces after their content.
    //
    // For convenience we define special Symbols beginning with '@' so that
    // @P(k) becomes (λ P k) and then replace λ with "LDE EFA" as a shortcut in
    // parsing.js.  Note that 𝜆 gets replaced by '@' up front in the input.
    // This is not intended for use in any other way than for writing rules that
    // require 𝜆P(k) where P is a single character Symbol and k an Expression.
    //
    // In order to allow subscripted variables and expressions like id_A we
    // allow an options underscore character immediately preceeding the opening
    // parentheses of a funciton application.  This is completely ignored as far
    // as meaning is concerned but allows the user to decide whether they want
    // e.g. x(0) or x_0 for how the expression appears.  So they can enter
    // either `x_(0)` or `x(0)` to get `(x 0)` in putdown, but the parentheses
    // cannot be omitted in the former case. We might allow e.g. `x_0` with no
    // parentheses in the case where the function argument is a Symbol or
    // Number, but for now we do not do that so that it reinforces the concept
    // for students that it's just a formatting difference, not a meaningful
    // difference and that subscripting is just a notationally different way to
    // enter function application.  This seems more valuable than learning that,
    // e.g. in LaTeX you would enter `x_{n+1}` instead of `x_(n+1)`.
    Prefix = // the first argument group forms the EFA; any extra groups
              // nest as ordinary application, like f(x)(y)
              '@' a:[a-z]i b:( '('_ @ExpressionSeq _')' )+
                { return b.slice(1).reduce(
                    (head,args) => { return { type:'app', head, args } },
                    { type:'efa', name:a, args:b[0] } ) } /
              // allow 'set' to be case insensitive, check for setbuilder before
              // finite sets (fmt.call distinguishes the set(...) call form
              // from ｛...｝ brackets for the tex printer's parenthesization).
              // The bound variable takes an optional `in S` domain and the
              // conditions are a comma-separated list, so set-builder reads
              // the way mathematicians write it: set(x in NN : 0<x, x<5)
              'set('i _ a:Symbol d:( _ 'in' _x @Expression )? _ ':' _
                    b:Expression|1..,comma| _')'
                { return setBuilder( a, d, b, { call:true } ) } /
              // allow 'set' to be case insensitive (elements are
              // bare-mention holes, like tuples: {star, cdot} is a set
              // of operators)
              'set('i _ b:MentionableSeq _')'
                { return { type:'set', elts:b, fmt:{ call:true } } } /
              // allow 'paren' to wrap an expression in visual parens with no
              // meaning change
              'paren('i _ b:Expression _')'
                { return { type:'paren', expr:b, fmt:{ call:true } } } /
              // allow 'class' to be case insensitive; its arguments are
              // bare-mention holes (the documented class(a,~) form names
              // the relation bare)
              'class('i _ b:MentionableSeq _')'
                { return { type:'class', elts:b } } /
              // (bracket forms like the index of a subgroup [G:H] are
              // TableDelimited's business; the call form index(a,b) is
              // ordinary function application)
              // convert 'pair' and 'triple' to 'tuple'
              ('pair('/'triple('/'tuple(') _ b:MentionableSeq _')'
                { return { type:'tuple', elts:b, fmt:{ style:'call' } } } /
              // everything else (nested one app node per argument group).
              // Each argument group may be preceded by an underscore, which
              // is formatting only: x_(0) and x(0) both mean (x 0), but tex
              // renders the former as a subscript.  Recording it per group
              // also lets a subscript apply to an application result, e.g.
              // f(x)_(n+1).
              // The head is a bare-mention hole: an operator name
              // there has no infix reading, so ~(a,b), loves(x,y), and
              // ⊕(2,3) apply the operator's canonical head - and mention
              // markers work there too ('⊕'(2,3), (⊕)(2,3)).  Argument
              // slots likewise accept a lone bare operator (P_(~), f(~)).
              a:(Exp / Symbol / QuoteMention / ParenMention / Parenthesized /
                 BareOpName)
              b:( u:'_'? '('_ s:MentionableSeq _')' { return { sub:!!u, args:s } } )+
                { return b.reduce( (head,g) =>
                    { return { type:'app', head, args:g.args, fmt:{ sub:g.sub } } }, a ) }

    // The head-forming exponent.
    // The choice of precedence of function application vs Exp is tricky:
    // consider 2^cos(x), f^2(x), 2^f(x), f^(-1)(x), and the nightmare
    // expressions sin^2(x) and sin(x)^2.  The main use case in the intro
    // to proof course is inverse functions, so exponentiation binds
    // ABOVE application: an Exp may be an application HEAD - f^2(x) is
    // ((^ f 2) x), and f^(-1)(x) works unquoted - which is exactly why
    // an application RESULT is not an exponent base in the closed-unit
    // layer above (write 2^(cos(x)), (f(x))^2, 2^(f(x)) for the value
    // readings, and either define a rule that says sin^2(x)=(sin(x))^2
    // or avoid sin^2(x) entirely).
    Exp = a:Atomic _'^'_ b:Exponent { return op('^',[a,b]) }

///////////////////////////////////////////////////////////////////////////////
// Atomic Expressions
//
// morally atomic expressions (do not require parentheses)
Atomic = StringLiteral / QuoteMention / ParenSequent / ParenMention /
         Parenthesized /
         // EquivalenceClass /
         Tuple / SetBracketed / Symbol / Number

// The uniform mention rule: an operator token alone in parentheses - or
// in single quotes - denotes the operator symbol
// itself.  Every alias of a row mentions the same canonical head, so
// (subset), '⊆', '⊕', (oplus) are the operators' true atoms.  Both forms
// build the same paren wrapper node,
// so putdown drops the wrapper and tex reproduces it
// (with the ('~') → \sim special case in texParen preserved).  Optional
// inner whitespace absorbs the padding the unicode pass inserts when a
// glyph alias is quoted ('≈' reaches the grammar as "' approx '").
// The rules follow the matchOrderedLiteral pattern: the & predicate and
// the consumption are adjacent, so the match variable is safe with
// --cache.
ParenMention = '(' _ m:MentionName _ ')' { return { type:'paren', expr:m } }
QuoteMention = "'" _ m:MentionName _ "'" { return { type:'paren', expr:m } }

// an explicitly marked mention accepts every mentionable operator,
// including the big-operator leading names ((sum), 'product')
MentionName = &{ mentionMatch = matchMentionName(input, offset())
                 return mentionMatch !== null }
              . .|{ return mentionMatch.len - 1 }|
              { return mentionMatch.head }

// A bare operator name - a classified operator word or glyph - resolved
// to its canonical head symbol.  Used by the mention rules above and, as
// the bare-mention holes, by BareRelation, the bareRight relation holes,
// application heads, and MentionableSeq slots; big-operator leading names
// are excluded (matchMentionName bare flag) so a mistyped call form like
// sum(f,k) stays an error instead of silently becoming an application.
BareOpName = &{ bareMentionMatch = matchMentionName(input, offset(), true)
                return bareMentionMatch !== null }
             . .|{ return bareMentionMatch.len - 1 }|
             { return bareMentionMatch.head }

///////////////////////////////////////////////////////////////////////////////
// Things in parentheses
//

// equivalence class - if the optional relation is missing from an equivalence
//                     class we use '~'
// TODO: upgrade everything to use class(a) and class(a,~) instead of this to 
//       make room for matrices.
//
// EquivalenceClass = 
//   '[' b:( @Expression ) ']'                   { return lispPrefix('class',[b,'~']) } /
//   '[' a:Expression comma b:('~'/Symbol) ']'   { return lispPrefix('class',[a,b]) }

// tuples - trailing tick marks are formatting only (ignored by putdown;
// tex renders a ticked tuple/matrix as its transpose), and fmt.style
// records which surface bracket was typed (tex renders [..] of [..] rows
// as a matrix, and only the bracket form accepts a tick)
// tuple and set elements are bare-mention holes: a lone operator
// name as an element denotes the operator, so the algebraic-structure
// tuple [G,star,e] and sets of operators parse with no mention marker
Tuple = '['_ a:MentionableSeq _']' t:"'"? !alphanum
          { return { type:'tuple', elts:a, fmt:{ style:'bracket', tick:!!t } } } /
        'langle'_x a:MentionableSeq _'rangle'!alphanum
          { return { type:'tuple', elts:a, fmt:{ style:'langle' } } }
// sets - set-builder takes an optional `in S` domain on the bound
// variable and a comma-separated condition list (see the setBuilder
// helper); a braced membership with no colon, like { x in S }, still
// falls through to a finite set containing one membership statement
SetBracketed = '｛'_ a:Symbol d:( _ 'in' _x @Expression )? _ ':' _
                    b:Expression|1..,comma| _'｝'
                 { return setBuilder( a, d, b ) } /
               '｛'_ a:MentionableSeq _'｝' { return { type:'set', elts:a } }
// parenthesized (recorded in the AST as a formatting-only wrapper node:
// putdown drops it, the tex printer reproduces it)
Parenthesized = '(' _ a:Expression _ ')' { return { type:'paren', expr:a } }

///////////////////////////////////////////////////////////////////////////////
// Numbers 
// (negatives and fractions are compound)
Number  = RepeatingDecimal / Decimal / Natural
RepeatingDecimal = $(Decimal '[' [0-9]+ ']') 
Decimal = $( Natural '.' [0-9]* ) 
Natural = $( [1-9][0-9]* / '0' )

///////////////////////////////////////////////////////////////////////////////
// Symbols and classified keywords
//
// Symbols can be any string of alphanumeric characters [a-zA-Z0-9] that
// does not start with a digit and is not CLASSIFIED as a keyword:
// classifyWordAt looks up the whole word in the maps
// derived from the structural-keyword list and the operator tables, so
// "reserved" is a property of the tables, not a maintained list.  The
// word-at-a-time lookup makes boundaries automatic ('summit' is never
// blocked by its 'sum' prefix).  Classified words can still be declared
// with a Declare (ClassifiedName below) and mentioned as (op) or 'op'.
//
// For clarity in reading the putdown output we rename some special
// frequently used constant symbols (the leading renames).
Symbol "Symbol" =
  LeadingSymbolRename /
  StringLiteral /
  &{ return classifyWordAt(input, offset()) === null }
  @$([a-z]i alphanum* )

// Table-driven ordered literal choice for the constant renames: the &
// predicate finds the first table entry matching at the current position -
// the same first-match, prefix semantics as literal alternatives - and the
// repetition consumes exactly that literal's length.  No rule can run
// between the predicate and the consumption, so the match variable in the
// initializer is safe, including with --cache.
LeadingSymbolRename =
  &{ renameMatch = matchOrderedLiteral(putdownLeadingSymbolRenames, input, offset())
     return renameMatch !== null }
  .|{ return renameMatch.lit.length }|
  { return renameMatch.out }

// A declarable classified name, for DeclareSeq: any structural keyword,
// operator word, or operator glyph.  Consumes and returns the raw matched text; the
// putdown printer maps it through the internal-name table.
ClassifiedName =
  &{ declNameMatch = matchDeclarableName(input, offset())
     return declNameMatch !== null }
  @$(. .|{ return declNameMatch.len - 1 }|)

// A chain operator, together with a flag recording whether a newline
// appears in the whitespace on either side of it (formatting-only; the tex
// printer uses it to choose the align* layout)
//
// The tokens come from the chainFamilies rows in
// notation-tables.js, matched by the ranked ChainTok0/ChainTok1 rules on
// exactly the RelTok pattern; '=' stays a grammar literal (it is the
// neutral operator of every family, not a table row).  A param family
// row's token REQUIRES the `_(params)` subscript group - the
// parameterized congruence cong_(m),
// whose op is the compound-operator object { head:'≅', params } so the
// single-step case prints ((≅ m) a b).  peggy never re-enters a
// succeeded ParamRel/TableRelation, which is why every chain-capable
// operator lives HERE and not in those tables (the English
// 'a cong b mod m' is the non-chaining relation row, tried first).
// When the `_(` group is absent the whole rank-0 alternative fails and
// ChainTok1 gives the bare-≅ row its turn, so 'a cong b' is the
// geometer's congruence (≅ a b).  The optional
// whitespace before the underscore admits the space the unicode pass
// pads around the ≅ glyph; a multi-word subscript is permitted for the
// same reason ParamRel uses ExpressionSeq, but congruence takes one
// modulus in practice.
// (src records the typed synonym of the step operator for the
// per-surface tex echo: a standalone `a divides b` step renders as the
// English it is, while `a | b` and all multi-step chains render \mid)
ChainOp = w1:$_ c:ChainOpCore w2:$_
          { return { op:c.op, src:c.src,
                     nl: w1.includes('\n') || w2.includes('\n') } }

ChainOpCore =
    '=' { return { op:'=', src:'=' } }
  / t:ChainTok0
    o:( &{ return t.row.param === true }
        _ '_' '('_ n:ExpressionSeq _')'
        { return { head:t.row.head, params:n } } /
        &{ return t.row.param !== true } { return t.row.head } )
    { return { op:o, src:t.src } }
  / t:ChainTok1
    o:( &{ return t.row.param === true }
        _ '_' '('_ n:ExpressionSeq _')'
        { return { head:t.row.head, params:n } } /
        &{ return t.row.param !== true } { return t.row.head } )
    { return { op:o, src:t.src } }

// the ranked chain-operator token rules, on the RelTok pattern: the &
// predicate and the consumption are adjacent, so the match variables are
// safe with --cache (the params group of ChainOpCore parses only AFTER
// the matched token has been consumed and returned as a label value)
ChainTok0 = &{ chainTokMatch0 = matchChainOpToken(input, offset(), 0)
               return chainTokMatch0 !== null }
            . .|{ return chainTokMatch0.len - 1 }|
            { return chainTokMatch0 }
ChainTok1 = &{ chainTokMatch1 = matchChainOpToken(input, offset(), 1)
               return chainTokMatch1 !== null }
            . .|{ return chainTokMatch1.len - 1 }|
            { return chainTokMatch1 }

///////////////////////////////////////////////////////////////////////////////
// punctuation and character classes

// alphanum checks for a nonalphanumeric character without consuming any input.  It
// is useful for checking for the end of reserved words and classes that end
// with a word
alphanum = [a-z0-9]i

// We frequently want to allow optional spacing before or after a reserved word.
// We might need to consume the space, but if there is no space there we need to
// ensure that there isn't an alphanumeric character immediately following the
// reserved word.  So we first check for that before consuming the space in case
// it is the space that statisfies that condition. Then we just return undefined so 
// it will be cleaned out of in the result.
_x = !alphanum _ { return undefined }

// commas, periods, and spaces
comma  =  _ ',' _
period =  '.'
__  = [ \t\n\r]+ // a string of whitespace of positive length
_   = [ \t\n\r]* // a string of whitespace of any length (even zero)
_s  = [ \t]*     // same-line whitespace only (no newlines) - see Complement