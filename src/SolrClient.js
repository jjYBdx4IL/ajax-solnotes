
const SolrClient = class {
    constructor() {
        this.pullConfigFromServer();
        this.selectUrl = this.selectUrl;
        this.q = this.contentFieldName + ':*';
    }
    selectUrl = '';
    disableJsonp = false;
    proxyUrl = '';
    contentFieldName = 'text';
    rowsPerRequest = 25;
    json_nl = 'map';
    sort = 'lmod_dt desc';
    q = '';
    start = 0;
    /** @type {JQuery.jqXHR} */
    currentRequest = undefined;
    pullConfigFromServer() {
        /** @type {GetSolrConfigResponse} */
        var res = JSON.parse($.ajax({
            type: "GET",
            url: $(location).attr("href") + "getSolrConfig",
            async: false
        }).responseText);
        if (res.status != 0) {
            throw new Error(res.error);
        }
        this.selectUrl = res.solrUrl;
    }
    /** @param {number} rows */
    setRowsPerRequest(rows) {
        this.rowsPerRequest = rows;
    }
    abort() {
        if (this.currentRequest) {
            this.currentRequest.abort();
            this.currentRequest = undefined;
        }
    }
    startRequest() {
        var self = this;
        var options = { dataType: 'json', jsonp: !this.disableJsonp, context: {} };
        var qs = "q=" + encodeURIComponent(this.q)
            + "&start=" + this.start
            + "&rows=" + this.rowsPerRequest
            + "&sort=" + encodeURIComponent(this.sort)
            + "&json.nl=" + encodeURIComponent(this.json_nl);
        if (this.proxyUrl) {
            options.url = this.proxyUrl;
            options.data = { query: qs };
            options.type = 'POST';
        }
        else {
            options.url = this.selectUrl + '?' + qs + '&wt=json' + (this.disableJsonp ? '' : '&json.wrf=?');
        }
        if (DEBUG) console.log("ajax options: ", options);
        this.currentRequest = $.ajax(options);
        this.currentRequest.done(function (res) {
            if (DEBUG) console.log(res);
            self.handleResponse(res);
        });
        this.currentRequest.fail(function (jqXHR, textStatus, errorThrown) {
            self.handleError(jqXHR, textStatus, errorThrown);
        });
        this.currentRequest.always(function () {
            self.handleAlways();
        });
    }
    handleResponse(res) {
        throw new Error("not implemented");
    }
    /**
     * @param {JQuery.jqXHR} jqXHR
     * @param {JQuery.Ajax.ErrorTextStatus} textStatus 
     * @param {string} errorThrown
     * @returns {void}
     */
    handleError(jqXHR, textStatus, errorThrown) {
        throw new Error(textStatus + " " + errorThrown);
    }
    handleAlways() {
    }
};
