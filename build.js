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

console.log("generating favicon...")
execSync("magick -background transparent favicon.svg -define icon:auto-resize=16,24,32,48,64,72,96,128,256 "
    + path.join(builddir, "favicon.ico"))

console.log("done.")
