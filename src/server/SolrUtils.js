
const solr = require('solr-client');


/**
 * 
 * @param {URL} solrUrl
 */
 function extractSolrCoreName(solrUrl) {
    var m = solrUrl.pathname.match(/\/([^\/]+)\/select$/)
    if (m.length == 2) {
        return m[1];
    } else {
        throw Error("cannot extract core name from solrUrl: " + solrUrl.toString())
    }
}
exports.extractSolrCoreName = extractSolrCoreName

/**
 * 
 * @param {URL} solrUrl
 */
function createClientFromUrl(solrUrl) {
    return solr.createClient({
        secure: solrUrl.protocol.startsWith('https'),
        host: solrUrl.hostname,
        port: parseInt(solrUrl.port),
        core: extractSolrCoreName(solrUrl)
    })
}
exports.createClientFromUrl = createClientFromUrl


/**
 * async-wrapper for solrClient.deleteAll()
 * 
 * @param {solr.Client} solrClient
 * @param {async.AsyncResultArrayCallback<any, Error>} cb 
 */
function deleteAll(solrClient, cb) {
    solrClient.deleteAll(null, function(err, obj){
        if (err) {
            cb(err)
        } else {
            cb()
        }
    })
}
exports.deleteAll = deleteAll

/**
 * async-wrapper for solrClient.softCommit()
 * 
 * @param {solr.Client} solrClient
 * @param {async.AsyncResultArrayCallback<any, Error>} cb 
 */
 function softCommit(solrClient, cb) {
    solrClient.softCommit(function(err, obj){
        if (err) {
            cb(err)
        } else {
            cb()
        }
    })
}
exports.softCommit = softCommit


/**
 * async-wrapper for solrClient.add(), solrClient.softCommit?()
 * 
 * @param {solr.Client} solrClient
 * @param {any} data
 * @param {boolean} softCommit
 * @param {(value: any) => void} resolve
 * @param {(reason?: any) => void} reject
 * @param {any} resolveValue
 */
function add(solrClient, data, softCommit, resolve, reject, resolveValue) {

    solrClient.add(data, null, function(err,obj){
        if(err) {
            reject("failed to update index: " + err);
        } else {
            if (softCommit) {
                solrClient.softCommit(function(err,res) {
                    if(err) {
                        reject("index softCommit failed: " + err);
                    } else {
                        resolve(resolveValue);
                    }
                });
            } else {
                resolve(resolveValue);
            }
        }
    })
}
exports.add = add


