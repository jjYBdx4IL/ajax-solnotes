
### Simple Note-Keeping With Live-Search and Text Files Backend

## Functional Status

* Implemented: live-search, add note.
* tbd: edit note, make links accessible, delete note.

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

* This project has been derived in large parts from [Ajax Solr](https://github.com/evolvingweb/ajax-solr).
* Out-of-order responses are prevented by calling abort() (`AbstractManager::cancelAllRequests()`)on all open async requests when the user issues a new live-search request (ie. changes the search field). Also, the result display update timer gets cancelled (`ResultWidget::disableUntilNextResponse()`).
* Everything that's not needed has been stripped out.
* Updated external JavaScript assets to the current stable version (jQuery/UI, RequireJS).
* CSS supports browser dark mode.

## Installation

* Node.js server:
  * `node server.js [-h]`
  * Alternatively, for development:
    * `npm install nodemon -g`
    * `nodemon server.js [-h]`
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
* Optional: generate the favicon (optional, needs [ImageMagick 7](https://imagemagick.org/index.php) - available via Cygwin on Windows 10): `magick -background transparent "favicon.svg" -define icon:auto-resize=16,24,32,48,64,72,96,128,256 favicon.ico`

## Continuous Integration

* See Github workflow.
* `npm run ci` (needs a running `notes` core -- see *Installation*)

## Development

* `npm run dev`

## TODO

* implement note editing.
* improve GUI display.
* add creation/last-modified dates to notes and sort search results by last-modified.
* refresh search results on leaving the editor

## MAYDO

* add node.js server to solr-autostart.cmd?
* Rakefile/javascript compression
* support large note repositories by adding an incremental initial sync mechanism?

## DONE

* scan only repo/.
* Simple CI test.

