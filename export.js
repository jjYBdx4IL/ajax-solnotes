/**
 * Scans for notes ending with the line pattern ",PUBLISH:CATEGORY:<cat-name>", and writes
 * a converted version to "<--exportroot>/<cat-name>/<filename-derived-from-title>" where the title
 * is the first non-empty line of a note. This is intended to be used in combination with Hugo, ie.
 * it allows one to transform a simple note into a static webpage.
 * 
 * TODO: tags support
 */

const async = require("async");
const fs = require('fs');
const path = require('path');
const glob = require("glob")
const yargs = require('yargs');
const noteStore = require('./src/server/NoteStore')

const mdEol = "\n"

// https://nodejs.org/en/knowledge/command-line/how-to-parse-command-line-arguments/
const argv = yargs
    .option('verbose', {
        alias: 'v',
        description: 'be more verbose',
        type: 'boolean',
    })
    .option('reporoot', {
        description: 'primary notes storage location',
        type: 'string',
    })
    .option('exportroot', {
        description: 'where to write the markdown files - usually the content/ directory of your Hugo-based website sources',
        type: 'string',
    })
    .help()
    .alias('help', 'h')
    .argv;

if (!fs.existsSync(argv.reporoot) || !fs.statSync(argv.reporoot).isDirectory()) {
    throw Error(argv.reporoot + " must point to an existing directory")
}
if (!fs.existsSync(argv.exportroot) || !fs.statSync(argv.exportroot).isDirectory()) {
    throw Error(argv.exportroot + " must point to an existing directory")
}


noteStore.init(argv.reporoot)




console.log("Note repository root: " + argv.reporoot)


var execStack = [];

function exportNote(noteId) {
    if (!noteId) {
        throw new Error("no note id")
    }

    var note = noteStore.loadNote(noteId);

    var m = note.text.match(/^\s*(\S[^\r\n]*)[\r\n]+(\S|\S.*\S)\s*[\r\n],PUBLISH:CATEGORY:([a-zA-Z0-9_-]+)\s*$/s)
    if(!m) {
        return
    }
    if(argv.verbose) {
        console.log("exporting: " + noteId);
    }
    var title = m[1]
    var body = m[2]
    var cat = m[3]

    var filename = title.replace(/[^a-zA-Z0-9-]/g, ' ')
    filename = filename.replace(/\s+/g, ' ')
    filename = filename.trim()
    filename = note.created_dt.match(/(\S+)T/)[1] + ' ' + filename
    filename = filename.replace(/ /g, '-')
    filename += ".md"

    console.log(filename)
    var content = "---" + mdEol
    content += "title: \"" + title.replace(/"/g, "\\\"") + "\"" + mdEol
    content += "date: " + note.created_dt.match(/(\S+)T/)[1] + mdEol
    if (note.lmod_dt) {
        content += "modified: " + note.lmod_dt.match(/(\S+)T/)[1] + mdEol
    }
    content += "---" + mdEol
    content += body

    var filepath = path.join(argv.exportroot, cat, filename)
    if (fs.existsSync(filepath)) {
        throw new Error("file already exists: " + filepath)
    }
    fs.writeFileSync(filepath, content)
}

// import note repository
execStack.push(function (cb) {
    // recurse repo/ dir and find files to add to the index
    var filelist = glob.sync('**', {cwd: argv.reporoot, follow: false, nodir: true});

    for (var i=0; i<filelist.length; i++) {
        exportNote(filelist[i])
    }
})

async.series(execStack, function(err){
    if(err) {
        throw err
    }
});


