
### Simple Note-Keeping With Live-Search and Text Files Backend

## Functional Status

* All working.
* Minor UI tweaks might be a good idea [tm].

## Overview

* Intended as an alternative to Google Keep, one that can be run locally and integrates nicely with version control systems (ie. operates only on simple text files, which can then be exported, converted, grepped at will).
* Uses simple text files as backend storage.
  * Must be stored in `repo/`.
  * Subdirs are allowed.
  * Everything starting with a dot ('.') is ignored, incl. directories. All files larger than 1 MB are being ignored, too. Links are *not* followed.
* Uses [Solr](https://solr.apache.org/) for *live search*. Beware: Solr is a bit of bloatware, but it's also doing everything we need. If you find a leaner substring indexer, you are welcome to add the backend support for it.
* [Node.js](https://nodejs.org/) server script feeds the Solr indexer at startup (using [solr-client](https://github.com/lbdremy/solr-node-client#readme)) with all files currently in the repository. It also submits to solr every update it writes to that repository and keeps it up-to-date.
* The [jQuery/Ajax client](https://jquery.com/) directly talks to Solr to get live search results. Only writes (note updates/deletions) go to the Node.js server. The jQuery/Ajax client's files are also served through the Node.js server.
* Supported query syntax:
  * all search terms are combined using logical *AND*.
  * all search terms are evaluated as substring matches.
  * prepending a minus character ('-') implies logical *AND NOT*.
  * grouping is *not* supported.
  * The search expression needs at least one term of length 3+.
* [KISS](https://en.wikipedia.org/wiki/KISS_principle)
* Simple text files as backend. No structuring whatsoever. First line of each note is the informal title and storage filename.
* No tag cloud. Tag notes by adding keywords at the end.

## Changes & Remarks

* This project has been derived in parts from [Ajax Solr](https://github.com/evolvingweb/ajax-solr), but has since been completely rewritten.
* Out-of-order responses are prevented by calling abort() on a potentially running async request when the user issues a new live-search request (ie. changes the search field). Also, the result display update/relayout timer gets cancelled.
* Everything that's not needed has been stripped out (jQuery UI, RequireJS).
* JQuery has been updated and [HE](https://github.com/mathiasbynens/he) added.
* CSS supports browser dark mode.
* Added [nunjucks](https://mozilla.github.io/nunjucks/templating.html) templating system to be able to switch js include tags in `index.html` between minified and dev sources depending on the command line switch `--prod`.
* Added [live-reload](https://www.npmjs.com/package/livereload) for instant css updates and automatic page refreshes. Enable via `--livereload`. Or simply `npm run dev`.
* Switched over from the strange RequireJS loading and init system to a clean, simple, straight-forward class-based flat initialization. 'Main program' is now in src/client.js and the js loading sequence is defined in `views/index.html` (from where also the minify process extracts it). This rewrite allows the use of type checking without having to migrate to TypeScript.

## Installation

* Node.js server:
  * `node server.js [-h]`
  * Check `--help`and `package.json` for available `npm run <opt>` options.
  * Alternatively, for development:
    * `npm install nodemon -g`
    * `nodemon server.js [-h]`
    * or simply `npm run dev`
  * For prod:
    * `npm run minify` minifies css and js using [Uglify-JS](https://github.com/mishoo/UglifyJS) and [uglifycss](https://www.npmjs.com/package/uglifycss).
    * `npm run prod`
    * That will enable the `--prod` flag, which in turn will redirect css and js loading to the `build/` dir where the minified css and js files get written to.
  * Use the `--help` option to display a current list of available arguments.
  * If all went right, the frontend should be accessible at http://localhost:3000 now.
* [Solr 8](https://solr.apache.org/downloads.html):
  * Remove `X-Content-Type-Options` section from jetty.xml (but be aware of the consequences depending on your use case)
  * `solr[.cmd] start`
  * `solr[.cmd] create_core -c notes`
  * You can start solr automatically at login by:
     * Using docker (?).
     * Using [Cygwin](https://www.cygwin.com/) screen package (Windows 10):
       * Install Cygwin. Install `screen` package.
       * Open autostart folder via `win-r`, then enter `shell:startup`.
       * Link `solr-autostart.cmd` into that folder.
       * The script assumes that the `solr.cmd` control script is in `%LOCALAPPDATA%\solr\bin`, ie. the top directory of the unpacked solr distribution has been renamed to `solr` (version number removed) and moved to `%LOCALAPPDATA%`.
       * Optionally, set the link's properties to start the window minimized (it will only show for a second anyways).
       * You can check the server by starting the Cygwin command line (ie. bash), then enter `screen -r` to attach to the solr console. Press `ctrl-a, d` to detach and leave it alone. Use `screen -ls` to show a list of running screen sessions.
       * The administrative frontend should be running at http://localhost:8983 now.
* Optional: generate the favicon (needs [ImageMagick 7](https://imagemagick.org/index.php) - available via Cygwin on Windows 10): `magick -background transparent "favicon.svg" -define icon:auto-resize=16,24,32,48,64,72,96,128,256 build/favicon.ico`

## Continuous Integration

* See Github workflow.
* `npm run ci` (needs a running `notes` core -- see *Installation*)

## Development

* `npm run dev`
* `tsconfig.json` is there to enable type checking for JavaScript (works in VSCode). There is no intention to switch to TypeScript. Development cycles probably would be even faster using [GWT](http://www.gwtproject.org/). The same applies to `lib.d.ts`. It's essentially a better alternative to `//@ts-ignore`. In the optimal case, `npm i @types/<pkgname> --save-dev` is available.
* `__env_(prod|dev).js` contains the environment definitions. Beware that `DEBUG` and `PROD` variable ininitializations for `--prod` might be fake because they are overwritten in `uglify.js` to force the dead code elimination.

