const assert = require('assert');
const fs = require('fs');
const got = require('got');
const jsdom = require("jsdom");
const { exit } = require('process');
const { JSDOM } = jsdom;

const vgmUrl= 'http://127.0.0.1:3000/';

function waitFor(callback, secs=10) {
    var i = 0;
    var timer = setInterval(function() {
        i++;
        if(callback()) {
            clearTimeout(timer);
        }
        if (i >= secs) {
            assert.fail();
        }
    }, 1000);
}



got(vgmUrl).then(response => {
  const dom = new JSDOM(response.body, {runScripts: 'dangerously', resources: 'usable', url: vgmUrl});
  dom.window.eval(`
    const input = document.querySelector("input");
    input.value = "test";
    const event = new Event('input', {
        bubbles: true,
        cancelable: true
    });
    input.dispatchEvent(event);
  `);
  waitFor(function() {
    console.log("text content: " + dom.window.document.querySelector('#docs').textContent);
    return dom.window.document.querySelector('#docs').textContent.includes("testvalue_xyz");
  });
}).catch(err => {
  console.log(err);
  exit(1);
});
