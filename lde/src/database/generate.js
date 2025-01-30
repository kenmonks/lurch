
/**
 * This file recursively finds and reads all .putdown and .smackdown files in
 * all subfolders of the src/database folder and stores them in one large JSON
 * object.  It then creates a JavaScript file that includes that full JSON
 * object as a * module-level constant, as well as several utility functions
 * for querying its contents.  Those functions appear (and are documented) in
 * footer.js.
 * 
 * Unlike most JavaScript files in this repository, this one is not intended
 * for use in the browser, but is a script to be run by Node.js.  To run it,
 * call "npm run build-db" from the repository root.  It generates the source
 * file src/database.js.
 * 
 * Each .putdown and .smackdown file must contain either exclusivly putdown
 * content (that is amenable to parsing by LogicConcept.fromPutdown(text)) or
 * smackdown content, respectively, or such content preceded by a YAML header,
 * as in the following example.
 * 
 * ---
 * language: yaml
 * example: true
 * ---
 * 
 * Such headers can be used to include other putdown files at the top of a
 * putdown file that contains the header, in the order specified, or include
 * either putdown or smackdown files at the top of the smackdown file
 * containing the header.  (But you cannot include smackdown files into putdown
 * files, since smackdown is a strict superset of putdown.)  They can use
 * relative paths (which are relative to the putdown file in question) or
 * absolute paths (which are resolved from the src/database/ folder).  Here is
 * an example.
 * 
 * ---
 * includes:
 *  - some/relative/path/file.putdown
 *  - /some/absolute/path/other.putdown
 * ---
 * 
 * Any other metadata can be stored in the YAML header and will be converted
 * to a JSON object when the file is read into the database.
 */

import fs from 'fs'
import path from 'path'
import jsyaml from 'js-yaml'

// traverse filesystem to find all putdown/smackdown files in database folder
const filesWithExtension = ( folder, extension ) =>
    fs.readdirSync( folder ).filter( filename =>
        filename.endsWith( '.' + extension ) )
const absoluteFilesWithExtension = ( folder, extension ) =>
    filesWithExtension( folder, extension )
        .map( file => path.join( folder, file ) )
const subfoldersIn = folder =>
    fs.readdirSync( folder, { withFileTypes : true } ).filter( folder =>
        folder.isDirectory() ).map( folder => folder.name )
const recur = folder => [
    ...absoluteFilesWithExtension( folder, 'putdown' ),
    ...absoluteFilesWithExtension( folder, 'smackdown' ),
    ...subfoldersIn( folder ).map( subfolder =>
        recur( path.join( folder, subfolder ) ) ).flat()
]
const baseFolder = import.meta.dirname // Old method: path.dirname( import.meta.url.substring( 7 ) )
const allFilenames = recur( baseFolder )
console.log( `Reading ${allFilenames.length} files ...` )

// for each file, read it and split out its YAML header (if any) into metadata
const database = allFilenames.map( filename => {
    // console.log( `Reading contents of ${filename}...` )
    const content = String( fs.readFileSync( filename ) )
    const yaml = /^---\n(?:.|\n)*\n---(?:\n|$)/.exec( content )
    return yaml ? {
        filename : filename,
        metadata : jsyaml.load( yaml[0].substring( 0, yaml[0].length-4 ) ),
        content : content.substring( yaml[0].length )
    } : {
        filename : filename,
        metadata : { },
        content : content
    }
} )

// process "includes" directives in YAML headers
console.log( 'Processing "includes" directives in YAML headers...' )
const getContent = filename => {
    const index = database.findIndex( entry => entry.filename == filename )
    return index == -1 ? null : database[index].content
}
database.forEach( entry => {
    if ( entry.metadata.includes ) {
        entry.original = entry.content
        entry.content = entry.metadata.includes.map( toInclude => {
            if ( entry.filename.endsWith( '.putdown' )
              && toInclude.endsWith( '.smackdown' ) ) {
                console.log( 'Error - cannot include smackdown into putdown:' )
                console.log( '  This file:', entry.filename )
                console.log( '  attempted to include this:', toInclude )
                process.exit( 1 )
            }
            const folder = path.isAbsolute( toInclude ) ?
                baseFolder : path.dirname( entry.filename )
            const filename = path.normalize( path.join( folder, toInclude ) )
            const included = getContent( filename )
            if ( included == null ) {
                console.log( 'Error - could not find an included file:' )
                console.log( '  This file:', entry.filename )
                console.log( '  attempted to include this:', toInclude )
                console.log( '  which resolved to:', filename )
                console.log( '  which was not found.')
                process.exit( 1 )
            }
            return included + '\n'
        } ).join( '' ) + entry.content
    }
} )

// clean up paths to be relative to baseFolder
database.forEach( entry =>
    entry.filename = entry.filename.substring( baseFolder.length ) )

// normalize paths to use forward slash
database.forEach( entry =>
    entry.filename = entry.filename.split( path.sep ).join( '/' )
)

// save to files as JSON and JavaScript
console.log( 'Reading footer.js...' )
const footer = String( fs.readFileSync(
    path.join( baseFolder, 'footer.js' ) ) )
const json = JSON.stringify( database, null, 2 )
console.log( 'Generating src/database.js...' )
// fs.writeFileSync( path.join( baseFolder, 'database.json' ), json )
fs.writeFileSync( path.join( baseFolder, '..', 'database.js' ), `

/////////////////////////////////////////////////
// DO NOT EDIT THIS SOURCE CODE FILE DIRECTLY. //
// IT IS AUTOGENERATED BY npm run build-db.    //
/////////////////////////////////////////////////

// Instead, edit database/footer.js, database/generate.js, or any of the
// .putdown or .smackdown files recursively stored in any subfolder of the
// database folder.

// This file begins with the database as a large JSON object,
// then ends with JavaScript code that provides access to it.

const testingDatabase = ${json}

${footer}
` )
console.log( 'Done.' )
