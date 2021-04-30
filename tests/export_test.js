const glob = require("glob")
const async = require("async");
const assert = require('assert');
const fs = require('fs');
const child_process = require('child_process');
const path = require('path')

const rootdir = path.dirname(__dirname)
const testrepo = path.join(__dirname, "export")
const exportroot = path.join(rootdir, "build", "export-test")

function rm(_path) {
    fs.rmSync(_path, {recursive: true, force: true, maxRetries: 30, retryDelay: 1000})
}
function recreate(_path) {
    rm(_path)
    fs.mkdirSync(_path, {recursive: true})
}

(async () => {

    recreate(exportroot)
    fs.mkdirSync(path.join(exportroot, "catincl"))

    child_process.execSync(`node export.js --reporoot=${testrepo} --exportroot=${exportroot}`,
        {stdio: 'inherit', shell: true, cwd: rootdir})

    var filelist = glob.sync('**', {cwd: exportroot, follow: false, nodir: true});

    assert(filelist.length == 4)

    console.log("done")
    
})();

