const assert = require('assert');
const fs = require('fs');
const got = require('got');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const vgmUrl= 'http://127.0.0.1:3000/';

// callback: test-condition implementation.
function waitFor(callback, secs=10) {
    var i = 0;
    var timer = setInterval(function() {
        i++;
        if(callback()) {
            clearTimeout(timer);
        }
        else if (i >= secs) {
            assert.fail();
        }
    }, 1000);
}

got(vgmUrl).then(response => {
  // start up the 'browser'
  const dom = new JSDOM(response.body, {runScripts: 'dangerously', resources: 'usable', url: vgmUrl});
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
  // wait for client scripts to show the search query response
  waitFor(function() {
    var content = dom.window.document.querySelector('#docs').textContent;
    console.log("text content: " + content);
    return content.includes("testvalue_xyz");
  });
}).catch(err => {
  throw Error(err);
});
