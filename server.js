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

// https://nodejs.org/en/knowledge/command-line/how-to-parse-command-line-arguments/
const argv = yargs
    .command('port', 'server port', {
        port: {
            description: 'server port',
            alias: 'p',
            type: 'number',
        }
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


const maxFileSize = 1024 * 1024;

// server config
const hostname = '0.0.0.0';
const port = argv.port || 3000;

// Create a client (collection ("core") name: "notes"; create with: "solr.cmd create_core -c notes").
// Expects solr at localhost:8983.
const client = solr.createClient({core : 'notes'});

const app = express();
function startApp() {
    app.listen(port, () => {
        console.log(`Listening at http://localhost:${port}`)
    })
}

if (argv.reset) {
    client.deleteAll();
    client.commit();
    console.log("Index resetted.");
}

if (!argv.skipimport) {
    // recurse repo/ dir and find files to add to the index
    var rootpath = process.cwd();
    var repoRoot = path.join(rootpath, "repo");
    var filelist = glob.sync('**', {cwd: repoRoot, follow: false, nodir: true});

    // remove too large files
    var _filelist = [];
    for (var i=0; i<filelist.length; i++) {
        var fn = filelist[i];
        var stat = fs.statSync(path.join(repoRoot, fn));
        if (!stat) {
            throw Error("stat failed for " + fn);
        }
        if(stat.size <= maxFileSize) {
            _filelist.push(fn);
        }
    }
    filelist = _filelist;

    // use work queues to limit the number of concurrent index submissions
    var submitToIndex = function (filenameId) {
        return new Promise(function (resolve, reject) {
            if(argv.verbose)
                console.log("adding to index: " + filenameId);
            // use relative url-ized path as id
            var content = fs.readFileSync(path.join(repoRoot, filenameId));
            client.add({ id : filenameId, text : content.toString()}, function(err,obj){
                if(err) {
                    throw Error(err);
                } else {
                    resolve(filenameId);
                }
            });
        })
    }

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
    liveReloadServer.watch(path.join(__dirname, '.'));

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

app.get('*', express.static('.'));

