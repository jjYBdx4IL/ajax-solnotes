
### Simple Note-Keeping With Live-Search and Text Files Backend For Your LAN

## Functional Status

* All working.
* Simple Google Keep Takeout import mechanism.
* `export.js` exports notes tagged with ",PUBLISH:CATEGORY:$catname" on the last line as markdown (ie. for publishing via [Hugo](https://gohugo.io/)). allowing you to instantly publish selected notes.
* No authorization mechanism. Intended for non-public, private use behind a firewall. Not multi-user friendly because there is currently no mechanism to coordinate concurrent edits.
* Minor UI tweaks might be a good idea [tm].

## Overview

* Intended as an alternative to Google Keep, one that can be run locally and integrates nicely with version control systems (ie. operates only on simple text files, which can then be exported, converted, grepped at will).
* Uses simple text files as backend storage.
  * By default, notes get stored in `repo/` (see `--reporoot` switch).
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

### Short Version

* Move this folder where you want to have it installed, maybe `%LOCALAPPDATA%\ajax-solnotes`.
* `npm install`
* `npm run build`
* `npm run managed`
* To keep it running while logged in under Windows 10, one option is to install Cygwin+screen and use the autostart folder. See below.

### Long Version

* Node.js server:
  * `node server.js [-h]`
  * Check `--help`and `package.json` for available `npm run <opt>` options.
  * Alternatively, for development:
    * `npm install nodemon -g`
    * `nodemon server.js [-h]`
    * or simply `npm run dev`
  * For prod:
    * `npm run minify` minifies css and js using [Uglify-JS](https://github.com/mishoo/UglifyJS) and [uglifycss](https://www.npmjs.com/package/uglifycss).
    * `npm run build` will do the above, and it will also clean and recreate the build directory before starting.
    * `npm run prod`
    * That will enable the `--prod` flag, which in turn will redirect css and js loading to the `build/` dir where the minified css and js files get written to.
  * Use the `--help` option to display a current list of available arguments.
  * If all went right, the frontend should be accessible at http://localhost:3000 now.
  * Use the `--reporoot` option to specify a custom notes repository directory. By default, `repo/` at the server.js location will be used.
* [Solr 8](https://solr.apache.org/downloads.html):
  * The `--managesolr` server.js flag performs all of the following for you. It will make the server manage its own Solr instance in `solr/`. Please note that this option uses special capabilities of the OpenJDK *v12+* JVM to reduce the memory footprint of the Solr instance dramatically and is therefore not compatible with earlier releases.
  * Remove `X-Content-Type-Options` section from jetty.xml (but be aware of the consequences depending on your use case)
  * `solr[.cmd] start`
  * `solr[.cmd] create_core -c notes`
  * You can start solr automatically at login by:
     * Using docker (?).
     * Using [Cygwin](https://www.cygwin.com/) screen package (Windows 10):
       * Install Cygwin. Install `screen` package.
       * Open autostart folder via `win-r`, then enter `shell:startup`.
       * Link `ajax-solnotes-autostart.cmd` into that folder and add the NOTESREPO *user* environment variable. The repo directory must exist. You can also just write your notes repository directory into the autostart cmd file instead.
       * The script assumes that the `solr.cmd` control script is in `%LOCALAPPDATA%\solr\bin`, ie. the top directory of the unpacked solr distribution has been renamed to `solr` (version number removed) and moved to `%LOCALAPPDATA%`.
       * Optionally, set the link's properties to start the window minimized (it will only show for a second anyways).
       * You can check the server by starting the Cygwin command line (ie. bash), then enter `screen -r` to attach to the solr console. Press `ctrl-a, d` to detach and leave it alone. Use `screen -ls` to show a list of running screen sessions.
       * The administrative frontend should be running at http://localhost:8983 now.

## Continuous Integration

* See Github workflow.
* `npm run test`

## Development

* `npm run dev`
* Primary development environment is Cygwin (bash command line) under Windows 10 + VSCode (editor).
* `tsconfig.json` is there to enable type checking for JavaScript (works in VSCode). There is no intention to switch to TypeScript. Development cycles probably would be even faster using [GWT](http://www.gwtproject.org/). The same applies to `lib.d.ts`. It's essentially a better alternative to `//@ts-ignore`. In the optimal case, `npm i @types/<pkgname> --save-dev` is available.
* `__env_(prod|dev).js` contains the environment definitions. Beware that `DEBUG` and `PROD` variable ininitializations for `--prod` might be fake because they are overwritten in `uglify.js` to force the dead code elimination.



--
devel/js/ajax-solnotes@7954
