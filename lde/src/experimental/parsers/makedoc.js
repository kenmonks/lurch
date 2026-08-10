///////////////////////////////////////////////////////////////////////////
// The syntax documentation table for the LurchMath parser
//
// The DECLARABLE notation rows
// derive from lurch-notation.txt: the loader records one surface pool per
// declaration (chain family / big-operator section) in
// notationExtras.docRows - primary pattern, word: synonyms, also:
// surfaces, the isa registry's automatic `is not` twins, and the
// example: instances - and this module expands each pool into docs boxes
// by grouping inputs whose tex renderings are IDENTICAL (the dedup
// policy: a box lists only synonyms that render the same
// way; surfaces with per-surface renderings, like `P wedge Q` or the
// `is a` echoes, get their own box).  A new notation-file row therefore
// appears on the docs page and in the golden corpus with zero JS edits.
//
// The hand skeleton below contributes the section headers, the
// { derive: band } placeholders, and the rows for GRAMMAR-LEVEL notation
// the file cannot declare (quantifiers, algebraic/postfix forms, sets and
// tuples, declarations, mentions).  Hand rows are plain arrays of input
// strings; the rendered column is always the live tex parse of the first
// input, so there is nothing here to drift.
//
// Exported so the golden-snapshot suite in parsertests.js can test every
// documented input with both parsers - see the MakedocExamples suite
// there.  Any input added here (or in the notation file) is automatically
// picked up by the tests.

import { parse } from './lurch-to-putdown.js'
import { notationExtras } from './notation-tables.js'
const tex = ( s, opts = {} ) => parse( s, { ...opts, tex: true } )

// the docs page renders with sets enabled, exactly as the tests parse it
const texOf = input => {
  try { return tex( input, { enableSets: true } ) }
  catch { return null }
}

// expand one docRow pool into boxes: inputs with identical tex share a
// box, in order of first appearance; inputs that do not parse standalone
// (the bare quantifier words of the constants group) are skipped - they
// are grammar participants, documented by the hand rows
const boxesOf = row => {
  const boxes = [], byTex = new Map()
  row.inputs.forEach( input => {
    const t = texOf(input)
    if ( t === null ) return
    if ( byTex.has(t) ) byTex.get(t).push(input)
    else { const box = [ input ]; byTex.set(t, box); boxes.push(box) }
  } )
  return boxes
}

const expand = table => table.flatMap( entry =>
  typeof entry === 'object' && !Array.isArray(entry)
    ? notationExtras.docRows.filter( r => r.band === entry.derive )
        .flatMap(boxesOf)
    : [ entry ] )

// The hand skeleton: section header strings, { derive: band } placeholders
// (bands: prop, relation, chain, setAlg, bigop, constant - the notation
// file's group structure), and hand boxes for grammar-level notation.
const skeleton = [

'Propositional logic',
{ derive: 'prop' },
['not P'],
['neg P', '¬P'],

'Quantifiers and bindings',
['forall x.x leq x+1', 'for all x.x leq x+1', '∀x.x leq x+1'],
['exists x.x=2 cdot x', '∃x.x=2⋅x'],
['exists unique x.x=2*x', '∃!x.x=2⋅x'],
['x.x+2', 'x mapsto x+2', 'x↦x+2'],

'Relations',
{ derive: 'relation' },

'Transitive chains',
['x=y'],
['x=y=z'],
{ derive: 'chain' },

'Sequents',
['A ⊢ B', 'A vdash B', 'A proves B'],
['(⊢ B)', '(vdash B)'],
['(A, B ⊢ C)'],
['(A, B ⊢ C, D)'],
['A ⊢_(Gamma) B'],
['not (A ⊢ B)', 'A does not prove B'],

'Set and algebraic operators',
{ derive: 'setAlg' },

'Big operators',
{ derive: 'bigop' },

'Delimited forms',
{ derive: 'delimited' },

'Constants and phrases',
{ derive: 'constant' },

'Algebraic expressions',
['(x)'],
['2+x+y'],
['-x'],
['1-x'],
['1/x'],
['2*1/x*y'],
['(2*1)/(x*y)'],
['x^2'],
['x factorial', 'x!'],
['multinomial(m,n)'],
['abs((1-x)/(1+x))'],
['x star y star z'],
['Fib_(n+2)'],

'Sets, functions, and tuples',
['{a,b,c}', 'set(a,b,c)'],
['{ p:p is prime}', 'set(p:p is prime)'],
["A'", 'A complement', 'A°'],
['powerset(A)', '𝒫(A)'],
['f:A→B'],
['f(x)'],
['f_(x)'],
['f_(0)(x)_(n+1)'],
['[x,y]', 'pair(x,y)', 'tuple(x,y)', '⟨x,y⟩'],
['[x,y,z]', 'triple(x,y,z)', 'tuple(x,y,z)', '⟨x,y,z⟩'],
['[w,x,y,z]', 'tuple(w,x,y,z)', '⟨w,x,y,z⟩'],
['[[1,2],[3,4]]'],
["[x,y]'"],
["[x,y,z]'"],
["[[1,2,3],[4,5,6]]'"],
['class(a)'],
['class(a,~)'],

'Assumptions and Declarations (case insensitive, phrase is echoed)',
['Assume P', 'Given P', 'From P', 'Suppose P', 'If P', 'Define P', ':P'],
['Let x'],
['Let x in A'],
['Let x be such that x in RR', 'Let x such that x in RR'],
['Let x in RR be such that 0 leq x'],
['f(c)=0 for some c'],
['f(c)=0 for some c in A'],
['Declare is, 0, +, cos'],

'Mentioning an operator as a symbol (any operator name or glyph)',
['(star)', "'star'"],
['(subset)', "'⊆'"],
['oplus(x,y)', "'⊕'(x,y)", '(⊕)(x,y)'],
['~ is reflexive', "'~' is reflexive"],
["⟨x,y⟩ in '~'", '⟨x,y⟩ in ~'],
['star is associative'],
['oplus is associative'],
['otimes is associative'],
['odot is associative'],
["'~' is an equivalence relation"],
["'~' is a strict partial order"],
["'~' is a partial order"],
["'~' is a total order"],

'Miscellaneous',
['1.23[456]'],
['x^-', 'x⁻'],
['@P(k)', '𝜆P(k)']

]

export const syntax = expand(skeleton)

const esc = s => s.replaceAll('&', '&amp;')
                  .replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export const makedoc = () => {
  let ans = ''
  syntax.forEach( row => {
    if (typeof row === 'string') {
      ans = ans +
        `\n<tr><td colspan="2" class="subheader">${row}</td></tr>\n`
    } else {
      ans = ans +
       `<tr>
          <td>${row.map(esc).join('<br/>')}</td>
          <td>$${tex(row[0],{enableSets:true})}$</td>
        </tr>\n`
    }
  })
  let doc = loadStr('lurch-parser-docs-template','./parsers/','html')
              .replace(/## MAKEDOC OUTPUT GOES HERE ##/g,ans)
  fs.writeFileSync('./parsers/lurch-parser-docs.html', doc)
  write('The Lurch syntax documentation page was written successfully.')
}
