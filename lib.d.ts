
// this file is only for @ts-check

interface JQuery {
     centerOnScreen(centerHorizontally: boolean, centerVertically: boolean): JQuery;
} 
interface JQueryStatic {
    ajax(options: Object): JQuery.jqXHR;
}

declare namespace AjaxSolr {
    export interface Widget {}
    export class Manager {
        constructor(any?)
        addWidget(Widget) : void
        init() : void
        solrContentFieldName : string
        store: any
        doRequest(): void
    }
    export class AbstractWidget {
        constructor(any?)
        extend() : any
        target: any
    }
    export class ResultWidget {
        constructor(any?)
    }
    export class LiveSearchWidget {
        constructor(any?)
    }
}
