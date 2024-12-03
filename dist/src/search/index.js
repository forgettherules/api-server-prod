"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.search = void 0;
const logger_1 = require("../../src/lib/logger");
const googlesearch_1 = require("./googlesearch");
const searchapi_1 = require("./searchapi");
const serper_1 = require("./serper");
async function search({ query, advanced = false, num_results = 7, tbs = undefined, filter = undefined, lang = "en", country = "us", location = undefined, proxy = undefined, sleep_interval = 0, timeout = 5000, }) {
    try {
        if (process.env.SERPER_API_KEY) {
            return await (0, serper_1.serper_search)(query, {
                num_results,
                tbs,
                filter,
                lang,
                country,
                location,
            });
        }
        if (process.env.SEARCHAPI_API_KEY) {
            return await (0, searchapi_1.searchapi_search)(query, {
                num_results,
                tbs,
                filter,
                lang,
                country,
                location
            });
        }
        return await (0, googlesearch_1.googleSearch)(query, advanced, num_results, tbs, filter, lang, country, proxy, sleep_interval, timeout);
    }
    catch (error) {
        logger_1.logger.error(`Error in search function: ${error}`);
        return [];
    }
}
exports.search = search;
//# sourceMappingURL=index.js.map