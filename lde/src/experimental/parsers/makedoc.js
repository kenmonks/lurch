// Raw Example Data for the LurchMath Parser
import { parse as lurchToTex } from './lurch-to-tex.js'
const tex = lurchToTex

const syntax = 
[

'Logic',
[['P and Q', 'P∧Q'                   ],`P\\text{ and }Q`],
[['P or Q',  'P∨Q'                   ],`P\\text{ or }Q`],
[['not P'                            ],`\\text{not }P`],
[['neg P', '¬P'                      ],`\\neg P`],
[['P implies Q', 'P⇒Q'               ],`P\\Rightarrow Q`],
[['P iff Q', 'P⇔Q'                   ],`P\\Leftrightarrow Q`],
[['contradiction', '→←'              ],`\\rightarrow\\leftarrow`],

'Quantifiers and bindings',
[['forall x.x leq x+1',
  'for all x.x leq x+1', 
  '∀x.x leq x+1'                      ],`\\forall x, x\\leq x+1` ],
[['exists x.x=2 cdot x', 
  '∃x.x=2⋅x'                         ],`\\exists x, x=2\\cdot x` ],
[['exists unique x.x=2*x', 
  '∃!x.x=2⋅x'                        ],`\\exists ! x, x=2\\cdot x` ],
[['x.x+2', 'x mapsto x+2' , 'x↦x+2'  ],`x, x+1`],

'Algebraic expressions',
[['(x)'                              ],'\\left(x\\right)'],
[['x+y'                              ],`x+y`],
[['2+x+y'                            ],`2+x+y`],
[['-x'                               ],`-x` ],
[['1-x'                              ],`1-x`],
[['x*y','x cdot y', 'x⋅y'            ],`x\\cdot  y`],
[['2*x*y','2 cdot x cdot y', '2⋅x⋅y' ],`2\\cdot x\\cdot y`],
[['2*3*x','2 cdot 3 cdot x', '2⋅3⋅x' ],`2\\cdot 3\\cdot x`],
[['1/x'                              ],`\\frac{1}{x}`],
[['2*1/x*y'                          ],`2\\cdot\\frac{1}{x}\\cdot y`],
[['(2*1)/(x*y)'                      ],`\\frac{2\\cdot 1}{x\\cdot y}`],
[['x^2'                              ],`x^2`],
[['x factorial', 'x!'                ],`x!`],
[['(n+1) choose (k-1)'               ],`\\binom{n+1}{k-1}`],
[['multinomial(m,n)'                 ],`(m,n)`],
[['abs((1-x)/(1+x))'                 ],`\\left|\\,\\frac{1+x}{1-x}\\,\\right|`],
[['sum k=0 to n of k^2',
  'sum k from 0 to n of k^2',
  'sum k to n of k^2',
  'sum of k^2 as k goes from 0 to n',
  'sum k^2 as k goes from 0 to n',
  'sum k^2 as k from 0 to n',
  'sum k^2 for k from 0 to n',
  'sum k^2 for k to n',
  'sum of k^2 as k to n',
  'sum of k^2 for k to n',
  'sum( k^2 , k , 0 , n )',
  'sum(k^2,k,0,n)',
  'sum(k^2,k,n)'                     ],`\\sum_{k=0}^n k^2`],
[['product(k^2,k,0,n)'               ],`\\prod_{k=0}^n k^2`],
[['int x=0 to n of x^2',
  'int x from 0 to n of x^2',
  'int of x^2 as x goes from 0 to n',
  'int x^2 as x goes from 0 to n',
  'int x^2 as x from 0 to n',
  'int x^2 for x from 0 to n',
  'int x^2 for x to n',
  'int of x^2 as x to n',
  'int of x^2 for x to n',
  'int( x^2 , x , 0 , n )',
  'int(x^2,x,0,n)'                   ],`\\int_0^n x^2\,\mathrm{d}x`],
[['int x^2 dx',
  'int with respect to x of x^2',
  'int wrt x of x^2',
  'int of x^2 with respect to x',
  'int x^2 wrt x',
  'int(x^2,x)'                       ],`\\int x^2\,\mathrm{d}x`],
[['Fib_(n+2)'                        ],`F_{n+2}`],

'Set Theory',
[['x in A', 'x∈A'                    ],`x\\in A` ],
[['x notin A', 'x∉A'                 ],`x\\notin A` ],
[['{a,b,c}', 'set(a,b,c)'            ],`\\left\\{\\,a,b,c\\,\\right\\}` ],
[['{ p:p is prime}', 
  'set(p:p is prime)'                ],`\\left\\{\\,a,b,c\\,\\right\\}` ],
[['A subset B', 'A subseteq B', 'A⊆B'],`A\\subseteq B`],
[['A cup B', 'A union B', 'A∪B'      ],`A\\cup B`],
[['A cap B', 'A intersect B', 'A∩B'  ],`A\\cap B`],
[['A setminus B', 'A∖B'              ],`A\\setminus B`],
[['A\'','A complement', 'A°'         ],`A'`],
[['powerset(A)', '𝒫(A)'              ],`\\textbf{P}(A)`],
[['f:A to B', 'f:A→B'                ],`f\\colon A\\to B`],
[['f(x)'                             ],`f\\left(x\\right)`],
[['f_(x)'                            ],`f_x`],
[['f_(0)(x)_(n+1)'                   ],`f_{0}\\left(x\\right)_{n+1}`],
[['g circ f', 'g comp f' , 'g∘f'     ],`g\\circ f`],
[['A times B', 'A cross B' ,'A×B'    ],`A\\times B`],
[['infty' , 'infinity'               ],`\\infty`],
[['[x,y]','pair(x,y)' , 'tuple(x,y)',
  '⟨x,y⟩'                            ],`\\langle x,y \\rangle`],
[['[x,y,z]','triple(x,y,z)' , 
  'tuple(x,y,z)', '⟨x,y,z⟩'          ],`\\langle x,y,z \\rangle`],
[['[w,x,y,z]','tuple(w,x,y,z)' , 
  '⟨w,x,y,z⟩'                        ],`\\langle x,y \\rangle`],
[['[[1,2],[3,4]]'                    ],
  `\\left[\\begin{matrix}1 & 2 \\\\ 3 & 4 \\end{matrix}\\right]`],  
[[`[x,y]'`                           ],
  `\\left[\\begin{matrix}x \\\\ y \\end{matrix}\\right]`],
[[`[x,y,z]'`                          ],
  `\\left[\\begin{matrix}x \\\\ y \\\\ z \\end{matrix}\\right]`],
[[`[[1,2,3],[4,5,6]]'`                    ],
  `\\left[\\begin{matrix}1 & 4 \\\\ 2 & 5 \\\\ 3 & 6 \\end{matrix}\\right]`],  
[['Union i in I of A_(i)',
  'Union of A_(i) for i in I',
  'Union(A_(i),i,I)',
  'Cup i in I of A_(i)',
  'bigcup i in I of A_(i)'           ],`\\Bigcup_{i\\in I} A_i`],
[['Intersect i in I of A_(i)',
  'Intersect of A_(i) for i in I',
  'Intersect(A_(i),i,I)',
  'Cap i in I of A_(i)',
  'bigcap i in I of A_(i)'           ],`\\Bigcap_{i\\in I} A_i`],

'Relations',
[['x lt 0', 'x &lt; 0'               ],`x\\lt 0` ],
[['x leq 0', 'x ≤ 0'                 ],`x\\leq 0` ],
[['x neq 0', 'x ne 0', 'x≠0'         ],`x\\neq 0` ],
[['m | n', 'm divides n'             ],`m\\mid n` ],
[['a cong b mod m', 
  'a cong mod m to b'                ],`a\\underset{m}{\\equiv}b` ],
[['x~y'                              ],`x\\sim y`],
[['x~y~z'                            ],`x\\sim y\\sim z`],
[['x=y'                              ],`x=y`],
[['x=y=z'                            ],`x=y=z`],
[['X loves Y'                        ],`X\\text{ loves }Y`],
[['X is Y', 'X is an Y', 'X is a Y',
  'X are Y'                          ],`X\\text{ is }Y`],
[['P is a partition of A'            ],`P\\text{ is a partition of }A`],
[[`'~' is an equivalence relation`   ],`\\sim\\text{ is equivalence relation}`],
[['class(a)'                         ],`\\left[a\\right]` ],
[['class(a,~)'                       ],`\\left[a\\right]_{\\sim}` ],
[[`'~' is a strict partial order`    ],`\\sim\\text{ is strict partial order}`],
[[`'~' is a partial order`           ],`\\sim\\text{ is partial order}`],
[[`'~' is a total order`             ],`\\sim\\text{ is total order}`],

'Assumptions and Declarations (case insensitive, phrase is echoed)',
[['Assume P', 'Given P', 'From P',
  'Suppose P', 'If P', 'Define P', 
  ':P',                              ],`\\text{Assume }P\\text{  (etc.)}` ],
[['Let x'                            ],`\\text{Let }x` ],
[['Let x in A'                       ],`\\text{Let }x\\in A` ],
[['Let x be such that x in RR',
  'Let x such that x in RR'          ],
  `\\text{Let }x\\text{ be such that }x\\in\\mathbb{R}` ],
[['f(c)=0 for some c'                ],`f(c)=0\\text{ for some }c` ],
[['f(c)=0 for some c in A'           ],`f(c)=0\\text{ for some }c\\in A` ],
[['Declare is, 0, +, cos'            ],`\\text{Declare is, 0, +, and cos}` ],

'Miscellaneous',
[['x^-' , 'x⁻'                       ],`x^-`],
[['@P(k)', 'λP(k)'                   ],`\\lambda{P}(k)` ]

]
export const makedoc = () => {
  let ans = ''
  syntax.forEach( row => {
    if (typeof row === 'string') {
      ans = ans + 
        `\n<tr><td colspan="2" class="subheader">${row}</td></tr>\n`
    } else {
      ans = ans + 
       `<tr>
          <td>${row[0].join('<br/>')}</td>
          <td>$${tex(row[0][0],{enableSets:true})}$</td>
        </tr>\n`
    }
  })
  let doc = loadStr('lurch-parser-docs-template','./parsers/','html')
              .replace(/## MAKEDOC OUTPUT GOES HERE ##/g,ans)
  fs.writeFileSync('./parsers/lurch-parser-docs.html', doc)
  write('The Lurch syntax documentation page was written successfully.')
}