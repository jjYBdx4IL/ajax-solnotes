const async = require("async");
const yargs = require('yargs');
const assert = require('assert');
const fs = require('fs');
const got = require('got');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const child_process = require('child_process');
const path = require('path')
const waitOn = require('wait-on');

const argv = yargs
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
.option('portinc', {
    description: 'increment all ports by this number',
    type: 'number',
})
.default('portinc', 0)
.help()
.alias('help', 'h')
.argv;

if (argv.portinc) {
    argv.serverport += argv.portinc
}

const serverUrl= `http://${argv.servername}:${argv.serverport}/`;
const testrepo = path.join(__dirname, "build", "testrepo")
const solrPath = path.join(__dirname, "solr")
const serverLaunchCommand = `node server.js --portinc ${argv.portinc} -v --logging --reporoot "${testrepo}" --managesolr`;

async function waitFor(testfunc, secs=10) {
    return new Promise((resolve, reject) => {
        async.retry({times: secs, interval: 1000}, function(cb) {
            cb(testfunc() ? undefined : Error("failed"))
        }, function(err, result) {
            err ? reject(err) : resolve(result)
        });
    })
}

function rm(_path) {
    fs.rmSync(_path, {recursive: true, force: true, maxRetries: 30, retryDelay: 1000})
}

(async () => {

    // clean test repo
    rm(testrepo)
    fs.mkdirSync(testrepo, {recursive: true})

    // erase existing managed solr test installation
    rm(solrPath)

    // import takeout test dump
    var takeoutdir = path.join(__dirname, "tests", "takeout")
    child_process.execSync(`${serverLaunchCommand} --gktoimport ${takeoutdir}`, {stdio: 'inherit'})

    // start server
    var serverProcess = child_process.spawn(serverLaunchCommand, {stdio: 'inherit', shell: true})

    // wait
    await waitOn({resources: [serverUrl], timeout: 30000})

    //@ts-ignore
    const response = await got(serverUrl, {});
    // start up the 'browser'
    const dom = new JSDOM(response.body, {runScripts: 'dangerously', resources: 'usable', url: serverUrl});
    // simulate an input event
    dom.window.eval(`
        const input = document.querySelector("input");
        input.value = "test";
        const event = new Event('input', {
            bubbles: true,
            cancelable: true
        });
        input.dispatchEvent(event);
    `);
    await waitFor(function() {
        var content = dom.window.document.querySelector('#docs').textContent;
        console.log("text content: " + content);
        return content.includes("takeout-test-title")
            && content.includes("takeout-test-text-content")
            && content.includes("LABEL:takeout-test-label-2")
            && content.includes("ATTACHMENT:")
            && content.includes(".jpeg")
    });
    serverProcess.kill('SIGKILL')
    console.log("done")
    dom.window.close()
})();

