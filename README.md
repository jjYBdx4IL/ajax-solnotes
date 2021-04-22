
### Simple Note-Keeping With Live-Search and Text Files Backend

## Overview

* Intended as an alternative to Google Keep, one that can be run locally and integrates nicely with version control systems (ie. operates only on simple text files, which can then be exported, converted, grepped at will).
* Uses simple text files as backend storage.
  * Must be stored in `repo/`.
  * Subdirs are allowed.
  * Everything starting with a dot ('.') is ignored, incl. directories. All files larger than 1 MB are being ignored, too. Links are *not* followed.
* Uses [Solr](https://solr.apache.org/) for *live search*. Beware: Solr is a bit of bloatware, but it's also doing everything we need. If you find a leaner substring indexer, you are welcome to add the backend support for it.
* [Node.js](https://nodejs.org/) server script feeds the Solr indexer at startup with all files currently in the repository. It also submits to solr every update it writes to that repository and keeps it up-to-date.
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

## Changes

* This project has been derived in large parts from [Ajax Solr](https://github.com/evolvingweb/ajax-solr).
* Added handling (possibility to skip) of out-of-order responses. Due to the nature of async requests, responses can come in out of order. And we certainly do not want to overwrite a current result with outdated ones from a previous request. For that purpose, there have been two changes applied:
  * the introduction of a monotonically increasing requestSerial (incremented before starting the async request in the doRequest function), which will be returned in the afterRequest call.
  * The afterRequest call now also returns the response data instance. Storing the response data in the manager object (as it was done previously) introduces out-of-order violations. Together with the requestSerial, each module now has the ability to decide on its own what to do with stale responses.
* Everything that's not needed has been stripped out.
* Updated external JavaScript assets to the current stable version (jQuery/UI, RequireJS).
* CSS supports browser dark mode.

## Installation

* Generate the favicon (optional, needs imagemagick 7 - available via Cygwin on Windows 10): `magick -background transparent "favicon.svg" -define icon:auto-resize=16,24,32,48,64,72,96,128,256 favicon.ico`
* Node.js server:
  * `node server.js [-h]`
  * Alternatively, for development:
    * `npm install nodemon -g`
    * `nodemon server.js [-h]`
  * Use the `--help` option to display a current list of available arguments.
  * If all went right, the frontend should be accessible at http://localhost:3000 now.
* [Solr 8](https://solr.apache.org/downloads.html):
  * Remove `X-Content-Type-Options` section from jetty.xml (but be aware of the consequences depending on your use case)
  * `solr.cmd create_collection -c notes`
  * `solr.cmd start`
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
  
## TODO

* scan only repo/.
* implement note editing.
* improve GUI display.
* support subversion:
  * rename only files that haven't been added to the repository yet. (svn status yields `? ...`).
* Use first line of each note to determine its filename.

## MAYDO

* travis
* add node.js server to solr-autostart.cmd?
* Rakefile/javascript compression
* support large note repositories by adding an incremental initial sync mechanism?
* Allow Solr search queries? Probably not. One can use the Solr administration frontend for that purpose.
