const fs = require('fs');
const path = require('path');
const glob = require("glob")
const noteStore = require('./NoteStore');

//---------------------------------------------------------------------------------------
// Google Keep Takeout import


function doImport (srcdir) {
    if(!srcdir || !fs.existsSync(srcdir) || !fs.statSync(srcdir).isDirectory()) {
        throw new Error("source is not an existing directory: " + srcdir)
    }
    noteStore.ensureInitialized()

    console.log("Import requested. Will import dump data in " + srcdir + " to: " + noteStore.getRepoRoot())
    console.log("WARNING! This import routine may ignore some metadata stored in your Google Keep Takeout dump.")
    console.log("References to images will be attached to the text content where this import process can find them.")
    console.log("Beyond that, there is no image import.")
    console.log("It's advised to keep your takeout dump around, especially the images included in it (if any).")
    var filelist = glob.sync('**/*.json', {cwd: srcdir, follow: false, nodir: true});
    if (!fs.existsSync(path.join(srcdir, "Labels.txt"))) {
        console.log(`WARNING! No 'Labels.txt' file found in your takeout directory. Are you sure ${srcdir} contains a Google Keep Takeout?`)
    }
    console.log(filelist.length + " notes (.json files) found in your dump")
    filelist.forEach(function(file){
        var json = fs.readFileSync(path.join(srcdir, file)).toString()
        // {"attachments":[{"filePath":"16c90563b9a.8e57e880aaed9c81.jpeg","mimetype":"image/jpeg"}],"color":"DEFAULT","isTrashed":false,
        // "isPinned":false,"isArchived":false,"textContent":"...","title":"abc","userEditedTimestampUsec":1565789725546000,
        // "labels":[{"name":"takeout-test-label"},{"name":"takeout-test-label-2"},{"name":"takeout-test-label-3"}]}
        const obj = JSON.parse(json);
        const lmod = obj.userEditedTimestampUsec / 1000
        const title = obj.title
        var text = obj.textContent
        var footerRefs = []
        if(obj.attachments) {
            obj.attachments.forEach(el => {
                if (!el.filePath) {
                    throw new Error("unexpected format: " + json)
                }
                footerRefs.push("ATTACHMENT:" + el.filePath)
            });
        }
        if(obj.labels) {
            obj.labels.forEach(el => {
                if (!el.name) {
                    throw new Error("unexpected format: " + json)
                }
                footerRefs.push("LABEL:" + el.name)
            });
        }
        if (obj.isTrashed) {
            footerRefs.push("FLAG:TRASHED")
        }
        if (obj.isPinned) {
            footerRefs.push("FLAG:PINNED")
        }
        if (obj.isArchived) {
            footerRefs.push("FLAG:ARCHIVED")
        }
        if (title.length) {
            text = title + noteStore.noteEol + text
        }
        if (footerRefs.length) {
            text += noteStore.noteEol
            text += footerRefs.join(", ")
        }
        /** @type {INote} */
        var note = {
            id: noteStore.createUniqueNoteId(new Date(lmod), true),
            text: text,
            lmod_dt: new Date(lmod).toISOString(),
            created_dt: new Date(lmod).toISOString()
        }
        noteStore.saveNote(note)
    })
}
exports.doImport = doImport
