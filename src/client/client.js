
// init block. wait for page to finish loading.
$(function () {
    var resultWidget = new ResultWidget("#docs");
    var liveSearchWidget = new LiveSearchWidget("#search");
    var lsClient = new LiveSearchClient(liveSearchWidget, resultWidget);
    lsClient.setRowsPerRequest(20);
    lsClient.updateResults();
    var statusDisplay = new StatusDisplay();
    var noteEditor = new NoteEditor();
    noteEditor.liveSearchClient = lsClient;
    noteEditor.statusDisplay = statusDisplay;
    if (DEBUG) console.log("end");
    //if (DEBUG) openEditor("testnote");
});
