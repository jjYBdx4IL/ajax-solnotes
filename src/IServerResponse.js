const NoteServerResponse = class {
    /** @type {number} */
    status = undefined;
    /** @type {string} */
    error = undefined;
}
  
const GetSolrConfigResponse = class extends NoteServerResponse {
    /** @type {string} */
    solrUrl = undefined;
}
  
  