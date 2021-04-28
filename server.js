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
const async = require("async");
const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const glob = require("glob")
const yargs = require('yargs');
const PromisePool = require('es6-promise-pool');
const nunjucks = require('nunjucks');
const open = require('open');
const managedSolr = require('./src/server/ManagedSolr')
const solrUtils = require('./src/server/SolrUtils')
const noteStore = require('./src/server/NoteStore')

const buildRoot = path.join(__dirname, "build")

// https://nodejs.org/en/knowledge/command-line/how-to-parse-command-line-arguments/
const argv = yargs
    .option('managesolr', {
        description: 'let the server script manage its own solr installation (incl download)',
        type: 'boolean',
    })
    .default('managesolr', false)
    .option('prod', {
        description: 'production switch',
        type: 'boolean',
    })
    .default('prod', false)
    .option('force', {
        description: 'insist on insanity',
        alias: 'f',
        type: 'boolean',
    })
    .default('force', false)
    .option('solrUrl', {
        description: 'Solr service url (incl final "/select")',
        alias: 'u',
        type: 'string',
    })
    .default('solrUrl', 'http://127.0.0.1:8983/solr/notes/select')
    .option('serverport', {
        description: 'server port',
        alias: 'p',
        type: 'number',
    })
    .default('serverport', 3000)
    .option('servername', {
        description: 'address to bind the server to',
        alias: 'n',
        type: 'string'
    })
    .default('servername', '127.0.0.1')
    .option('stopafterimport', {
        alias: 's',
        description: 'do not start the server after pushing notes to the index',
        type: 'boolean',
    })
    .option('reset', {
        alias: 'r',
        description: 'rebuild the search index',
        type: 'boolean',
    })
    .option('skipimport', {
        description: 'skip index submission at start',
        type: 'boolean',
    })
    .option('maxfilesize', {
        description: 'maximum file size accepted during startup indexing run (in kb)',
        type: 'number',
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
    .option('reporoot', {
        description: 'primary notes storage location',
        type: 'string',
    })
    .default('reporoot', path.join(__dirname, "repo"))
    .option('portinc', {
        description: 'increment all ports by this number',
        type: 'number',
    })
    .default('portinc', 0)
    .option('gktoimport', {
        description: 'Google Keep Takeout import (specify source directory, will terminate after writing files to repo dir)',
        type: 'string'
    })
    .default('gktoimport', null, "disabled")
    .option('openurl', {
        description: 'open index.html in your browser after server start',
        type: 'boolean'
    })
    .help()
    .alias('help', 'h')
    .argv;

if (argv.stopafterimport && argv.skipimport) {
    throw Error("cannot use --skipimport and --stopafterimport at the same time");
}

if (!fs.existsSync(argv.reporoot) || !fs.statSync(argv.reporoot).isDirectory()) {
    throw Error(argv.reporoot + " must point to an existing directory")
}

if (argv.gktoimport && (!fs.existsSync(argv.gktoimport) || !fs.statSync(argv.gktoimport).isDirectory())) {
    throw Error(argv.gktoimport + " must point to an existing directory")
}

if (argv.prod) {
    console.log("Production mode enabled.");
}


noteStore.init(argv.reporoot)


//---------------------------------------------------------------------------------------
// Google Keep Takeout import
if (argv.gktoimport) {
    const gkti = require('./src/server/gkti')
    gkti.doImport(argv.gktoimport)
    console.log("Google Keep Takeout import complete, exit")
    process.exit(0)
}




console.log("Starting server in: " + __dirname)
console.log("Note repository root: " + argv.reporoot)

if (argv.portinc) {
    argv.serverport += argv.portinc
    const myurl = new URL(argv.solrUrl);
    myurl.port = "" + (parseInt(myurl.port) + argv.portinc)
    argv.solrUrl = myurl.toString()
    if (argv.verbose) {
        console.log("solrUrl changed port to: " + argv.solrUrl)
    }
}

console.log("Solr instance: " + argv.solrUrl + " ("  + (argv.managesolr ? "managed" : "unmanaged") + ")")
console.log("Live-reload: " + (argv.livereload ? "enabled" : "disabled"))

const serverUrl = `http://${argv.servername}:${argv.serverport}`
var solrClient = null



var execStack = [];

execStack.push(function(cb) {
    if (argv.managesolr) {
        managedSolr.init(path.join(__dirname, "solr"), new URL(argv.solrUrl), argv.verbose, cb);
        return
    }
    cb()
})

execStack.push(function(cb) {
    solrClient = solrUtils.createClientFromUrl(new URL(argv.solrUrl))
    cb()
})

execStack.push(function(cb) {
    if (argv.reset) {
        console.log("Clearing index...")
        solrUtils.deleteAll(solrClient, cb)
    } else {
        cb()
    }
})

execStack.push(function(cb) {
    if (argv.reset) {
        console.log("Soft-committing changes...")
        solrUtils.softCommit(solrClient, cb)
    } else {
        cb()
    }
})

var submitToIndex = function (noteId, doSync=false) {
    return new Promise(function (resolve, reject) {
        if (!noteId) {
            throw new Error("no note id")
        }
        if(argv.verbose) {
            console.log("adding to index: " + noteId);
        }
        // use relative url-ized path as id
        /** @type {INote} */
        var note;
        try {
            note = noteStore.loadNote(noteId);
        } catch (error) {
            console.log(error)
            reject(error);
            return;
        }
        // always submit notes with a modified date to the index so we can sort them by activity
        if (!note.lmod_dt) {
            note.lmod_dt = note.created_dt;
        }
        solrUtils.add(solrClient, note, doSync, resolve, reject, noteId)
    })
}

// import note repository
execStack.push(function (cb) {
    if (argv.skipimport) {
        cb()
        return
    }

    // recurse repo/ dir and find files to add to the index
    var filelist = glob.sync('**', {cwd: argv.reporoot, follow: false, nodir: true});

    // remove too large files
    if (argv.maxfilesize > 0) {
        var _filelist = [];
        for (var i=0; i<filelist.length; i++) {
            var fn = filelist[i];
            var stat = fs.statSync(path.join(argv.reporoot, fn));
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
    //@ts-ignore
    var pool = new PromisePool(promiseProducer, os.cpus().length);

    // start submitting the notes to the index
    console.log("Indexing...");
    pool.start()
    .then(function () {
        console.log("Added " + filelist.length + " files to the index.");
        // make sure the changes to the index are made visible ...
        solrUtils.softCommit(solrClient, cb)
    }, function (err) {
        cb(err)
    });
})

//--------------------------------------------------------------------------
// express
var app = undefined
var nunjucksEnv = undefined

execStack.push(function (cb) {
    if (argv.stopafterimport) {
        console.log("--stopafterimport requested. Doing as commanded.")
        process.exit(0)
    }

    if(argv.verbose) {
        console.log("Initializing Express and template engine")
    }

    app = express()
    nunjucksEnv = nunjucks.configure('views', {
        autoescape: true,
        express: app
    });

    nunjucksEnv.addGlobal('prod', argv.prod);
    cb()
});

//--------------------------------------------------------------------------
// live-reload
const livereload = require("livereload");
const connectLivereload = require("connect-livereload");

execStack.push(function (cb) {
    if (!argv.livereload) {
        cb()
        return
    }

    if (argv.prod && !argv.force) {
        console.log("refusing to use live-reload in prod, aborting...");
        cb('prod !force')
        return
    }

    if(argv.verbose) {
        console.log("Activating live-reload")
    }

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
    cb()
});


//--------------------------------------------------------------------------
// logging
execStack.push(function (cb) {
    if (!argv.logging) {
        cb()
        return
    }

    if(argv.verbose) {
        console.log("Activating request logging")
    }
    const morgan = require('morgan');
    app.use(morgan('dev'));
    cb()
})

//--------------------------------------------------------------------------
// create note editor session id -> successfully created note id and timestamp for cleanup
var createSessionIds = new Map();

execStack.push(function (cb) {
    if(argv.verbose) {
        console.log("Starting createSessionId housekeeping")
    }
    var createSessionIdStaleSecs = 3600;
    var createSessionIdsPruner = function() {
        var now = new Date().getTime()/1000;
        createSessionIds.forEach(function(value, key) {
            if ((now - value.created) > createSessionIdStaleSecs) {
                createSessionIds.delete(key);
            }
        })
    }
    setInterval(createSessionIdsPruner, createSessionIdStaleSecs/2 * 1000);
    cb()
})

function createUniqueNoteId(sessionId) {
    if(createSessionIds.has(sessionId)) {
        return createSessionIds.get(sessionId).noteId
    }

    var noteId = noteStore.createUniqueNoteId()
    createSessionIds.set(sessionId, {noteId: noteId, created: new Date().getTime()/1000})
    return noteId
}




//--------------------------------------------------------------------------
// note rest CRUD
execStack.push(function (cb) {
    if(argv.verbose) {
        console.log("Configuring express routes and handlers")
    }

    // http://expressjs.com/en/api.html
    app.use(express.json());
    app.param('noteId', function (req, res, next, noteId) {
        if (!noteStore.isValidNoteIdFormat(noteId)) {
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
        res.contentType = 'application/json';
        /** @type {ICreateNoteServerResponse} */
        var reply = {status: 0, error: '', noteId: undefined};
        var note = req.body.note;
        note.id = createUniqueNoteId(res.locals.sessionId);
        note.created_dt = new Date().toISOString();
        try {
            noteStore.saveNote(note)
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
                console.log(error)
                reply.status = 2;
                reply.error = error;
                res.status(500).send(JSON.stringify(reply)).end();
            }
        );
    });
    app.get('/r/:noteId', express.json(), function (req, res){  
        var noteId = res.locals.noteId;
        res.contentType = 'application/json';
        /** @type {IRetrieveNoteServerResponse} */
        var reply = {status: 0, error: '', note: undefined};
        if (!fs.existsSync(path.join(argv.reporoot, noteId))) {
            reply.status = 1;
            res.status(404).send(JSON.stringify(reply)).end();
            return;
        }
        try {
            reply.note = noteStore.loadNote(noteId);
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
        res.contentType = 'application/json';
        /** @type {INoteServerResponse} */
        var reply = {status: 0, error: ''};
        var noteId = req.body.note.id;

        /** @type {INote} */
        var note;
        try {
            note = noteStore.loadNote(noteId);
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
        try {
            noteStore.saveNote(note)
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
        var noteId = res.locals.noteId;
        res.contentType = 'application/json';
        /** @type {INoteServerResponse} */
        var reply = {status: 0, error: ''};

        var np = path.join(argv.reporoot, noteId);
        solrClient.deleteByID(noteId, function(err,solrRes) {
            if(err) {
                console.log("index delete failed: ", err, solrRes);
                reply.error = "index removal failed";
                reply.status = 1;
                res.status(500);
                res.send(JSON.stringify(reply)).end();
            } else {
                solrClient.softCommit(function(err2,solrRes2) {
                    if(err2) {
                        console.log("index softCommit failed: ", err2, solrRes2);
                        reply.error = "index softCommit failed";
                    } else {
                        if (fs.existsSync(np)) {
                            try {
                                fs.unlinkSync(np);
                            } catch (err3) {
                                console.log("disk delete failed: ", err3);
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
            }
        });
    });
    if (argv.prod) {
        app.get('*.js', express.static(buildRoot))
        app.get('*.css', express.static(buildRoot))
    } else {
        app.get('*.js', express.static(path.join(__dirname, "src/client")))
        app.get('*.js', express.static(path.join(__dirname, "src")))
        app.get('*.css', express.static(path.join(__dirname, "css")))
    }
    app.get('*.gif', express.static(path.join(__dirname, "images")))
    app.get('*.svg', express.static(buildRoot))
    app.get('/getSolrConfig', express.json(), function (req, res){  
        res.contentType = 'application/json';
        /** @type {GetSolrConfigResponse} */
        var reply = {status: 0, error: '', solrUrl: argv.solrUrl};
        res.send(JSON.stringify(reply)).end();
    });

    // index.html gets rendered through a templating engine so we can switch javascript loading
    // from dev to prod via command line switch
    // https://mozilla.github.io/nunjucks/templating.html
    app.get('/', function(req, res) {
        res.render('index.html');
    });

    if(argv.verbose) {
        console.log("Done.")
    }

    app.listen(argv.serverport, argv.servername, () => {
        console.log(`Listening at ${serverUrl}`)
        cb()
    })
})

execStack.push(function (cb) {
    if(!argv.openurl) {
        cb()
        return
    }

    if(argv.verbose) {
        console.log("Opening server url in browser")
    }
    open(serverUrl)
    cb()
})

if(argv.verbose) {
    console.log("Processing exec stack...")
}

async.series(execStack, function(err){
    if(err) {
        throw err
    }
});


