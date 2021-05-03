
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
    md = undefined // markdown-it
    
    /** @type {LiveSearchClient} */
    liveSearchClient = undefined;
    /** @type {StatusDisplay} */
    statusDisplay = undefined;
    /** @type {JQuery<HTMLElement>} */
    textContentEl = undefined
    /** @type {string} to check whether editor is dirty */
    initialContent = undefined

    isDirty = function() {
        return this.textContentEl.val() != this.initialContent
    }

    /** @param {JQuery.ClickEvent} evt */
    onClick(evt) {
        if ($(evt.target).hasClass("link")) {
            window.open($(evt.target).text(), '_blank').focus();
        }
    }

    hintShown = false
    /** @param {HTMLElement} el */
    onInput(el) {
        // hide background label/hint?
        if (this.hintShown && ("" + this.textContentEl.val()).length) {
            $(".editbglabel").css({ visibility: "hidden" })
            this.hintShown = false
        }

        this.debouncedRender()
    }

    afterOpen() {
        if (DEBUG) console.log("onOpen")
        var self = this

        $("#query").attr("tabindex", -1);
        $(".modal").css({ visibility: "visible" });
        $("#editor").css({ visibility: "visible" });
        $("#editor .textcontent").trigger("focus");

        this.initialContent = "" + this.textContentEl.val()

        // show background label/hint ?
        if (("" + this.textContentEl.val()).length) {
            $(".editbglabel").css({ visibility: "hidden" });
            this.hintShown = false
        } else {
            $(".editbglabel").css({ visibility: "visible" });
            this.hintShown = true
        }

        this.textContentEl.on('input', function () { self.onInput(this) });

        // initial render
        this.render()
    }

    afterClose() {
        if (DEBUG) console.log("onClose")

        this.editNoteId = ''
        this.createNoteSessionId = ''
        this.textContentEl.html("")
        this.initialContent = undefined

        $("#query").attr("tabindex", 0);
        $("#query").trigger("focus"); // this pushed the result overview to the top atm, the query part should have static positioning (TODO)
        $(".modal").css({ visibility: "hidden" });
        $("#editor").css({ visibility: "hidden" });
        $(".editbglabel").css({ visibility: "hidden" });
    }

    render() {
        $("#editor .render").html(this.md.render("" + this.textContentEl.val()))
    }

    debouncedRender = _.debounce(function() {
        if (this.isOpen()) {
            this.render()
        }
    }, 300)

    setupMarkdownIt() {
        this.md = window.markdownit({
            linkify: true,
            breaks: true,
            highlight: function (str, lang) {
                if (lang && hljs.getLanguage(lang)) {
                  try {
                    return hljs.highlight(str, { language: lang }).value;
                  } catch (__) {}
                }
            
                return ''; // use external default escaping
              }
        });
        this.md.linkify.set({ fuzzyEmail: false }); // disables converting email to link

        // https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md#renderer        
        var defaultRender = this.md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
        this.md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrPush(['target', '_blank']);
            return defaultRender(tokens, idx, options, env, self);
        };

        // preserve empty lines
        // https://github.com/markdown-it/markdown-it/issues/211
        const defaultParagraphRenderer = this.md.renderer.rules.paragraph_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
        this.md.renderer.rules.paragraph_open = function (tokens, idx, options, env, self) {
          let result = '';
          if (idx > 1) {
            const inline = tokens[idx - 2];
            const paragraph = tokens[idx];
            if (inline.type === 'inline' && inline.map && inline.map[1] && paragraph.map && paragraph.map[0]) {
              const diff = paragraph.map[0] - inline.map[1];
              if (diff > 0) {
                result = '<br>'.repeat(diff);
              }
            }
          }
          return result + defaultParagraphRenderer(tokens, idx, options, env, self);
        };        
    }

    init() {
        var self = this;
        this.setupMarkdownIt()
        this.textContentEl = $("#editor .textcontent")
        this.textContentEl.on('click', function (evt) { self.onClick(evt); });

        document.addEventListener('keydown', event => {
            // Quick toggle between "create note (modal editor UI)" and search UI.
            // Will save changes when leaving the editor.
            if (event.key == "Escape") {
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

    isNoteEmpty() {
        return !$.trim("" + this.textContentEl.val()).length
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
        var plainText = this.textContentEl.val();
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
            self.textContentEl.removeAttr('readonly')
        });
        self.textContentEl.attr('readonly', 'readonly')
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
            this.textContentEl.val(res.note.text);
            this.createNoteSessionId = '';
            $("#delete").show();
        } else {
            this.textContentEl.val("");
            this.createNoteSessionId = makeid(20);
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
