"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEntryFromCache = exports.saveEntryToCache = exports.cacheKey = exports.cacheRedis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("./logger");
const logger = logger_1.logger.child({ module: "cache" });
exports.cacheRedis = process.env.CACHE_REDIS_URL ? new ioredis_1.default(process.env.CACHE_REDIS_URL, {
    maxRetriesPerRequest: null,
}) : null;
function cacheKey(url, scrapeOptions, internalOptions) {
    if (!exports.cacheRedis)
        return null;
    // these options disqualify a cache
    if (internalOptions.v0CrawlOnlyUrls || internalOptions.forceEngine || internalOptions.v0UseFastMode || internalOptions.atsv
        || (scrapeOptions.actions && scrapeOptions.actions.length > 0)) {
        return null;
    }
    return "cache:" + url + ":waitFor:" + scrapeOptions.waitFor;
}
exports.cacheKey = cacheKey;
async function saveEntryToCache(key, entry) {
    if (!exports.cacheRedis)
        return;
    try {
        await exports.cacheRedis.set(key, JSON.stringify(entry));
    }
    catch (error) {
        logger.warn("Failed to save to cache", { key, error });
    }
}
exports.saveEntryToCache = saveEntryToCache;
async function getEntryFromCache(key) {
    if (!exports.cacheRedis)
        return null;
    try {
        return JSON.parse(await exports.cacheRedis.get(key) ?? "null");
    }
    catch (error) {
        logger.warn("Failed to get from cache", { key, error });
        return null;
    }
}
exports.getEntryFromCache = getEntryFromCache;
//# sourceMappingURL=cache.js.map