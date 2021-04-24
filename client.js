var Manager;

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
    // Manager.addWidget(new AjaxSolr.PagerWidget({
    //   id: 'pager',
    //   target: '#pager',
    //   prevLabel: '&lt;',
    //   nextLabel: '&gt;',
    //   innerWindow: 1,
    //   renderHeader: function (perPage, offset, total) {
    //     $('#pager-header').html($('<span></span>').text('displaying ' + Math.min(total, offset + 1) + ' to ' + Math.min(total, offset + perPage) + ' of ' + total));
    //   }
    // }));
    Manager.init();
    var params = {
      'json.nl': 'map',
      'rows': '25',
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
