// Prime sieve for benchmarking and fun
console.log("Computing primes...")
const start = Date.now()
const n = 100000000
let primes = [ 2 ]
for (let i = 3; i < n; i++) {
  let isPrime = true
  for (const p of primes ) {
    if ( !(i % p) ) { 
      isPrime = false
      break
    } else if (i<p*p) {  
      break
    }
  }
  if (isPrime) primes.push(i)
}
const end = (Date.now()-start)/1000
console.log(`Done! ( ${end} sec)`)
console.log(`Found ${primes.length} primes less than ${n}`)