const async = require("async");
const yargs = require('yargs');
const assert = require('assert');
const fs = require('fs');
const got = require('got');
const jsdom = require("jsdom");
const { exit } = require("yargs");
const { JSDOM } = jsdom;


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


async function waitFor(testfunc, secs=10) {
    return new Promise((resolve, reject) => {
        async.retry({times: secs, interval: 1000}, function(cb) {
            cb(testfunc() ? undefined : Error("failed"))
        }, function(err, result) {
            err ? reject(err) : resolve(result)
        });
    })
}

(async () => {
    //@ts-ignore
    const response = await got(serverUrl);
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
        return content.includes("testvalue_xyz");
    });
    console.log("done")
    dom.window.close()
})();

