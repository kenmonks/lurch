/**
 * Lurch Options
 *
 * We just use a global for storing the current options. This avoids having to
 * pass it as an optional argument through the entire validation chain of
 * interpretations and validation tools. To set an option just do e.g.
 * `LurchOptions.avoidLoneMetavars = false`. Current validation options are:
 *
 *   * `validateall` - if true, validate all inferences.  If false, only
 *      validate the target.
 *   * `checkPreemies` - Check for preemies iff this is true
 *   * `processBIHs` - process BIHs iff this is true         
 *   * `instantiateEverything` - don't avoid anything below (equivalent to
 *      setting the next three settings to false)
 *   * `avoidLoneMetavars` - if true don't try to instantiate lone
 *      metavariables, otherwise try to instantiate them with every user
 *      proposition.
 *   * `avoidLoneEFAs` - the same thing for lone EFAs        
 *   * `avoidLoneElementOfs` - the same thing for lone x∈A's where A is a
 *      metavariable        
 *   * `processEquations` - process equations iff this is true  
 *   * `processCases`- process the cases tool iff this is true 
 *   * `autoCases` - similar to avoidLoneMetavars=false. If true, then identify
 *      all Cases-like rules and try to instantiate their univar conclusion with
 *      every user's conclusion in the document.
 *   * `processCAS` - process CAS tool iff this is true
 *   * `processAlgebra` - use the CAS tool to validate equations followed by 'by
 *      algebra' iff this is true
 *   * `swapTheoremProofPairs` - move theorems after their next sibling if its a
 *      proof
 *   * `updateProgress` - the function that gives progress updates while
 *      instantiating
 *   * `updateFreq` - how often to give a progress update during a pass
 *   * `badResultMsg` - what the feedback message should be internally to
 *      expressions which are not found to be propositionally valid 
 *   *  `runStudentTests` - use all of the student test files in the acid test suite
 *   *  `startStudentTest` - the number of the first student test to run 
 *   *  `endStudentTest` - the number of the last student test to run
 *
 */
export const LurchOptions = { 
  validateall: true ,    
  checkPreemies: true ,  
  processBIHs: true ,
  instantiateEverything: false,
  avoidLoneMetavars: true ,
  avoidLoneEFAs: true ,    
  avoidLoneElementOfs: true ,    
  processEquations: true ,    
  processCases: true ,    
  autoCases: false ,
  processCAS: false ,
  processArithmetic: true,
  processAlgebra: true,
  swapTheoremProofPairs: true ,
  updateProgress: async () => { }  ,
  updateFreq: 100 ,
  badResultMsg: 'indeterminate',
  runStudentTests: false,
  startStudentTest: 0,
  endStudentTest: Infinity 
}

///////////////////////////////////////////////////////////////////////////////