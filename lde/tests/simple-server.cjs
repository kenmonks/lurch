
// This code was taken from a StackOverflow question.
// https://stackoverflow.com/questions/16333790/node-js-quick-file-server-static-files-over-http
// Thank you!

const http = require( 'http' )
const { URL } = require( 'url' )
const fs = require( 'fs' )
const path = require( 'path' )
const port = 8080

const startServer = ( options = { } ) => {
    // Use these default values for the options:
    options = Object.assign( {
        port : port,
        verbose : true
    }, options ) // But update them with the actual options given.
    // Create the server:
    const server = http.createServer( ( req, res ) => {
        // const parsedUrl = url.parse( req.url )
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`)
        let pathname = `.${parsedUrl.pathname}`
        const ext = path.parse( pathname ).ext
        const extensionToMime = {
            '.ico'  : 'image/x-icon',
            '.html' : 'text/html',
            '.js'   : 'text/javascript',
            '.json' : 'application/json',
            '.css'  : 'text/css',
            '.png'  : 'image/png',
            '.jpg'  : 'image/jpeg',
            '.wav'  : 'audio/wav',
            '.mp3'  : 'audio/mpeg',
            '.svg'  : 'image/svg+xml',
            '.pdf'  : 'application/pdf',
            '.doc'  : 'application/msword'
        };
    
        fs.exists( pathname, exist => {
            // if no such file
            if( !exist ) {
                if ( options.verbose )
                    console.log( `Request: ${req.url}  Response: 404` )
                res.statusCode = 404
                res.end( `File ${pathname} not found!` )
                return
            }
        
            // if directory search for index file matching the extention
            if ( fs.statSync( pathname ).isDirectory() )
                pathname += '/index' + ext
        
            // read file from file system
            fs.readFile( pathname, ( err, data ) => {
                if ( err ) {
                    // error getting file
                    if ( options.verbose )
                        console.log( `Request: ${req.url}  Response: 500` )
                    res.statusCode = 500
                    res.end( `Error getting the file: ${err}.` )
                } else {
                    // found; send type and data
                    if ( options.verbose )
                        console.log( `Request: ${req.url}  Response: ${extensionToMime[ext]}` )
                    res.setHeader( 'Content-type', extensionToMime[ext] || 'text/plain' )
                    res.end( data )
                }
            } )
        } )

    } )
    // Start the server, or give a useful error if you can't:
    server.on( 'error', err => {
        if ( /address already in use/.test( `${err}` ) ) {
            console.log( `
Cannot launch test server in which to run unit tests:
A test server is already running on port ${options.port}.
Perhaps you have one running in another terminal?
            ` )
            process.exit()
        } else {
            throw err
        }
    } )
    server.listen( options.port )
    if ( options.verbose )
        console.log( `Listening on port ${port}` )
}

module.exports = { startServer }
