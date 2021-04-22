// npm install solr-client --save
//   + findit
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
// Works with solr 8.8. Run "solr.cmd create_collection -c notes" and follow
// instructions in solr-autostart.cmd.
const http = require('http');
var fs = require('fs');
var path = require('path');
var _url = require('url');
var qs = require('querystring');
var find = require('findit');
const solr = require('solr-client');
const yargs = require('yargs');

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

// Create a client (collection ("core") name: "notes"; create with: "solr.cmd create_collection -c notes").
// Expects solr at localhost:8983.
const client = solr.createClient({core : 'notes'});

if (argv.reset) {
    client.deleteAll();
    client.commit();
    console.log("Index resetted.");
}

// recurse and add documents to the index
var rootpath = process.cwd();
var repoRoot = path.join(rootpath, "repo");
var finder = find(repoRoot);
var submittedFiles = 0;
finder.on('file', function (file, stat) {
    // use relative url-ized path as id
    var normPath = path.normalize(path.relative(repoRoot, file)).replace(/\\/g, "/");
    if (path.basename(file).startsWith(".") || stat.size > maxFileSize) {
        if(argv.verbose)
            console.log("skipping: " + normPath);
        return;
    }
    var content = fs.readFileSync(file);
    client.add({ id : normPath, lmod_dt : stat.mtime, text : content.toString()});
    submittedFiles++;
});
finder.on('directory', function (dir, stat, stop) {
    var normPath = path.normalize(path.relative(repoRoot, dir)).replace(/\\/g, "/");
    if (path.basename(dir).startsWith(".")) {
        if(argv.verbose)
            console.log("skipping: " + normPath);
        stop();
    }
});

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

finder.on('end', function () {
    client.commit();
    console.log("Added " + submittedFiles + " files to the index.");
    const server = http.createServer(serverHandler);
    server.listen(port, hostname, () => {
        console.log(`Server running at http://${hostname}:${port}/`);
    });
});

console.log("Indexing...");
