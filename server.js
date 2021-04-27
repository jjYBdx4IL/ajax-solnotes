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
var crypto = require('crypto');
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
const open = require('open');

const noteLmodHeader = "Last-Modified";
const noteCreatedHeader = "Created";
const noteEol = "\n";
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




//---------------------------------------------------------------------------------------
// Google Keep Takeout import
if (argv.gktoimport) {
    console.log("Import requested. Will import dump data in " + argv.gktoimport + " to: " + argv.reporoot)
    console.log("WARNING! This import routine may ignore some metadata stored in your Google Keep Takeout dump.")
    console.log("References to images will be attached to the text content where this import process can find them.")
    console.log("Beyond that, there is no image import.")
    console.log("It's advised to keep your takeout dump around, especially the images included in it (if any).")
    var filelist = glob.sync('**/*.json', {cwd: argv.gktoimport, follow: false, nodir: true});
    if (!fs.existsSync(path.join(argv.gktoimport, "Labels.txt"))) {
        console.log(`WARNING! No 'Labels.txt' file found in your takeout directory. Are you sure ${argv.gtk} contains a Google Keep Takeout?`)
    }
    console.log(filelist.length + " notes (.json files) found in your dump")
    filelist.forEach(function(file){
        var json = fs.readFileSync(path.join(argv.gktoimport, file)).toString()
        // {"attachments":[{"filePath":"16c90563b9a.8e57e880aaed9c81.jpeg","mimetype":"image/jpeg"}],"color":"DEFAULT","isTrashed":false,"isPinned":false,"isArchived":false,"textContent":"...","title":"abc","userEditedTimestampUsec":1565789725546000}
        const obj = JSON.parse(json);
        const lmod = obj.userEditedTimestampUsec / 1000
        const title = obj.title
        var text = obj.textContent
        var footerRefs = []
        if(obj.attachments) {
            obj.attachments.forEach(el => {
                if (!el.filePath) {
                    throw new Error("unexpected format: " + json)
                }
                footerRefs.push("ATTACHMENT:" + el.filePath)
            });
        }
        if (obj.isTrashed) {
            footerRefs.push("FLAG:TRASHED")
        }
        if (obj.isPinned) {
            footerRefs.push("FLAG:PINNED")
        }
        if (obj.isArchived) {
            footerRefs.push("FLAG:ARCHIVED")
        }
        if (title.length) {
            text = title + noteEol + text
        }
        if (footerRefs.length) {
            text += noteEol
            text += footerRefs.join(", ")
        }
        /** @type {INote} */
        var note = {
            id: createNoteBaseIdFromDate(new Date(lmod)) + noteSuffix,
            text: text,
            lmod_dt: new Date(lmod).toISOString(),
            created_dt: new Date(lmod).toISOString()
        }
        var onDiskData = cvtNoteToOnDiskFormat(note);
        var tgtFn = path.join(argv.reporoot, note.id)
        if (fs.existsSync(tgtFn)) {
            throw new Error("refusing to overwrite another note: " + tgtFn)
        }
        fs.writeFileSync(tgtFn, onDiskData);
    })
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

function extractSolrCoreName() {
    var m = argv.solrUrl.match(/\/([^\/]+)\/select$/)
    if (m.length == 2) {
        return m[1];
    } else {
        throw Error("cannot extract core name from solrUrl: " + argv.solrUrl)
    }
}
const solrCoreName = extractSolrCoreName();


var execStack = [];

//------------------------------------------------------------------------------------
// install/start/stop solr installation/instance
// v8.4.0 is the latest version that doesn't completely shoot itself in the foot with
// security features (fixes available for 9, but neither is 8 released nor have the fixes been backported)
// https://issues.apache.org/jira/browse/SOLR-15161
const managedSolrPath = path.join(__dirname, "solr")
const managedSolrZip = path.join(__dirname, "solr.zip")
const managedSolrVersion = "8.8.2"
const managedSolrSha512 = 'd7f1b381bceef17436053e42e3289857b670efba6060ffd3c99757c7df37a55cca89506937935ac34778c76b1cfe8984aba2c2ef76783a7837a25d2ee25ace55'
const managedSolrSetupDoneFlag = path.join(managedSolrPath, ".setup_complete")
const managedSolrBinPath = path.join(managedSolrPath, "bin")
const managedSolrCmdScript = os.platform() == 'win32' ? "solr.cmd" : "./solr";
const managedSolrHostName = new URL(argv.solrUrl).hostname
const managedSolrPort = parseInt(new URL(argv.solrUrl).port)
const managedSolrEnv = process.env;

function checksumFile(hashName, path) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash(hashName);
        const stream = fs.createReadStream(path);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function verifyFileCksum(path, hash, hashname) {
    return new Promise((resolve, reject) => {
        checksumFile(hashname, path).then(function(_hash) {
            if (hash != _hash) {
                reject(`checksum verification failed for ${path}: expected ${hash} but got ${_hash}`)
            } else {
                console.log("checksum ok")
                resolve()
            }
        }, function(err) {
            reject(err)
        })
    })
}

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
        verifyFileCksum(tmpfn, managedSolrSha512, "sha512").then(function(result) {
            fs.renameSync(tmpfn, managedSolrZip)
            cb()
        })
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
                var cmd = managedSolrCmdScript + " stop -p " + managedSolrPort
                if (argv.verbose) {
                    console.log("executing command: " + cmd)
                }
                child_process.execSync(cmd, {cwd: managedSolrBinPath, env: managedSolrEnv});
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
    var cmd = `${managedSolrCmdScript} start -p ${managedSolrPort} -h ${managedSolrHostName}`
    if (argv.verbose) {
        console.log("executing command: " + cmd)
    }
    child_process.exec(cmd, {cwd: managedSolrBinPath, env: managedSolrEnv});
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
    solrClient = solr.createClient({
        secure: new URL(argv.solrUrl).protocol == 'https',
        host: new URL(argv.solrUrl).hostname,
        port: parseInt(new URL(argv.solrUrl).port),
        core: solrCoreName
    })
    cb()
});

function managedSolrSetup(cb) {
    if (!argv.managesolr || fs.existsSync(managedSolrSetupDoneFlag)) {
        cb();
        return;
    }
    var cmd = `${managedSolrCmdScript} create_core -c ${solrCoreName} -p ${managedSolrPort}`
    if (argv.verbose) {
        console.log("executing command: " + cmd)
    }
    child_process.execSync(cmd, {cwd: managedSolrBinPath, env: managedSolrEnv});
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
            note = loadNote(noteId);
        } catch (error) {
            console.log(error)
            reject(error);
            return;
        }
        // always submit notes with a modified date to the index so we can sort them by activity
        if (!note.lmod_dt) {
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
// note rest CRUD

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

/** @param {Date} dt @returns {string} */
function createNoteBaseIdFromDate(dt) {
    var noteId = dt.toISOString();
    // remove milliseconds and more
    noteId = noteId.replace(/\..*$/g, '');
    noteId = noteId.replace(/[^T0-9]/g, '');
    return noteId
}

// for now, only use sync ops when storing the note to avoid having to deal with concurrency issues for no reason
function createUniqueNoteId(sessionId) {
    if(createSessionIds.has(sessionId)) {
        return createSessionIds.get(sessionId).noteId;
    }

    // UTC time in ISO8601 format
    var noteId = createNoteBaseIdFromDate(new Date())
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
    if(argv.verbose) {
        console.log("Configuring express routes and handlers")
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


