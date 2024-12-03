"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeCache = void 0;
const cache_1 = require("../../../../lib/cache");
const error_1 = require("../../error");
async function scrapeCache(meta) {
    const key = (0, cache_1.cacheKey)(meta.url, meta.options, meta.internalOptions);
    if (key === null)
        throw new error_1.EngineError("Scrape not eligible for caching");
    const entry = await (0, cache_1.getEntryFromCache)(key);
    if (entry === null)
        throw new error_1.EngineError("Cache missed");
    return {
        url: entry.url,
        html: entry.html,
        statusCode: entry.statusCode,
        error: entry.error,
    };
}
exports.scrapeCache = scrapeCache;
//# sourceMappingURL=index.js.map