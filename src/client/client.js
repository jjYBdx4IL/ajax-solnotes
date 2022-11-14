
// init block. wait for page to finish loading.
$(function () {
    var noteEditor = new NoteEditor();
    var resultWidget = new ResultWidget("#docs", noteEditor);
    var liveSearchWidget = new LiveSearchWidget("#query");
    var lsClient = new LiveSearchClient(liveSearchWidget, resultWidget);
    lsClient.setRowsPerRequest(20);
    lsClient.updateResults();
    var statusDisplay = new StatusDisplay();
    noteEditor.liveSearchClient = lsClient;
    noteEditor.statusDisplay = statusDisplay;
    $("#addnote").on("click", function () { noteEditor.openEditor() });
    if (DEBUG) console.log("end");
    //if (DEBUG) openEditor("testnote");
});
