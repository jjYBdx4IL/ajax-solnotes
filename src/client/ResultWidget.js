
const ResultWidget = class extends Widget {
    /**
     * @param {string} container .grid
     */
    constructor(container) {
        super(container);
    }
    /** @type {number[]} column height */
    colMaxY = [];
    /** element (column) width */
    elw = 0;
    maxPreviewLength = 700;

    /**
     * 
     * @param {SelectResponse} res 
     * @returns 
     */
    update(res) {
        var q = res.responseHeader.params.q;
        var rows = parseInt(res.responseHeader.params.rows);
        var numFound = res.response.numFound;
        var start = res.response.start;
        var numFoundExact = res.response.numFoundExact;

        if (start == 0) {
            $(this.container).empty();
            this.colMaxY = []; // force column re-layout
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

    /**
     * has the target width changed so much that we have a new column count?
     * @returns {boolean}
     */
    needsColumnRelayout() {
        var ncols = Math.max(3, Math.floor($(this.container).width() / this.elw));
        return ncols != this.colMaxY.length;
    }

    append(noteDiv) {
        $(this.container).append(noteDiv);

        if (!this.colMaxY.length) {
            this.elw = noteDiv.outerWidth() + parseInt(noteDiv.css('margin-left')) + parseInt(noteDiv.css('margin-right'));
            var ncols = Math.max(3, Math.floor($(this.container).width() / this.elw));
            if (DEBUG) console.log("v = ", this.elw);
            for (var i = 0; i < ncols; i++) {
                this.colMaxY.push(0);
            }
        }

        // find column with most free space at bottom
        var i = 0;
        for (var j = 1; j < this.colMaxY.length; j++) {
            if (this.colMaxY[j] < this.colMaxY[i]) {
                i = j;
            }
        }

        // and append the element to it
        noteDiv.css({ top: this.colMaxY[i], left: i * this.elw });
        this.colMaxY[i] += noteDiv.outerHeight() + parseInt(noteDiv.css('margin-top')) + parseInt(noteDiv.css('margin-bottom'));
    }

    /** @param {string} noteText */
    template(noteText) {
        var snippet = '';
        if (noteText.length > this.maxPreviewLength) {
            snippet = urlify($("<div>").text(noteText.substring(0, this.maxPreviewLength) + " ...").html());
        } else {
            snippet = urlify($("<div>").text(noteText).html());
        }
        snippet = snippet.replaceAll(/\r?\n/g, "<br>");
        return '<div class="grid-item"><div class="grid-item-textcontent">' + snippet + '</div></div>';
    }
};
