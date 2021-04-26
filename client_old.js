var Manager;

//
// Utility functions
//
$.fn.centerOnScreen = function (centerHorizontally = true, centerVertically = true) {
  this.css("position", "fixed");
  if (centerHorizontally)
    this.css("left", Math.max(0, (($(window).width() - $(this).outerWidth()) / 2) +
      $(window).scrollLeft()) + "px");
  if (centerVertically)
    this.css("top", Math.max(0, (($(window).height() - $(this).outerHeight()) / 2) +
      $(window).scrollTop()) + "px");
  return this;
}


/** @param {number} length @returns {string} */
function makeid(length) {
  var result           = [];
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
    result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
  }
  return result.join('');
}

const urlifyRegex = new RegExp("(((?:(http|https|Http|Https|rtsp|Rtsp):\\/\\/(?:(?:[a-zA-Z0-9\\$\\-\\_\\.\\+\\!\\*\\'\\(\\)"
+ "\\,\\;\\?\\&\\=]|(?:\\%[a-fA-F0-9]{2})){1,64}(?:\\:(?:[a-zA-Z0-9\\$\\-\\_"
+ "\\.\\+\\!\\*\\'\\(\\)\\,\\;\\?\\&\\=]|(?:\\%[a-fA-F0-9]{2})){1,25})?\\@)?)?"
+ "((?:(?:[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}\\.)+"   // named host
+ "(?:"   // plus top level domain
+ "(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])"
+ "|(?:biz|b[abdefghijmnorstvwyz])"
+ "|(?:cat|com|coop|c[acdfghiklmnoruvxyz])"
+ "|d[ejkmoz]"
+ "|(?:edu|e[cegrstu])"
+ "|f[ijkmor]"
+ "|(?:gov|g[abdefghilmnpqrstuwy])"
+ "|h[kmnrtu]"
+ "|(?:info|int|i[delmnoqrst])"
+ "|(?:jobs|j[emop])"
+ "|k[eghimnrwyz]"
+ "|l[abcikrstuvy]"
+ "|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])"
+ "|(?:name|net|n[acefgilopruz])"
+ "|(?:org|om)"
+ "|(?:pro|p[aefghklmnrstwy])"
+ "|qa"
+ "|r[eouw]"
+ "|s[abcdeghijklmnortuvyz]"
+ "|(?:tel|travel|t[cdfghjklmnoprtvwz])"
+ "|u[agkmsyz]"
+ "|v[aceginu]"
+ "|w[fs]"
+ "|y[etu]"
+ "|z[amw]))"
+ "|(?:(?:25[0-5]|2[0-4]" // or ip address
+ "[0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\\.(?:25[0-5]|2[0-4][0-9]"
+ "|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\\.(?:25[0-5]|2[0-4][0-9]|[0-1]"
+ "[0-9]{2}|[1-9][0-9]|[1-9]|0)\\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}"
+ "|[1-9][0-9]|[0-9])))"
+ "(?:\\:\\d{1,5})?)" // plus option port number
+ "(\\/(?:(?:[a-zA-Z0-9\\;\\/\\?\\:\\@\\&\\=\\#\\~"  // plus option query params
+ "\\-\\.\\+\\!\\*\\'\\(\\)\\,\\_])|(?:\\%[a-fA-F0-9]{2}))*)?"
+ "(?:\\b|$))", "g");  
/** @param {string} text  @returns {string} */
function urlify(text) {
  return text.replaceAll(urlifyRegex, '<div class="link">$1</a>');
}
//console.log("test:"+urlify("https://www.google.de http://www.bla.de"));
const deurlifyRegex = new RegExp("<div class=\"link\">([^<>]+)</div>", "g");
/** @param {string} text  @returns {string} */
function deurlify(text) {
  return text.replaceAll(deurlifyRegex, '$1');
}
//console.log("test:"+deurlify(urlify("https://www.google.de http://www.bla.de")));

