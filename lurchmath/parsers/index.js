
export { latexToLurch } from '../../lde/src/experimental/parsers/tex-to-lurch.js'
import { parse as parseToPutdown } from '../../lde/src/experimental/parsers/lurch-to-putdown.js'
import { parse as parseToLatex } from '../../lde/src/experimental/parsers/lurch-to-tex.js'

const lurchToPutdownOptions = { debug:false, enableSets:true } 
export const lurchToPutdown = ( lurch ) => {
    const putdown = parseToPutdown( lurch, lurchToPutdownOptions )
    return putdown
}

const lurchToLatexOptions = { debug:false, enableSets:true }
export const lurchToLatex = ( lurch ) => {
    const latex = parseToLatex( lurch, lurchToLatexOptions )
    return latex
}