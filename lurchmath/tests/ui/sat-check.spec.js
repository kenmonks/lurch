import { test, expect } from '@playwright/test'
import { LurchPage } from './lurch-page.js'

// Run in the same worker as the UI: a failure must restore document polarity
// and reach the caller without being cached as a mathematical result.
for ( const failureStage of [ 'cnf', 'solver' ] ) {
    test( `SAT check preserves the document after a ${failureStage} failure`,
        async ( { page } ) => {
            await LurchPage.boot( page )
            const worker = page.workers().find( worker =>
                worker.url().includes( 'validation-worker.js' ) )
            const results = await worker.evaluate( async failureStage => {
                const { LDE } = await import( '/lurchmath/lde-cdn.js' )
                const { default: CNF } = await import(
                    '/lde/src/validation/conjunctive-normal-form.js' )
                const originalSolver = CNF.isSatisfiable
                const failure = new Error( `Injected ${failureStage} failure` )
                const results = [ ]
                try {
                    for ( const given of [ false, true ] ) {
                        for ( const preemies of [ false, true ] ) {
                            const doc = LDE.LogicConcept.fromPutdown(
                                given ? ':{ A }' : '{ A }' )[0]
                            const target = doc.child( 0 )
                            if ( preemies ) LDE.Validation.setResult( target, {
                                result: 'valid', reason: 'n-compact'
                            } )
                            const before = doc.toPutdown()
                            let sawNegated = false
                            doc.cnf = () => {
                                sawNegated = doc.isA( 'given' ) !== given
                                if ( failureStage === 'cnf' ) throw failure
                                return [ [ 1 ] ]
                            }
                            CNF.isSatisfiable = () => { throw failure }
                            let thrown
                            try {
                                doc._validate( target, preemies )
                            } catch ( error ) {
                                thrown = error
                            }
                            results.push( {
                                given, preemies, sawNegated,
                                sameError: thrown === failure,
                                unchanged: doc.toPutdown() === before
                            } )
                        }
                    }
                } finally {
                    CNF.isSatisfiable = originalSolver
                }
                return results
            }, failureStage )
            for ( const result of results ) {
                expect( result, JSON.stringify( result ) ).toMatchObject( {
                    sawNegated: true, sameError: true, unchanged: true
                } )
            }
        } )
}

test( 'SAT check restores polarity after either satisfiability result',
    async ( { page } ) => {
        await LurchPage.boot( page )
        const worker = page.workers().find( worker =>
            worker.url().includes( 'validation-worker.js' ) )
        const results = await worker.evaluate( async () => {
            const { LDE } = await import( '/lurchmath/lde-cdn.js' )
            return [ false, true ].flatMap( given =>
                [ false, true ].map( satisfiable => {
                    const doc = LDE.LogicConcept.fromPutdown(
                        given ? ':{ A }' : '{ A }' )[0]
                    doc.cnf = () => satisfiable ? [ [ 1 ] ] : [ [ 1 ], [ -1 ] ]
                    const result = doc._validate( doc.child( 0 ) )
                    return { restored: doc.isA( 'given' ) === given,
                        correct: result === !satisfiable }
                } ) )
        } )
        expect( results ).toEqual( Array.from( { length: 4 }, () => ( {
            restored: true, correct: true
        } ) ) )
    } )