//
// Status display
//
/** @type {NodeJS.Timeout} */
var clearStatusTimer = null;
/** @param {string} msg @returns {void} */
function updateStatus(msg, duration=5) {
  var el = $("#status");
  el.html(he.encode(msg));
  el.fadeIn();
  el.centerOnScreen(true, false);
  if (clearStatusTimer !== null) {
    clearTimeout(clearStatusTimer);
    clearStatusTimer = null;
  }
  if (duration > 0) {
    clearStatusTimer = setTimeout(function() {
      el.fadeOut();
      clearStatusTimer = null;
    }, duration * 1000);
  }
}

//
// Note editor
//
///** @returns {JQuery<HTMLElement>} */
function getEditorTextElement() {
  return $("#editor .textcontent");
}
///** @type {JQuery.jqXHR} */
var xhrSaveRequest = null;
var editNoteId = '';
var createNoteSessionId = '';
var isDirty = false;
getEditorTextElement().on('input', function() {
  if (!isDirty) {
    $(".editbglabel").css({visibility: "hidden"});
    isDirty = true;
  }
});
getEditorTextElement().on('click', function(evt) {
  if ($(evt.target).hasClass("link")) {
    window.open($(evt.target).text(), '_blank').focus();
  }
});

// prevent browsers from inserting divs into contenteditable div
// (otherwise we have a hard time to condense the html down into properly formatted plain text)
document.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    document.execCommand('insertLineBreak')
    event.preventDefault()
  }
})

/** @param {string} text  @returns {string} */
function cvtToEditorHtml(text) {
  return urlify(text).replace(/\r?\n/gs, '<br>');
}

/** @param {string} htmlNote  @returns {string} */
function cvtToPlainText(htmlNote) {
  var text = deurlify(htmlNote).replaceAll(/<br>/g, '\n');
  // did we miss a tag?
  if (text.match(/[<>]/)) {
    console.log("conversion to plaintext failed:" + text);
    return null;
  }
  text = he.decode(text);
  return text;
}

/** @returns {void} */
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
  if (editNoteId) {
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
    if (!editNoteId) {
      if (!res.noteId) {
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
  var tc = $("#editor .textcontent");
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
    tc.html(cvtToEditorHtml(res.note.text));
    createNoteSessionId = '';
    $("#delete").show();
  } else {
    tc.html("");
    createNoteSessionId = makeid(20);
    $(".editbglabel").css({visibility: "visible"});
    $("#delete").hide();
  }
  toggleModal(true);
  editNoteId = noteId;
  isDirty = false;
}
/** @returns {boolean} */
function deleteNote() {
  if (!editNoteId) return;
  var res = JSON.parse($.ajax({
    type: "POST",
    url: $(location).attr("href") + "d/" + editNoteId,
    async: false
  }).responseText);
  if (res.status != 0) {
    updateStatus(res.error);
    return false;
  }
  return true;
}

//
// Modal editor toggling
//
/**
 * 
 * @param {boolean} state 
 * @returns {void}
 */
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
    $(".editbglabel").css({visibility: "hidden"});
  }
};
$("#addnote").on("click", function(){openEditor(null)});
$(".modal").on("click", function(){toggleModal(false)});
$("#cancel").on("click", function(){
  isDirty = false;
  toggleModal(false);
});
$("#delete").on("click", function(){
  if(confirm('Really DELETE ERASE DESTROY VAPORIZE this note?')) {
    if (deleteNote()) {
      isDirty = false;
      toggleModal(false);
      Manager.doRequest();
    }
  }
});
function isModal() {
  return parseInt($("#query").attr("tabindex")) != 0;
}
$("#editor").on('keydown', function(event) {
  if (event.key == "Escape") {
    toggleModal(false);
  }
});
//openEditor("testnote");


//
// Grid interaction
//
$(".grid").on('click', function(evt) {
  var notePreview = evt.target.closest('.grid-item');
  openEditor($(notePreview).attr("note-id"));
});






//@ts-ignore
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
});

})(jQuery);
