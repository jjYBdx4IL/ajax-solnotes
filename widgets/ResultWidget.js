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
    this.prevSerial = -1;
  },

  afterRequest: function (res, reqSerial) {
    // skip late responses
    if (reqSerial <= this.prevSerial)
      return;
    this.prevSerial = reqSerial;

    $(this.target).empty();
    for (var i = 0, l = res.response.docs.length; i < l; i++) {
      var doc = res.response.docs[i];
      if (doc.text !== void 0 && doc.text.length > 0) {
        doc.text = doc.text[0];
        $(this.target).append(this.template(doc));
      }
    }
  },

  template: function (doc) {
    var snippet = '';
    if (doc.text.length > 300) {
      snippet += $("<span>").text(doc.text.substring(0, 300)).html();
      snippet += $("<span>").attr("style", "display:none;").text(doc.text.substring(300)).html();
      snippet += '<a href="#" class="more">more</a>';
    }
    else {
      snippet += $("<span>").text(doc.text).html();
    }

    var output = '<div>';
    output += '<p id="links_' + doc.id + '" class="links"></p>';
    output += '<p>' + snippet + '</p></div>';
    return output;
  }
});

})(jQuery);

}));
