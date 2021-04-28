const fs = require('fs');
const path = require('path');

const noteLmodHeader = "Last-Modified";
const noteCreatedHeader = "Created";
const noteEol = "\n";
exports.noteEol = noteEol
const noteSuffix = ".txt";

var reporoot = ''

function init(_reporoot) {
    if (!_reporoot || !fs.existsSync(_reporoot) || !fs.statSync(_reporoot).isDirectory()) {
        throw new Error("note repository root is not an existing directory: " + _reporoot)
    }
    reporoot = _reporoot
}
exports.init = init


/** @param {Date} dt @returns {string} */
function createNoteBaseIdFromDate(dt) {
    var noteId = dt.toISOString();
    // remove milliseconds and more
    noteId = noteId.replace(/\..*$/g, '');
    noteId = noteId.replace(/[^T0-9]/g, '');
    return noteId
}

// for now, only use sync ops when storing the note to avoid having to deal with concurrency issues for no reason
function createUniqueNoteId(dt=new Date(), failOnConflict=false) {
    ensureInitialized()
    // UTC time in ISO8601 format
    var noteId = createNoteBaseIdFromDate(dt)
    var noteIdExt = noteId + noteSuffix;
    var i = 0;
    while (fs.existsSync(path.join(reporoot, noteIdExt))) {
        if (failOnConflict) {
            throw new Error("note alrady exists: " + noteIdExt + " in " + reporoot)
        }
        noteIdExt = noteId + "_" + i++ + noteSuffix;
    }
    return noteIdExt;
}
exports.createUniqueNoteId = createUniqueNoteId

/** @param {INote} note @returns {string} */
function cvtNoteToOnDiskFormat(note) {
    var data = '';
    if (note.id === void 0 || note.id === null) {
        throw Error("no note id");
    }
    if (!isValidNoteIdFormat(note.id)) {
        throw Error("invalid note id: " + note.id);
    }
    if (note.created_dt === void 0 || note.created_dt === null) {
        throw Error("no note created_dt value, note id: " + note.id);
    }
    if (isNaN(Date.parse(note.created_dt))) {
        throw Error("invalid note created_dt value: " + note.created_dt + ", note id: " + note.id);
    }
    data += noteCreatedHeader + ": " + note.created_dt + noteEol;
    if (note.lmod_dt !== void 0 && note.lmod_dt !== null) {
        if (isNaN(Date.parse(note.lmod_dt))) {
            throw Error("invalid note lmod_dt value: " + note.lmod_dt + ", note id: " + note.id);
        }
        data += noteLmodHeader + ": " + note.lmod_dt + noteEol;
    }
    // end of header (empty line)
    data += noteEol;
    if (note.text === void 0 || note.text === null) {
        throw Error("invalid note: no text entry, note id: " + note.id);
    }
    data += note.text;
    return data;
}
exports.cvtNoteToOnDiskFormat = cvtNoteToOnDiskFormat

function isValidNoteIdFormat(noteId) {
    return /^[0-9_A-Za-z./-]+$/.test(noteId) && !/\.\./.test(noteId) && !/\/$/.test(noteId) && !/\/\./.test(noteId);
}
exports.isValidNoteIdFormat = isValidNoteIdFormat

/**
 * 
 * @param {string} noteId 
 * @returns {INote}
 */
function loadNote(noteId) {
    ensureInitialized()
    /** @type {INote} */
    var note = {id: noteId, text: undefined, created_dt: undefined, lmod_dt: undefined};
    var data = fs.readFileSync(path.join(reporoot, noteId)).toString();
    var sepOffset = data.indexOf("\n\n");
    if (sepOffset == -1) {
        throw Error("no header found: " + noteId);
    }
    var bodyOffset = sepOffset + 2;
    var header = data.substring(0, bodyOffset-1); // include final "\n"
    note.text = data.substring(bodyOffset);
    if (/\r/.test(header)) {
        throw Error("malformed header contains bad eol type");
    }
    var offset = 0;
    var headerLines = [];
    while (offset < sepOffset) {
        var eol = header.indexOf("\n", offset);
        headerLines.push(header.substring(offset, eol));
        offset = eol+1;
    }

    headerLines.forEach(function(line, _key, _hl) {
        var m = line.match(/([^:]+):(.*)/);
        if (m === null) {
            throw Error("bad header line: " + line);
        }
        var key = m[1];
        var val = m[2].trim();
        switch(key) {
            case "Created":
                note.created_dt = val;
                break;
            case "Last-Modified":
                note.lmod_dt = val;
                break;
            default:
                throw Error("bad header key: " + line);
        }
    });
    return note;
}
exports.loadNote = loadNote

function ensureInitialized() {
    if (!reporoot) {
        throw new Error("NoteStore not initialized");
    }
}
exports.ensureInitialized = ensureInitialized

function getRepoRoot() {
    return reporoot
}
exports.getRepoRoot = getRepoRoot

/**
 * @param {INote} note
 * @returns {void}
 */
function saveNote(note) {
    ensureInitialized()
    const onDiskData = cvtNoteToOnDiskFormat(note);
    fs.writeFileSync(path.join(reporoot, note.id), onDiskData);
}
exports.saveNote = saveNote
