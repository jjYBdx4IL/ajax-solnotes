
const ResultWidget = class extends Widget {
    /**
     * @param {string} container .grid
     * @param {NoteEditor} noteEditor
     */
    constructor(container, noteEditor) {
        super(container);
        this.noteEditor = noteEditor
        
        // Grid interaction
        var self = this
        $(this.container).on('click', function(evt) { self.onClick(evt) })
    }
    /** @type {NoteEditor} */
    noteEditor = undefined
    currentColCount = 0;
    maxPreviewLength = 700;
    minColCount = 3;
    desiredColWidth = 240;

    /**
     * @param {JQuery.ClickEvent} evt
     */
    onClick(evt) {
        // ignore direct link clicks
        if ($(evt.target).is("a")) {
            return
        }
        // else open the note editor
        var notePreview = evt.target.closest('.grid-item');
        if (notePreview) {
            this.noteEditor.openEditor($(notePreview).attr("note-id"));
        }
    }

    /**
     * 
     * @param {SelectResponse} res 
     * @returns 
     */
    update(res) {
        var start = res.response.start;

        if (start == 0) {
            $(this.container).empty()
            this.relayoutColumns()
        }

        for (var i = 0, l = res.response.docs.length; i < l; i++) {
            var doc = res.response.docs[i];
            if (doc.text && doc.text.length) {
                var notePreview = $(this.template(doc.text[0])); // .grid-item
                notePreview.attr("note-id", doc.id);
                this.append(notePreview);
            }
        }
    }

    /**
     * space left to display more results?
     * @returns {boolean}
     */
    hasSpaceForMore() {
        var docHeight = $(document).height();
        var viewPortBottom = window.scrollY + window.innerHeight;
        var bottomOverShoot = docHeight - viewPortBottom;
        return bottomOverShoot < window.innerHeight;
    }

    desiredColCount() {
        return Math.max(this.minColCount, Math.floor($(this.container).width() / this.desiredColWidth));
    }

    /**
     * has the target width changed so much that we have a new column count?
     * @returns {boolean}
     */
    needsColumnRelayout() {
        return this.desiredColCount() != this.currentColCount;
    }

    relayoutColumns() {
        this.currentColCount = this.desiredColCount()
        if (DEBUG) console.log("ncols = " + this.currentColCount)
        for (var i = 0; i < this.currentColCount; i++) {
            $(this.container).append('<div class="grid-column"></div>')
        }
    }

    append(noteDiv) {
        // find column with most free space at bottom
        var i = 0
        var minHeight = -1
        var smallestCol = undefined
        $(this.container).children().each((j, col) => {
            var l = $(col).children().last()
            const h = l.length ? l.position().top + l.outerHeight() : 0
            if (h < minHeight || minHeight < 0) {
                minHeight = h
                i = j
                smallestCol = col
            }
        })

        // and append the element to it
        $(smallestCol).append(noteDiv);
    }

    /** @param {string} noteText */
    template(noteText) {
        var snippet = '';
        if (noteText.length > this.maxPreviewLength) {
            snippet = this.noteEditor.md.render(noteText.substring(0, this.maxPreviewLength) + " ...")
        } else {
            snippet = this.noteEditor.md.render(noteText)
        }
        return '<div class="grid-item"><div class="grid-item-textcontent render">' + snippet + '</div></div>';
    }
};
