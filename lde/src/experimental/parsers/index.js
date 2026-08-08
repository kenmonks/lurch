
// Both notations come from the single unified grammar: it parses Lurch
// notation to an AST and renders it with
// ast-to-putdown.js or (with the tex option) ast-to-tex.js.
// A failed parse gets a classification-aware hint
// appended: peggy error offsets refer to the tokenized input, so the
// input is re-tokenized to inspect the failure position.
// export { latexToLurch } from './tex-to-lurch.js'
import { parse } from './lurch-to-putdown.js'
import { tokenize } from './tokenizer.js'
import { enrichParseError } from './expression-core.js'

export const lurchToPutdown = ( input, options = {} ) => {
  try { return parse( input, options ) }
  catch ( e ) {
    try { enrichParseError( tokenize( input, options ), e ) } catch {}
    throw e
  }
}
export const lurchToLatex = ( input, options = {} ) =>
  lurchToPutdown( input, { ...options, tex: true } )
