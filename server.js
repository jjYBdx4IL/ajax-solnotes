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
const waitPort = require('wait-port');
const { promisify } = require('util')
const got = require("got");
const stream = require("stream");
const pipeline = promisify(stream.pipeline);
const async = require("async");
const extract = require('extract-zip')
const express = require('express');
const os = require('os');
var fs = require('fs');
var path = require('path');
var glob = require("glob")
const solr = require('solr-client');
const yargs = require('yargs');
var PromisePool = require('es6-promise-pool');
var nunjucks = require('nunjucks');
const child_process = require('child_process');
var commandExists = require('command-exists');
var javahome = require('find-java-home');

const solrCoreName = "notes";
const noteSuffix = ".txt";
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
        description: 'Solr service url for the JS client to use',
        alias: 'u',
        type: 'string',
    })
    .default('solrUrl', 'http://127.0.0.1:8983/solr/notes/select')
    .option('port', {
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
    .help()
    .alias('help', 'h')
    .argv;

if (argv.stopafterimport && argv.skipimport) {
    throw Error("cannot use --skipimport and --stopafterimport at the same time");
}

if (!fs.existsSync(argv.reporoot) || !fs.statSync(argv.reporoot).isDirectory()) {
    throw Error(argv.reporoot + " must point to an existing directory")
}

if (argv.prod) {
    console.log("Production mode enabled.");
}

var execStack = [];

//------------------------------------------------------------------------------------
// install/start/stop solr installation/instance
// v8.4.0 is the latest version that doesn't completely shoot itself in the foot with
// security features (fixes available for 9, but neither is 8 released nor have the fixes been backported)
// https://issues.apache.org/jira/browse/SOLR-15161
const managedSolrPath = path.join(__dirname, "solr")
const managedSolrZip = path.join(__dirname, "solr.zip")
const managedSolrVersion = "8.8.2"
const managedSolrSetupDoneFlag = path.join(managedSolrPath, ".setup_complete")
const managedSolrBinPath = path.join(managedSolrPath, "bin")
const managedSolrCmdScript = os.platform() == 'win32' ? "solr.cmd" : "./solr";
const managedSolrHostName = "127.0.0.1"
const managedSolrPort = 8983;
const managedSolrEnv = process.env;

function managedSolrDownload(cb) {
    if (!argv.managesolr || fs.existsSync(managedSolrSetupDoneFlag) || fs.existsSync(managedSolrZip)) {
        cb();
        return;
    }
    var url = "https://archive.apache.org/dist/lucene/solr/" + managedSolrVersion
        + "/solr-" + managedSolrVersion + ".zip"
    console.log("Downloading: " + url)
    var tmpfn = managedSolrZip + ".tmp"
    fs.mkdirSync(path.dirname(managedSolrZip), { recursive: true })
    //@ts-ignore
    pipeline(got.stream(url), fs.createWriteStream(tmpfn)).then(function(){
        fs.renameSync(tmpfn, managedSolrZip)
        cb()
    })
}
execStack.push(managedSolrDownload);

/** @param {NodeJS.ProcessEnv} env @returns {void} */
function reorder_cygwin_paths(env) {
    var p = env.PATH.split(";")
    var p1 = [];
    var p2 = [];
    p.forEach(function(_p){
        if (_p.match(/cygwin.*\\bin/i)) {
            p2.push(_p);
        } else {
            p1.push(_p);
        }
    });
    p2.forEach(function(_p){
        p1.push(_p);
    });
    env.PATH = p1.join(";");
    if (argv.verbose) {
        console.log("reordered path: ", p1)
    }
}

function managedSolrAdjustEnv(cb) {
    if (!argv.managesolr) {
        cb();
        return;
    }
    if (os.platform() == 'win32' && process.env.JAVA_HOME && process.env.JAVA_HOME.startsWith('/')) {
        console.log("trying to fix JAVA_HOME")
        if (commandExists.sync('cygpath')) {
            // because we are running under cygwin, we need to reorder the paths so that the windows paths come first
            // and cygwin's find.exe does not shadow win32's.
            reorder_cygwin_paths(managedSolrEnv);

            process.env.JAVA_HOME = undefined
            javahome(function(err, home){
                if(err) {
                    cb(err)
                } else {
                    console.log("found JAVA_HOME: " + home);
                    process.env.JAVA_HOME = home
                    cb()
                }
            });
            return;

            // var jh = child_process.spawnSync('cygpath', ['-w', process.env.JAVA_HOME]).stdout.toString()
            // console.log("using JAVA_HOME=" + jh)
            // managedSolrEnv.JAVA_HOME = jh;

        }
    }
    cb()
}
execStack.push(managedSolrAdjustEnv);

function managedSolrStop(cb) {
    if (!argv.managesolr || fs.existsSync(managedSolrSetupDoneFlag) || !fs.existsSync(path.join(managedSolrBinPath, managedSolrCmdScript))) {
        cb();
        return;
    }
    console.log("Checking for a running instance...")

    waitPort({host: managedSolrHostName, port: managedSolrPort, timeout: 3000, output: "silent"}).then(function(err) {
        if (!err) {
            console.log("Stopping Solr...")
            try {
                child_process.execSync(managedSolrCmdScript + " stop -all", {cwd: managedSolrBinPath, env: managedSolrEnv});
            } catch (err) {
                console.log("failed to stop instance, let's hope we can continue anyways...")
            }
        }
        cb()
    }, function() {
        console.log("Port " + managedSolrPort + " is not open, Solr seems to be not running")
        cb()
    });
}
execStack.push(managedSolrStop);

function managedSolrInstall(cb) {
    if (!argv.managesolr || fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }
    console.log("Unpacking solr to: " + managedSolrPath)
    if (fs.existsSync(managedSolrPath)) {
        fs.rmdirSync(managedSolrPath, {recursive: true, maxRetries: 10, retryDelay: 1000})
    }
    var tmpd = path.join(buildRoot, ".unpack_tmp");
    if (fs.existsSync(tmpd)) {
        fs.rmdirSync(tmpd, {recursive: true, maxRetries: 10, retryDelay: 1000})
    }
    extract(managedSolrZip, { dir: tmpd }).then(function() {
        fs.renameSync(path.join(tmpd, "solr-" + managedSolrVersion), managedSolrPath)
        fs.rmdirSync(tmpd, {recursive: true, maxRetries: 10, retryDelay: 1000})
        cb()
    })    
}
execStack.push(managedSolrInstall);

function managedSolrPostInstall(cb) {
    if (!argv.managesolr || fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }

    const jettyXml = path.join(managedSolrPath, "server", "etc", "jetty.xml")
    var xml = fs.readFileSync(jettyXml).toString()

    if(false) {
        var scriptSrc = `http://${argv.servername}:${argv.serverport}`
        console.log("Adding " + scriptSrc + " to script-src in: " + jettyXml)
        xml = xml.replace(/(script-src 'self')/, `script-src ${scriptSrc} 'self'`)
    }

    console.log("Removing X-Content-Type-Options header, you have been warned!")
    xml = xml.replace(/X-Content-Type-Options/, `X-GTFO`)

    fs.writeFileSync(jettyXml, xml)

    //build/solr/server/solr-webapp/webapp/WEB-INF/web.xml
    /**
    <filter>
    <filter-name>cross-origin</filter-name>
    <filter-class>org.eclipse.jetty.servlets.CrossOriginFilter</filter-class>
</filter>
<filter-mapping>
    <filter-name>cross-origin</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
 */
    //cp build/solr/server/lib/jetty-servlets-9.4.34.v20201102.jar build/solr/server/solr-webapp/webapp/WEB-INF/lib/
    //build/solr/server/solr/configsets/_default/conf/solrconfig.xml

    cb()
}
execStack.push(managedSolrPostInstall);

function managedSolrStart(cb) {
    if (!argv.managesolr) {
        cb();
        return;
    }
    console.log("Starting Solr...")
    // on windows the solr start command does not properly detach, so we have to keep the process attached
    // or kill the server instantly
    child_process.exec(managedSolrCmdScript + " start", {cwd: managedSolrBinPath, env: managedSolrEnv});
    waitPort({host: managedSolrHostName, port: managedSolrPort}).then(function() {
        cb()
    });
}
execStack.push(managedSolrStart);

var solrClient = undefined;
execStack.push(function(cb) {
    if (argv.verbose) {
        console.log("creating solr client")
    }
    solrClient = solr.createClient({core : solrCoreName})
    cb()
});

function managedSolrSetup(cb) {
    if (!argv.managesolr || fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }
    console.log("Setting up Solr core: " + solrCoreName)
    child_process.execSync(managedSolrCmdScript + " create_core -c " + solrCoreName, {cwd: managedSolrBinPath, env: managedSolrEnv});
    cb()
}
execStack.push(managedSolrSetup);

// wait for core to come online
execStack.push(function(cb) {
    if (argv.verbose) {
        console.log("waiting for service")
    }
    async.retry({times: 30, interval: 1000}, function(cb2) {
        solrClient.ping(function(err,obj){
            if(err){
                cb2(err)
            }else{
                console.log("ping OK")
                cb2()
            }
        });
    }, function(err, result) {
        if(err) {cb("service ping failed: "+err)} else {cb()}
    });
});

function managedSolrSetup2(cb) {
    if (!argv.managesolr || fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }

    // we are using dynamic configuration. So whatever data we throw at Solr, the first instance it sees for a particular
    // field, that's the type it will assume for that field henceforth. If our first submission would be "123" as the body
    // of a note, the type would be a number. For that reason we are now implicitly forcing the desired field types by
    // submitting a proper example note
    /** @type {INote} */
    var note = {
        id: "20200101T202020.txt",
        text: "some proper English\nmulti-line\ntext.",
        created_dt: new Date().toISOString(),
        lmod_dt: new Date().toISOString(),
    }
    async.series([
        function(cb2) {
            solrClient.add(note, function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
        function(cb2) {
            solrClient.softCommit(function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
        function(cb2) {
            solrClient.deleteAll(function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
        function(cb2) {
            solrClient.softCommit(function(err,obj) {
                if(err) {cb2(err)} else {cb2()}
            })
        },
    ],
    function(err,result) {
        if(err) {cb(err)}
        else {
            fs.writeFileSync(managedSolrSetupDoneFlag, "")
            console.log("Solr setup finished.")
            cb()
        }
    })
}
execStack.push(managedSolrSetup2);





execStack.push(function(cb) {
    if (argv.reset) {
        console.log("Clearing index...")
        solrClient.deleteAll(function(err, obj){
            if (err) {
                cb(err)
            } else {
                cb()
            }
        })
    } else {
        cb()
    }
})

execStack.push(function(cb) {
    if (argv.reset) {
        console.log("Soft-committing changes...")
        solrClient.softCommit(function(err, obj){
            if (err) {
                cb(err)
            } else {
                cb()
            }
        })
    } else {
        cb()
    }
})

var submitToIndex = function (noteId, doSync=false) {
    return new Promise(function (resolve, reject) {
        if(argv.verbose)
            console.log("adding to index: " + noteId);
        // use relative url-ized path as id
        /** @type {INote} */
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
        solrClient.add(note, function(err,obj){
            if(err) {
                console.log("failed to update index: ", err, " -- note was: ", note);
                reject("failed to update index");
            } else {
                if (doSync) {
                    solrClient.softCommit(function(err,res) {
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
        // make sure the changes to the index are made visible ...
        solrClient.commit(function(err, obj) {
            if (err) {
                cb(err)
            } else {
                console.log("Added " + filelist.length + " files to the index.");
                filelist = null;
                cb()
            }
        });
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
        cb("stop-after-import")
        return
    }

    app = express()
    nunjucksEnv = nunjucks.configure('views', {
        autoescape: true,
        express: app
    });

    nunjucksEnv.addGlobal('prod', argv.prod);
        app.listen(argv.serverport, argv.servername, () => {
        console.log(`Listening at http://${argv.servername}:${argv.serverport}`)
        cb()
    })
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
});


//--------------------------------------------------------------------------
// logging
execStack.push(function (cb) {
    if (!argv.logging) {
        cb()
        return
    }

    const morgan = require('morgan');
    app.use(morgan('dev'));
    cb()
})

//--------------------------------------------------------------------------
// note rest CRUD

const noteEol = "\n";
const noteLmodHeader = "Last-Modified";
const noteCreatedHeader = "Created";

// create note editor session id -> successfully created note id and timestamp for cleanup
var createSessionIds = new Map();

execStack.push(function (cb) {
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
    cb()
})

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
    while (fs.existsSync(path.join(argv.reporoot, noteIdExt))) {
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

/**
 * 
 * @param {string} noteId 
 * @returns {INote}
 */
function loadNote(noteId) {
    /** @type {INote} */
    var note = {id: noteId, text: undefined, created_dt: undefined, lmod_dt: undefined};
    var data = fs.readFileSync(path.join(argv.reporoot, noteId)).toString();
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

    headerLines.forEach(function(line, _key, _hl) {
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



execStack.push(function (cb) {
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
        res.contentType = 'application/json';
        /** @type {ICreateNoteServerResponse} */
        var reply = {status: 0, error: '', noteId: undefined};
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
            fs.writeFileSync(path.join(argv.reporoot, note.id), onDiskData);
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
        /** @type {IRetrieveNoteServerResponse} */
        var reply = {status: 0, error: '', note: undefined};
        if (!fs.existsSync(path.join(argv.reporoot, noteId))) {
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
        res.contentType = 'application/json';
        /** @type {INoteServerResponse} */
        var reply = {status: 0, error: ''};
        var noteId = req.body.note.id;

        /** @type {INote} */
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
            fs.writeFileSync(path.join(argv.reporoot, note.id), onDiskData);
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
        app.get('*.js', express.static(path.join(__dirname, "src")))
        app.get('*.css', express.static(path.join(__dirname, "css")))
    }
    app.get('*.gif', express.static(path.join(__dirname, "images")))
    app.get('*.ico', express.static(buildRoot))
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


