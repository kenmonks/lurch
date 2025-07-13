
import { predictableStringify } from '../src/utilities.js' // ensure JSON.equals loaded
import M from '../src/matching.js'
import { Symbol as LurchSymbol } from '../src/symbol.js'
import { LogicConcept } from '../src/logic-concept.js'
import { Application } from '../src/application.js'
import { BindingExpression } from '../src/binding-expression.js'
import Database from '../src/database.js'

describe( 'Problem', function () {

    // This takes a long time, so increase the timeout threshold.
    this.timeout( 10000 )
        
    it( 'Should declare the correct global identifiers', () => {
        expect( M.Problem ).to.be.ok
    } )

    it( 'Should let us construct empty problems and query them', () => {
        let P
        expect( () => P = new M.Problem() ).not.to.throw()
        expect( P.empty() ).to.equal( true )
        expect( P.length ).to.equal( 0 )
    } )

    it( 'Should let us add constraints in a wide variety of ways', () => {
        let P, C1, C2, C3, C4, p1, e1, p2, e2, p3, e3, p4, e4, p5, e5, p6, e6
        // start with a new P and add two different constraints by P.add(C1,C2)
        P = new M.Problem()
        C1 = new M.Constraint(
            new LurchSymbol( 'A' ).asA( M.metavariable ),
            new LurchSymbol( 5 )
        )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (- 12 (+ k 1))
            (- 3 (+ K 11))
        ` ) )
        expect( () => P.add( C1, C2 ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 2 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        // add two more the same way, but one is a duplicate
        C3 = new M.Constraint( new LurchSymbol( 'x' ),
                               new LurchSymbol( 'z' ) )
        C4 = C2.copy()
        expect( () => P.add( C3, C4 ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )

        // starting afresh, add two different constraints by P.add([C1,C2])
        P = new M.Problem()
        C1 = new M.Constraint(
            new LurchSymbol( 'A' ).asA( M.metavariable ),
            new LurchSymbol( 5 )
        )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (- 12 (+ k 1))
            (- 3 (+ K 11))
        ` ) )
        expect( () => P.add( [ C1, C2 ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 2 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        // add two more the same way, but one is a duplicate
        C3 = new M.Constraint( new LurchSymbol( 'x' ),
                               new LurchSymbol( 'z' ) )
        C4 = C2.copy()
        expect( () => P.add( [ C3, C4 ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )

        // starting afresh, add two different constraints by P.add(p1,e1,p2,e2)
        P = new M.Problem()
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        expect( () => P.add( p1, e1, p2, e2 ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 2 )
        // ensure that the constraints we expect are in the problem
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        // add one more the same way, it is a duplicate
        p3 = new LurchSymbol( 'A' ).asA( M.metavariable )
        e3 = new LurchSymbol( 5 )
        P.add( p3, e3 )
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 2 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        // add three more the same way, new ones, but they're all equal
        p4 = new Application(
            new LurchSymbol( 'f' ).asA( M.metavariable ),
            new LurchSymbol( 1 ), new LurchSymbol( 2 ), new LurchSymbol( 3 )
        )
        e4 = LogicConcept.fromPutdown( '(∃ u v , (= (* (- u) (- v)) 0))' )[0]
        p5 = p4.copy()
        e5 = e4.copy()
        p6 = p4.copy()
        e6 = e4.copy()
        P.add( p4, e4, p5, e5, p6, e6 )
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        C3 = new M.Constraint( p4, e4 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )

        // starting afresh, add two different constraints by P.add([p1,e1,p2,e2])
        P = new M.Problem()
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        expect( () => P.add( [ p1, e1, p2, e2 ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 2 )
        // ensure that the constraints we expect are in the problem
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        // add one more the same way, it is a duplicate
        p3 = new LurchSymbol( 'A' ).asA( M.metavariable )
        e3 = new LurchSymbol( 5 )
        P.add( p3, e3 )
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 2 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        // add three more the same way, new ones, but they're all equal
        p4 = new Application(
            new LurchSymbol( 'f' ).asA( M.metavariable ),
            new LurchSymbol( 1 ), new LurchSymbol( 2 ), new LurchSymbol( 3 )
        )
        e4 = LogicConcept.fromPutdown( '(∃ u v , (= (* (- u) (- v)) 0))' )[0]
        p5 = p4.copy()
        e5 = e4.copy()
        p6 = p4.copy()
        e6 = e4.copy()
        P.add( [ p4, e4, p5, e5, p6, e6 ] )
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        C3 = new M.Constraint( p4, e4 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )

        // starting afresh, add two different constraints by P.add([[p1,e1],[p2,e2]]])
        P = new M.Problem()
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        expect( () => P.add( [ [ p1, e1 ], [ p2, e2 ] ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 2 )
        // ensure that the constraints we expect are in the problem
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        // add two more the same way, but one is a duplicate
        p3 = new LurchSymbol( 'x' )
        e3 = new LurchSymbol( 'z' )
        p4 = p2.copy()
        e4 = e2.copy()
        expect( () => P.add( [ [ p3, e3 ], [ p4, e4 ] ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        C3 = new M.Constraint( p3, e3 )
        C4 = new M.Constraint( p4, e4 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )
    } )

    it( 'Should let us add constraints at construction time', () => {
        let P, C1, C2, C3, C4, p1, e1, p2, e2, p3, e3, p4, e4, p5, e5, p6, e6
        // construct P = new Problem( C1, C2, C3, C4 ), but C4 is a repeat of C2
        C1 = new M.Constraint(
            new LurchSymbol( 'A' ).asA( M.metavariable ),
            new LurchSymbol( 5 )
        )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (- 12 (+ k 1))
            (- 3 (+ K 11))
        ` ) )
        C3 = new M.Constraint( new LurchSymbol( 'x' ), new LurchSymbol( 'z' ) )
        C4 = C2.copy()
        expect( () => P = new M.Problem( C1, C2, C3, C4 ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )

        // same as previous test, but using new Problem( [ C1, C2, C3, C4 ] )
        C1 = new M.Constraint(
            new LurchSymbol( 'A' ).asA( M.metavariable ),
            new LurchSymbol( 5 )
        )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (- 12 (+ k 1))
            (- 3 (+ K 11))
        ` ) )
        C3 = new M.Constraint( new LurchSymbol( 'x' ), new LurchSymbol( 'z' ) )
        C4 = C2.copy()
        expect( () => P = new M.Problem( [ C1, C2, C3, C4 ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )

        // now P = new Problem( p1, e1, p2, e2, p3, e3, p4, e4, p5, e5, p6, e6 )
        // but p3,e3 is the same as p1,e1
        // and p4,e4 through p6,e6 are all just repeats of p4,e4
        // for a total of just 3 unique constraints: p1,e1, p2,e2, p4,e4
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        p3 = new LurchSymbol( 'A' ).asA( M.metavariable )
        e3 = new LurchSymbol( 5 )
        p4 = new Application(
            new LurchSymbol( 'f' ).asA( M.metavariable ),
            new LurchSymbol( 1 ), new LurchSymbol( 2 ), new LurchSymbol( 3 )
        )
        e4 = LogicConcept.fromPutdown( '(∃ u v , (= (* (- u) (- v)) 0))' )[0]
        p5 = p4.copy()
        e5 = e4.copy()
        p6 = p4.copy()
        e6 = e4.copy()
        expect( () => P = new M.Problem(
            p1, e1, p2, e2, p3, e3, p4, e4, p5, e5, p6, e6 ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        C3 = new M.Constraint( p4, e4 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )

        // same as previous test, but using:
        // new Problem( [ p1, e1, p2, e2, p3, e3, p4, e4, p5, e5, p6, e6 ] )
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        p3 = new LurchSymbol( 'A' ).asA( M.metavariable )
        e3 = new LurchSymbol( 5 )
        p4 = new Application(
            new LurchSymbol( 'f' ).asA( M.metavariable ),
            new LurchSymbol( 1 ), new LurchSymbol( 2 ), new LurchSymbol( 3 )
        )
        e4 = LogicConcept.fromPutdown( '(∃ u v , (= (* (- u) (- v)) 0))' )[0]
        p5 = p4.copy()
        e5 = e4.copy()
        p6 = p4.copy()
        e6 = e4.copy()
        expect( () => P = new M.Problem( [
            p1, e1, p2, e2, p3, e3, p4, e4, p5, e5, p6, e6
        ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        C3 = new M.Constraint( p4, e4 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )

        // same as first test, but breaking each constraint into its p,e
        // components, and using the syntax new Problem( [ [ p1, e1 ], ... ] )
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        p3 = new LurchSymbol( 'x' )
        e3 = new LurchSymbol( 'z' )
        p4 = p2.copy()
        e4 = e2.copy()
        expect( () => P = new M.Problem( [
            [ p1, e1 ], [ p2, e2 ], [ p3, e3 ], [ p4, e4 ]
        ] ) ).not.to.throw()
        // test length and empty status of problem
        expect( P.empty() ).to.equal( false )
        expect( P.length ).to.equal( 3 )
        // ensure that the constraints we expect are in the problem
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        C3 = new M.Constraint( p3, e3 )
        C4 = new M.Constraint( p4, e4 )
        expect( P.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )
    } )

    it( 'Should let us add constraints while copying, with plus()', () => {
        let P1, P2, P3, P4
        let C1, C2, C3, C4, p1, e1, p2, e2, p3, e3, p4, e4, p5, e5, p6, e6
        // same as first test from previous function, except we create problems
        // iteratively using .plus()
        C1 = new M.Constraint(
            new LurchSymbol( 'A' ).asA( M.metavariable ),
            new LurchSymbol( 5 )
        )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (- 12 (+ k 1))
            (- 3 (+ K 11))
        ` ) )
        C3 = new M.Constraint( new LurchSymbol( 'x' ), new LurchSymbol( 'z' ) )
        C4 = C2.copy()
        // an empty problem
        expect( () => P1 = new M.Problem() ).not.to.throw()
        expect( P1.empty() ).to.equal( true )
        expect( P1.length ).to.equal( 0 )
        expect( P1.constraints.some( C => C.equals( C1 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C4 ) ) ).to.equal( false )
        // add first constraint
        expect( () => P2 = P1.plus( C1 ) ).not.to.throw()
        expect( P2 ).not.to.equal( P1 )
        expect( P2.empty() ).to.equal( false )
        expect( P2.length ).to.equal( 1 )
        expect( P2.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P2.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P2.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        expect( P2.constraints.some( C => C.equals( C4 ) ) ).to.equal( false )
        // add next two constraints
        expect( () => P3 = P2.plus( C2, C3 ) ).not.to.throw()
        expect( P3 ).not.to.equal( P2 )
        expect( P3.empty() ).to.equal( false )
        expect( P3.length ).to.equal( 3 )
        expect( P3.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C4 ) ) ).to.equal( true ) // C2==C4
        // add final constraint
        expect( () => P4 = P3.plus( C4 ) ).not.to.throw()
        expect( P4 ).not.to.equal( P3 )
        expect( P4.empty() ).to.equal( false )
        expect( P4.length ).to.equal( 3 )
        expect( P4.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )

        // same as previous test, but using new Problem( [ constraints... ] )
        C1 = new M.Constraint(
            new LurchSymbol( 'A' ).asA( M.metavariable ),
            new LurchSymbol( 5 )
        )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (- 12 (+ k 1))
            (- 3 (+ K 11))
        ` ) )
        C3 = new M.Constraint( new LurchSymbol( 'x' ), new LurchSymbol( 'z' ) )
        C4 = C2.copy()
        // an empty problem
        expect( () => P1 = new M.Problem() ).not.to.throw()
        expect( P1.empty() ).to.equal( true )
        expect( P1.length ).to.equal( 0 )
        expect( P1.constraints.some( C => C.equals( C1 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C4 ) ) ).to.equal( false )
        // add first constraint
        expect( () => P2 = P1.plus( [ C1 ] ) ).not.to.throw()
        expect( P2 ).not.to.equal( P1 )
        expect( P2.empty() ).to.equal( false )
        expect( P2.length ).to.equal( 1 )
        expect( P2.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P2.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P2.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        expect( P2.constraints.some( C => C.equals( C4 ) ) ).to.equal( false )
        // add next two constraints
        expect( () => P3 = P2.plus( [ C2, C3 ] ) ).not.to.throw()
        expect( P3 ).not.to.equal( P2 )
        expect( P3.empty() ).to.equal( false )
        expect( P3.length ).to.equal( 3 )
        expect( P3.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C4 ) ) ).to.equal( true ) // C2==C4
        // add final constraint
        expect( () => P4 = P3.plus( [ C4 ] ) ).not.to.throw()
        expect( P4 ).not.to.equal( P3 )
        expect( P4.empty() ).to.equal( false )
        expect( P4.length ).to.equal( 3 )
        expect( P4.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )

        // Now we repeat test 3 from the previous test function, but with .plus().
        // it's a problem with p1,e1, p2,e2, p3,e3, p4,e4, p5,e5, and p6,e6
        // but p3,e3 is the same as p1,e1
        // and p4,e4 through p6,e6 are all just repeats of p4,e4
        // for a total of just 3 unique constraints: p1,e1, p2,e2, p4,e4
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        p3 = new LurchSymbol( 'A' ).asA( M.metavariable )
        e3 = new LurchSymbol( 5 )
        p4 = new Application(
            new LurchSymbol( 'f' ).asA( M.metavariable ),
            new LurchSymbol( 1 ), new LurchSymbol( 2 ), new LurchSymbol( 3 )
        )
        e4 = LogicConcept.fromPutdown( '(∃ u v , (= (* (- u) (- v)) 0))' )[0]
        p5 = p4.copy()
        e5 = e4.copy()
        p6 = p4.copy()
        e6 = e4.copy()
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        C3 = new M.Constraint( p4, e4 )
        // start with an empty problem
        expect( () => P1 = new M.Problem() ).not.to.throw()
        expect( P1.empty() ).to.equal( true )
        expect( P1.length ).to.equal( 0 )
        expect( P1.constraints.some( C => C.equals( C1 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        // add the first two constraints
        expect( () => P2 = P1.plus( p1, e1, p2, e2 ) ).not.to.throw()
        expect( P2 ).not.to.equal( P1 )
        expect( P2.empty() ).to.equal( false )
        expect( P2.length ).to.equal( 2 )
        expect( P2.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P2.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P2.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        // add the next two constraints
        expect( () => P3 = P2.plus( p3, e3, p4, e4 ) ).not.to.throw()
        expect( P3 ).not.to.equal( P2 )
        expect( P3.empty() ).to.equal( false )
        expect( P3.length ).to.equal( 3 )
        expect( P3.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        // add the final two constraints
        expect( () => P4 = P3.plus( p5, e5, p6, e6 ) ).not.to.throw()
        expect( P4 ).not.to.equal( P3 )
        expect( P4.empty() ).to.equal( false )
        expect( P4.length ).to.equal( 3 )
        expect( P4.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )

        // same as previous test, but using array argument to .plus()
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        p3 = new LurchSymbol( 'A' ).asA( M.metavariable )
        e3 = new LurchSymbol( 5 )
        p4 = new Application(
            new LurchSymbol( 'f' ).asA( M.metavariable ),
            new LurchSymbol( 1 ), new LurchSymbol( 2 ), new LurchSymbol( 3 )
        )
        e4 = LogicConcept.fromPutdown( '(∃ u v , (= (* (- u) (- v)) 0))' )[0]
        p5 = p4.copy()
        e5 = e4.copy()
        p6 = p4.copy()
        e6 = e4.copy()
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        C3 = new M.Constraint( p4, e4 )
        // start with an empty problem
        expect( () => P1 = new M.Problem() ).not.to.throw()
        expect( P1.empty() ).to.equal( true )
        expect( P1.length ).to.equal( 0 )
        expect( P1.constraints.some( C => C.equals( C1 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        // add the first two constraints
        expect( () => P2 = P1.plus( [ p1, e1, p2, e2 ] ) ).not.to.throw()
        expect( P2 ).not.to.equal( P1 )
        expect( P2.empty() ).to.equal( false )
        expect( P2.length ).to.equal( 2 )
        expect( P2.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P2.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P2.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        // add the next two constraints
        expect( () => P3 = P2.plus( [ p3, e3, p4, e4 ] ) ).not.to.throw()
        expect( P3 ).not.to.equal( P2 )
        expect( P3.empty() ).to.equal( false )
        expect( P3.length ).to.equal( 3 )
        expect( P3.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        // add the final two constraints
        expect( () => P4 = P3.plus( [ p5, e5, p6, e6 ] ) ).not.to.throw()
        expect( P4 ).not.to.equal( P3 )
        expect( P4.empty() ).to.equal( false )
        expect( P4.length ).to.equal( 3 )
        expect( P4.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )

        // same as first test, but breaking each constraint into its p,e
        // components, and using .plus( [ [ p1, e1 ], ... ] )
        p1 = new LurchSymbol( 'A' ).asA( M.metavariable ),
        e1 = new LurchSymbol( 5 )
        p2 = LogicConcept.fromPutdown( '(- 12 (+ k 1))' )[0]
        e2 = LogicConcept.fromPutdown( '(- 3 (+ K 11))' )[0]
        p3 = new LurchSymbol( 'x' )
        e3 = new LurchSymbol( 'z' )
        p4 = p2.copy()
        e4 = e2.copy()
        C1 = new M.Constraint( p1, e1 )
        C2 = new M.Constraint( p2, e2 )
        C3 = new M.Constraint( p3, e3 )
        C4 = new M.Constraint( p4, e4 )
        // an empty problem
        expect( () => P1 = new M.Problem() ).not.to.throw()
        expect( P1.empty() ).to.equal( true )
        expect( P1.length ).to.equal( 0 )
        expect( P1.constraints.some( C => C.equals( C1 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        expect( P1.constraints.some( C => C.equals( C4 ) ) ).to.equal( false )
        // add first constraint
        expect( () => P2 = P1.plus( [ [ p1, e1 ] ] ) ).not.to.throw()
        expect( P2 ).not.to.equal( P1 )
        expect( P2.empty() ).to.equal( false )
        expect( P2.length ).to.equal( 1 )
        expect( P2.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P2.constraints.some( C => C.equals( C2 ) ) ).to.equal( false )
        expect( P2.constraints.some( C => C.equals( C3 ) ) ).to.equal( false )
        expect( P2.constraints.some( C => C.equals( C4 ) ) ).to.equal( false )
        // add next two constraints
        expect( () => P3 = P2.plus( [ [ p2, e2 ], [ p3, e3 ] ] ) ).not.to.throw()
        expect( P3 ).not.to.equal( P2 )
        expect( P3.empty() ).to.equal( false )
        expect( P3.length ).to.equal( 3 )
        expect( P3.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P3.constraints.some( C => C.equals( C4 ) ) ).to.equal( true ) // C2==C4
        // add final constraint
        expect( () => P4 = P3.plus( [ [ p4, e4 ] ] ) ).not.to.throw()
        expect( P4 ).not.to.equal( P3 )
        expect( P4.empty() ).to.equal( false )
        expect( P4.length ).to.equal( 3 )
        expect( P4.constraints.some( C => C.equals( C1 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C2 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C3 ) ) ).to.equal( true )
        expect( P4.constraints.some( C => C.equals( C4 ) ) ).to.equal( true )
    } )

    it( 'Should preserve increasing complexity ordering of constraints', () => {
        // create several constraints, at least one of each complexity level,
        // and more than one of some complexity levels.
        let C1, C2, C3, C4, C5, C6, C7
        C1 = new M.Constraint( new LurchSymbol( 1 ), new LurchSymbol( 2 ) )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (this thingy here is just)
            ("not equal to" this (other thingy) here)
        ` ) )
        C3 = new M.Constraint( ...LogicConcept.fromPutdown( 'same same' ) )
        C4 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (one large , (expression "and its" (twin twin) sister))
            (one large , (expression "and its" (twin twin) sister))
        ` ) )
        C5 = new M.Constraint(
            new LurchSymbol( 'metavar' ).asA( M.metavariable ),
            LogicConcept.fromPutdown( '(instantiation of that metavar)' )[0]
        )
        C6 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (the children of this one must match)
            (the children of this second one here)
        ` ) )
        C6.pattern.child( 1 ).makeIntoA( M.metavariable )
        C7 = new M.Constraint(
            M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                      new LurchSymbol( 2 ) ),
            LogicConcept.fromPutdown( '(("some") (structure))' )[0]
        )
        expect( C1.complexity() ).to.equal( 0 )
        expect( C2.complexity() ).to.equal( 0 )
        expect( C3.complexity() ).to.equal( 1 )
        expect( C4.complexity() ).to.equal( 1 )
        expect( C5.complexity() ).to.equal( 2 )
        expect( C6.complexity() ).to.equal( 3 )
        expect( C7.complexity() ).to.equal( 4 )
        // now try inserting various combinations of them into various problem
        // instances, and ensure they always show up in an order that is a
        // suborder of C1,C2,C3,C4,C5,C6,C7, with the exceptions that C1,C2 are
        // interchangeable, as are C3,C4.
        let P
        // set 1, default ordering:
        P = new M.Problem( C1, C4, C7 )
        expect( P.length ).to.equal( 3 )
        expect( P.constraints[0].equals( C1 ) ).to.equal( true )
        expect( P.constraints[1].equals( C4 ) ).to.equal( true )
        expect( P.constraints[2].equals( C7 ) ).to.equal( true )
        // set 1, new ordering:
        P = new M.Problem( C4, C7, C1 )
        expect( P.length ).to.equal( 3 )
        expect( P.constraints[0].equals( C1 ) ).to.equal( true )
        expect( P.constraints[1].equals( C4 ) ).to.equal( true )
        expect( P.constraints[2].equals( C7 ) ).to.equal( true )
        // set 2, default ordering:
        P = new M.Problem( C3, C4, C5 )
        expect( P.length ).to.equal( 3 )
        expect( P.constraints[0].equals( C4 ) ).to.equal( true )
        expect( P.constraints[1].equals( C3 ) ).to.equal( true )
        expect( P.constraints[2].equals( C5 ) ).to.equal( true )
        // set 2, new ordering:
        P = new M.Problem( C5, C4, C3 )
        expect( P.length ).to.equal( 3 )
        expect( P.constraints[0].equals( C3 ) ).to.equal( true )
        expect( P.constraints[1].equals( C4 ) ).to.equal( true )
        expect( P.constraints[2].equals( C5 ) ).to.equal( true )
        // set 3, default ordering:
        P = new M.Problem( C2, C6 )
        expect( P.length ).to.equal( 2 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C6 ) ).to.equal( true )
        // set 3, new ordering:
        P = new M.Problem( C6, C2 )
        expect( P.length ).to.equal( 2 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C6 ) ).to.equal( true )
        // full set, default ordering:
        P = new M.Problem( C1, C2, C3, C4, C5, C6, C7 )
        expect( P.length ).to.equal( 7 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C3 ) ).to.equal( true )
        expect( P.constraints[4].equals( C5 ) ).to.equal( true )
        expect( P.constraints[5].equals( C6 ) ).to.equal( true )
        expect( P.constraints[6].equals( C7 ) ).to.equal( true )
        // full set, new ordering:
        P = new M.Problem( C3, C7, C5, C4, C2, C6, C1 )
        expect( P.length ).to.equal( 7 )
        expect( P.constraints[0].equals( C1 ) ).to.equal( true )
        expect( P.constraints[1].equals( C2 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C3 ) ).to.equal( true )
        expect( P.constraints[4].equals( C5 ) ).to.equal( true )
        expect( P.constraints[5].equals( C6 ) ).to.equal( true )
        expect( P.constraints[6].equals( C7 ) ).to.equal( true )
    } )

    it( 'Should remove constraints correctly, even using without()', () => {
        // re-use the same set of 7 constraints from the previous test function
        let C1, C2, C3, C4, C5, C6, C7
        C1 = new M.Constraint( new LurchSymbol( 1 ), new LurchSymbol( 2 ) )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (this thingy here is just)
            ("not equal to" this (other thingy) here)
        ` ) )
        C3 = new M.Constraint( ...LogicConcept.fromPutdown( 'same same' ) )
        C4 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (one large , (expression "and its" (twin twin) sister))
            (one large , (expression "and its" (twin twin) sister))
        ` ) )
        C5 = new M.Constraint(
            new LurchSymbol( 'metavar' ).asA( M.metavariable ),
            LogicConcept.fromPutdown( '(instantiation of that metavar)' )[0]
        )
        C6 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (the children of this one must match)
            (the children of this second one here)
        ` ) )
        C6.pattern.child( 1 ).makeIntoA( M.metavariable )
        C7 = new M.Constraint(
            M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                      new LurchSymbol( 2 ) ),
            LogicConcept.fromPutdown( '(("some") (structure))' )[0]
        )
        // build one of the large problems from the previous test function,
        // and ensure it looks just like it did in that case
        let P, Q
        P = new M.Problem( C1, C2, C3, C4, C5, C6, C7 )
        expect( P.length ).to.equal( 7 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C3 ) ).to.equal( true )
        expect( P.constraints[4].equals( C5 ) ).to.equal( true )
        expect( P.constraints[5].equals( C6 ) ).to.equal( true )
        expect( P.constraints[6].equals( C7 ) ).to.equal( true )
        // remove a constraint and ensure P has changed
        P.remove( C3 )
        expect( P.length ).to.equal( 6 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C5 ) ).to.equal( true )
        expect( P.constraints[4].equals( C6 ) ).to.equal( true )
        expect( P.constraints[5].equals( C7 ) ).to.equal( true )
        // remove a constraint by index and ensure P has changed
        P.remove( 4 )
        expect( P.length ).to.equal( 5 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C5 ) ).to.equal( true )
        expect( P.constraints[4].equals( C7 ) ).to.equal( true )
        // remove a nonexistent constraint and ensure no changes
        P.remove( C6 )
        expect( P.length ).to.equal( 5 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C5 ) ).to.equal( true )
        expect( P.constraints[4].equals( C7 ) ).to.equal( true )
        // remove invalid indices and ensure no changes
        P.remove( -1 )
        expect( P.length ).to.equal( 5 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C5 ) ).to.equal( true )
        expect( P.constraints[4].equals( C7 ) ).to.equal( true )
        P.remove( 30 )
        expect( P.length ).to.equal( 5 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C5 ) ).to.equal( true )
        expect( P.constraints[4].equals( C7 ) ).to.equal( true )
        // make a copy of P without some entries (indicated by indices)
        // and ensure it works, and that P has not changed
        Q = P.without( 1 ).without( 0 )
        expect( Q ).not.to.equal( P )
        expect( P.length ).to.equal( 5 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C5 ) ).to.equal( true )
        expect( P.constraints[4].equals( C7 ) ).to.equal( true )
        expect( Q.length ).to.equal( 3 )
        expect( Q.constraints[0].equals( C4 ) ).to.equal( true )
        expect( Q.constraints[1].equals( C5 ) ).to.equal( true )
        expect( Q.constraints[2].equals( C7 ) ).to.equal( true )
        // similar to the previous, but this time removing constraints rather
        // than just indices
        Q = P.without( C1 ).without( C5 )
        expect( Q ).not.to.equal( P )
        expect( P.length ).to.equal( 5 )
        expect( P.constraints[0].equals( C2 ) ).to.equal( true )
        expect( P.constraints[1].equals( C1 ) ).to.equal( true )
        expect( P.constraints[2].equals( C4 ) ).to.equal( true )
        expect( P.constraints[3].equals( C5 ) ).to.equal( true )
        expect( P.constraints[4].equals( C7 ) ).to.equal( true )
        expect( Q.length ).to.equal( 3 )
        expect( Q.constraints[0].equals( C2 ) ).to.equal( true )
        expect( Q.constraints[1].equals( C4 ) ).to.equal( true )
        expect( Q.constraints[2].equals( C7 ) ).to.equal( true )
    } )

    it( 'Should compare problems for equality correctly', () => {
        // re-use the same set of 7 constraints from the previous test function
        let C1, C2, C3, C4, C5, C6, C7
        C1 = new M.Constraint( new LurchSymbol( 1 ), new LurchSymbol( 2 ) )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (this thingy here is just)
            ("not equal to" this (other thingy) here)
        ` ) )
        C3 = new M.Constraint( ...LogicConcept.fromPutdown( 'same same' ) )
        C4 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (one large , (expression "and its" (twin twin) sister))
            (one large , (expression "and its" (twin twin) sister))
        ` ) )
        C5 = new M.Constraint(
            new LurchSymbol( 'metavar' ).asA( M.metavariable ),
            LogicConcept.fromPutdown( '(instantiation of that metavar)' )[0]
        )
        C6 = new M.Constraint( ...LogicConcept.fromPutdown( `
            (the children of this one must match)
            (the children of this second one here)
        ` ) )
        C6.pattern.child( 1 ).makeIntoA( M.metavariable )
        C7 = new M.Constraint(
            M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                      new LurchSymbol( 2 ) ),
            LogicConcept.fromPutdown( '(("some") (structure))' )[0]
        )
        // make several problems with various combinations of the constraints
        let P1, P2, P3, P4, P5
        P1 = new M.Problem( C1, C3, C5 )
        P2 = new M.Problem( C2, C3, C4 )
        P3 = new M.Problem( C3, C1, C5, C3 )
        P4 = new M.Problem( C3, C6, C7 )
        P5 = new M.Problem( C7, C3, C6 )
        // test all possible pairs for equality
        expect( P1.equals( P1 ) ).to.equal( true )
        expect( P1.equals( P2 ) ).to.equal( false )
        expect( P1.equals( P3 ) ).to.equal( true )
        expect( P1.equals( P4 ) ).to.equal( false )
        expect( P1.equals( P5 ) ).to.equal( false )
        expect( P2.equals( P1 ) ).to.equal( false )
        expect( P2.equals( P2 ) ).to.equal( true )
        expect( P2.equals( P3 ) ).to.equal( false )
        expect( P2.equals( P4 ) ).to.equal( false )
        expect( P2.equals( P5 ) ).to.equal( false )
        expect( P3.equals( P1 ) ).to.equal( true )
        expect( P3.equals( P2 ) ).to.equal( false )
        expect( P3.equals( P3 ) ).to.equal( true )
        expect( P3.equals( P4 ) ).to.equal( false )
        expect( P3.equals( P5 ) ).to.equal( false )
        expect( P4.equals( P1 ) ).to.equal( false )
        expect( P4.equals( P2 ) ).to.equal( false )
        expect( P4.equals( P3 ) ).to.equal( false )
        expect( P4.equals( P4 ) ).to.equal( true )
        expect( P4.equals( P5 ) ).to.equal( true )
        expect( P5.equals( P1 ) ).to.equal( false )
        expect( P5.equals( P2 ) ).to.equal( false )
        expect( P5.equals( P3 ) ).to.equal( false )
        expect( P5.equals( P4 ) ).to.equal( true )
        expect( P5.equals( P5 ) ).to.equal( true )
    } )

    it( 'Should make shallow copies correctly', () => {
        // re-use a few of the constraints from the previous test function
        let C1, C2, C3, C4
        C1 = new M.Constraint( new LurchSymbol( 1 ), new LurchSymbol( 2 ) )
        C2 = new M.Constraint( ...LogicConcept.fromPutdown( 'same same' ) )
        C3 = new M.Constraint(
            new LurchSymbol( 'metavar' ).asA( M.metavariable ),
            LogicConcept.fromPutdown( '(instantiation of that metavar)' )[0]
        )
        C4 = new M.Constraint(
            M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                      new LurchSymbol( 2 ) ),
            LogicConcept.fromPutdown( '(("some") (structure))' )[0]
        )
        // make some problems using those constraints
        let P1, P2, P3, P4
        P1 = new M.Problem( C1, C2, C3 )
        P2 = new M.Problem( C2, C4 )
        // make copies and verify that they are the same structurally, but not
        // the same objects in memory
        expect( () => P3 = P1.copy() ).not.to.throw()
        expect( () => P4 = P2.copy() ).not.to.throw()
        expect( P3 ).not.to.equal( P1 )
        expect( P4 ).not.to.equal( P2 )
        expect( P1.length ).to.equal( P3.length )
        expect( P2.length ).to.equal( P4.length )
        expect( P1.equals( P3 ) ).to.equal( true )
        expect( P2.equals( P4 ) ).to.equal( true )
        expect( P3.equals( P1 ) ).to.equal( true )
        expect( P4.equals( P2 ) ).to.equal( true )
        // ensure they contain the exact same constraint objects in the same
        // order, since these are just shallow copies
        expect( P1.length ).to.equal( 3 )
        expect( P1.constraints[0] ).to.equal( P3.constraints[0] )
        expect( P1.constraints[1] ).to.equal( P3.constraints[1] )
        expect( P1.constraints[2] ).to.equal( P3.constraints[2] )
        expect( P2.length ).to.equal( 2 )
        expect( P2.constraints[0] ).to.equal( P4.constraints[0] )
        expect( P2.constraints[1] ).to.equal( P4.constraints[1] )
    } )

    it( 'Should support substitution in-place', () => {
        // Let us adopt the convention in the following comments that capital
        // letters stand for metavariables, and lower-case ones do not.
        // problem: { (M,foo), ((a b),(c d)), ((x y , Z),7) }
        // substitutions: (M,was_m), (Z,was_Z)
        // result: { (was_M,foo), ((a b),(c d)), ((x y , was_Z),7) }
        let P, C1, C2, C3, S1, S2, S3
        C1 = new M.Constraint(
            new LurchSymbol( 'M' ).asA( M.metavariable ),
            new LurchSymbol( 'foo' )
        )
        C2 = new M.Constraint(
            LogicConcept.fromPutdown( '(a b)' )[0],
            LogicConcept.fromPutdown( '(c d)' )[0]
        )
        C3 = new M.Constraint(
            new Application(
                new LurchSymbol( 'x' ),
                new BindingExpression(
                    new LurchSymbol( 'y' ),
                    new LurchSymbol( 'Z' ).asA( M.metavariable )
                )
            ),
            new LurchSymbol( 7 )
        )
        P = new M.Problem( C1, C2, C3 )
        S1 = new M.Substitution(
            new LurchSymbol( 'M' ).asA( M.metavariable ),
            new LurchSymbol( 'was_M' )
        )
        S2 = new M.Substitution(
            new LurchSymbol( 'Z' ).asA( M.metavariable ),
            new LurchSymbol( 'was_Z' )
        )
        expect( () => P.substitute( S1, S2 ) ).not.to.throw()
        expect( P.length ).to.equal( 3 )
        expect( P.constraints.some( c =>
            c.pattern.equals( S1.expression )
         && c.expression.equals( C1.expression ) ) ).to.equal( true )
        expect( P.constraints.some( c => c.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( c =>
            c.pattern.equals( LogicConcept.fromPutdown( '(x y , was_Z)' )[0] )
         && c.expression.equals( new LurchSymbol( 7 ) ) ) ).to.equal( true )
        // now repeat the same test, but call substitute() on an array of
        // substitutions rather than on 3 substitutions separately
        P = new M.Problem( C1, C2, C3 )
        expect( () => P.substitute( [ S1, S2 ] ) ).not.to.throw()
        expect( P.length ).to.equal( 3 )
        expect( P.constraints.some( c =>
            c.pattern.equals( S1.expression )
         && c.expression.equals( C1.expression ) ) ).to.equal( true )
        expect( P.constraints.some( c => c.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( c =>
            c.pattern.equals(
                LogicConcept.fromPutdown( '(x y , was_Z)' )[0] )
         && c.expression.equals( new LurchSymbol( 7 ) ) ) ).to.equal( true )
    } )

    it( 'Should support substitution functionally', () => {
        // We run the same two tests as in the previous test function,
        // but this time, we use afterSubstituting() instead of substitute().
        // Test 1:
        let P, newP, C1, C2, C3, S1, S2, S3
        C1 = new M.Constraint(
            new LurchSymbol( 'M' ).asA( M.metavariable ),
            new LurchSymbol( 'foo' )
        )
        C2 = new M.Constraint(
            LogicConcept.fromPutdown( '(a b)' )[0],
            LogicConcept.fromPutdown( '(c d)' )[0]
        )
        C3 = new M.Constraint(
            new Application(
                new LurchSymbol( 'x' ),
                new BindingExpression(
                    new LurchSymbol( 'y' ),
                    new LurchSymbol( 'Z' ).asA( M.metavariable )
                )
            ),
            new LurchSymbol( 7 )
        )
        P = new M.Problem( C1, C2, C3 )
        S1 = new M.Substitution(
            new LurchSymbol( 'M' ).asA( M.metavariable ),
            new LurchSymbol( 'was_M' )
        )
        S2 = new M.Substitution(
            new LurchSymbol( 'Z' ).asA( M.metavariable ),
            new LurchSymbol( 'was_Z' )
        )
        expect( () => newP = P.afterSubstituting( S1, S2 ) ).not.to.throw()
        // ensure that P is just as it was before
        expect( P.length ).to.equal( 3 )
        expect( P.constraints.some( c => c.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( c => c.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( c => c.equals( C3 ) ) ).to.equal( true )
        // ensure that newP is just as P was in the previous test function,
        // but is not the same object as P, nor does it equal P
        expect( P ).not.to.equal( newP )
        expect( P.equals( newP ) ).to.equal( false )
        expect( newP.length ).to.equal( 3 )
        expect( newP.constraints.some( c =>
            c.pattern.equals( S1.expression )
         && c.expression.equals( C1.expression ) ) ).to.equal( true )
        expect( newP.constraints.some( c => c.equals( C2 ) ) ).to.equal( true )
        expect( newP.constraints.some( c =>
            c.pattern.equals(
                LogicConcept.fromPutdown( '(x y , was_Z)' )[0] )
         && c.expression.equals( new LurchSymbol( 7 ) ) ) ).to.equal( true )
        // now repeat the same test, but call afterSubstituting() on an array of
        // substitutions rather than on 3 substitutions separately
        P = new M.Problem( C1, C2, C3 )
        expect( () => newP = P.afterSubstituting( [ S1, S2 ] ) )
            .not.to.throw()
        // ensure that P is just as it was before
        expect( P.length ).to.equal( 3 )
        expect( P.constraints.some( c => c.equals( C1 ) ) ).to.equal( true )
        expect( P.constraints.some( c => c.equals( C2 ) ) ).to.equal( true )
        expect( P.constraints.some( c => c.equals( C3 ) ) ).to.equal( true )
        // ensure that newP is just as P was in the previous test function,
        // but is not the same object as P, nor does it equal P
        expect( P ).not.to.equal( newP )
        expect( P.equals( newP ) ).to.equal( false )
        expect( newP.length ).to.equal( 3 )
        expect( newP.constraints.some( c =>
            c.pattern.equals( S1.expression )
         && c.expression.equals( C1.expression ) ) ).to.equal( true )
        expect( newP.constraints.some( c => c.equals( C2 ) ) ).to.equal( true )
        expect( newP.constraints.some( c =>
            c.pattern.equals(
                LogicConcept.fromPutdown( '(x y , was_Z)' )[0] )
         && c.expression.equals( new LurchSymbol( 7 ) ) ) ).to.equal( true )
    } )

    // Utility function for constructing solution sets
    // Call like so: solset( problem, [
    //     { 'metavar1' : 'putdown for expression1', ... }, // solution 1
    //     ...
    // ] )
    const solSet = ( problem, ...sols ) => {
        return sols.map( sol => {
            const result = new M.Solution( problem )
            for ( let mv in sol ) {
                if ( sol.hasOwnProperty( mv ) ) {
                    result.add( new M.Substitution(
                        new LurchSymbol( mv ).asA( M.metavariable ),
                        sol[mv] instanceof LogicConcept ? sol[mv] :
                            LogicConcept.fromPutdown( sol[mv] )[0]
                    ) )
                }
            }
            return result
        } )
    }
    // Utility function for comparing solution sets for equality
    const solSetsEq = ( set1, set2, debug = true ) => {
        const set1strs = set1.map( x => `${x}` )
        const set2strs = set2.map( x => `${x}` )
        if ( set1.length != set2.length ) {
            if ( debug ) {
                console.log( 'Not same length:' )
                console.log( `\tlength ${set1.length}:` )
                set1strs.map( x => console.log( `\t\t${x}` ) )
                console.log( `\tlength ${set2.length}:` )
                set2strs.map( x => console.log( `\t\t${x}` ) )
            }
            return false
        }
        if ( !set1.every( sol => sol instanceof M.Solution ) ) {
            if ( debug ) {
                console.log( 'Not all are solution instances:' )
                set1strs.map( x => console.log( `\t\t${x}` ) )
            }
            return false
        }
        if ( !set2.every( sol => sol instanceof M.Solution ) ) {
            if ( debug ) {
                console.log( 'Not all are solution instances:' )
                set2strs.map( x => console.log( `\t\t${x}` ) )
            }
            return false
        }
        const missing = set1.find( sol1 =>
            !set2.some( sol2 => sol1.equals( sol2 ) ) )
        if ( missing ) {
            if ( debug ) {
                console.log( `Missing: ${missing}` )
                console.log( `\tfrom here:` )
                set1strs.map( x => console.log( `\t\t${x}` ) )
                console.log( `\tin here:` )
                set2strs.map( x => console.log( `\t\t${x}` ) )
            }
            return false
        }
        return true
    }
    // Utility function for creating lambdas
    const lambda = ( arg, body ) => {
        if ( !( arg instanceof LogicConcept ) )
            arg = new LurchSymbol( arg )
        if ( !( body instanceof LogicConcept ) )
            body = LogicConcept.fromPutdown( `${body}` )[0]
        return M.newEF( arg, body )
    }

    it( 'Should compute correct solutions to trivial problems', () => {
        let P, S, expr1, expr2, pat1

        // problem: empty problem
        // solution set: one solution, the empty solution
        P = new M.Problem()
        expect( () => S = Array.from( P.solutions() ) ).not.to.throw()
        expect( S ).to.be.instanceof( Array )
        expect( solSetsEq( S, solSet( P,
            { } // one solution, the empty solution
        ) ) ).equals( true )

        // problem: one constraint, (expr1,expr1) (no metavars)
        // solution set: one solution, the empty solution
        expr1 = LogicConcept.fromPutdown( '(an example)' )[0]
        P = new M.Problem( expr1, expr1 )
        expect( () => S = Array.from( P.solutions() ) ).not.to.throw()
        expect( S ).to.be.instanceof( Array )
        expect( solSetsEq( S, solSet( P,
            { } // one solution, the empty solution
        ) ) ).equals( true )
        
        // problem: one constraint, (expr1,expr2) (no metavars, not equal)
        // solution set: one solution, the empty solution
        expr2 = new LurchSymbol( 'not_the_same' )
        P = new M.Problem( expr1, expr2 )
        expect( () => S = Array.from( P.solutions() ) ).not.to.throw()
        expect( S ).to.be.instanceof( Array )
        expect( solSetsEq( S, [
            // no solutions
        ] ) ).equals( true )
        
        // problem: one constraint, (pat1,expr1) (with pat1 a metavar)
        // solution set: one solution, the solution (pat1,expr1)
        pat1 = new LurchSymbol( 'foo' ).asA( M.metavariable )
        P = new M.Problem( pat1, expr1 )
        expect( () => S = Array.from( P.solutions() ) ).not.to.throw()
        expect( S ).to.be.instanceof( Array )
        expect( solSetsEq( S, solSet( P,
            { 'foo' : '(an example)' } // one solution
        ) ) ).equals( true )

        // problem: one constraint, but its pattern and expression are both
        // compound and have the same number of children, thus enabling us to
        // combine multiple constraints into one; here we choose just one
        // example of this type, ((expr1 pat1),(expr1 expr2))
        // solution set: one solution, the solution (pat1,expr2)
        P = new M.Problem(
            new Application( expr1.copy(), pat1.copy() ),
            new Application( expr1.copy(), expr2.copy() )
        )
        expect( () => S = Array.from( P.solutions() ) ).not.to.throw()
        expect( S ).to.be.instanceof( Array )
        expect( solSetsEq( S, solSet( P,
            { 'foo' : 'not_the_same' } // one solution
        ) ) ).equals( true )
    } )

    it( 'Should compute correct solutions to small EFA problems', () => {
        let pat, expr, prob, S
        // problem: pattern EFA (P 1), expression 1
        // solution set: two solutions, P = lambda v.1 or P = lambda v.v
        pat = M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                        new LurchSymbol( 1 ) )
        expr = new LurchSymbol( 1 )
        prob = new M.Problem( pat, expr )
        expect( () => S = Array.from( prob.solutions() ) ).not.to.throw()
        expect( solSetsEq( S, solSet( prob,
            { 'P' : lambda( 'v1', 1 ) },
            { 'P' : lambda( 'v1', 'v1' ) }
        ) ) ).equals( true )

        // problem: pattern EFA (P 3), expression 1
        // solution set: one solution, P = lambda v.1
        pat = M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                        new LurchSymbol( 3 ) )
        expr = new LurchSymbol( 1 )
        prob = new M.Problem( pat, expr )
        expect( () => S = Array.from( prob.solutions() ) ).not.to.throw()
        expect( solSetsEq( S, solSet( prob,
            { 'P' : lambda( 'v1', 1 ) }
        ) ) ).equals( true )

        // problem: pattern EFA (P 1), expression 1=2
        // solution set: two solutions, P = lambda v.v=2 or P = lambda v.1=2
        pat = M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                        new LurchSymbol( 1 ) )
        expr = LogicConcept.fromPutdown( '(= 1 2)' )[0]
        prob = new M.Problem( pat, expr )
        expect( () => S = Array.from( prob.solutions() ) ).not.to.throw()
        expect( solSetsEq( S, solSet( prob,
            { 'P' : lambda( 'v1', '(= 1 2)' ) },
            { 'P' : lambda( 'v1', '(= v1 2)' ) }
        ) ) ).equals( true )

        // problem: pattern EFA (P 3), expression 1=2
        // solution set: one solution, P = lambda v.1=2
        pat = M.newEFA( new LurchSymbol( 'P' ).asA( M.metavariable ),
                        new LurchSymbol( 3 ) )
        expr = LogicConcept.fromPutdown( '(= 1 2)' )[0]
        prob = new M.Problem( pat, expr )
        expect( () => S = Array.from( prob.solutions() ) ).not.to.throw()
        expect( solSetsEq( S, solSet( prob,
            { 'P' : lambda( 'v1', '(= 1 2)' ) }
        ) ) ).equals( true )
    } )

    // convenience function for easier debugging of Problems
    const showProblem = P =>
        P.constraints.map( ( constraint, index ) =>
            '\t' + ( index == 0 ? '{ ' : '  ' )
          + `( ${constraint.pattern.toPutdown()},\n`
          + `\t    ${constraint.expression.toPutdown()} )`
          + ( index == P.constraints.length - 1 ? ' }' : ',' )
        ).join( '\n' )
        .replace( / \+\{"LDE DB":[^\n]+\}\n/g, '' )
        .replace( /"\[\\"LDE DB\\"\,\\"(.*?)\\"\]"/g, '.$1' )
        .replace( /"\[\\"LDE DB\\"\,(.*?)\]"/g, '($1)' )
        .replace( /"LDE DB"/g, 'DB' )
        .replace( /\n      /g, '' )
        .replace( / \+\{"_type_Metavar":true\}\n/g, '__' )
        .replace( /"LDE EFA"/g, '@' )
        .replace( /"LDE lambda"/g, '𝝺' )

    it( 'Should compute correct solutions for the whole database', () => {
        // Get all matching tests from the database
        const matchingTests = Database.filterByMetadata( metadata =>
            metadata.testing && metadata.testing.type &&
            metadata.testing.type == 'matching' )
        // they are all entitled "/path/to/test N.putdown" for some N,
        // so sort them by that value of N in increasing order.
        const getNum = key => {
            const parts = key.split( ' ' )
            return parseInt( parts[parts.length-1].split( '.' )[0] )
        }
        matchingTests.sort( ( a, b ) => getNum( a ) - getNum( b ) )
        // Now run each test as follows...

        matchingTests.forEach( key => {
            // Look up the test with the given key and ensure it has three
            // parts (metavariable list, problem definition, expected solution
            // set)
            const LCs = Database.getObjects( key )
            expect( LCs.length ).equals( 3,
                `Malformed test: ${key} had ${LCs.length} LCs instead of 3` )
            // Convert all instances of the problem's metavariables into actual
            // metavariables (which would be prohibitive in putdown)
            const metavars = LCs[0].children().slice( 1 )
            metavars.forEach( mv => {
                // LCs[1] is of the form (problem pat1 exp1 pat2 exp2 ...)
                // and thus odd-index things in LCs[1] are patterns
                LCs[1].descendantsSatisfying(
                    d => d.equals( mv ) && d.address( LCs[1] )[0] % 2 == 1
                ).forEach( d => d.makeIntoA( M.metavariable ) )
                // LCs[2] is of the form (solutions (mv1 exp1 ...) ...)
                // and thus even-index things in each solution are metavariables
                LCs[2].descendantsSatisfying(
                    d => d.equals( mv ) && d.address( LCs[2] ).length == 2
                      && d.address( LCs[2] )[1] % 2 == 0
                ).forEach( d => d.makeIntoA( M.metavariable ) )
            } )
            // Extract the constraints that define the problem.
            let constraints = LCs[1].children().slice( 1 )
            expect( constraints.length % 2 ).equals( 0,
                `Constraint list of odd length in ${key}: ${LCs[1]}` )
            // The tests use the notation (@apply x y) for EFAs,
            // so we need to find each such expression and convert it into an
            // actual EFA.
            const apply = new LurchSymbol( '@apply' )
            const isEFANotation = lc => ( lc instanceof Application )
                                     && lc.numChildren() == 3
                                     && lc.child( 0 ).equals( apply )
            const convertToEFA = lc => M.newEFA( lc.child( 1 ), lc.child( 2 ) )
            const wrapper = new Application( ...constraints )
            wrapper.descendantsSatisfying( isEFANotation )
                   .map( d => d.replaceWith( convertToEFA( d ) ) )
            constraints = wrapper.children()
            // Finally, construct the actual problem instance.
            const P = new M.Problem( ...constraints )
            // if ( getNum( key ) == 27 ) P._debug = true
            // Extract the solutions and define the expected solution objects
            // from them.
            const solutions = LCs[2].children().slice( 1 ).map( sol => {
                expect( sol.numChildren() % 2 == 0 ).equals( true,
                    `Expected solution of even length in ${key}: ${sol}` )
                // The tests use the notation (@lambda x , y) for EFs,
                // so we need to find each such expression and convert it into
                // an actual EF.
                const lambda = new LurchSymbol( '@lambda' )
                const isEFNotation = lc =>
                    ( lc instanceof Application )
                 && lc.numChildren() == 2
                 && lc.firstChild().equals( lambda )
                 && ( lc.lastChild() instanceof BindingExpression )
                 && lc.lastChild().boundSymbols().length == 1
                const convertToEF = lc => M.newEF(
                    ...lc.lastChild().boundSymbols(),
                    lc.lastChild().lastChild() )
                sol.descendantsSatisfying( isEFNotation )
                   .map( d => d.replaceWith( convertToEF( d ) ) )
                // Now form the parts into a Solution object
                const result = new M.Solution( P )
                for ( let i = 0 ; i < sol.numChildren() - 1 ; i += 2 ) {
                    expect( sol.child( i ) ).to.be.instanceOf( LurchSymbol,
                        `Expected solution in ${key} has ${sol.child(i)}`
                      + ` where a metavariable belongs` )
                    expect( sol.child( i ).isA( M.metavariable) )
                        .equals( true,
                            `Expected solution in ${key} has ${sol.child(i)}`
                          + ` where a metavariable belongs` )
                    result.add( new M.Substitution(
                        sol.child( i ), sol.child( i + 1 ) ) )
                }
                return result
            } )
            // Now actually run the matching algorithm
            let computedSols
            expect( () => computedSols = Array.from( P.solutions() ),
                `Error when running matching algorithm on ${key}:\n`
              + `Problem:\n${showProblem(P)}\n`
              + `Expected solutions:\n`
              + solutions.map( x => `\t${x}\n` ).join( '' ) ).not.to.throw()
            // And check to see if it gave the expected answer
            expect( solSetsEq( computedSols, solutions ) ).equals( true,
                `Solution set not as expected for matching problem ${key}:\n`
              + `Problem:\n${showProblem(P)}\n`
              + `Expected solutions:\n`
              + solutions.map( x => `\t${x}\n` ).join( '' )
              + `Computed solutions:\n`
              + computedSols.map( x => `\t${x}\n` ).join( '' ) )
            // Also verify that numSolutions() works:
            expect( P.numSolutions() ).to.equal( solutions.length )
            // And that isSolvable() works:
            expect( P.isSolvable() ).to.equal( solutions.length > 0)
            // And that firstSolution works:
            if ( solutions.length > 0 ) {
                // If there are any, firstSolution() should be one of them:
                expect( solutions.some( solution =>
                    solution.equals( P.firstSolution() ) ) ).to.equal( true,
                    `First solution test failed for matching problem ${key}:\n`
                  + `Problem:\n${showProblem(P)}\n`
                  + `Full set of expected solutions:\n`
                  + solutions.map( x => `\t${x}\n` ).join( '' )
                  + `First computed solution:\n\t${P.firstSolution()}` )
            } else {
                // If there aren't any, firstSolution() better be undefined:
                expect( P.firstSolution() ).to.be.undefined
            }
          } )
    } )

    it( 'should support n-ary expression functions for n>1', () => {
        let pat, expr, prob, S
        // Test 1
        // problem: pattern (= (@ _P_ a b) (@ _Q_ a b))
        //       expression (= (+ a b)   (+ b a))
        pat = LogicConcept.fromPutdown(
            '( = ("LDE EFA" P a b) ("LDE EFA" Q a b) )' )[0]
        pat.descendantsSatisfying(
            d => ( d instanceof LurchSymbol ) && ['P','Q'].includes( d.text() )
        ).forEach(
            d => d.makeIntoA( M.metavariable )
        )
        expr = LogicConcept.fromPutdown( '( = (+ a b) (+ b a) )' )[0]
        prob = new M.Problem( pat, expr )
        expect( () => S = Array.from( prob.solutions() ) ).not.to.throw()
        expect( solSetsEq( S, solSet( prob,
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ b a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ a b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ b a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v4 b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ b a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ a v5))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ b a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v4 v5))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ a b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ v7 b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ a v8))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 a))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ v7 v8))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ b v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ a b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ b v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ v7 b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ b v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ a v8))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ b v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ v7 v8))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , (+ a b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ v7 b))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ a v8))' )[0],
            },
            {
                'Q' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 v4))' )[0],
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v7 v8) , (+ v7 v8))' )[0],
            },
        ) ) )

        // Test 2
        // problem: pattern (= (@ _P_ _x_ _y_) (@ _P_ _y_ _x_))
        //       expression (= (+ a b)         (+ b a))
        pat = LogicConcept.fromPutdown(
            '( = ("LDE EFA" P x y) ("LDE EFA" P y x) )' )[0]
        pat.descendantsSatisfying(
            d => ( d instanceof LurchSymbol )
              && ['P','Q','x','y'].includes( d.text() )
        ).forEach(
            d => d.makeIntoA( M.metavariable )
        )
        expr = LogicConcept.fromPutdown( '( = (+ a b) (+ b a) )' )[0]
        prob = new M.Problem( pat, expr )
        expect( () => S = Array.from( prob.solutions() ) ).not.to.throw()
        expect( solSetsEq( S, solSet( prob,
            {
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , v1)' )[0],
                'y' : LogicConcept.fromPutdown( '(+ b a)' )[0],
                'x' : LogicConcept.fromPutdown( '(+ a b)' )[0],
            },
            {
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v1 v2) , v2)' )[0],
                'x' : LogicConcept.fromPutdown( '(+ b a)' )[0],
                'y' : LogicConcept.fromPutdown( '(+ a b)' )[0],
            },
            {
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v5 v4))' )[0],
                'x' : LogicConcept.fromPutdown( 'b' )[0],
                'y' : LogicConcept.fromPutdown( 'a' )[0],
            },
            {
                'P' : LogicConcept.fromPutdown( 
                    '("LDE lambda" (v4 v5) , (+ v4 v5))' )[0],
                'y' : LogicConcept.fromPutdown( 'b' )[0],
                'x' : LogicConcept.fromPutdown( 'a' )[0],
            },
        ) ) )
    } )

} )
