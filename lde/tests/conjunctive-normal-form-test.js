
// Import what we're testing
import CNFTools from '../src/validation/conjunctive-normal-form.js'

// Test suite begins here.

describe( 'Conjunctive normal form', () => {

    it( 'Module should import successfully', () => {
        expect( CNFTools ).to.be.ok
    } )

    // Define a function for verifying that something is actually a CNF
    // (array of arrays of integers)
    const isACNF = toTest => ( toTest instanceof Array ) && toTest.every(
        entry => ( entry instanceof Array ) && entry.every( Number.isInteger )
    )

    it( 'can express the constant "true"', () => {
        // Do we have the function that creates such a CNF?
        expect( CNFTools.constantTrue ).to.be.ok
        // Does it seem to always create the same result?
        const true1 = CNFTools.constantTrue()
        const true2 = CNFTools.constantTrue()
        expect( true1 ).to.eql( true2 )
        // Is that result a valid CNF?
        expect( isACNF( true1 ) ).to.equal( true )
        expect( isACNF( true2 ) ).to.equal( true )
        // Is that result satisfiable?
        expect( CNFTools.isSatisfiable( true1 ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( true2 ) ).to.equal( true )
        // Does it have the exact form we expect it to have?
        expect( true1 ).to.eql( [ ] )
        expect( true2 ).to.eql( [ ] )
    } )

    it( 'can express the constant "false"', () => {
        // Do we have the function that creates such a CNF?
        expect( CNFTools.constantFalse ).to.be.ok
        // Does it seem to always create the same result?
        const false1 = CNFTools.constantFalse()
        const false2 = CNFTools.constantFalse()
        expect( false1 ).to.eql( false2 )
        // Is that result a valid CNF?
        expect( isACNF( false1 ) ).to.equal( true )
        expect( isACNF( false2 ) ).to.equal( true )
        // Is that result satisfiable?
        expect( CNFTools.isSatisfiable( false1 ) ).to.equal( false )
        expect( CNFTools.isSatisfiable( false2 ) ).to.equal( false )
        // Does it have the exact form we expect it to have?
        expect( false1 ).to.eql( [ [ ] ] )
        expect( false2 ).to.eql( [ [ ] ] )
    } )

    it( 'can express atomic propositions and their negations', () => {
        // Do we have the function that creates such a CNF?
        expect( CNFTools.proposition ).to.be.ok
        // Does it create a unique result for each proposition/negation?
        const P1 =    CNFTools.proposition(  1 )
        const P2 =    CNFTools.proposition(  2 )
        const notP1 = CNFTools.proposition( -1 )
        const notP2 = CNFTools.proposition( -2 )
        expect( P1    ).not.to.eql( P2    )
        expect( P1    ).not.to.eql( notP1 )
        expect( P1    ).not.to.eql( notP2 )
        expect( P2    ).not.to.eql( notP1 )
        expect( P2    ).not.to.eql( notP2 )
        expect( notP1 ).not.to.eql( notP2 )
        // Is each result a valid CNF?
        expect( isACNF( P1    ) ).to.equal( true )
        expect( isACNF( P2    ) ).to.equal( true )
        expect( isACNF( notP1 ) ).to.equal( true )
        expect( isACNF( notP2 ) ).to.equal( true )
        // Is each result satisfiable?
        expect( CNFTools.isSatisfiable( P1    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P2    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( notP1 ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( notP2 ) ).to.equal( true )
        // Does each have the exact form we expect it to have?
        expect( P1    ).to.eql( [ [ 1 ] ] )
        expect( P2    ).to.eql( [ [ 2 ] ] )
        expect( notP1 ).to.eql( [ [ -1 ] ] )
        expect( notP2 ).to.eql( [ [ -2 ] ] )
    } )

    it( 'can express conjunctions of other CNFs', () => {
        // Do we have the function that creates such a CNF?
        expect( CNFTools.and ).to.be.ok
        // It's supposed to concatenate CNFs.  Does it?
        const P1    = CNFTools.proposition(  1 )
        const P2    = CNFTools.proposition(  2 )
        const notP1 = CNFTools.proposition( -1 )
        const notP2 = CNFTools.proposition( -2 )
        const P1andP2       = CNFTools.and( P1,    P2    )
        const P1andNotP1    = CNFTools.and( P1,    notP1 )
        const P1andNotP2    = CNFTools.and( P1,    notP2 )
        const P2andNotP1    = CNFTools.and( P2,    notP1 )
        const P2andNotP2    = CNFTools.and( P2,    notP2 )
        const notP1andNotP2 = CNFTools.and( notP1, notP2 )
        expect( P1andP2       ).to.eql( P1.concat(    P2    ) )
        expect( P1andNotP1    ).to.eql( P1.concat(    notP1 ) )
        expect( P1andNotP2    ).to.eql( P1.concat(    notP2 ) )
        expect( P2andNotP1    ).to.eql( P2.concat(    notP1 ) )
        expect( P2andNotP2    ).to.eql( P2.concat(    notP2 ) )
        expect( notP1andNotP2 ).to.eql( notP1.concat( notP2 ) )
        // Is each result a valid CNF?
        expect( isACNF( P1andP2       ) ).to.equal( true )
        expect( isACNF( P1andNotP1    ) ).to.equal( true )
        expect( isACNF( P1andNotP2    ) ).to.equal( true )
        expect( isACNF( P2andNotP1    ) ).to.equal( true )
        expect( isACNF( P2andNotP2    ) ).to.equal( true )
        expect( isACNF( notP1andNotP2 ) ).to.equal( true )
        // These should be satisfiable iff they don't have a letter and its
        // own negation being conjoined together.
        expect( CNFTools.isSatisfiable( P1andP2       ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P1andNotP1    ) ).to.equal( false )
        expect( CNFTools.isSatisfiable( P1andNotP2    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P2andNotP1    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P2andNotP2    ) ).to.equal( false )
        expect( CNFTools.isSatisfiable( notP1andNotP2 ) ).to.equal( true )
        // Does each have the exact form we expect it to have?
        expect( P1andP2       ).to.eql( [ [  1 ], [  2 ] ] )
        expect( P1andNotP1    ).to.eql( [ [  1 ], [ -1 ] ] )
        expect( P1andNotP2    ).to.eql( [ [  1 ], [ -2 ] ] )
        expect( P2andNotP1    ).to.eql( [ [  2 ], [ -1 ] ] )
        expect( P2andNotP2    ).to.eql( [ [  2 ], [ -2 ] ] )
        expect( notP1andNotP2 ).to.eql( [ [ -1 ], [ -2 ] ] )
    } )

    it( 'can express disjunctions of small CNFs', () => {
        // Do we have the function that creates such a CNF?
        expect( CNFTools.or ).to.be.ok
        // In the trivial cases we test below, it's a one-entry CNF; verify.
        const P1    = CNFTools.proposition(  1 )
        const P2    = CNFTools.proposition(  2 )
        const notP1 = CNFTools.proposition( -1 )
        const notP2 = CNFTools.proposition( -2 )
        const P1orP2       = CNFTools.or( P1,    P2 )
        const P1orNotP1    = CNFTools.or( P1,    notP1 )
        const P1orNotP2    = CNFTools.or( P1,    notP2 )
        const P2orNotP1    = CNFTools.or( P2,    notP1 )
        const P2orNotP2    = CNFTools.or( P2,    notP2 )
        const notP1orNotP2 = CNFTools.or( notP1, notP2 )
        expect( P1orP2       ).to.eql( [ [  1,  2 ] ] )
        expect( P1orNotP1    ).to.eql( [ [  1, -1 ] ] )
        expect( P1orNotP2    ).to.eql( [ [  1, -2 ] ] )
        expect( P2orNotP1    ).to.eql( [ [  2, -1 ] ] )
        expect( P2orNotP2    ).to.eql( [ [  2, -2 ] ] )
        expect( notP1orNotP2 ).to.eql( [ [ -1, -2 ] ] )
        // Is each result a valid CNF?
        expect( isACNF( P1orP2       ) ).to.equal( true )
        expect( isACNF( P1orNotP1    ) ).to.equal( true )
        expect( isACNF( P1orNotP2    ) ).to.equal( true )
        expect( isACNF( P2orNotP1    ) ).to.equal( true )
        expect( isACNF( P2orNotP2    ) ).to.equal( true )
        expect( isACNF( notP1orNotP2 ) ).to.equal( true )
        // These should all be satisfiable because you can't or together a
        // bunch of propositions (even with their negations) and get a
        // contradiction.
        expect( CNFTools.isSatisfiable( P1orP2       ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P1orNotP1    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P1orNotP2    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P2orNotP1    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( P2orNotP2    ) ).to.equal( true )
        expect( CNFTools.isSatisfiable( notP1orNotP2 ) ).to.equal( true )
    } )

    it( 'can express disjunctions of complex CNFs', () => {
        // try (P1^P2)v(P3^P4)
        // which should give (P1vP3)^(P1vP4)^(P2vP3)^(P2vP4)
        // and be satisfiable
        const P1 = CNFTools.proposition( 1 )
        const P2 = CNFTools.proposition( 2 )
        const P3 = CNFTools.proposition( 3 )
        const P4 = CNFTools.proposition( 4 )
        const test1 = CNFTools.or(
            CNFTools.and( P1, P2 ), CNFTools.and( P3, P4 ) )
        expect( isACNF( test1 ) ).to.equal( true )
        expect( test1 ).to.eql( [ [ 1, 3 ], [ 1, 4 ], [ 2, 3 ], [ 2, 4 ] ] )
        expect( CNFTools.isSatisfiable( test1 ) ).to.equal( true )
        // try (P1^P2^P3)vP4
        // which should give (P1vP4)^(P2vP4)^(P3vP4)
        // and be satisfiable
        const test2 = CNFTools.or( CNFTools.and( P1, P2, P3 ), P4 )
        expect( isACNF( test2 ) ).to.equal( true )
        expect( test2 ).to.eql( [ [ 4, 1 ], [ 4, 2 ], [ 4, 3 ] ] )
        expect( CNFTools.isSatisfiable( test2 ) ).to.equal( true )
        // try (P1^P2^P3)v(P4^P5)
        // which should give (P1vP6)^(P2vP6)^(P3vP6)^(P4v-P6)^(P5v-P6)
        // and be satisfiable
        const P5 = CNFTools.proposition( 5 )
        const test3 = CNFTools.or(
            CNFTools.and( P1, P2, P3 ), CNFTools.and( P4, P5 ) )
        expect( isACNF( test3 ) ).to.equal( true )
        expect( test3 ).to.eql(
            [ [ 6, 1 ], [ 6, 2 ], [ 6, 3 ], [ -6, 4 ], [ -6, 5 ] ] )
        expect( CNFTools.isSatisfiable( test3 ) ).to.equal( true )
    } )

    it( 'uses a fresh switch variable with sparse, negative indices', () => {
        const result = CNFTools.or(
            [ [ 1 ], [ -7 ], [ -101 ] ], [ [ 5 ], [ 9 ] ] )
        expect( result ).to.eql( [
            [ 102, 1 ], [ 102, -7 ], [ 102, -101 ],
            [ -102, 5 ], [ -102, 9 ]
        ] )
        expect( CNFTools.isSatisfiable( result ) ).to.equal( true )
    } )

    // More literal occurrences than can safely be passed as function
    // arguments.  The unit clauses force each long clause to require -101.
    const largeCNF = () => Array.from( { length: 32768 },
        () => [ 1, 2, 3, 4, 5, 6, 7, -101 ] ).concat(
        [ [ -1 ], [ -2 ], [ -3 ], [ -4 ], [ -5 ], [ -6 ], [ -7 ] ] )

    it( 'can check satisfiability with many literal occurrences', () => {
        expect( CNFTools.isSatisfiable( largeCNF() ) ).to.equal( true )
    } )

    it( 'can detect contradictions with many literal occurrences', () => {
        const cnf = largeCNF().concat( [ [ 101 ] ] )
        expect( CNFTools.isSatisfiable( cnf ) ).to.equal( false )
    } )

} )
