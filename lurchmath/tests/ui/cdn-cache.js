/**
 * A local cache of the third-party CDN resources the Lurch app loads, so the
 * Playwright suite does not depend on the network (or its moods).
 *
 * Why: the app boots by downloading TinyMCE from cdnjs, and every Playwright
 * test runs in a fresh browser context with an empty cache, so a full suite
 * run re-downloads everything dozens of times.  One stalled CDN connection
 * left a test stuck on the splash screen until it timed out - an
 * intermittent, hard-to-reproduce failure.  (Diagnosed 2026-07-22 from a
 * failure trace whose network log showed the tinymce.min.js request never
 * completing.)
 *
 * How it works:
 *
 *  * As a Playwright `globalSetup` (see playwright.config.js), the default
 *    export downloads the official TinyMCE release tarball from the npm
 *    registry ONCE, into the gitignored folder `tests/ui/.cache/`, keyed by
 *    the version number read from the CDN URL in editor.js so the cache can
 *    never drift from what the app loads.  TinyMCE is many files (theme,
 *    plugins, skins, icons) fetched lazily from the CDN base URL, which is
 *    why we take the whole package rather than one file.
 *  * `installCdnCache( page )`, called by LurchPage.boot() before the app
 *    loads, reroutes every request to the CDN hosts below: TinyMCE requests
 *    are served from the extracted package, and anything else (the embed
 *    listener's showdown, font CSS, ...) is fetched from the network the
 *    first time it is ever requested, saved in the cache, and served from
 *    disk forever after.
 *
 * So the first suite run on a fresh clone downloads each resource once, and
 * every run after that touches no third-party server at all.  Delete
 * `tests/ui/.cache/` to reset.
 */

import {
    existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync
} from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const here = dirname( fileURLToPath( import.meta.url ) )
const cacheDir = join( here, '.cache' )

// The TinyMCE version the app actually loads, read from its CDN URL in
// editor.js (a version bump there automatically refreshes this cache)
const editorSource = readFileSync( join( here, '..', '..', 'editor.js' ), 'utf8' )
const tinyMCEMatch = /cdnjs\.cloudflare\.com\/ajax\/libs\/tinymce\/(\d+\.\d+\.\d+)\//
    .exec( editorSource )
if ( !tinyMCEMatch ) throw new Error(
    'cdn-cache.js could not find the TinyMCE CDN URL in editor.js' )
const tinyMCEVersion = tinyMCEMatch[1]
const tinyMCEPathPrefix = `/ajax/libs/tinymce/${tinyMCEVersion}/`
const tinyMCEDir = join( cacheDir, `tinymce-${tinyMCEVersion}`, 'package' )

// the third-party hosts the app loads resources from during tests
const cachedHosts = [
    'https://cdnjs.cloudflare.com',
    'https://cdn.jsdelivr.net'
]

// content types by file extension, for serving cached files
const contentTypes = {
    '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json',
    '.svg' : 'image/svg+xml', '.png' : 'image/png', '.gif' : 'image/gif',
    '.woff' : 'font/woff', '.woff2' : 'font/woff2', '.ttf' : 'font/ttf',
    '.map' : 'application/json'
}
const contentTypeFor = file =>
    contentTypes[extname( file )] || 'application/octet-stream'

// the cache file for a URL: TinyMCE requests map into the extracted npm
// package, everything else is cached on demand under its host name
const cacheFileFor = url => {
    if ( url.hostname == 'cdnjs.cloudflare.com'
      && url.pathname.startsWith( tinyMCEPathPrefix ) )
        return join( tinyMCEDir, ...url.pathname
            .slice( tinyMCEPathPrefix.length ).split( '/' ) )
    return join( cacheDir, 'on-demand', url.hostname,
        ...url.pathname.split( '/' ) )
}

/**
 * Playwright global setup: download and extract the TinyMCE release tarball
 * into the cache, once per version.  (The npm registry package for tinymce
 * has the same file layout that cdnjs serves.)
 */
export default async function globalSetup () {
    if ( existsSync( join( tinyMCEDir, 'tinymce.min.js' ) ) ) return
    const url =
        `https://registry.npmjs.org/tinymce/-/tinymce-${tinyMCEVersion}.tgz`
    console.log( `Downloading TinyMCE ${tinyMCEVersion} into tests/ui/.cache/`
        + ` (one-time setup for the test suite)...` )
    const response = await fetch( url )
    if ( !response.ok ) throw new Error(
        `could not download ${url}: ${response.status} ${response.statusText}` )
    const parent = dirname( tinyMCEDir )
    rmSync( parent, { recursive : true, force : true } )
    mkdirSync( parent, { recursive : true } )
    const tarball = join( parent, 'tinymce.tgz' )
    writeFileSync( tarball, Buffer.from( await response.arrayBuffer() ) )
    execSync( `tar -xzf "${tarball}" -C "${parent}"` )   // extracts package/
    rmSync( tarball )
    if ( !existsSync( join( tinyMCEDir, 'tinymce.min.js' ) ) ) throw new Error(
        'the TinyMCE tarball did not contain package/tinymce.min.js' )
}

/**
 * Reroute a page's requests to the CDN hosts above so they are served from
 * the local cache, fetching and caching any file not yet present (so the
 * first-ever suite run populates the cache and later runs are offline).
 *
 * @param {Page} page - a Playwright page, before the app is loaded in it
 */
export const installCdnCache = async page => {
    for ( const host of cachedHosts )
        await page.route( host + '/**', async route => {
            if ( route.request().method() != 'GET' ) return route.fallback()
            const file = cacheFileFor( new URL( route.request().url() ) )
            if ( existsSync( file ) )
                return route.fulfill( {
                    body : readFileSync( file ),
                    contentType : contentTypeFor( file )
                } )
            // not cached yet: fetch it once for real, cache it (atomically,
            // in case parallel workers race to the same file), and serve it
            const response = await route.fetch()
            if ( response.ok() ) {
                mkdirSync( dirname( file ), { recursive : true } )
                const temp = `${file}.${process.pid}.tmp`
                writeFileSync( temp, await response.body() )
                renameSync( temp, file )
            }
            return route.fulfill( { response } )
        } )
}
