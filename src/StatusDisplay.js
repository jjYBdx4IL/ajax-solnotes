
const StatusDisplay = class {
    /** @type {number} */
    clearStatusTimer = undefined;
    /** @param {string} msg @returns {void} */
    updateStatus(msg, duration = 5) {
        var el = $("#status");
        el.html(he.encode(msg));
        el.fadeIn();
        el.centerOnScreen(true, false);
        if (this.clearStatusTimer) {
            window.clearTimeout(this.clearStatusTimer);
        }
        if (duration > 0) {
            this.clearStatusTimer = window.setTimeout(function () {
                el.fadeOut();
            }, duration * 1000);
        }
    }
}
