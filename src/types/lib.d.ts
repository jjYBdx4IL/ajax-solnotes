
// this file is only for @ts-check

/**
 * The note we send to Solr.
 */
interface INote {
    id: string;
    created_dt: string; // ISO8601 date
    lmod_dt: string; // ISO8601 date
    text: string;
}

interface INoteServerResponse {
    status: number;
    error: string;
}

interface ICreateNoteServerResponse extends INoteServerResponse {
    noteId: number;
}
interface IRetrieveNoteServerResponse extends INoteServerResponse {
    note: INote;
}


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
