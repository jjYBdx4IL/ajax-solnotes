(function (callback) {
  if (typeof define === 'function' && define.amd) {
    define(['core/AbstractWidget'], callback);
  }
  else {
    callback();
  }
}(function () {

(function ($) {

AjaxSolr.ResultWidget = AjaxSolr.AbstractWidget.extend({
  init: function() {
    this.timer = null;
    this.colMaxY = [];
    this.elw = 0;
    this.lastTargetWidth = 0;
    this.maxPreviewLength = 800;
    var self = this;
    $(window).on('resize', function(){
      var win = $(this); //this = window
    });
  },

  afterRequest: function () {
    var res = this.manager.response;
    var q = res.responseHeader.params.q;
    var rows = parseInt(res.responseHeader.params.rows);
    var numFound = parseInt(res.response.numFound);
    var start = parseInt(res.response.start);
    var numFoundExact = res.response.numFoundExact;

    if(start == 0) {
      $(this.target).empty();
      this.colMaxY = [];
    }

    for (var i = 0, l = res.response.docs.length; i < l; i++) {
      var doc = res.response.docs[i];
      if (doc.text !== void 0 && doc.text.length > 0) {
        var notePreview = $(this.template(doc.text[0])); // .grid-item
        notePreview.attr("note-id", doc.id);
        this.append(notePreview);
      }
    }
    
    // no more results?
    if (start + rows >= numFound) return;

    var self = this;
    this.timer = setTimeout(function(){self.timedUpdate(self)}, 1000);
  },

  timedUpdate: function(self) {
    var res = self.manager.response;
    var q = res.responseHeader.params.q;
    var rows = parseInt(res.responseHeader.params.rows);
    var numFound = parseInt(res.response.numFound);
    var start = parseInt(res.response.start);
    var numFoundExact = res.response.numFoundExact;

    // no more results?
    if (start + rows >= numFound) return;

    // has the target width changed so much that we have a new column count?
    var ncols = Math.max(3, Math.floor($(self.target).width() / self.elw));
    if (ncols != self.colMaxY.length) {
      // then start over loading the results
      self.manager.store.get("start").val(0);
      self.doRequest();
      return;
    }

    // no more space to display more results?
    var docHeight = $(document).height();
    var viewPortBottom = window.scrollY + window.innerHeight;
    var bottomOverShoot = docHeight - viewPortBottom;
    if (bottomOverShoot > window.innerHeight/2) {
      // check again later
      self.timer = setTimeout(function(){self.timedUpdate(self)}, 1000);
      return;
    }

    // acquire more results
    self.manager.store.get("start").val(start+rows);
    self.doRequest();
  },

  append: function(noteDiv) {
    $(this.target).append(noteDiv);
    // console.log(noteDiv.position().top);
    // console.log(noteDiv.outerWidth());

    if (this.colMaxY.length == 0) {
      this.elw = noteDiv.outerWidth() + parseInt(noteDiv.css('margin-left')) + parseInt(noteDiv.css('margin-right'));
      var ncols = Math.max(3, Math.floor($(this.target).width() / this.elw));
      //console.log("ncols = " + this.ncols);
      for(var i=0; i<ncols; i++) {
        this.colMaxY.push(0);
      }
    }

    // find column with most free space at bottom
    var i = 0;
    for (var j = 1; j < this.colMaxY.length; j++) {
      if (this.colMaxY[j] < this.colMaxY[i]) {
        i = j;
      }
    }

    // and append the element to it
    noteDiv.css({top: this.colMaxY[i], left: i * this.elw});
    this.colMaxY[i] += noteDiv.outerHeight() + parseInt(noteDiv.css('margin-top')) + parseInt(noteDiv.css('margin-bottom'));
  },

  template: function (noteText) {
    var snippet = '';
    if (noteText.length > this.maxPreviewLength) {
      snippet = urlify($("<div>").text(noteText.substring(0,this.maxPreviewLength) + " ...").html());
    } else {
      snippet = urlify($("<div>").text(noteText).html());
    }
    snippet = snippet.replaceAll(/\r?\n/g, "<br>");
    return '<div class="grid-item"><div class="grid-item-textcontent">' + snippet + '</div></div>';
  }, 

  disableUntilNextResponse: function() {
    if(this.timer !== null) {
      clearTimeout(this.timer);
    }
  }
});

})(jQuery);

}));
