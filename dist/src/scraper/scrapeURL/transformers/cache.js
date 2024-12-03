"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveToCache = void 0;
const cache_1 = require("../../../lib/cache");
function saveToCache(meta, document) {
    if (document.metadata.statusCode < 200 || document.metadata.statusCode >= 300)
        return document;
    if (document.rawHtml === undefined) {
        throw new Error("rawHtml is undefined -- this transformer is being called out of order");
    }
    const key = (0, cache_1.cacheKey)(meta.url, meta.options, meta.internalOptions);
    if (key !== null) {
        const entry = {
            html: document.rawHtml,
            statusCode: document.metadata.statusCode,
            url: document.metadata.url ?? document.metadata.sourceURL,
            error: document.metadata.error ?? undefined,
        };
        (0, cache_1.saveEntryToCache)(key, entry);
    }
    return document;
}
exports.saveToCache = saveToCache;
//# sourceMappingURL=cache.js.map