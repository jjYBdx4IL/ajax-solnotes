const glob = require("glob")
const child_process = require('child_process');
const path = require('path')

var filelist = glob.sync('tests/*test.js', {cwd: __dirname, follow: false, nodir: true});

for (var i = 0; i < filelist.length; i++) {
    var testjs = filelist[i]
    console.log("Running test: " + testjs)
    child_process.execSync(`node ${path.basename(testjs)}`, {stdio: 'inherit', cwd: path.dirname(testjs)})
}

console.log(filelist.length + " tests executed ok")
