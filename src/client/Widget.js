
const Widget = class {
    /**
     * @param {string} container jQuery qualifier
     */
    constructor(container) {
      this.container = $(container).get(0);
    }
    /** @type {HTMLElement} */
    container = undefined;
  }
  
  