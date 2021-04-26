const ServerResponse = class {
    /** @type {number} */
    status = undefined;
    /** @type {string} */
    error = undefined;
  }
  
  const GetSolrConfigResponse = class extends ServerResponse {
    /** @type {string} */
    solrUrl = undefined;
  }
  
  