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
// with the way negation is handled.  We do not allow expresions like '/2' to
// represent one half. We do not have an Integer or Rational constant type for
// this reason.
//
// To make the parser more robust, all symbols can only consist of upper and 
// lower case letters A-Z and a-z and digits 0-9, but cannot start with a digit.
//
// To save the resulting parser to a standalone .js file use:
//   peggy --cache --format es -o outfilename.js infilename.peggy
//

{{

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

  // Since we are returning a string with this parser, no matter how nested and
  // convoluted an array might be, we always want to ignore undefined and empty
  // arrays that peggy creates when interpreting the rule.  Here we remove both
  // undefined terms and empty arrays that appear in array A.
  const clean = A => { 
    return A.filter(x=>x!==undefined && !(Array.isArray(x) && x.length===0))
             .map( c => { return (Array.isArray(c)) ? clean(c) : c } )
  }
  
  // Toggle debuging output on or off here
  const DEBUG = false

  // Convert optional associative binary operator to lisp. This is used to
  // process rules that use the |m..n,op| sequence syntax. This returns an array
  // which is passed as the args argument.  We do not clean the args to force being
  // more careful when defining the rules.
  const lispSeq = (op,args) => {
    debug(`\nlispSeq ${op}`,args)
    // if there's only one arg, return it, otherwise apply the op
    return (args.length>1) ? `(${op} ${args.join(' ')})` : args[0]
  }

  // convert optional unary operator to lisp
  const lispUnary = (op,arg) => {
    debug(`\nlispUnary: ${op}`,arg)
    return `(${op} ${arg})`
  }

  // convert mandatory binary operator to lisp
  const lispBinary = (op,a,b) => {
    debug(`\nlispBinary: ${op}`,a,b)
    return `(${op} ${a} ${b})`
  }

  // convert prefix function application to lisp
  const lispPrefix = (op,args) => {
      return args.reduce( (ans,expr) => { return `(${ans} ${expr})` } , op )
  }
  
  // convert a transitive chain to the correct putdown
  const lispChain = (a,b) => {
    // just an ordinary equation or inequality
    if ( b.length==1 ) return `(${b[0][0]} ${a} ${b[0][1]} )`
    return `(trans_chain ${a} ${b.flat().join(' ') } )`
  }

  // convert signed sums to lisp
  const lispSum = (first,rest) => {
    // console.log(`lispSum:\n`)
    // write(first)
    // console.log(rest)
    let ans = `(+ ${first}`
    rest.forEach( term => {
      ans = ans + ( (term[1]==='-') ? ` (- ${term[3]})` : ` ${term[3]}` )
    })
    return ans + ')'
  }

  // convert summations to putdown
  const summation = (f,k,a,b) => {
    a = a || 0 
    return `(sum (${k} , ${f}) ${a} ${b})`
  }

  // convert indexed union to putdown
  const union = (f,k,a) => {
    return `(Union (${k} , ${f}) ${a})`
  }
  // convert indexed intersection to putdown
  const intersect = (f,k,a) => {
    return `(Intersect (${k} , ${f}) ${a})`
  }

  // join the elements in an array with spaces
  const spacedSeq = s => { return s.join(' ') }

  /////////////////////////////////////////////////////////////////
  // Parser specific utilities

  // replace tabs with a space
  const replaceTabs = s => s.replace(/\t/g,' ') 

  // put spaces around commas, and colons since they are now treated as symbols
  const padCommas = s => s.replace(/,/g,' , ')
  // for the colons, only pad on the right to allow things like Rules: 
  const padColons = s => s.replace(/:/g,': ') 

  // shrink consecutive spaces to a single space
  const shrink = s => s.replace(/ ( +)/g,' ') 
  
  // Replace reserved phrases with Symbols.  These should be replaced in order
  // so longer phrases are replaced before subphrases. We shrink the string
  // before doing these substitutions in case someone has, e.g. 'partial    order'
  // with extra spaces.  We also replace some standard words with unicode characters
  // so they are easy to prevent being interpreted as Symbols.
  const Phrases = [
    [ '→←'                     , 'contradiction'          ] , 
    [ '∃!'                     , 'existsUnique'           ] , 
    [ 'exists unique'          , 'existsUnique'           ] , 
    [ 'exists!'                , 'existsUnique'           ] , 
    [ 'equivalence relation'   , 'equivalenceRelation'    ] ,
    [ 'strict partial order'   , 'strictPartialOrder'     ] ,
    [ 'partial order'          , 'partialOrder'           ] ,
    [ 'total order'            , 'totalOrder'             ] ,
    [ 'topological space'      , 'topSpace'               ] ,
    [ 'for all'                , 'forall'                 ] ,
    [ 'for each'               , 'forall'                 ] ,
    [ 'for every'              , 'forall'                 ] ,
    [ 'there exists'           , 'exists'                 ] 
  ]
  
  const UnicodeNames = {
    '⋅' : '*'          ,  '≤' : 'leq'       , '¬' : 'neg'    , '→' : 'to'        ,
    '←' : 'from'       ,  '⇒' : 'implies'   , '⇔' : 'iff'    , '∩' : 'intersect' ,   
    '∪' : 'union'      ,  '×' : 'cross'     , '∈' : 'in'     , '⊆' : 'subset'    ,    
    '∖' : 'setminus'   ,  '∘' : 'circ'      , '∧' : 'wedge'  , '∨' : 'vee'       ,
    '≡' : 'equiv'      ,  '↦' : 'mapsto'    , '≈' : 'approx' , '∀' : 'forall'    ,
    '∃' : 'exists'     ,  '⟨' : 'langle'    , '⟩' : 'rangle' , '➤' : 'comment'   ,
    '°' : 'complement' ,  '≅' : 'cong'      , '\\': ' '      , '!' : 'factorial' 
  }
  
  const internalNames = {
    'equiv'     : '≡' , 'forall'   : '∀'  , 'exists' : '∃'  , 'existsUnique' : '∃!'    ,
    'iff'       : '⇔' , 'implies'  : '⇒'  , 'vee'    : 'or' , 'wedge'        : 'and'   ,
    'not'       : '¬' , 'setminus' : '∖'  , 'subset' : '⊆'  , 'subseteq'     : '⊆'     ,
    'cong'      : '≅' , 'leq'      : '≤'  , 'lt'     : '<'  , 'factorial'    : '!'     ,
    'divides'   : '|' , 'cdot'     : '⋅'  , '*'      : '⋅'  , 'love'         : 'loves' ,
    'in'        : '∈' , 'Sum'      : 'sum', '\\'     : ' '  , 'fear'         : 'fears' ,
    'complement': '°' , 'intersect': '∩'  , 'union'  : '∪'  , 'cap'          : '∩'     ,
    'cup'       : '∪' , 'comp'     : '∘'  , 'circ'   : '∘'  , 'cross'        : '×'     ,
    'star'      : '★' , 'division' : '/'  , 'neg'    : '¬'
  }

  // for use in Declare's, look up the internal name of a reserved word or
  // symbol that might appear in the declare sequence.  If the name isn't on the list
  // then it is internally just iteslf.  Handle division as a special case.
  const internal = s => {
    return (s=='cdot /') ? '/' : internalNames[s] || s
  }

  // replace phrases first
  const replacePhrases = s => {
    Phrases.forEach( p => { 
      const regex = new RegExp(p[0],'g')
      s = s.replace(regex,` ${p[1]} ` )  
    } )
    return shrink(s)
  }
  
  // then remove the unicodes
  const replaceUnicode = s => {
    // first, replace toxic unicode chars with their ascii synonym
    s = s.replace(/𝜎/g  , ' sigma'    ) // usually used as a function so no following space
         .replace(/𝜆/g  , '@'         ) // for "LDE EFA"
         .replace(/≠/g  , ' neq '     )
         .replace(/∉/g  , ' notin '   )
         .replace(/⁻/g  , '^-'        )
         .replace(/𝒫/g  , ' powerset' ) // usually used as a function so no following space
    // now replace the given unicode characters that do not appear in strings or
    // putdown
    const chars = '[⋅≤¬→←⇒⇔∩∪×∈⊆∖∘∧∨≡↦≈∀∃⟨⟩➤°!⁻≅\\\\]'      
    const regex = new RegExp(`(?<!«[^«»]*)(?<!^[^"]*"[^"]*)${chars}(?![^«»]*»)`,'mg')
    const ans = shrink(s.replace(regex, c => { return ` ${UnicodeNames[c]} ` } ) )
    return ans
  }

  // for debugging, say where you are in the parse and what you are seeing
  const debug = (name,...args) => {
    if (DEBUG) {
      write(`${name}:`)
      args.forEach(a=>write(a))
    }
    return true
  }
  
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
  // Comments
  //
  // Comments are defined to start at // and continue to the end of the line.
  // Delete comments first, but leave any \n's to keep the line counts right for
  // debugging.
  input = input.replace(/\/\/[^\n\r]*(\n|\r|$)/g, '\n')
  // Look for lines containing only a ➤ and whitespace, and replace them
  // with (➤ " ") to act as a line break in the output in Lode
  input = input.replace(/^([ \t]*)➤[ \t]*$/mg, '$1➤ " " \n')
  
  // Tabs, Spaces, Commas
  //
  // replace tabs with a space
  input = replaceTabs(input)
  // pad commas for when they are shorthands
  input = padCommas(input)
  // pad colons for when they are shorthands
  input = padColons(input)
  // remove double spaces
  input = shrink(input)

  // Phrases and unicode
  //
  // replace phrases with symbols
  input = replacePhrases(input)
  // replace unicode characters with ascii symbols
  input = replaceUnicode(input)
  
  // Relations
  //
  // In order to use ~ and ≈ as both infix operations AND sets (and talk about
  // their properties) we replace '~' and '≈' up front with (~) and (≈)
  // respectively.
  input = input.replace(/'~'/g, '(~)')
  input = input.replace(/'≈'/g, '(approx)')
  
  // Optional Given Colons
  //
  // Lets used to require a colon e.g. ':Let' but we no longer require it, so
  // for backwards compatibility, remove it if its there.  If someone puts it
  // there, no big deal.
  input = input.replace(/:([Ll]et )/g, '$1') 
  
  // Division '/' to product ' cdot /'
  //
  // Replace all '/' with ' cdot /'
  input = input.replace(/(?<!«[^«»]*)\/(?![^«»]*»)/g,' cdot /')
  
  // Remove any double spaces that were created
  input = shrink(input)
  
  //\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//\\//
  //  Set brackets option
  //
  //  We have the following problem. For backwards compatibility with the
  //  testing suite we need to keep { } brackets for environments.  But we also
  //  now want to allow students to type sets using those brackets.  To
  //  accomplish both with the same parsers we do the following.
  //
  //  1. There is a parser option `options.enableSets` which is a boolean.
  //  2. If true, then every set bracket { or } in the input is replaced by the
  //     unicode `Fullwidth Curly Brackets`｛  ｝which are then parsed
  //     differently. 
  //  3. In the UI for students entering expressions, this option is enabled.
  //  4. In Lode and the testing suite it is disabled, but in that case the
  //     unicode curly brackets can be entered directly with a keyboard shortcut
  //     to make test proofs involving sets.
  //  5. One challenge is that we want to allow set brackets for rule labels and 
  //     citations even when enableSets is true. To handle that situation we replace
  //     set brackets with ordinary parentheses first, in that case.
  input = input.replace(/(\b(label|by)\s*)\{([^{}]+)\}/g,'$2($3)')
  // Now proceed with the set bracket replacements
  if (options.enableSets) 
    input = input.replace(/{/g,'｛').replace(/}/g,'｝')  

  // set options.debug to true for debugging
  if (options.debug) say(input)

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
//     - Quantified : 
//     - Binding    :
//     - Prop       :
//     - Relations  :
//     - Set        :
//     - Prefix     :
//     - Algebraic  :
//     - Atomic     :
//
// The start rule for a Peggy grammar is the first rule.  For us, it's a
// sequence of LCs. 
//
// (this consumes all of the inter-LC spaces)
LCs "LC" = _ a:(LC)|..,__| _  { return a.join(' ') }

///////////////////////////////////////////////////////////////////////////////
// Overview
//
// Here we just put a high level overview that shows the precedence of
// operations. All of these are defined below.
//
// A single LC
LC = Meta / Given / Environment / Declaration / Expression
  // Things it searches for and replaces up front
  Meta = Putdown / Comment / Label / Ref / StringLiteral / Shorthand 
  // Declarations
  Declaration = Declare / ForSome / Let 
  // Expressions
  Expression =  Quantified / Binding / Prop / PropArg
    // higher precedence than Prop ops for use in Props
    PropArg  = Relations / RelArg
      // higher precedence than Relations for use in Relations
      RelArg = Set / Algebraic
  
  // It is often useful to have a sequence of one or more expressions separated
  // by commas
  ExpressionSeq = a:Expression|..,comma| { return a.join(' ') }

///////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////
// Meta
//
// Unprocessed putdown notation (cannot include // comments)
Putdown = '«' @$([^»]*) '»'  
// Insert a comment that gets echoed in Lode
Comment = ( '%' / 'Comment'i ) __ a:StringLiteral 
          { return `(➤ ${a})` }
// A string literal is anything enclosed in double quotes
// Currently only used for comments
StringLiteral = $('"' [^"]* '"')
// Labels - generalization of LaTeX \label{} command (including that syntax)
Label = 'label'i _ [(\[{"] _ a:([^)\]}"]+) _ [)\]}"] { return `(label> "${a.join('')}")` }
// Refs - generalization of LaTeX \ref{} command (including that syntax)
Ref = RefLabel _ [(\[{"] _ a:([^)\]}"]+) _ [)\]}"] 
      { return `by "${a.join('')}"` } /
      // But it might be split between atoms, in which case we handle it this
      // way In this case it has to be followed by a symbol (which can have
      // spaces if wrapped in " ").
      RefLabel !alphanum { return 'by'}
  RefLabel = $('ref'i/'by'i)  
// Shorthands are special symbols which are not allowed to be part
// of a larger expression and are post-processed by the LDE
// They cannot be part of a longer symbol
Shorthand = a:(BIH / Ruleset / Rule / Thm / Proof / Cases / Subs / Equiv / Comma) 
              !alphanum { return a }
  // Shorthands
  Equiv = 'equiv'i { return '≡' }
  BIH = ('since'i / 'because'i / 'recall'i) { return '>>' }
  Ruleset = ('rules'i / 'axioms'i / 'definitions'i) ':'? { return 'rules>' }
  Rule = ('rule'i / 'axiom'i / 'definition'i) ':'? { return 'rule>' }
  Thm = ('theorem'i / 'thm'i / 'lemma'i / 'corollary'i) ':'? { return 'thm>' }
  Proof = 'proof'i ':'? { return 'proof>' }
  Cases = 'CasesRule'i ':'? { return 'cases>' }
  Subs = 'SubsRule'i ':'? { return 'subs>' }
  Comma = ',' { return '<comma'}

///////////////////////////////////////////////////////////////////////////////
// Givens
//
// A Given label that is not part of a longer symbol or followed by another :
// character, separated from either an Environment or Expession sequence by
// optional spaces.
// Given = GivenLabel a:Environment { return ':'+a } /
//         GivenLabel a:Expression|1..,comma| { return a.map(x=>':'+x).join(' ') }
Given = GivenLabel
  GivenLabel = (':' / ('assume'i / 'given'i / 'suppose'i / 
                       'if'i / 'from'i / 'define'i ) !alphanum ) { return 'given>' }

///////////////////////////////////////////////////////////////////////////////
// Environments
//
Environment =  '{' a:LCs '}' { return `{ ${a} }` }

///////////////////////////////////////////////////////////////////////////////
// Declarations
//
// Declare constants (cannot have a body and is a given)
Declare = 'declare'i __ a:DeclareSeq { return `declare> :[${a}]` }
// ForSome declaration (always a claim)
// We also allow the special shorthand `for some x in A` since it is so common.
// upgrade some> to a shorthand to allow environment bodies
ForSome = 'for'i __ 'some'i __ a:(Symbol)|1..,comma| __ 'in'i __ b:Expression 
            { return `some> [${a.join(' ')},{ ${a.map(x=>`(∈ ${x} ${b})`).join(' ')} }]` } /
          'for'i __ 'some'i __ a:SymbolSeq 
            { return `some> [${a}]` }
// the 'given' colon is optional since these are always 'given'. We also 
// allow the special shorthand `Let x∈A` since it is so common.          
Let = 'Let'i __ a:Symbol __ 'in'i __ b:Expression 
                            { return `:[${a}, ${lispBinary('∈',a,b)}]` } /
      // upgrade <be to a shorthand to allow environment bodies                      
      'Let'i __ a:SymbolSeq __ ('be'i __)? 'such'i __ 'that'i // __ b:Expression 
                            { return `:[${a}] <be` } /
      'Let'i __ a:SymbolSeq { return `:[${a}]`       }
  // Comma separated symbols, numbers, and reserved words
  DeclareSeq = a:('cdot /' / Symbol / Number / ReservedWord)|1..,comma| 
                { return a.map(internal).join(' ') }
  // We allow Reserved Words and Numbers to be declared by a Declare, but not
  // by a Let or ForSome.
  SymbolSeq  = a:(Symbol)|1..,comma| { return a.join(' ') }

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
// Quantified and Binding
//
// quantified binding expressions
Quantified = 'forall' _x b:Binding           { return `(∀ ${b})`  } /
             'exists' _x b:Binding           { return `(∃ ${b})`  } /
             'existsUnique' _x b:Binding     { return `(∃! ${b})` } 
// binding expressions / anonymous maps
Binding = a:Symbol (period _ / _'mapsto'_x) b:Expression 
          { return `${a}, ${b}` }

///////////////////////////////////////////////////////////////////////////////
// Propositional expressions
//
// We want a strict precedence of operations here, so lower precedence items 
// should only permit higher precedence arguments.
// Thus we only need Prop to point to Iff because the higher precedent ones feed
// into that, and they use BelowProp and higher precendent Prop's as arguments. 
Prop = Iff

  Iff     = a:(Implies/PropArg)|1..,_'iff'_x|        { return lispSeq('⇔',a)   }
  Implies = a:(Or/And/PropArg)|1..,_'implies'_x|     { return lispSeq('⇒',a)   }
  Or      = a:(And/PropArg)|1..,_('or'/'vee')_x|     { return lispSeq('or',a)  }
  And     = a:(Not/PropArg)|1..,_('and'/'wedge')_x|  { return lispSeq('and',a) }
  Not     = _('not'/'neg')_x b:PropArg               { return lispUnary('¬',b) }
  
///////////////////////////////////////////////////////////////////////////////
// Relations
//
Relations = Maps / Partition / Congruent / Subset / ElementOf / NotEltOf / 
            Divides / Chain / Relation / NotEqual / Loves / Fears / Is

  Maps       = a:RelArg _':'_ b:RelArg _'to'_x c:RelArg  
                 { return lispSeq('maps',[a,b,c]) }
  // TODO: combine this with Is, and add the order relations
  Partition  = a:(Binding/RelArg) _'is' __ 'a' __ 'partition'i __ 'of' __ 
               b:(Binding/RelArg)
                 { return lispSeq('partition',[a,b]) } / 
               a:(Binding/RelArg) _'is' __ 'a' __ 'relation'i __ 'on' __ 
               b:(Binding/RelArg)
                 { return lispSeq('relation',[a,b]) }    
  Congruent  = a:(Binding/RelArg) _'cong'_x b:(Binding/RelArg) _'mod'i_x 
               c:(Binding/RelArg)
                 { return lispSeq('≅',[a,b,c]) } /
               a:(Binding/RelArg) _'cong mod'i_x c:(Binding/RelArg) _'to'_x 
               b:(Binding/RelArg)
                 { return lispSeq('≅',[a,b,c]) }              
  Subset     = a:RelArg|2..,_('subset'/'subseteq')_x|  
                 { return lispSeq('⊆',a) }
  NotEltOf   = a:RelArg _'notin'_x b:RelArg        
                 { return `(¬ ${lispBinary('∈',a,b)})` }
  ElementOf  = a:RelArg _'in'_x b:RelArg           
                 { return lispBinary('∈',a,b) }
  Divides    = a:RelArg _('|'_ / 'divides'_x) b:RelArg      
                 { return lispBinary('|',a,b) }
  Chain      = a:(Binding/RelArg) b:( ChainOp (Binding/RelArg) )+
                 { return lispChain(a,b) }
  NotEqual   = a:RelArg _('neq'/'ne')_x b:RelArg   
                 { return `(¬ ${lispBinary('=',a,b)})` }
  Relation   = a:(Binding/RelArg)|2..,_'~'_|       
                { return lispSeq('~',a) }             
  Loves      = a:RelArg _('loves'/'love')_x b:RelArg
                { return lispBinary('loves',a,b) }
  Fears      = a:RelArg _('fears'/'fear')_x b:RelArg
                { return lispBinary('fears',a,b) }
  Is         = a:RelArg _('is' __ 'not' __ 'an' __ /
                          'is' __ 'not' __ 'a'__   /
                          'is' __ 'not' __         /
                          'are'__ 'not' __ ) b:RelArg
                { return `(¬ ${lispBinary('is',a,b)})` } /
               a:RelArg _('is' __ 'an' __/'is' __ 'a'__/'is' __ 'the'__/'is'__/'are'__) b:RelArg
                { return lispBinary('is',a,b) }


///////////////////////////////////////////////////////////////////////////////
// Sets 
//
// We imitate Algebraic operator precendence as much as possible and rank from
// lowest to highest: set difference < set product < ∪ and ∩ (tied) <
// composition , complement (tie) Thus, as for Prop we only need for Set to
// point to the first one. Algebraic bubbles up from Composition.
Set = RelativeComp

  RelativeComp  = a:CartProd|1..,_'setminus'_x| 
                    { return lispSeq('∖',a) }  
  CartProd      = a:Union|1..,_('times'/'cross')_x| 
                    { return lispSeq('×',a) }
  Union         = a:Intersection|1..,_('cup'/'union')_x| 
                    { return lispSeq('∪',a) }
  // Moved Complement below so ticks can be used for both complement and
  // derivatives and other operations as needed.
  //
  // Intersection  = a:(Complement/Composition)|1..,_('cap'/'intersect')_x| 
  Intersection  = a:(Composition)|1..,_('cap'/'intersect')_x| 
                    { return lispSeq('∩',a) }               
  // Complement    = a:Algebraic _('\''/'complement')!alphanum
  //                   { return lispUnary('°',a) }
  Composition   = a:Algebraic|1..,_('circ'/'comp')_x| 
                    { return lispSeq('∘',a) }
  
  // We imitate Summation to implement both IndexedUnion and IndexedIntersection
  // and give it rought the same precedence
  BigUnionName = 'Union'/'Cup'/'bigcup'i 
  IndexedUnion = BigUnionName __ k:Symbol __ 'in'_x a:Set __ 'of' __ f:Set
                  { return union(f,k,a) }  / 

                 BigUnionName __ ('of'i __)? f:Set 
                 __ 'for'i__ k:Symbol _ 'in'_x a:Set
                     { return union(f,k,a) }  /

                 BigUnionName '(' _ f:Set comma 
                 k:Symbol comma  a:Set _ ')'
                     { return union(f,k,a) }

  BigIntersectName = 'Intersect'/'Cap'/'bigcap'i 
  IndexedIntersect = BigIntersectName __ k:Symbol __ 'in'_x a:Set __ 'of' __ f:Set
                         { return intersect(f,k,a) }  / 

                     BigIntersectName __ ('of'i __)? f:Set 
                     __ 'for'i__ k:Symbol _ 'in'_x a:Set
                         { return intersect(f,k,a) }  /
    
                     BigIntersectName '(' _ f:Set comma k:Symbol comma  a:Set _ ')'
                         { return intersect(f,k,a) }              


///////////////////////////////////////////////////////////////////////////////
// Algebraic Expressions
//
// For now we implement binomial coefficients with the infix operator 'choose'
// and make it even lower precedence than sum so you can do things like '(n+1
// choose k)' without additional parentheses. Sums and Products are particularly
// subtle because of the need to integrate them with the standard conventions
// for negation and division.
//
// Once again, Algebraic only has to point to the lowest precedence operator
// that inherits the ones below it (but Choose does not). Atomic is passed up
// the chain from Exp.
Algebraic = Choose / Sum / Summation / IndexedUnion / IndexedIntersect / Product
  
  Choose    = a:(Sum / Product) _'choose'_x b:(Sum / Product) 
                { return lispBinary('choose',a,b) }      
  Sum       = a:(Summation / Product) _ b:(_ [-+] _ (Summation / Product))+ 
                { return lispSum(a,b) }

  // this is one of the more complex symbols so we support multiple ways of
  // entering it Precendence for this is a bit tricky.  What seems most natural
  // and avoids the most awkward parentheses is to make summation higher
  // precedence than addition but lower than multiplication.  That way e.g. 'sum
  // k to n of f(k) + sum k to n of g(k)' will be the sum of the two summations,
  // rather than a single summation where the second one is part of the summands
  // of the first. 
  Summation = 'sum'i __ k:Symbol _ '=' _ a:Product __ 'to'i __ b:Product
              __ ('of'i __)? f:Product
                  { return summation(f,k,a,b) }  / 

              'sum'i __ k:Symbol __ a:('from' __ @Product __)? 'to'i __ b:Product
              __ ('of'i __)? f:Product
                  { return summation(f,k,a,b) }  /  

              'sum'i __ ('of'i __)? f:Product 
              __ ('as'i __ / 'for'i__) k:Symbol __ ('goes'i __)? 
              a:('from' __ @Product __)? 'to'i __ b:Product
                  { return summation(f,k,a,b) }  /

              'sum'i '(' _ f:Product comma 
              k:Symbol comma a:(@Product comma)? b:Product _ ')'
                  { return summation(f,k,a,b) }              

  Product   = a:(Denom/Negated/ExpArgs)
                |1..,(_'⋅'_/_'cdot'_x/_'*'_)| 
                { return lispSeq('⋅',a) }
                
    Denom     = '/' _ a:ExpArgs 
                  { return lispUnary('/',a) }    
    Negated   = '-' _ a:ExpArgs 
                  { return lispUnary('-',a) }

    // higher precedence args 
    ExpArgs =  Factorial / Complement / Prefix / Exp / Star / Atomic

    // The choice of precedence of Function application vs Exp is tricky.
    // Consider e.g. 2^cos(x), f^2(x), 2^f(x), f^(-1)(x), and the nightmare
    // expressions like sin^2(x) and sin(x)^2. What is the natural way to parse
    // each of those? 
    //
    // The main use case in the intro to proof course is for inverse functions.
    // For this reason we choose to make exponentiation higher precedence than
    // function application, and remove parentheses from exponents.  With this
    // choice of precedence we most likely would want to type the above
    // expressions as: 2^(cos(x)), f^2(x), 2^(f(x)), f^(-1)(x), and either
    // define a rule that says sin^2(x)=(sin(x))^2, or just don't ever use
    // sin^2(x) at all for input. 
    //
    // For a similar reason, Factorials are lower precedence than exponentials
    // so that e.g. 2^n! parses as (2^n)! instead of 2^(n!). And since f(n)!
    // really only makes sense in one way, function application is a higher
    // precedence than Factorial.
    //
    // So the precedence from lowest to highest is
    //
    //                   Factorial < Prefix < Exp
    
    Factorial = a:(Prefix / Exp / Atomic) _'factorial'!alphanum 
                  { return lispUnary('!',a) }

    // even though we originally defined this for set complement, if we move it's 
    // precedence here we can also use it for derivatives or other operators.

    Complement = a:(Prefix / Exp / Atomic) _('\''/'complement')!alphanum
                  { return lispUnary('°',a) }
    
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
    Prefix = '@' a:[a-z]i b:( '('_ @ExpressionSeq _')' )+ 
                { return `(λ ${a} ${b})` } /
              // allow 'set' to be case insensitive, check for setbuilder before
              // finite sets
              'set('i _ a:Symbol _ ':' _ b:Expression _')'  
                { return `(setbuilder (${a},${b}))` } /
              // allow 'set' to be case insensitive
              'set('i _ b:ExpressionSeq _')'  
                { return `(set ${b})` } /
              // allow 'paren' to wrap an expression in visual parens with no
              // meaning change
              'paren('i _ b:Expression _')'  { return b } /
              // allow 'class' to be case insensitive
              'class('i _ b:ExpressionSeq _')'  
                { return `(class ${b})` } /
              // everything else
              a:(Exp / Symbol / Parenthesized) '_'?
              b:( '('_ @ExpressionSeq _')' )+ 
                { return lispPrefix(a,b) }

    // If we made it to here, we are at the bottom of the food chain for
    // compound expressions, so it's ok to return a symbol or other atomic at
    // this point.
    Exp = a:Atomic _'^'_ b:(Atomic / '-') { return lispBinary('^',a,b) } 

    // An arbitrary high precedence infix operator
    Star = a:Atomic|1..,(_'★'_/_'star'_x)| 
                { return lispSeq('★',a) }

///////////////////////////////////////////////////////////////////////////////
// Atomic Expressions
//
// morally atomic expressions (do not require parentheses)
Atomic = StringLiteral / Parenthesized / // EquivalenceClass / 
         Tuple / SetBracketed / Symbol / Number

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

// tuples
Tuple = '['_ a:ExpressionSeq _']'!alphanum { return `(tuple ${a})` } /
        'langle'_x a:ExpressionSeq _'rangle'!alphanum { return `(tuple ${a})` }
// sets
SetBracketed = '｛'_ a:Symbol _ ':' _ b:Expression _'｝' 
                 { return `(setbuilder (${a},${b}))` } /
               '｛'_ a:ExpressionSeq _'｝' { return `(set ${a})` }
// parenthesized
Parenthesized = '(' _ @Expression _ ')'

///////////////////////////////////////////////////////////////////////////////
// Numbers 
// (negatives and fractions are compound)
Number  = Decimal / Natural
Decimal = $( Natural '.' [0-9]+ )
Natural = $( [1-9][0-9]* / '0' )

///////////////////////////////////////////////////////////////////////////////
// Symbols and Reserved Words
//
// Symbols can be anything string of alphanumeric characters [a-zA-Z0-9] that
// does not start with a digit and is not a reserved word.  Reserved words are not
// symbols, but can be declared with a Declare.
//
// For clarity in reading the putdown output we rename some special frequently used
// symbols.
Symbol "Symbol" = 
  '✔︎' / '✗' / '⁉︎' / '⊘' / // useful unicode
  ('infty'/'infinity') { return '∞'  }  /
  'contradiction' { return '→←' }  /  'sigma'         { return 'σ'  }   /
  'NN'            { return 'ℕ'  }  /  'ZZ'            { return 'ℤ'  }   /
  'QQ'            { return 'ℚ'  }  /  'RR'            { return 'ℝ'  }   /
  'CC'            { return 'ℂ'  }  /  'II'            { return '𝕀'  }   /  
  'OO'            { return '𝕆'  }  /  '~'                              /
  !(ReservedWord !alphanum) @$([a-z]i alphanum* ) 

// Reserved Words
//
// a string is a reserved word if it starts with one of these and is not
// followed by an alphanum, so not part of a longer symbol, or things that
// aren't symbols that we still want to declare as constants.
ReservedWord  = $(
    'declare'i / 'existsUnique' / 'forall' / 'exists' / '*' / 'leq' /
    'not' / 'neg' / 'to' / 'from' / 'implies' / 'iff' / 'intersect' / 'union' /
    'cross' / 'subset' / 'setminus'i / 'circ' / 'comp' / 'wedge' / 'vee' / 
    'equiv' / 'mapsto' / 'approx' / 'langle' / 'rangle' / 'complement' / 
    'in' / 'and' / 'or' / '=' / '<' / '+' / '*' / '|' / '-' / 
    'sum'i / 'to' / 'of' / 'from' / 'as' / 'for' / '^' / 'division')

ChainOp = _ @( @'='_ / 'leq'_x { return '≤'} / 'lt'_x { return '<' } / @'<'_)

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