
const ResultWidget = class extends Widget {
    /**
     * @param {string} container .grid
     */
    constructor(container) {
        super(container);
    }
    currentColCount = 0;
    maxPreviewLength = 700;
    minColCount = 3;
    desiredColWidth = 240;

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
            this.currentColCount = 0; // force column re-layout
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

    append(noteDiv) {
        if (!this.currentColCount) {
            this.currentColCount = this.desiredColCount()
            if (DEBUG) console.log("ncols = " + this.currentColCount)
            for (var i = 0; i < this.currentColCount; i++) {
                $(this.container).append('<div class="grid-column"></div>')
            }
        }

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
            snippet = urlify($("<div>").text(noteText.substring(0, this.maxPreviewLength) + " ...").html());
        } else {
            snippet = urlify($("<div>").text(noteText).html());
        }
        snippet = snippet.replaceAll(/\r?\n/g, "<br>");
        return '<div class="grid-item"><div class="grid-item-textcontent">' + snippet + '</div></div>';
    }
};
