const {execSync} = require('child_process')
var fs = require('fs')
var path = require('path')

var builddir = path.join(__dirname, "build")

if (fs.existsSync(builddir)) {
    fs.rmdirSync(builddir, {recursive: true})
}
fs.mkdirSync(builddir)

console.log("minifying...")
execSync("npm run minify")

console.log("copying favicon...")
fs.copyFileSync(path.join(__dirname, "favicon.svg"), path.join(builddir, "favicon.svg"))

console.log("done.")
