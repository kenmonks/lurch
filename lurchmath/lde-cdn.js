
/**
 * This file imports all needed classes from the main branch of the LDE repo.
 * We do it in this file so that anywhere else in the app, it can just load this
 * file and know it's getting the right classes.  Then if we need to change the
 * URL, we can do it here in one place, rather than in many places throughout
 * the codebase.
 */

export {
  LogicConcept, MathConcept, BindingExpression, Application, 
  Environment, Declaration, Expression, LurchSymbol
} from '../lde/src/index.js' 

import branchLDE from '../lde/src/experimental/global-validation.js'
export const LDE = branchLDE
