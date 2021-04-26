
/**
 * This class' task is to coordinate the query and result widgets and the async requests.
 * This is what can happen:
 * <ul>
 * <li>Seach field gets changed by user -> updateQuery() -> abort current request, cancel timeout, start new request (start=0, new search query)
 * <li>request reply comes in -> update result view, schedule timer
 * <li>Timeout strikes:
 *   <ul>
 *   <li>start over (start=0, start request) if column layout needs an update (browser tab width changed significantly)
 *   <li>there is space left on screen and results set not exhausted -> (start+=x, start request)
 *   <li>none of the above -> re-schedule the timer to check again later
 *   </ul>
 * </ul>
 * There is always either a single request or a single timeout pending. This keeps things simple and reliable and prevents out-of-order reply issues etc.
 * @param {string} selectUrl 
 * @param {string} contentFieldName 
 * @param {LiveSearchWidget} liveSearchWidget 
 * @param {ResultWidget} resultWidget 
 */
 const LiveSearchClient = class extends SolrClient {
    constructor(liveSearchWidget, resultWidget) {
      super();
      this.liveSearchWidget = liveSearchWidget;
      this.resultWidget = resultWidget;
      this.liveSearchWidget.setLiveSearchClient(this);
    }
    /** @type {LiveSearchWidget} */
    liveSearchWidget = undefined;
    /** @type {ResultWidget} */
    resultWidget = undefined;
    /** @type {number} */
    timer = undefined;
    /** @type {SelectResponse} */
    res = undefined;
  
    updateQuery(newQuery) {
      if (this.q != newQuery) {
        this.q = newQuery;
        this.restart();
      }
    }
    restart() {
      this.start = 0;
      this.updateResults();
    }
    updateResults() {
      clearTimeout(this.timer);
      this.abort();
      this.startRequest();
    }
    handleResponse(res) {
      this.res = res;
      this.resultWidget.update(res);
      this.startTimer();
    }
    /**
     * @override
     * @param {JQuery.jqXHR} jqXHR
     * @param {JQuery.Ajax.ErrorTextStatus} textStatus 
     * @param {string} errorThrown
     * @returns {void}
     */
     handleError(jqXHR, textStatus, errorThrown) {
        if (textStatus !== 'abort') {
            super.handleError(jqXHR, textStatus, errorThrown);
        }
    }
    startTimer() {
      var self = this;
      this.timer = window.setTimeout(function() {
        self.handleTimer();
      }, 1000);
    }
    handleTimer() {
      // need to update the column count?
      if (this.resultWidget.needsColumnRelayout()) {
        this.restart();
        return;
      }
  
      // no more rows?
      if (this.res.response.start + this.rowsPerRequest >= this.res.response.numFound) {
        this.startTimer();
        return;
      }
  
      // screen full?
      if (!this.resultWidget.hasSpaceForMore()) {
        this.startTimer();
        return;
      }
  
      // load more
      this.start += this.rowsPerRequest;
      this.startRequest();
    }
  }
  