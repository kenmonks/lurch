
export { latexToLurch } from '../../lde/src/experimental/parsers/tex-to-lurch.js'
// Both notations come from the single unified grammar (Phase 2b of the
// parser upgrade); the tex option renders the AST with ast-to-tex.js.
// A failed parse gets a classification-aware hint appended (Phase 3d-ii):
// peggy error offsets refer to the tokenized input, so the input is
// re-tokenized to inspect the failure position.
import { parse as parseToPutdown } from '../../lde/src/experimental/parsers/lurch-to-putdown.js'
import { tokenize } from '../../lde/src/experimental/parsers/tokenizer.js'
import { enrichParseError } from '../../lde/src/experimental/parsers/expression-core.js'

const parseWithHints = ( lurch, options ) => {
    try { return parseToPutdown( lurch, options ) }
    catch ( e ) {
        try { enrichParseError( tokenize( lurch, options ), e ) } catch {}
        throw e
    }
}

const lurchToPutdownOptions = { debug:false, enableSets:true }
export const lurchToPutdown = ( lurch ) => {
    const putdown = parseWithHints( lurch, lurchToPutdownOptions )
    return putdown
}

const lurchToLatexOptions = { debug:false, enableSets:true, tex:true }
export const lurchToLatex = ( lurch ) => {
    const latex = parseWithHints( lurch, lurchToLatexOptions )
    return latex
}
