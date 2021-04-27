
const NoteEditor = class {
    constructor() {
        this.init();
    }
    /** @type {JQuery.jqXHR} */
    xhrSaveRequest = null;
    editNoteId = '';
    createNoteSessionId = '';
    isDirty = false;
    /** @type {LiveSearchClient} */
    liveSearchClient = undefined;
    /** @type {StatusDisplay} */
    statusDisplay = undefined;

    /** @returns {JQuery<HTMLElement>} */
    getEditorTextElement() {
        return $("#editor .textcontent");
    }

    /** @param {JQuery.ClickEvent} evt */
    onClick(evt) {
        if ($(evt.target).hasClass("link")) {
            window.open($(evt.target).text(), '_blank').focus();
        }
    }
    /** @param {HTMLElement} el */
    onInput(el) {
        if (!this.isDirty) {
            $(".editbglabel").css({ visibility: "hidden" });
            this.isDirty = true;
        }
    }

    init() {
        var self = this;
        this.getEditorTextElement().on('input', function () { self.onInput(this); });
        this.getEditorTextElement().on('click', function (evt) { self.onClick(evt); });

        // prevent browsers from inserting divs into contenteditable div
        // (otherwise we have a hard time to condense the html down into properly formatted plain text)
        document.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                document.execCommand('insertLineBreak')
                event.preventDefault()
            }
        })

        $("#addnote").on("click", function () { self.openEditor(null) });
        $(".modal").on("click", function () { self.toggleModal(false) });
        $("#cancel").on("click", function () {
            self.isDirty = false;
            self.toggleModal(false);
        });
        $("#delete").on("click", function () {
            if (confirm('Really DELETE ERASE DESTROY VAPORIZE this note?')) {
                self.deleteNote();
            }
        });
        $("#editor").on('keydown', function (event) {
            if (event.key == "Escape") {
                if (self.isModal()) {
                    self.toggleModal(false);
                } else {
                    self.openEditor(null);
                }
            }
        });

        //
        // Grid interaction
        //
        $(".grid").on('click', function (evt) {
            var notePreview = evt.target.closest('.grid-item');
            self.openEditor($(notePreview).attr("note-id"));
        });
    }

    /** @param {string} text  @returns {string} */
    cvtToEditorHtml(text) {
        return urlify(text).replace(/\r?\n/gs, '<br>');
    }

    /** @param {string} htmlNote  @returns {string} */
    cvtToPlainText(htmlNote) {
        var text = deurlify(htmlNote).replaceAll(/<br>/g, '\n');
        // did we miss a tag?
        if (text.match(/[<>]/)) {
            if (DEBUG) console.log("conversion to plaintext failed:" + text);
            return null;
        }
        text = he.decode(text);
        return text;
    }

    /** @returns {void} */
    saveNote() {
        if (this.xhrSaveRequest) return;
        var plainText = this.cvtToPlainText(this.getEditorTextElement().html());
        if (plainText === null) {
            this.statusDisplay.updateStatus("conversion to plain text format failed");
            return;
        }
        var options = {
            url: $(location).attr("href"),
            contentType: 'application/json',
            data: JSON.stringify({ note: { text: plainText, id: this.editNoteId } }),
            type: 'POST'
        };
        if (this.editNoteId) {
            options.url += "u/";
        } else {
            options.url += "c/" + this.createNoteSessionId;
        }
        if (DEBUG) console.log("ajax options: ", options);
        this.xhrSaveRequest = jQuery.ajax(options);
        var self = this;
        this.xhrSaveRequest.done(function (data) { self.onSaveSuccess(); });
        this.xhrSaveRequest.fail(function (jqXHR, textStatus, errorThrown) {
            self.onSaveError(jqXHR, textStatus, errorThrown);
        });
        this.xhrSaveRequest.always(function () { self.xhrSaveRequest = undefined; });
    }
    onSaveSuccess() {
        if (DEBUG) console.log("saved");
        this.getEditorTextElement().html("");
        this.isDirty = false;
        this.toggleModal(false);
        this.liveSearchClient.restart();
    }
    onSaveError(jqXHR, textStatus, errorThrown) {
        this.isDirty = true;
        if (DEBUG) console.log(textStatus + ', ' + errorThrown, jqXHR.responseText);
        var res = JSON.parse(jqXHR.responseText);
        this.statusDisplay.updateStatus(res.error);
        if (!this.editNoteId) {
            if (!res.noteId) {
                throw new Error("response did not contain any note id");
            }
            this.editNoteId = res.noteId;
        }
    }
    openEditor(noteId = null) {
        if (this.isModal()) return;
        var tc = $("#editor .textcontent");
        if (noteId !== null) {
            var res = JSON.parse($.ajax({
                type: "GET",
                url: $(location).attr("href") + "r/" + noteId,
                async: false
            }).responseText);
            if (res.status != 0) {
                this.statusDisplay.updateStatus(res.error);
                return;
            }
            tc.html(this.cvtToEditorHtml(res.note.text));
            this.createNoteSessionId = '';
            $("#delete").show();
        } else {
            tc.html("");
            this.createNoteSessionId = makeid(20);
            $(".editbglabel").css({ visibility: "visible" });
            $("#delete").hide();
        }
        this.toggleModal(true);
        this.editNoteId = noteId;
        this.isDirty = false;
    }
    /** @returns {void} */
    deleteNote() {
        if (!this.editNoteId) return;
        var res = JSON.parse($.ajax({
            type: "POST",
            url: $(location).attr("href") + "d/" + this.editNoteId,
            async: false
        }).responseText);
        if (res.status != 0) {
            this.statusDisplay.updateStatus(res.error);
            return;
        }
        this.isDirty = false;
        this.toggleModal(false);
        this.liveSearchClient.restart();
    }

    //
    // Modal editor toggling
    //
    /**
     * 
     * @param {boolean} state 
     * @returns {void}
     */
    toggleModal(state) {
        if (DEBUG) console.log("toggleModal: ", state);
        if (state) {
            this.isDirty = false;
            $("#query").attr("tabindex", -1);
            $(".modal").css({ visibility: "visible" });
            $("#editor").css({ visibility: "visible" });
            $("#editor .textcontent").focus();
        } else {
            // TODO: fix race between save and further edits (goal: reliable background saves)
            if (this.isDirty) {
                this.saveNote();
                return;
            }
            $("#query").attr("tabindex", 0);
            $("#query").focus();
            $(".modal").css({ visibility: "hidden" });
            $("#editor").css({ visibility: "hidden" });
            $(".editbglabel").css({ visibility: "hidden" });
        }
    };
    isModal() {
        return parseInt($("#query").attr("tabindex")) != 0;
    }
} // class NoteEditor
