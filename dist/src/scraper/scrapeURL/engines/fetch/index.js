"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeURLWithFetch = void 0;
const error_1 = require("../../error");
const specialtyHandler_1 = require("../utils/specialtyHandler");
async function scrapeURLWithFetch(meta) {
    const timeout = 20000;
    const response = await Promise.race([
        fetch(meta.url, {
            redirect: "follow",
            headers: meta.options.headers,
        }),
        (async () => {
            await new Promise((resolve) => setTimeout(() => resolve(null), timeout));
            throw new error_1.TimeoutError("Fetch was unable to scrape the page before timing out", { cause: { timeout } });
        })()
    ]);
    (0, specialtyHandler_1.specialtyScrapeCheck)(meta.logger.child({ method: "scrapeURLWithFetch/specialtyScrapeCheck" }), Object.fromEntries(response.headers));
    return {
        url: response.url,
        html: await response.text(),
        statusCode: response.status,
        // TODO: error?
    };
}
exports.scrapeURLWithFetch = scrapeURLWithFetch;
//# sourceMappingURL=index.js.map