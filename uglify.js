var fs = require('fs')
var path = require('path')


//------------------------------------------------------------------------------------
// JS
var UglifyJS = require("uglify-js")

var indexHtml = fs.readFileSync(path.join(__dirname, "views", "index.html")).toString()
var scriptLines = indexHtml.match(/<script\s.*src="(?!_)(?!https?:)([^"]+\.js)"/g)
var scripts = ['__env_prod.js']
scriptLines.forEach(function(line, _key, _hl) {
    var m = line.match(/<script\s.*src="([^"]+)"/)
    scripts.push(m[1])
})
console.log(scripts)

var input = '';
scripts.forEach(function(script, _key, _hl) {
    try {
        input += fs.readFileSync(path.join(__dirname, "src", "client", script), "utf8")
    } catch (e) {
        input += fs.readFileSync(path.join(__dirname, "src", script), "utf8")
    }
})

if (!fs.existsSync(path.join(__dirname, "build"))) {
    fs.mkdirSync(path.join(__dirname, "build"))
}

// https://github.com/mishoo/UglifyJS
var result = UglifyJS.minify(input, {
    toplevel: true,
    warnings: true,
    mangle: {
        // properties: {
        //     keep_quoted: true
        // }
    },
    compress: {
        dead_code: true,
        passes: 3,
        global_defs: {
            DEBUG: false,
            PROD: true
        }
    }
})
if (result.error !== undefined) {
    throw result.error
}
console.log(result.warnings);
fs.writeFileSync(path.join(__dirname, "build", "__app__.js"), result.code)


//------------------------------------------------------------------------------------
// CSS
// https://www.npmjs.com/package/uglifycss

var cssLines = indexHtml.match(/<link \s*rel="stylesheet" \s*href="(?!https?:)[^"]+"\s*>/g)
var cssFiles = []
cssLines.forEach(function(line, _key, _hl) {
    var m = line.match(/<link \s*rel="stylesheet" \s*href="([^"]+)"\s*>/)
    cssFiles.push(path.join("css", m[1]))
})
console.log(cssFiles)

var uglifycss = require('uglifycss');
 
var uglified = uglifycss.processFiles(
    cssFiles,
    { maxLineLen: 500, expandVars: true }
);
 
fs.writeFileSync(path.join(__dirname, "build", "site.css"), uglified)


