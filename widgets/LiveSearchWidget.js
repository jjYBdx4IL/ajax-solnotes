(function (callback) {
  if (typeof define === 'function' && define.amd) {
    define(['core/AbstractTextWidget'], callback);
  }
  else {
    callback();
  }
}(function () {

(function ($) {

/**
 * Live-search widget.
 *
 * @class LiveSearchWidget
 * @augments AjaxSolr.AbstractWidget
 */
AjaxSolr.LiveSearchWidget = AjaxSolr.AbstractTextWidget.extend({
  constructor: function (attributes) {
    AjaxSolr.extend(this, {
      id: null,
      target: null,
      start: undefined,
      servlet: undefined,
      // A reference to the widget's manager.
      manager: null,
      resultWidget: null,
    }, attributes);
  },

  init: function () {
    var self = this;
    $(this.target).find('input').on('input', function () {
      // convert search expression to solr notation
      var values = $.trim($(this).val()).split(/\s+/);
      var maxLen = 0;
      var newValues = [];
      for(var i=0; i<values.length; i++) {
        var value = values[i];
        var not = false;
        if (value.substr(0, 1) === '-') {
          not = true;
          value = value.substr(1);
        }
        maxLen = Math.max(maxLen, value.length);
        // skip incomplete search expressions
        if (!value.length) {
          continue;
        }
        value = value.replaceAll("\\", "\\\\");
        value = value.replaceAll("\"", "\\\"");
        value = value.replaceAll("*", "\\*");
        value = value.replaceAll("^", "\\^");
        // always do a substring match
        newValues.push((not ? "NOT " : "") + self.manager.solrContentFieldName + ':*' + value + '*');
      }
      values = newValues;
      // ignore search term input until we have at least one term of length 3+
      if (maxLen < 3) {
        values = [self.manager.solrContentFieldName + ':*'];
      }
      // always use logical AND to combine the substring matches
      if (values.length && self.set(values.join(' AND '))) {
        self.manager.store.get("start").val("0");
        // this saves us A LOT of synchronization headaches because it prevents all out-of-order replies
        self.manager.cancelAllRequests();
        self.resultWidget.disableUntilNextResponse();
        self.doRequest();
      }
    });
  }
});

})(jQuery);

}));




















