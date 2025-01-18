
// Import what we're testing
import Formula from '../src/formula.js'

// Import other classes we need to do the testing
import { MathConcept } from '../src/math-concept.js'
import { LogicConcept } from '../src/logic-concept.js'
import { Environment } from '../src/environment.js'
import { Symbol as LurchSymbol } from '../src/symbol.js'
import Matching from '../src/matching.js'

// Test suite begins here.

describe( 'Formulas', () => {

    it( 'Module should import successfully', () => {
        expect( Formula ).to.be.ok
    } )

    it( 'Should create formulas correctly from LCs in context', () => {
        // declare some variables we'll use repeatedly
        let context  // the "document" in which to look for declarations
        let target   // the LC we will convert to a formula
        let formula  // the copy of the target that is a formula

        // Consider a single expression with nothing declared; every symbol in
        // it should become a metavariable except for strings of digits, which
        // are auto-declared as constants.
        context = LogicConcept.fromPutdown( ` {
            (this is irrelevant because it is not a declaration)
            (+ 3 (* -1 k))  // <-- target
        } ` )[0]
        target = context.child( 1 )
        // No metavariables in the target right now:
        expect( target.child( 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        // But if we make a formula, everything becomes a metavariable except 3:
        formula = Formula.from( target )
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( true )
        // 3 is auto-declared    
        expect( formula.child( 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 2 ).isA( Matching.metavariable ) )
            .equals( true )
        // check if it works in place (i.e., second arg is true)   
        formula = Formula.from( target, true )
        expect( formula ).equals( target )   
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( true )
        // 3 is auto-declared    
        expect( formula.child( 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 2 ).isA( Matching.metavariable ) )
            .equals( true )

        // Consider a single expression with one symbol declared;
        // every other symbol in it should become a metavariable.
        context = LogicConcept.fromPutdown( ` {
            [i j k]
            (+ k (* -1 k))  // <-- target
        } ` )[0]
        target = context.child( 1 )
        // No metavariables in the target right now:
        expect( target.child( 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        // But if we make a formula, everything except k becomes a metavar:
        formula = Formula.from( target )
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        // check if it works in place (i.e., second arg is true)   
        formula = Formula.from( target , true )
        expect( formula ).equals( target ) 
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 2 ).isA( Matching.metavariable ) )
            .equals( false )
            
        // Consider an environment with one symbol declared; every other symbol
        // in it should become a metavariable, except for strings of digits.
        context = LogicConcept.fromPutdown( ` {
            [i j k]
            { :(= i 1) (> n m) }  // <-- target
        } ` )[0]
        target = context.child( 1 )
        // No metavariables in the target right now:
        expect( target.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        // But if we make a formula, everything except i becomes a metavar:
        formula = Formula.from( target )
        expect( formula.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        // 1 is auto-declared    
        expect( formula.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 2 ).isA( Matching.metavariable ) )
            .equals( true )
        // check if it works in place (i.e., second arg is true)   
        formula = Formula.from( target, true )
        expect( formula ).equals( target )
        expect( formula.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        // 1 is auto-declared
        expect( formula.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 2 ).isA( Matching.metavariable ) )
            .equals( true )

        // Repeat the previous test, but now ensure that Binding Environments
        // also count as declaring variables.
        context = LogicConcept.fromPutdown( `(i j k) , {
            { :(= i 1) (> n m) }  // <-- target
        } ` )[0]
        target = context.child( 3, 0 )
        // No metavariables in the target right now:
        expect( target.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        // But if we make a formula, everything except i and 1 becomes a metavar:
        formula = Formula.from( target )
        expect( formula.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        // 1 is auto-declared
        expect( formula.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 2 ).isA( Matching.metavariable ) )
            .equals( true )
        // check if it works in place (i.e., second arg is true)   
        formula = Formula.from( target, true )
        expect( formula ).equals( target ) 
        expect( formula.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        // 1 is auto-declared
        expect( formula.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 2 ).isA( Matching.metavariable ) )
            .equals( true )
        
        
        // Consider two nested environment with many symbols declared at
        // different points, so that some environments have a symbol declared
        // while earlier environments do not have that same symbol declared.
        context = LogicConcept.fromPutdown( ` {
            [= > < => <=]
            { :(= i 1) (surjective f) }           // <-- target 1
            {
                [injective surjective bijective]
                (=> (bijective f) (injective f))  // <-- target 2
            }
            { (just testing injective here) }     // <-- target 3
        } ` )[0]
        // First consider target #1, as marked above.
        target = context.child( 1 )
        // No metavariables in target 1 right now:
        expect( target.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        // But if we make a formula, everything except = becomes a metavar:
        formula = Formula.from( target )
        expect( formula.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        // 1 is auto-declared    
        expect( formula.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        // check if it works in place (i.e., second arg is true)   
        formula = Formula.from( target, true )
        expect( formula ).equals( target ) 
        expect( formula.child( 0, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 0, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        // 1 is auto-declared
        expect( formula.child( 0, 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
            
        // Next consider target #2, as marked above.
        target = context.child( 2, 1 )
        // No metavariables in target 2 right now:
        expect( target.child( 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( false )
        // But if we make a formula, only f becomes a metavar:
        formula = Formula.from( target )
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        // check if it works in place (i.e., second arg is true)               
        formula = Formula.from( target, true )
        expect( formula ).equals( target ) 
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 1, 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2, 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( formula.child( 2, 1 ).isA( Matching.metavariable ) )
            .equals( true )
            
            
        // Finally consider target #3, as marked above.
        target = context.child( 3, 0 )
        // No metavariables in target 3 right now:
        expect( target.child( 0 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 1 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 2 ).isA( Matching.metavariable ) )
            .equals( false )
        expect( target.child( 3 ).isA( Matching.metavariable ) )
            .equals( false )
        // But if we make a formula, everything becomes a metavar:
        formula = Formula.from( target )
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 3 ).isA( Matching.metavariable ) )
            .equals( true )
        // check if it works in place (i.e., second arg is true)
        formula = Formula.from( target, true )
        expect( formula ).equals( target ) 
        expect( formula.child( 0 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 1 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 2 ).isA( Matching.metavariable ) )
            .equals( true )
        expect( formula.child( 3 ).isA( Matching.metavariable ) )
            .equals( true )

    } )

    it( 'Should compute the correct domain of any formula', () => {
        let target
        let domain

        // An expression with no metavariables has an empty domain
        target = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        domain = Formula.domain( target )
        expect( domain.equals( new Set ) ).equals( true )

        // An environment with no metavariables has an empty domain
        target = LogicConcept.fromPutdown( `
            {
                one
                (two 3)
                :(4 five , six)
                { seven }
            }
        ` )[0]
        domain = Formula.domain( target )
        expect( domain.equals( new Set ) ).equals( true )

        // An expression with 1 metavariable has a singleton domain
        target = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        target.child( 1, 2 ).makeIntoA( Matching.metavariable )
        domain = Formula.domain( target )
        expect( domain.equals( new Set( [ 'example' ] ) ) ).equals( true )

        // Same as previous but with multiple occurrences of the symbol
        target = LogicConcept.fromPutdown( `
            (this (is an example example) (with example))
        ` )[0]
        target.child( 1, 2 ).makeIntoA( Matching.metavariable )
        target.child( 1, 3 ).makeIntoA( Matching.metavariable )
        target.child( 2, 1 ).makeIntoA( Matching.metavariable )
        domain = Formula.domain( target )
        expect( domain.equals( new Set( [ 'example' ] ) ) ).equals( true )

        // An expression may have a large domain
        target = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        target.descendantsSatisfying( d => d instanceof LurchSymbol )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        domain = Formula.domain( target )
        expect( domain.equals( new Set( [
            'this', 'is', 'an', 'example', 'expression',
            'with', '#s', '1', '2', '3'
        ] ) ) ).equals( true )

        // An environment may have a large domain
        // (here we also test some things being metavars and some not)
        target = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :("LDE EFA" P a)
                ("LDE EFA" P b)
            } +{"label":"equality elimination"}
        ` )[0]
        target.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => !['=','LDE EFA'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        domain = Formula.domain( target )
        expect( domain.equals( new Set( [ 'a', 'b', 'P' ] ) ) ).equals( true )
    } )

    it( 'Should instantiate formulas from Objects', () => {
        let formula
        let instantiated
        let expected

        // Re-use an environment from an earlier test as the formula; it has
        // no metavariables, so any instantiation will be the same:
        formula = LogicConcept.fromPutdown( ` {
            one    (two 3)    :(4 five , six)    { seven }
        } ` )[0]
        instantiated = Formula.instantiate( formula, {
            'x' : LogicConcept.fromPutdown( 'testing' )[0],
            'y' : LogicConcept.fromPutdown( '{ a b c }' )[0],
            'z' : LogicConcept.fromPutdown( ':1' )[0]
        } )
        expect( formula.equals( instantiated ) ).equals( true )

        // Re-use an expression from an earlier test as the formula; it has 1
        // metavariable, so we will try instantiating it three ways:
        // Way #1: example -> 7
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiated = Formula.instantiate( formula, {
            'example' : LogicConcept.fromPutdown( '7' )[0]
        } )
        expect( instantiated.equals( LogicConcept.fromPutdown(
            '(this (is an 7 expression) (with #s 1 2 3))'
        )[0] ) ).equals( true )
        // Way #2: example -> (some compound expression)
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiated = Formula.instantiate( formula, {
            'example' : LogicConcept.fromPutdown(
                '(some compound expression)'
            )[0]
        } )
        expect( instantiated.equals( LogicConcept.fromPutdown(
            `(this (is an (some compound expression) expression)
                   (with #s 1 2 3))`
        )[0] ) ).equals( true )
        // Way #3: example -> { an env }, which is invalid
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        expect( () => Formula.instantiate( formula, {
            'example' : LogicConcept.fromPutdown( '{ some env }' )[0]
        } ) ).to.throw( /Cannot place a non-expression inside an expression/ )

        // Re-use an environment from an earlier test as the formula; it has 3
        // metavariables, and we will try instantiating it three ways:
        formula = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :("LDE EFA" P a)
                ("LDE EFA" P b)
            } +{"label":"equality elimination"}
        ` )[0]
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        // Way #1: instantiate only a subset of the metavariables
        instantiated = Formula.instantiate( formula, {
            'P' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] )
        } )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :(> a 1)
                (> b 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expected.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #2: try to instantiate the metavariables and some non-meta-
        // variables as well, which should not actually instantiate the
        // symbols in that latter category
        instantiated = Formula.instantiate( formula, {
            'P' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ),
            'a' : new LurchSymbol( 'AAA' ),
            'b' : new LurchSymbol( 'BBB' ),
            'c' : LogicConcept.fromPutdown( '(this is unused)' )[0],
            'd' : LogicConcept.fromPutdown( '(this also)' )[0]
        } )
        expect( instantiated.equals( LogicConcept.fromPutdown( `
            :{
                :(= AAA BBB)
                :(> AAA 1)
                (> BBB 1)
            } +{"label":"equality elimination"}
        ` )[0] ) ).equals( true )
        // Way #3: instantiate exactly the symbols that are metavariables
        instantiated = Formula.instantiate( formula, {
            'P' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ),
            'a' : LogicConcept.fromPutdown( '(first letter)' )[0],
            'b' : LogicConcept.fromPutdown( '(second letter)' )[0]
        } )
        expect( instantiated.equals( LogicConcept.fromPutdown( `
            :{
                :(= (first letter) (second letter))
                :(> (first letter) 1)
                (> (second letter) 1)
            } +{"label":"equality elimination"}
        ` )[0] ) ).equals( true )
    } )

    it( 'Should instantiate formulas from Maps', () => {
        // This test is literally just the exact same as the one above, except
        // we pass arguments to the instantiate() function as Map instances
        // rather than raw JS Objects.
        let formula
        let instantiated
        let expected
        let instantiation

        // Re-use an environment from an earlier test as the formula; it has
        // no metavariables, so any instantiation will be the same:
        formula = LogicConcept.fromPutdown( ` {
            one    (two 3)    :(4 five , six)    { seven }
        } ` )[0]
        instantiation = new Map()
        instantiation.set( 'x', LogicConcept.fromPutdown( 'testing' )[0] )
        instantiation.set( 'y', LogicConcept.fromPutdown( '{ a b c }' )[0] )
        instantiation.set( 'z', LogicConcept.fromPutdown( ':1' )[0] )
        instantiated = Formula.instantiate( formula, instantiation )
        expect( formula.equals( instantiated ) ).equals( true )

        // Re-use an expression from an earlier test as the formula; it has 1
        // metavariable, so we will try instantiating it three ways:
        // Way #1: example -> 7
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiation = new Map()
        instantiation.set( 'example', LogicConcept.fromPutdown( '7' )[0] )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown(
            '(this (is an 7 expression) (with #s 1 2 3))'
        )[0]
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #2: example -> (some compound expression)
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiation = new Map()
        instantiation.set( 'example', LogicConcept.fromPutdown(
            '(some compound expression)'
        )[0] )
        instantiated = Formula.instantiate( formula, instantiation )
        expect( instantiated.equals( LogicConcept.fromPutdown(
            `(this (is an (some compound expression) expression)
                   (with #s 1 2 3))`
        )[0] ) ).equals( true )
        // Way #3: example -> { an env }, which is invalid
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiation = new Map()
        instantiation.set( 'example',
            LogicConcept.fromPutdown( '{ some env }' )[0] )
        expect( () => Formula.instantiate( formula, instantiation ) )
            .to.throw( /Cannot place a non-expression inside an expression/ )

        // Re-use an environment from an earlier test as the formula; it has 3
        // metavariables, and we will try instantiating it three ways:
        formula = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :("LDE EFA" P a)
                ("LDE EFA" P b)
            } +{"label":"equality elimination"}
        ` )[0]
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        // Way #1: instantiate only a subset of the metavariables
        instantiation = new Map()
        instantiation.set( 'P', Matching.newEF( new LurchSymbol( 'v' ),
            LogicConcept.fromPutdown( '(> v 1)' )[0] ) )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :(> a 1)
                (> b 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expected.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #2: try to instantiate the metavariables and some non-meta-
        // variables as well, which should not actually instantiate the
        // symbols in that latter category
        instantiation = new Map()
        instantiation.set( 'P', Matching.newEF( new LurchSymbol( 'v' ),
            LogicConcept.fromPutdown( '(> v 1)' )[0] ) )
        instantiation.set( 'a', new LurchSymbol( 'AAA' ) )
        instantiation.set( 'b', new LurchSymbol( 'BBB' ) )
        instantiation.set( 'c',
            LogicConcept.fromPutdown( '(this is unused)' )[0] )
        instantiation.set( 'd', LogicConcept.fromPutdown( '(this also)' )[0] )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= AAA BBB)
                :(> AAA 1)
                (> BBB 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #3: instantiate exactly the symbols that are metavariables
        instantiation = new Map()
        instantiation.set( 'P', Matching.newEF( new LurchSymbol( 'v' ),
            LogicConcept.fromPutdown( '(> v 1)' )[0] ) )
        instantiation.set( 'a', LogicConcept.fromPutdown(
            '(first letter)' )[0] )
        instantiation.set( 'b', LogicConcept.fromPutdown(
            '(second letter)' )[0] )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= (first letter) (second letter))
                :(> (first letter) 1)
                (> (second letter) 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
    } )

    it( 'Should instantiate formulas from Solutions', () => {
        // This test is almost the exact same as the one above, except
        // we pass arguments to the instantiate() function as Solution instances
        // rather than JS Map instances.  Small changes were made to accommodate
        // the limitations of Substitutions; they are noted below.
        let formula
        let instantiated
        let expected
        let instantiation

        // Re-use an environment from an earlier test as the formula; it has
        // no metavariables, so any instantiation will be the same:
        formula = LogicConcept.fromPutdown( ` {
            one    (two 3)    :(4 five , six)    { seven }
        } ` )[0]
        instantiation = new Matching.Solution( new Matching.Problem )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'x' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( 'testing' )[0] ) )
        // the following replacement was changed because Substitutions can have
        // only Expressions in their image
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'y' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( '(a b c)' )[0] ) )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'z' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( ':1' )[0] ) )
        instantiated = Formula.instantiate( formula, instantiation )
        expect( formula.equals( instantiated ) ).equals( true )

        // Re-use an expression from an earlier test as the formula; it has 1
        // metavariable, so we will try instantiating it three ways:
        // Way #1: example -> 7
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiation = new Matching.Solution( new Matching.Problem )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'example' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( '7' )[0] ) )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown(
            '(this (is an 7 expression) (with #s 1 2 3))'
        )[0]
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #2: example -> (some compound expression)
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiation = new Matching.Solution( new Matching.Problem )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'example' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( '(some compound expression)' )[0] ) )
        instantiated = Formula.instantiate( formula, instantiation )
        expect( instantiated.equals( LogicConcept.fromPutdown(
            `(this (is an (some compound expression) expression)
                   (with #s 1 2 3))`
        )[0] ) ).equals( true )
        // Way #3: example -> { an env }, which is invalid LogicConcept
        // structure, but we cannot test this with Substitutions; we have
        // tested it in other tests; see above.

        // Re-use an environment from an earlier test as the formula; it has 3
        // metavariables, and we will try instantiating it three ways:
        formula = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :("LDE EFA" P a)
                ("LDE EFA" P b)
            } +{"label":"equality elimination"}
        ` )[0]
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        // Way #1: instantiate only a subset of the metavariables
        instantiation = new Matching.Solution( new Matching.Problem )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'P' ).makeIntoA( Matching.metavariable ),
            Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ) ) )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :(> a 1)
                (> b 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expected.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #2: try to instantiate the metavariables and some non-meta-
        // variables as well, which should not actually instantiate the
        // symbols in that latter category
        instantiation = new Matching.Solution( new Matching.Problem )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'P' ).makeIntoA( Matching.metavariable ),
            Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ) ) )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'a' ).makeIntoA( Matching.metavariable ),
            new LurchSymbol( 'AAA' ) ) )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'b' ).makeIntoA( Matching.metavariable ),
            new LurchSymbol( 'BBB' ) ) )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'c' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( '(this is unused)' )[0] ) )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'd' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( '(this also)' )[0] ) )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= AAA BBB)
                :(> AAA 1)
                (> BBB 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #3: instantiate exactly the symbols that are metavariables
        instantiation = new Matching.Solution( new Matching.Problem )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'P' ).makeIntoA( Matching.metavariable ),
            Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ) ) )
        instantiation.add( new Matching.Substitution( 
            new LurchSymbol( 'a' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( '(first letter)' )[0] ) )
        instantiation.add( new Matching.Substitution(
            new LurchSymbol( 'b' ).makeIntoA( Matching.metavariable ),
            LogicConcept.fromPutdown( '(second letter)' )[0] ) )
        instantiated = Formula.instantiate( formula, instantiation )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= (first letter) (second letter))
                :(> (first letter) 1)
                (> (second letter) 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
    } )

    it( 'Should instantiate formulas from Substitutions', () => {
        // This test is literally just the exact same as the one above, except
        // we pass arguments to the instantiate() function as Substitution
        // instances rather than Solution instances.  This requires, in some
        // cases, multiple calls to instantiate().
        let formula
        let instantiated
        let expected

        // Re-use an environment from an earlier test as the formula; it has
        // no metavariables, so any instantiation will be the same:
        formula = LogicConcept.fromPutdown( ` {
            one    (two 3)    :(4 five , six)    { seven }
        } ` )[0]
        instantiated = Formula.instantiate( formula,
            new Matching.Substitution(
                new LurchSymbol( 'x' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( 'testing' )[0] ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution(
                new LurchSymbol( 'y' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( '(a b c)' )[0] ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution(
                new LurchSymbol( 'z' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( ':1' )[0] ) )
        expect( formula.equals( instantiated ) ).equals( true )

        // Re-use an expression from an earlier test as the formula; it has 1
        // metavariable, so we will try instantiating it three ways:
        // Way #1: example -> 7
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiated = Formula.instantiate( formula,
            new Matching.Substitution(
                new LurchSymbol( 'example' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( '7' )[0] ) )
        expected = LogicConcept.fromPutdown(
            '(this (is an 7 expression) (with #s 1 2 3))'
        )[0]
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #2: example -> (some compound expression)
        formula = LogicConcept.fromPutdown( `
            (this (is an example expression) (with #s 1 2 3))
        ` )[0]
        formula.child( 1, 2 ).makeIntoA( Matching.metavariable )
        instantiated = Formula.instantiate( formula,
            new Matching.Substitution(
                new LurchSymbol( 'example' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( '(some compound expression)' )[0] ) )
        expect( instantiated.equals( LogicConcept.fromPutdown(
            `(this (is an (some compound expression) expression)
                   (with #s 1 2 3))`
        )[0] ) ).equals( true )
        // Way #3: example -> { an env }, which is invalid LogicConcept
        // structure, but we cannot test this with Substitutions; we have
        // tested it in other tests; see above.

        // Re-use an environment from an earlier test as the formula; it has 3
        // metavariables, and we will try instantiating it three ways:
        formula = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :("LDE EFA" P a)
                ("LDE EFA" P b)
            } +{"label":"equality elimination"}
        ` )[0]
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        // Way #1: instantiate only a subset of the metavariables
        instantiated = Formula.instantiate( formula, 
            new Matching.Substitution(
                new LurchSymbol( 'P' ).makeIntoA( Matching.metavariable ),
                Matching.newEF( new LurchSymbol( 'v' ),
                    LogicConcept.fromPutdown( '(> v 1)' )[0] ) ) )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :(> a 1)
                (> b 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expected.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #2: try to instantiate the metavariables and some non-meta-
        // variables as well, which should not actually instantiate the
        // symbols in that latter category
        instantiated = Formula.instantiate( formula,
            new Matching.Substitution(
                new LurchSymbol( 'P' ).makeIntoA( Matching.metavariable ),
                Matching.newEF( new LurchSymbol( 'v' ),
                    LogicConcept.fromPutdown( '(> v 1)' )[0] ) ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution(
                new LurchSymbol( 'a' ).makeIntoA( Matching.metavariable ),
                new LurchSymbol( 'AAA' ) ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution(
                new LurchSymbol( 'b' ).makeIntoA( Matching.metavariable ),
                new LurchSymbol( 'BBB' ) ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution(
                new LurchSymbol( 'c' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( '(this is unused)' )[0] ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution(
                new LurchSymbol( 'd' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( '(this also)' )[0] ) )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= AAA BBB)
                :(> AAA 1)
                (> BBB 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
        // Way #3: instantiate exactly the symbols that are metavariables
        instantiated = Formula.instantiate( formula,
            new Matching.Substitution(
                new LurchSymbol( 'P' ).makeIntoA( Matching.metavariable ),
                Matching.newEF( new LurchSymbol( 'v' ),
                    LogicConcept.fromPutdown( '(> v 1)' )[0] ) ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution( 
                new LurchSymbol( 'a' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( '(first letter)' )[0] ) )
        instantiated = Formula.instantiate( instantiated,
            new Matching.Substitution(
                new LurchSymbol( 'b' ).makeIntoA( Matching.metavariable ),
                LogicConcept.fromPutdown( '(second letter)' )[0] ) )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= (first letter) (second letter))
                :(> (first letter) 1)
                (> (second letter) 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
    } )

    it( 'Should respect the "preserve" attribute to instantiate', () => {
        let formula
        let instantiated
        let expected

        // Repeat a portion of the first instantiation test above, for Objects,
        // but now we place some attributes on the metavariables that will be
        // substituted:
        formula = LogicConcept.fromPutdown( `
            :{
                :(= a b)
                :("LDE EFA" P a)
                ("LDE EFA" P b)
            } +{"label":"equality elimination"}
        ` )[0]

        // Here's where we mark P, a, and b as metavariables:
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )
        // Here's where we give them some other attributes, too:
        // 1. Every P and a will be colored green.
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','a'].includes( s.text() ) )
            .forEach( s => s.setAttribute( 'color', 'green' ) )
        // 2. Every P and b will be flavored bitter.
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['P','b'].includes( s.text() ) )
            .forEach( s => s.setAttribute( 'flavor', 'bitter' ) )
        // 3. Every a and b will be have type "lower-case".
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['a','b'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( 'lower-case' ) )

        // Now we try instantiating without preserving any attributes.
        // We should get an output that retains none of the attributes that
        // were on the original metavariables.
        instantiated = Formula.instantiate( formula, {
            'P' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ),
            'a' : new LurchSymbol( 'I was "a" before' ).makeIntoA( 'foo!' ),
            'b' : LogicConcept.fromPutdown( '(+ x 1)' )[0]
        } )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= "I was \\"a\\" before" +{"_type_foo!":true}
                    (+ x 1))
                :(> "I was \\"a\\" before" +{"_type_foo!":true}
                    1)
                (> (+ x 1) 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )

        // Repeat the same test but preserve just the color attribute.
        // We should get an output that is the same as last time, except the
        // instantiation of "a" will have color green.  (Although P's
        // instantiation also had it, it was removed when P was beta-reduced.)
        instantiated = Formula.instantiate( formula, {
            'P' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ),
            'a' : new LurchSymbol( 'I was "a" before' ).makeIntoA( 'foo!' ),
            'b' : LogicConcept.fromPutdown( '(+ x 1)' )[0]
        }, [ "color" ] )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= "I was \\"a\\" before" +{"_type_foo!":true,"color":"green"}
                    (+ x 1))
                :(> "I was \\"a\\" before" +{"_type_foo!":true,"color":"green"}
                    1)
                (> (+ x 1) 1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )

        // Repeat the same test but preserve just the flavor attribute.
        // We should get an output that is the same as the first time, except
        // instantiation of "b" will have flavor bitter.  (Although P's
        // instantiation also had it, it was removed when P was beta-reduced.)
        instantiated = Formula.instantiate( formula, {
            'P' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ),
            'a' : new LurchSymbol( 'I was "a" before' ).makeIntoA( 'foo!' ),
            'b' : LogicConcept.fromPutdown( '(+ x 1)' )[0]
        }, [ "flavor" ] )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= "I was \\"a\\" before" +{"_type_foo!":true}
                    (+ x 1) +{"flavor":"bitter"}
                    )
                :(> "I was \\"a\\" before" +{"_type_foo!":true}
                    1)
                (> (+ x 1) +{"flavor":"bitter"}
                    1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )

        // Repeat the same test but preserve color, flavor, and lower-case
        // status.  We should get an output that retains every attribute except
        // those on P, for the reasons documented above.
        instantiated = Formula.instantiate( formula, {
            'P' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ),
            'a' : new LurchSymbol( 'I was "a" before' ).makeIntoA( 'foo!' ),
            'b' : LogicConcept.fromPutdown( '(+ x 1)' )[0]
        }, [ "color", "flavor", MathConcept.typeAttributeKey( 'lower-case' ) ] )
        expected = LogicConcept.fromPutdown( `
            :{
                :(= "I was \\"a\\" before"
                        +{"_type_foo!":true,"color":"green"}
                        +{"_type_lower-case":true}
                    (+ x 1)
                        +{"flavor":"bitter"}
                        +{"_type_lower-case":true}
                    )
                :(> "I was \\"a\\" before"
                        +{"_type_foo!":true,"color":"green"}
                        +{"_type_lower-case":true}
                    1)
                (> (+ x 1)
                        +{"flavor":"bitter"}
                        +{"_type_lower-case":true}
                    1)
            } +{"label":"equality elimination"}
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
    } )

    it( 'Should correctly instantiate formulas with Declarations', () => {
        let formula
        let instantiated
        let expected

        // Create a formula with a few declarations of different kinds
        formula = LogicConcept.fromPutdown( `
            :{
                :[x y , ("LDE EFA" B (x y))]
                [z w]
                (A b c)
            }
        ` )[0]

        // Here's where we mark metavariables:
        formula.descendantsSatisfying( d => d instanceof LurchSymbol )
            .filter( s => ['B','A','b','c'].includes( s.text() ) )
            .forEach( s => s.makeIntoA( Matching.metavariable ) )

        // Now we try instantiating
        instantiated = Formula.instantiate( formula, {
            'B' : Matching.newEF( new LurchSymbol( 'v' ),
                LogicConcept.fromPutdown( '(> v 1)' )[0] ),
            'A' : new LurchSymbol( '=' ),
            'b' : new LurchSymbol( 'foo' ),
            'c' : LogicConcept.fromPutdown( '(b a r)' )[0]
        } )
        
        // And check that it came out correctly
        expected = LogicConcept.fromPutdown( `
            :{
                :[x y , (> (x y) 1)]
                [z w]
                (= foo (b a r))
            }
        ` )[0]
        expect( instantiated.equals( expected ) ).equals( true )
    } )

    // Utility function used below to construct a Formula whose metavariables
    // do not include those on the given list.
    const buildFormula = ( putdown, nonMetavarNames = [ ] ) => {
        const wrapper = LogicConcept.fromPutdown(
            `( ${nonMetavarNames.join(" ")} ) , { ${putdown} }` )[0]
        return Formula.from( wrapper.lastChild().firstChild() )
    }
    // Utility function for constructing solution sets
    // Call like so: solset( problem, [
    //     { 'metavar1' : 'putdown for expression1', ... }, // solution 1
    //     ...
    // ] )
    const solSet = ( problem, ...sols ) => {
        return sols.map( sol => {
            const result = new Matching.Solution( problem )
            for ( let mv in sol ) {
                if ( sol.hasOwnProperty( mv ) ) {
                    result.add( new Matching.Substitution(
                        new LurchSymbol( mv ).asA( Matching.metavariable ),
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
        if ( !set1.every( sol => sol instanceof Matching.Solution ) ) {
            if ( debug ) {
                console.log( 'Not all are solution instances:' )
                set1strs.map( x => console.log( `\t\t${x}` ) )
            }
            return false
        }
        if ( !set2.every( sol => sol instanceof Matching.Solution ) ) {
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
        return Matching.newEF( arg, body )
    }

    it( 'Should correctly compute possible formula instantiations', () => {
        // Because here we are mostly just testing that the Formula module can
        // correctly set up problems to pass to the matching package, we do not
        // do here a comprehensive test of all matching features.  Rather, we
        // focus mostly on small matching problems sitting inside a variety of
        // different environments, declarations, binding environments, etc.
        let formula
        let candidate
        let results

        // Test 1: Put a simple matching problem inside an environment.
        formula = buildFormula( `
            { :A  :B  (^ A B) }
        `, [ '^' ] )
        candidate = LogicConcept.fromPutdown( `
            { :foo :bar (^ foo bar) }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( solSetsEq( results, solSet( results[0]._problem,
            { 'A' : 'foo', 'B' : 'bar' }
        ) ) ).equals( true )

        // Test 2: Same as previous, but this time make sure it fails.
        formula = buildFormula( `
            { :A  :B  (^ A B) }
        `, [ '^' ] )
        candidate = LogicConcept.fromPutdown( `
            { :foo :bar (^ foo baz) }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( results ).to.eql( [ ] )

        // Test 3: Still a simple problem, but with nested environments.
        formula = buildFormula( `
            { :{ :X Y } :{ :Y X } (<=> X Y) }
        `, [ '<=>' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :{ :happy clapping }
                :{ :clapping happy }
                (<=> happy clapping)
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( solSetsEq( results, solSet( results[0]._problem,
            { 'X' : 'happy', 'Y' : 'clapping' }
        ) ) ).equals( true )

        // Test 4: Same as previous, but not correct, so no matches.
        formula = buildFormula( `
            { :{ :X Y } :{ :Y X } (<=> X Y) }
        `, [ '<=>' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :{ :happy clapping }
                :{ :clapping happy }
                (<=> clapping happy) // mistake here; these args are reversed
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( results ).to.eql( [ ] )

        // Test 5: Same as #3, but only incorrect via nesting
        formula = buildFormula( `
            { :{ :X Y } :{ :Y X } (<=> X Y) }
        `, [ '<=>' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :{ :happy clapping }
                :clapping happy // mistake here; not nested
                (<=> happy clapping)
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( results ).to.eql( [ ] )

        // Test 6: Same as #3, but only incorrect via missing "given" flag
        formula = buildFormula( `
            { :{ :X Y } :{ :Y X } (<=> X Y) }
        `, [ '<=>' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :{ :happy clapping }
                { :clapping happy } // mistake here; not marked as a given
                (<=> happy clapping)
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( results ).to.eql( [ ] )

        // Test 7: Slightly less simple problem, because it has EFAs.
        formula = buildFormula( `
            { :(= a b) :("LDE EFA" P a) ("LDE EFA" P b) }
        `, [ '=', '"LDE EFA"' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :(= x 3)
                :(= (- x 1) (+ y 1))
                (= (- 3 1) (+ y 1))
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( solSetsEq( results, solSet( results[0]._problem,
            {
                'a' : 'x',
                'b' : '3',
                'P' : lambda( 'v', '(= (- v 1) (+ y 1))' )
            }
        ) ) ).equals( true )

        // Test 8: Like the previous, but with multiple solutions
        formula = buildFormula( `
            { ("LDE EFA" P 500) }
        `, [ '"LDE EFA"', '500' ] )
        candidate = LogicConcept.fromPutdown( `
            { (^ 500 2) }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( solSetsEq( results, solSet( results[0]._problem,
            { 'P' : lambda( 'v', '(^ v 2)' ) },
            { 'P' : lambda( 'v', '(^ 500 2)' ) }
        ) ) ).equals( true )

        // Test 9: Like test 7, but with no solutions.
        formula = buildFormula( `
            { :(= a b) :("LDE EFA" P a) ("LDE EFA" P b) }
        `, [ '=', '"LDE EFA"' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :(= x 3)
                :(= (- 3 1) (+ y 1)) // mistake is in these two lines;
                (= (- x 1) (+ y 1))  // they are reversed
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( results ).to.eql( [ ] )

        // Test 10: Larger example, including both nested Envs and EFAs.
        formula = buildFormula( `
            {
                :{
                    [x]
                    ("LDE EFA" P x)
                }
                (∀ x , ("LDE EFA" P x))
            }
        `, [ '∀', '"LDE EFA"' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :{
                    [a]
                    (not (is_silly a))
                }
                (∀ a , (not (is_silly a)))
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( solSetsEq( results, solSet( results[0]._problem,
            {
                'x' : 'a',
                'P' : lambda( 'v', '(not (is_silly v))' )
            }
        ) ) ).equals( true )

        // Test 11: Same as previous, but incorrect/not matching
        formula = buildFormula( `
            {
                :{
                    [x]
                    ("LDE EFA" P x)
                }
                (∀ x , ("LDE EFA" P x))
            }
        `, [ '∀', '"LDE EFA"' ] )
        candidate = LogicConcept.fromPutdown( `
            {
                :{
                    a // mistake is here; this is not a declaration of a
                    (not (is_silly a))
                }
                (∀ a , (not (is_silly a)))
            }
        ` )[0]
        results = Array.from(
            Formula.allPossibleInstantiations( formula, candidate ) )
        expect( results ).to.eql( [ ] )
    } )

    it( 'Should support caching formula instantiations as siblings', () => {

        // Can we mark LogicConcepts as cached formula instantiations?
        const testSymbol = new LurchSymbol( 'test' )
        expect( Formula.cachedInstantiation ).to.be.ok
        expect( testSymbol.isA( Formula.cachedInstantiation ) )
            .to.equal( false )
        expect( () => testSymbol.makeIntoA( Formula.cachedInstantiation ) )
            .not.to.throw()
        expect( testSymbol.isA( Formula.cachedInstantiation ) )
            .to.equal( true )
        expect( () => testSymbol.unmakeIntoA( Formula.cachedInstantiation ) )
            .not.to.throw()
        expect( testSymbol.isA( Formula.cachedInstantiation ) )
            .to.equal( false )

        // If we try to add a cached instantiation to a formula with no parent,
        // it should throw an error.
        let formula
        let instantiation1, instantiation2
        formula = buildFormula( `
            { :A  :B  (^ A B) }
        `, [ '^' ] )
        instantiation1 = LogicConcept.fromPutdown( `
            { :x  :y  (^ x y) }
        ` )[0]
        expect( () => Formula.addCachedInstantiation( formula, instantiation1 ) )
            .to.throw( /^Cannot insert.*formula has no parent$/ )
        // In that situation, the cache should be an empty list
        expect( Formula.allCachedInstantiations( formula ) ).to.eql( [ ] )

        // But if it has a parent, we can insert several, and they show up as
        // next siblings. We also test fetching the cache before and after each.
        let parentEnvironment
        parentEnvironment = new Environment(
            LogicConcept.fromPutdown( '(first child of environment)' )[0],
            formula,
            new LurchSymbol( 'last_child_of_environment' )
        )
        // test initial state:
        expect( parentEnvironment.numChildren() ).to.equal( 3 )
        expect( parentEnvironment.children().some( child =>
            child.isA( Formula.cachedInstantiation ) ) ).to.equal( false )
        expect( Formula.allCachedInstantiations( formula ) ).to.eql( [ ] )
        // no errors when we add one, and all subsequent tests pass:
        expect( () => Formula.addCachedInstantiation( formula, instantiation1 ) )
            .not.to.throw()
        expect( parentEnvironment.numChildren() ).to.equal( 4 )
        expect(
            parentEnvironment.child( 0 ).isA( Formula.cachedInstantiation )
        ).to.equal( false )
        expect(
            parentEnvironment.child( 1 ).isA( Formula.cachedInstantiation )
        ).to.equal( false )
        expect(
            parentEnvironment.child( 2 ).isA( Formula.cachedInstantiation )
        ).to.equal( true )
        expect(
            parentEnvironment.child( 3 ).isA( Formula.cachedInstantiation )
        ).to.equal( false )
        expect( parentEnvironment.child( 1 ) ).to.equal( formula )
        expect( parentEnvironment.child( 2 ) ).to.equal( instantiation1 )
        expect( Formula.allCachedInstantiations( formula ) )
            .to.eql( [ instantiation1 ] )
        // no errors when we add another, and all subsequent tests pass:
        instantiation2 = LogicConcept.fromPutdown( `
            { :P  :Q  (^ P Q) }
        ` )[0]
        expect( () => Formula.addCachedInstantiation( formula, instantiation2 ) )
            .not.to.throw()
        expect( parentEnvironment.numChildren() ).to.equal( 5 )
        expect(
            parentEnvironment.child( 0 ).isA( Formula.cachedInstantiation )
        ).to.equal( false )
        expect(
            parentEnvironment.child( 1 ).isA( Formula.cachedInstantiation )
        ).to.equal( false )
        expect(
            parentEnvironment.child( 2 ).isA( Formula.cachedInstantiation )
        ).to.equal( true )
        expect(
            parentEnvironment.child( 3 ).isA( Formula.cachedInstantiation )
        ).to.equal( true )
        expect(
            parentEnvironment.child( 4 ).isA( Formula.cachedInstantiation )
        ).to.equal( false )
        expect( parentEnvironment.child( 1 ) ).to.equal( formula )
        expect( parentEnvironment.child( 2 ) ).to.equal( instantiation1 )
        expect( parentEnvironment.child( 3 ) ).to.equal( instantiation2 )
        expect( Formula.allCachedInstantiations( formula ) )
            .to.eql( [ instantiation1, instantiation2 ] )
        
        // Then if we remove the cached instantiations, they get removed.
        expect( () => Formula.clearCachedInstantiations( formula ) )
            .not.to.throw()
        expect( parentEnvironment.numChildren() ).to.equal( 3 )
        expect( parentEnvironment.children().some( child =>
            child.isA( Formula.cachedInstantiation ) ) ).to.equal( false )
        expect( Formula.allCachedInstantiations( formula ) ).to.eql( [ ] )
    } )

    it( 'Should detect when declaration capture would occur', () => {
        let formula, instantiation

        // Test 1:
        // In a formula with no declarations, there can be no declaration
        // capture.
        formula = buildFormula( `
            { :{ :A B } (=> A B) }
        `, [ '=>' ] )
        instantiation = {
            A : LogicConcept.fromPutdown( '(+ x 3)' )[0],
            B : LogicConcept.fromPutdown( '(- B 2)' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( false )
        
        // Test 2:
        // If the instantiation has all different symbols than the formula,
        // then even when there are declarations, there can be no capture.
        formula = buildFormula( `
            { :{ :[x] ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v 7))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( false )
        
        // Test 3:
        // If the instantiation avoids capture, then that is reported correctly,
        // even if the instantiation shares some symbols with the formula.
        formula = buildFormula( `
            { :{ :[x] ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v x))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( false )
        
        // Test 4:
        // If the instantiation would capture, we better notice that.
        // First, consider the case where the capture is of a declared metavar.
        formula = buildFormula( `
            { :{ :[x] ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v K))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( true )
        
        // Test 5:
        // If the instantiation would capture, we better notice that.
        // Now, consider the case where the capture is of a declared non-metavar.
        formula = buildFormula( `
            { :{ :[x] ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"','x' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v x))' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( true )
        
        // Test 6:
        // Repeat test 2, but with the declaration outside the environment.
        // (This rule no longer makes sense logically, but is a good scope test.)
        formula = buildFormula( `
            { [x] { ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v 7))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( false )
        
        // Test 7:
        // Repeat test 3, but with the declaration outside the environment.
        // (This rule no longer makes sense logically, but is a good scope test.)
        formula = buildFormula( `
            { [x] { ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v x))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( false )
        
        // Test 8:
        // Repeat test 4, but with the declaration outside the environment.
        // (This rule no longer makes sense logically, but is a good scope test.)
        formula = buildFormula( `
            { [x] { ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v K))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( true )
        
        // Test 9:
        // Repeat test 5, but with the declaration outside the environment.
        // (This rule no longer makes sense logically, but is a good scope test.)
        formula = buildFormula( `
            { [x] { ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"','x' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v x))' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( true )
        
        // Test 10:
        // Repeat test 2, but with two declarations, so a new opportunity to
        // create capture.  And we use that opportunity, so capture happens.
        formula = buildFormula( `
            { [x y] { ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (= v y))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( true )
        
        // Test 11:
        // Repeat test 3, but with many declarations, so new opportunities to
        // create capture.  And we use such an opportunity, so capture happens.
        formula = buildFormula( `
            { [R E x Y F] { ("LDE EFA" P x) } (∀ x , ("LDE EFA" P x)) }
        `, [ '=>','"LDE EFA"' ] )
        instantiation = {
            P : LogicConcept.fromPutdown( '("LDE lambda" v , (F R v))' )[0],
            x : LogicConcept.fromPutdown( 'K' )[0]
        }
        expect( Formula.hasDeclarationCapture( formula, instantiation ) )
            .to.equal( true )
    } )

} )
