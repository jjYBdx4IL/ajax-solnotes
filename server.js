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
const os = require('os');
const http = require('http');
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
const hostname = '127.0.0.1';
const port = argv.port || 3000;

// Create a client (collection ("core") name: "notes"; create with: "solr.cmd create_core -c notes").
// Expects solr at localhost:8983.
const client = solr.createClient({core : 'notes'});

if (argv.reset) {
    client.deleteAll();
    client.commit();
    console.log("Index resetted.");
}

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

// a simple server implementation
function serverHandler(request, response) {
    var url = new URL(request.url, 'http://xyz');

    var filePath = '.' + url.pathname;
    if (filePath == './')
        filePath = './index.html';

    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;      
        case '.ico':
            contentType = 'image/x-icon';
            break;      
        case '.gif':
            contentType = 'image/gif';
            break;      
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
    }

    fs.readFile(filePath, function(error, content) {
        if (error) {
            console.log("404 " + filePath + " (" + error + ")");
            response.writeHead(404);
            response.end('File not found.\n');
            response.end(); 
        }
        else {
            console.log("200 " + filePath + " (" + content.byteLength + ")");
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });
};

// start submitting the notes to the index
console.log("Indexing...");
pool.start()
  .then(function () {
    // make sure the changes to the index are made visible ...
    client.commit(function() {
        console.log("Added " + filelist.length + " files to the index.");
        filelist = null;
        // ... before finally starting the server port
        const server = http.createServer(serverHandler);
        server.listen(port, hostname, () => {
            console.log(`Server running at http://${hostname}:${port}/`);
        });
    });
  });


