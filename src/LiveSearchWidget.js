
const LiveSearchWidget = class extends Widget {
    /**
     * @param {string} container 
     */
    constructor(container) {
        super(container);
        this.attach();
    }
    /** @param {LiveSearchClient} client @returns {void} */
    setLiveSearchClient(client) {
        this.lsClient = client;
    }
    /** @type {LiveSearchClient} */
    lsClient = undefined;

    /** @param {HTMLInputElement} el */
    onInput(el) {
        // convert search expression to solr nota
        var values = $.trim("" + $(el).val()).split(/\s+/);
        var maxLen = 0;
        var newValues = [];
        for (var i = 0; i < values.length; i++) {
            var value = values[i];
            var not = false;
            if (value.substr(0, 1) === '-') {
                not = true;
                value = value.substr(1);
            }
            maxLen = Math.max(maxLen, value.length);
            // skip incomplete search expressions
            if (!value.length) {
                continue;
            }
            value = value.replaceAll("\\", "\\\\");
            value = value.replaceAll("\"", "\\\"");
            value = value.replaceAll("*", "\\*");
            value = value.replaceAll("^", "\\^");
            // always do a substring match
            newValues.push((not ? "NOT " : "") + this.lsClient.contentFieldName + ':*' + value + '*');
        }
        values = newValues;
        // ignore search term input until we have at least one term of length 3+
        if (maxLen < 3) {
            values = [this.lsClient.contentFieldName + ':*'];
        }
        if (values.length) {
            // always use logical AND to combine the substring matches
            this.lsClient.updateQuery(values.join(' AND '));
        }
    }

    attach() {
        var self = this;
        $(this.container).find('input').on('input', function () {
            self.onInput(this);
        });
    }
};

