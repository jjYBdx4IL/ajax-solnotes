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
const { notDeepEqual } = require('assert');

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
        var note;
        try {
            note = loadNote(noteId);
        } catch (error) {
            reject(error);
        }
        // always submit notes with a modified date to the index so we can sort them by activity
        if (note.lmod_dt === void 0) {
            note.lmod_dt = note.created_dt;
        }
        client.add(note, function(err,obj){
            if(err) {
                console.log("failed to update index: ", err);
                reject("failed to update index");
            } else {
                if (doSync) {
                    client.softCommit(function(err,res) {
                        if(err) {
                            console.log("index softCommit failed: ", err);
                            reject("index softCommit failed");
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

const noteEol = "\n";
const noteLmodHeader = "Last-Modified";
const noteCreatedHeader = "Created";

// create note editor session id -> successfully created note id and timestamp for cleanup
var createSessionIds = new Map();
var createSessionIdStaleSecs = 12;
var createSessionIdsPruner = function() {
    var now = new Date().getTime()/1000;
    createSessionIds.forEach(function(value, key) {
        if ((now - value.created) > createSessionIdStaleSecs) {
            createSessionIds.delete(key);
        }
    })
}
var createSessionIdsPrunerIval = setInterval(createSessionIdsPruner, createSessionIdStaleSecs/3 * 1000);

// for now, only use sync ops when storing the note to avoid having to deal with concurrency issues for no reason
function createUniqueNoteId(sessionId) {
    if(createSessionIds.has(sessionId)) {
        return createSessionIds.get(sessionId).noteId;
    }

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
    createSessionIds.set(sessionId, {noteId: noteIdExt, created: new Date().getTime()/1000});
    return noteIdExt;
}

function cvtNoteToOnDiskFormat(note) {
    var data = '';
    if (note.id === void 0 || note.id === null) {
        throw Error("no note id");
    }
    if (!isValidNoteIdFormat(note.id)) {
        throw Error("invalid note id: " + note.id);
    }
    if (note.created_dt === void 0 || note.created_dt === null) {
        throw Error("no note created_dt value, note id: " + note.id);
    }
    if (isNaN(Date.parse(note.created_dt))) {
        throw Error("invalid note created_dt value: " + note.created_dt + ", note id: " + note.id);
    }
    data += noteCreatedHeader + ": " + note.created_dt + noteEol;
    if (note.lmod_dt !== void 0 && note.lmod_dt !== null) {
        if (isNaN(Date.parse(note.lmod_dt))) {
            throw Error("invalid note lmod_dt value: " + note.lmod_dt + ", note id: " + note.id);
        }
        data += noteLmodHeader + ": " + note.lmod_dt + noteEol;
    }
    // end of header (empty line)
    data += noteEol;
    if (note.text === void 0 || note.text === null) {
        throw Error("invalid note: no text entry, note id: " + note.id);
    }
    data += note.text;
    return data;
}

function isValidNoteIdFormat(noteId) {
    return /^[0-9_A-Za-z./-]+$/.test(noteId) && !/\.\./.test(noteId) && !/\/$/.test(noteId) && !/\/\./.test(noteId);
}

function loadNote(noteId) {
    var note = {id: noteId};
    var data = fs.readFileSync(path.join(repoRoot, noteId)).toString();
    var sepOffset = data.indexOf("\n\n");
    if (sepOffset == -1) {
        throw Error("no header found: " + noteId);
    }
    var bodyOffset = sepOffset + 2;
    var header = data.substring(0, bodyOffset-1); // include final "\n"
    note.text = data.substring(bodyOffset);
    if (/\r/.test(header)) {
        throw Error("malformed header contains bad eol type");
    }
    var offset = 0;
    var headerLines = [];
    while (offset < sepOffset) {
        var eol = header.indexOf("\n", offset);
        headerLines.push(header.substring(offset, eol));
        offset = eol+1;
    }

    headerLines.forEach(function(line, key, hl) {
        var m = line.match(/([^:]+):(.*)/);
        if (m === null) {
            throw Error("bad header line: " + line);
        }
        var key = m[1];
        var val = m[2].trim();
        switch(key) {
            case "Created":
                note.created_dt = val;
                break;
            case "Last-Modified":
                note.lmod_dt = val;
                break;
            default:
                throw Error("bad header key: " + line);
        }
    });
    return note;
}

// http://expressjs.com/en/api.html
app.use(express.json());
app.param('noteId', function (req, res, next, noteId) {
    if (!isValidNoteIdFormat(noteId)) {
        res.status(500).end();
        return;
    }
    res.locals.noteId = noteId;
    next()
})
app.param('sessionId', function (req, res, next, sessionId) {
    if (!sessionId || sessionId.length < 5) {
        res.status(500).end();
        return;
    }
    res.locals.sessionId = sessionId;
    next()
})
app.post('/c/:sessionId', express.json(), function (req, res){  
    console.log('req received: ', req.body);
    res.contentType = 'application/json';
    var reply = {status: 0, error: ''};
    var note = req.body.note;
    note.id = createUniqueNoteId(res.locals.sessionId);
    note.created_dt = new Date().toISOString();
    var onDiskData;
    try {
        onDiskData = cvtNoteToOnDiskFormat(note);
    } catch(e) {
        console.log(e);
        reply.status = 2;
        reply.error = e;
        res.status(500).send(JSON.stringify(reply)).end();
        return;
    }
    try {
        fs.writeFileSync(path.join(repoRoot, note.id), onDiskData);
    } catch(e) {
        console.log(e);
        reply.status = 2;
        reply.error = "failed to write note to disk";
        res.status(500).send(JSON.stringify(reply)).end();
        return;
    }
    // set note id on client after the note has been saved to disk.
    // this allows for an immediate retry to update the index if the index submission failed.
    reply.noteId = note.id;

    submitToIndex(note.id, true).then(function() {
            res.send(JSON.stringify(reply)).end();
        }, function(error) {
            reply.status = 2;
            reply.error = error;
            res.status(500).send(JSON.stringify(reply)).end();
        }
    );
 });
 app.get('/r/:noteId', express.json(), function (req, res){  
    var noteId = res.locals.noteId;
    res.contentType = 'application/json';
    var reply = {status: 0, error: ''};
    if (!fs.existsSync(path.join(repoRoot, noteId))) {
        reply.status = 1;
        res.status(404).send(JSON.stringify(reply)).end();
        return;
    }
    try {
        reply.note = loadNote(noteId);
    } catch (e) {
        if (argv.verbose) {
            console.log(e);
        }
        reply.status = 1;
        res.status(500).send(JSON.stringify(reply)).end();
        return;
    }
    res.send(JSON.stringify(reply)).end();
});
app.post('/u/', express.json(), function (req, res){  
    console.log('req received: ', req.body);
    res.contentType = 'application/json';
    var reply = {status: 0, error: ''};
    var noteId = req.body.note.id;

    var note;
    try {
        note = loadNote(noteId);
    } catch (e) {
        if (argv.verbose) {
            console.log(e);
        }
        reply.status = 1;
        res.status(500).send(JSON.stringify(reply)).end();
        return;
    }

    note.text = req.body.note.text;
    note.lmod_dt = new Date().toISOString();
    var onDiskData;
    try {
        onDiskData = cvtNoteToOnDiskFormat(note);
    } catch(e) {
        console.log(e);
        reply.status = 2;
        reply.error = e;
        res.status(500).send(JSON.stringify(reply)).end();
        return;
    }
    try {
        fs.writeFileSync(path.join(repoRoot, note.id), onDiskData);
    } catch(e) {
        console.log(e);
        reply.status = 2;
        reply.error = "failed to write note to disk";
        res.status(500).send(JSON.stringify(reply)).end();
        return;
    }

    submitToIndex(note.id, true).then(function() {
            res.send(JSON.stringify(reply)).end();
        }, function(error) {
            reply.status = 2;
            reply.error = error;
            res.status(500).send(JSON.stringify(reply)).end();
        }
    );
});
app.post('/d/:noteId', express.json(), function (req, res){  
    console.log('req received: ', req.body);
    var noteId = res.locals.noteId;
    res.contentType = 'application/json';
    var reply = {status: 0, error: ''};

    var np = path.join(repoRoot, noteId);
    client.deleteByID(noteId, function(err,res) {
        if(err) {
            console.log("index delete failed: ", err, res);
            reply.error = "index removal failed";
        } else {
            if (fs.existsSync(np)) {
                try {
                    fs.unlinkSync(np);
                } catch (err2) {
                    console.log("disk delete failed: ", err2);
                    reply.error = "deletion failed";
                }
            }
        }
        if (reply.error) {
            reply.status = 1;
            res.status(500);
        }
        res.send(JSON.stringify(reply)).end();
    });
 });
 app.get('*', express.static(__dirname))
