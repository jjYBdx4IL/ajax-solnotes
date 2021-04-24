// start with 'node server.js [-h]'
// (or with auto-restart on source changes: npm install nodemon -g; nodemon server.js)
//
// client-side solr client: https://github.com/evolvingweb/ajax-solr
//
// server-side solr client: https://www.npmjs.com/package/solr-client
//                          https://github.com/lbdremy/solr-node-client
//
// https://www.slideshare.net/netseven/apache-solr-ajax-solr?next_slideshow=1
// https://www.slideshare.net/lucenerevolution/make-your-gui-shine-with-ajax-solr
//
// curl "http://localhost:8983/solr/notes/select?indent=on&q=text:*&rows=10&start=3"
//
const express = require('express');
const os = require('os');
var fs = require('fs');
var path = require('path');
var _url = require('url');
var qs = require('querystring');
var glob = require("glob")
const solr = require('solr-client');
const yargs = require('yargs');
var PromisePool = require('es6-promise-pool');

const noteSuffix = ".txt";
const repoRoot = path.join(__dirname, "repo");

// https://nodejs.org/en/knowledge/command-line/how-to-parse-command-line-arguments/
const argv = yargs
    .command('port', 'server port', {
        serverport: {
            description: 'server port',
            alias: 'p',
            type: 'number',
        }
    })
    .default('serverport', 3000)
    .command('servername', 'address to bind the server to', {
        servername: {
            alias: 'n',
            type: 'string'
        }
    })
    .default('servername', '127.0.0.1')
    .option('reset', {
        alias: 'r',
        description: 'rebuild the search index',
        type: 'boolean',
    })
    .option('skipimport', {
        description: 'skip index submission at start',
        type: 'boolean',
    })
    .command('maxfilesize', 'maximum file size accepted during startup indexing run (in kb)', {
        maxfilesize: {
            type: 'number',
        }
    })
    .default('maxfilesize', 0, '(disabled)')
    .option('logging', {
        description: 'enable logging',
        type: 'boolean',
    })
    .option('livereload', {
        description: 'enable live-reload for client',
        type: 'boolean',
    })
    .option('verbose', {
        alias: 'v',
        description: 'be more verbose',
        type: 'boolean',
    })
    .help()
    .alias('help', 'h')
    .argv;



// Create a client (collection ("core") name: "notes"; create with: "solr.cmd create_core -c notes").
// Expects solr at localhost:8983.
const client = solr.createClient({core : 'notes'});

const app = express();
function startApp() {
    app.listen(argv.serverport, argv.servername, () => {
        console.log(`Listening at http://${argv.servername}:${argv.serverport}`)
    })
}

if (argv.reset) {
    client.deleteAll();
    client.commit();
    console.log("Index resetted.");
}

function createErrorPromise(errmsg) {
    return new Promise(function (resolve, reject) {
        reject(errmsg);
    })
}

var submitToIndex = function (noteId, doSync=false) {
    return new Promise(function (resolve, reject) {
        if(argv.verbose)
            console.log("adding to index: " + noteId);
        // use relative url-ized path as id
        var content = fs.readFileSync(path.join(repoRoot, noteId));
        client.add({ id : noteId, text : content.toString()}, function(err,obj){
            if(err) {
                console.log("failed to update index: ", err);
                reject("failed to update index");
            } else {
                if (doSync) {
                    client.softCommit(function(err,res) {
                        if(err) {
                            console.log("index commit failed: ", err);
                            reject("index commit failed");
                        } else {
                            resolve(noteId);
                        }
                    });
                } else {
                    resolve(noteId);
                }
            }
        });
    })
}

if (!argv.skipimport) {
    // recurse repo/ dir and find files to add to the index
    var filelist = glob.sync('**', {cwd: repoRoot, follow: false, nodir: true});

    // remove too large files
    if (argv.maxfilesize > 0) {
        var _filelist = [];
        for (var i=0; i<filelist.length; i++) {
            var fn = filelist[i];
            var stat = fs.statSync(path.join(repoRoot, fn));
            if (!stat) {
                throw Error("stat failed for " + fn);
            }
            if(stat.size <= argv.maxfilesize) {
                _filelist.push(fn);
            }
        }
        filelist = _filelist;
    }

    // use work queues to limit the number of concurrent index submissions
    var filelistIndex = 0;
    var promiseProducer = function () {
        if (filelistIndex < filelist.length) {
            return submitToIndex(filelist[filelistIndex++])
        } else {
            return null
        }
    }
    var pool = new PromisePool(promiseProducer, os.cpus().length);

    // start submitting the notes to the index
    console.log("Indexing...");
    pool.start()
    .then(function () {
        // make sure the changes to the index are made visible ...
        client.commit(function() {
            console.log("Added " + filelist.length + " files to the index.");
            filelist = null;
            // ... before finally starting the server port
            startApp();
        }, function (error) {
            throw error;
        });
    });
} else {
    startApp();
}


if (argv.livereload) {
    const livereload = require("livereload");
    const connectLivereload = require("connect-livereload");

    // open livereload high port and start to watch public directory for changes
    const liveReloadServer = livereload.createServer();
    liveReloadServer.watch(__dirname);

    // ping browser on Express boot, once browser has reconnected and handshaken
    liveReloadServer.server.once("connection", () => {
        setTimeout(() => {
            liveReloadServer.refresh("/");
        }, 100);
    });

    app.use(connectLivereload());
}

if (argv.logging) {
    const morgan = require('morgan');
    app.use(morgan('dev'));
}

// for now, only use sync ops when storing the note to avoid having to deal with concurrency issues for no reason
function createUniqueNoteId() {
    // UTC time in ISO8601 format
    var noteId = new Date().toISOString();
    // remove milliseconds and more
    noteId = noteId.replace(/\..*$/g, '');
    noteId = noteId.replace(/[^T0-9]/g, '');
    var noteIdExt = noteId + noteSuffix;
    var i = 0;
    while (fs.existsSync(path.join(repoRoot, noteIdExt))) {
        noteIdExt = noteId + "_" + i++ + noteSuffix;
    }
    return noteIdExt;
}

function storeNote(note) {
    console.log(note);
    try {
        fs.writeFileSync(path.join(repoRoot, note.id), note.content);
    } catch(e) {
        console.log(e);
        return createErrorPromise("failed to store note");
    }
    return new Promise(function (resolve, reject) {
        submitToIndex(note.id, true).then(function() {
                resolve(note.id);
            }, function(error) {

                reject(error);
            }
        );
    });
}

// http://expressjs.com/en/api.html
app.use(express.json());
app.get('*', express.static(__dirname))
app.post('*', express.json(), function (req, res){  
    console.log('req received: ', req.body);
    res.contentType = 'application/json';
    var reply = {status: 0, error: ''};
    var note = req.body;
    if (note.content === void 0 || note.content.length == 0) {
        reply.status = 1;
        reply.error = "no content";
        res.status(500).send(JSON.stringify(reply)).end();
    }
    note.id = note.id || createUniqueNoteId();
    reply.noteId = note.id;
    storeNote(note).then(function() {
        res.send(JSON.stringify(reply)).end();
    }, function(error) {
        reply.status = 2;
        reply.error = error;
        res.status(500).send(JSON.stringify(reply)).end();
    });
 });