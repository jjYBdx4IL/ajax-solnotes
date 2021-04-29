
/**
 * For simplicity, we don't use async when loading/saving notes in the editor.
 */
const NoteEditor = class {
    constructor() {
        this.init();
    }
    /** @type {JQuery.jqXHR} */
    xhrSaveRequest = null;
    editNoteId = '';
    createNoteSessionId = '';
    
    /** @type {LiveSearchClient} */
    liveSearchClient = undefined;
    /** @type {StatusDisplay} */
    statusDisplay = undefined;
    /** @type {JQuery<HTMLElement>} */
    textContentEl = undefined
    /** @type {string} to check whether editor is dirty */
    initialHtmlContent = undefined

    isDirty = function() {
        return this.textContentEl.html() != this.initialHtmlContent
    }

    /** @param {JQuery.ClickEvent} evt */
    onClick(evt) {
        if ($(evt.target).hasClass("link")) {
            window.open($(evt.target).text(), '_blank').focus();
        }
    }
    /** @param {HTMLElement} el */
    onInput(el) {
        // hide background label/hint?
        if (this.textContentEl.html().length) {
            $(".editbglabel").css({ visibility: "hidden" })
            $(el).off('input')
        }
    }

    afterOpen() {
        if (DEBUG) console.log("onOpen")
        var self = this

        $("#query").attr("tabindex", -1);
        $(".modal").css({ visibility: "visible" });
        $("#editor").css({ visibility: "visible" });
        $("#editor .textcontent").trigger("focus");

        this.initialHtmlContent = this.textContentEl.html()

        // show background label/hint ?
        if (this.textContentEl.html().length) {
            $(".editbglabel").css({ visibility: "hidden" });
        } else {
            $(".editbglabel").css({ visibility: "visible" });
            this.textContentEl.on('input', function () { self.onInput(this) });
        }
    }

    afterClose() {
        if (DEBUG) console.log("onClose")

        this.editNoteId = ''
        this.createNoteSessionId = ''
        this.textContentEl.html("")
        this.initialHtmlContent = undefined

        $("#query").attr("tabindex", 0);
        $("#query").trigger("focus"); // this pushed the result overview to the top atm, the query part should have static positioning (TODO)
        $(".modal").css({ visibility: "hidden" });
        $("#editor").css({ visibility: "hidden" });
        $(".editbglabel").css({ visibility: "hidden" });
    }

    init() {
        var self = this;
        this.textContentEl = $("#editor .textcontent")
        this.textContentEl.on('click', function (evt) { self.onClick(evt); });

        // paste as plain text only
        $("[contenteditable]").each((i,el) => el.addEventListener("paste", function(e) {
            e.preventDefault();
            document.execCommand("insertHTML", false, self.cvtToEditorHtml(e.clipboardData.getData('text/plain')));
        }));

        document.addEventListener('keydown', event => {
            // prevent browsers from inserting divs into contenteditable div
            // (otherwise we have a hard time to condense the html down into properly formatted plain text)
            if (event.key === 'Enter') {
                document.execCommand('insertLineBreak')
                event.preventDefault()
            }
            // Quick toggle between "create note (modal editor UI)" and search UI.
            // Will save changes when leaving the editor.
            else if (event.key == "Escape") {
                if (self.isOpen()) {
                    self.saveNote()
                } else {
                    self.openEditor(null);
                }
            }
        })

        $(".modal").on("click", function (evt) {
            self.saveNote()
        });
        $("#cancel").on("click", function () {
            self.cancelEdit()
        });
        $("#delete").on("click", function () {
            if (confirm('Really DELETE ERASE DESTROY VAPORIZE this note?')) {
                self.deleteNote();
            }
        });
    }

    /** @param {string} text  @returns {string} */
    cvtToEditorHtml(text) {
        if(DEBUG) console.log("cvtToEditorHtml input: " + text)
        text = he.encode(text)
        if(DEBUG) console.log("cvtToEditorHtml after he.encode: " + text)
        var val = urlify(text).replace(/\r?\n/gs, '<br>')
        if(DEBUG) console.log("cvtToEditorHtml output: " + val)
        return val
    }

    /** @param {string} htmlNote  @returns {string} */
    cvtToPlainText(htmlNote) {
        var text = deurlify(htmlNote).replaceAll(/<br>/g, '\n');
        text = he.decode(text);
        if (text == '') {
            text += "\n"
        }
        if (DEBUG) console.log("cvtToPlainText result: " + text)
        return text;
    }

    isNoteEmpty() {
        return !$.trim(this.textContentEl.text()).length
    }

    /** @returns {void} */
    saveNote() {
        if (this.xhrSaveRequest) {
            return
        }
        if (!this.isDirty()) {
            this.afterClose()
            return
        }
        var plainText = this.cvtToPlainText(this.textContentEl.html());
        if (plainText === null) {
            this.statusDisplay.updateStatus("conversion to plain text format failed");
            return;
        }
        if (this.isNoteEmpty()) {
            if (this.editNoteId) {
                this.statusDisplay.updateStatus("Refusing to save empty note. Please use delete button.")
            }
            this.afterClose()
            return
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
        this.xhrSaveRequest.always(function () {
            self.xhrSaveRequest = undefined
            self.textContentEl.attr('contenteditable', 'true')
        });
        self.textContentEl.attr('contenteditable', 'false')
    }
    onSaveSuccess() {
        if (DEBUG) console.log("saved");
        this.liveSearchClient.restart()
        this.afterClose()
    }
    onSaveError(jqXHR, textStatus, errorThrown) {
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
    isOpen() {
        return this.editNoteId || this.createNoteSessionId
    }
    /**
     * 
     * @param {string} noteId - leave empty to start a new note
     * @returns 
     */
    openEditor(noteId = '') {
        var self = this
        if (this.isOpen()) return;
        if (noteId) {
            var res = JSON.parse($.ajax({
                type: "GET",
                url: $(location).attr("href") + "r/" + noteId,
                async: false
            }).responseText);
            if (res.status != 0) {
                this.statusDisplay.updateStatus(res.error);
                return;
            }
            this.textContentEl.html(this.cvtToEditorHtml(res.note.text));
            this.createNoteSessionId = '';
            $("#delete").show();
        } else {
            this.textContentEl.html("");
            this.createNoteSessionId = makeid(20);
            $(".editbglabel").css({ visibility: "visible" });
            $("#delete").hide();
        }
        this.editNoteId = noteId;
        this.afterOpen()
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
        this.liveSearchClient.restart()
        this.afterClose()
    }
    cancelEdit() {
        this.afterClose()
    }
} // class NoteEditor
