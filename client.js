var Manager;

//
// Utility functions
//
jQuery.fn.centerOnScreen = function (centerHorizontally=true, centerVertically=true) {
  this.css("position","fixed");
  if(centerHorizontally)
    this.css("left", Math.max(0, (($(window).width() - $(this).outerWidth()) / 2) + 
                                              $(window).scrollLeft()) + "px");
  if(centerVertically)
    this.css("top", Math.max(0, (($(window).height() - $(this).outerHeight()) / 2) + 
                                          $(window).scrollTop()) + "px");
  return this;
}
function makeid(length) {
  var result           = [];
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
    result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
  }
  return result.join('');
}

//
// Status display
//
var clearStatusTimer = null;
function updateStatus(msg, duration=5) {
  var el = $("#status");
  el.html(he.encode(msg));
  el.css({visibility: "visible"});
  el.centerOnScreen(true, false);
  if (clearStatusTimer !== null) {
    clearTimeout(clearStatusTimer);
    clearStatusTimer = null;
  }
  if (duration > 0) {
    clearStatusTimer = setTimeout(function() {
      el.css({visibility: "hidden"});
      clearStatusTimer = null;
    }, duration * 1000);
  }
}

//
// Note editor
//
function getEditorTextElement() {
  return $("#editor .textcontent");
}
function editorHasUnsavedContent() {
  var val = getEditorTextElement().text().trim();
  return val.length != 0;
}
var xhrSaveRequest = null;
var editNoteId = null;
var createNoteSessionId = '';
var isDirty = false;
getEditorTextElement().on('input', function() {
  isDirty = true;
});
function cvtToPlainText(htmlNote) {
  var text = htmlNote.replaceAll(/<\/?div>/g, '');
  text = text.replaceAll(/<br>/g, '\n');
  // did we miss a tag?
  if (text.match(/[<>]/)) {
    console.log("conversion to plaintext failed");
    return null;
  }
  text = he.decode(text);
  return text;
}
function saveNote() {
  if (xhrSaveRequest !== null) return;
  var plainText = cvtToPlainText(getEditorTextElement().html());
  if (plainText === null) {
    updateStatus("conversion to plain text format failed");
    return;
  }
  var options = {
    url: $(location).attr("href"),
    contentType: 'application/json',
    data: JSON.stringify({note: {text: plainText, id: editNoteId}}),
    type: 'POST'
  };
  if (editNoteId !== null) {
    options.url += "u/";
  } else {
    options.url += "c/" + createNoteSessionId;
  }
  //console.log("ajax options: ", options);
  xhrSaveRequest = jQuery.ajax(options);
  xhrSaveRequest.done(function(data){
    console.log("saved");
    getEditorTextElement().html("");
    isDirty = false;
    toggleModal(false);
    Manager.doRequest();
  });
  xhrSaveRequest.fail(function (jqXHR, textStatus, errorThrown) {
    isDirty = true;
    console.log(textStatus + ', ' + errorThrown, jqXHR.responseText);
    var res = JSON.parse(jqXHR.responseText);
    updateStatus(res.error);
    if (editNoteId === null) {
      if (res.noteId === void 0 || !res.noteId) {
        throw Error("response did not contain any note id");
      }
      editNoteId = res.noteId;
    }
  });
  xhrSaveRequest.always(function (){
    xhrSaveRequest = null;
  });
}
function openEditor(noteId=null) {
  if(isModal()) return;
  if (noteId !== null) {
    var res = JSON.parse($.ajax({
      type: "GET",
      url: $(location).attr("href") + "r/" + noteId,
      async: false
    }).responseText);
    if (res.status != 0) {
      updateStatus(res.error);
      return;
    }
    $("#editor .textcontent").html(res.note.text);
    createNoteSessionId = '';
  } else {
    $("#editor .textcontent").html("");
    createNoteSessionId = makeid(20);
  }
  toggleModal(1);
  editNoteId = noteId;
  isDirty = false;
}

//
// Modal editor toggling
//
function toggleModal(state) {
  //console.log("toggleModal: " + state);
  if (state) {
    isDirty = false;
    $("#query").attr("tabindex", -1);
    $(".modal").css({visibility: "visible"});
    $("#editor").css({visibility: "visible"});
    $("#editor .textcontent").focus();
  } else {
    // TODO: fix race between save and further edits (goal: reliable background saves)
    if(isDirty) {
      saveNote();
      return;
    }
    $("#query").attr("tabindex", 0);
    $("#query").focus();
    $(".modal").css({visibility: "hidden"});
    $("#editor").css({visibility: "hidden"});
  }
};
$("#addnote").on("click", function(){openEditor(null)});
$(".modal").on("click", function(){toggleModal(0)});
function isModal() {
  return parseInt($("#query").attr("tabindex")) != 0;
}
$("#editor").on('keydown', function(event) {
  if (event.key == "Escape") {
    toggleModal(false);
  }
});
//toggleModal(1);

//
// Grid interaction
//
$(".grid").on('click', function(evt) {
  var notePreview = evt.target.closest('.grid-item');
  openEditor($(notePreview).attr("note-id"));
});




require.config({
  paths: {
    core: 'core',
    widgets: 'widgets'
  },
  //urlArgs: "bust=" +  (new Date()).getTime()
});

(function ($) {

define([
  'core/Manager',
  'core/ParameterStore',
  'widgets/LiveSearchWidget',
  'widgets/ResultWidget',
], function () {
  $(function () {

    Manager = new AjaxSolr.Manager({
      solrUrl: 'http://localhost:8983/solr/notes/',
      solrContentFieldName: 'text'
    });
    var resultWidget = new AjaxSolr.ResultWidget({
      id: 'result',
      target: '#docs',
    }); 
    Manager.addWidget(new AjaxSolr.LiveSearchWidget({
        id: 'text2',
        target: '#search',
        resultWidget: resultWidget,
      }));
    Manager.addWidget(resultWidget);
    Manager.init();
    var params = {
      'json.nl': 'map',
      'rows': '25',
      'sort': 'lmod_dt desc',
      'q': Manager.solrContentFieldName + ':*'
    };
    for (var name in params) {
      Manager.store.addByValue(name, params[name]);
    }
    Manager.doRequest();
  });

  $.fn.showIf = function (condition) {
    if (condition) {
      return this.show();
    }
    else {
      return this.hide();
    }
  }
});

})(jQuery);
