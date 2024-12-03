"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleSearch = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const entities_1 = require("../../src/lib/entities");
const logger_1 = require("../../src/lib/logger");
const _useragent_list = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.1661.62',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0'
];
function get_useragent() {
    return _useragent_list[Math.floor(Math.random() * _useragent_list.length)];
}
async function _req(term, results, lang, country, start, proxies, timeout, tbs = undefined, filter = undefined) {
    const params = {
        "q": term,
        "num": results, // Number of results to return
        "hl": lang,
        "gl": country,
        "start": start,
    };
    if (tbs) {
        params["tbs"] = tbs;
    }
    if (filter) {
        params["filter"] = filter;
    }
    try {
        const resp = await axios_1.default.get("https://www.google.com/search", {
            headers: {
                "User-Agent": get_useragent()
            },
            params: params,
            proxy: proxies,
            timeout: timeout,
        });
        return resp;
    }
    catch (error) {
        if (error.response && error.response.status === 429) {
            throw new Error('Google Search: Too many requests, try again later.');
        }
        throw error;
    }
}
async function googleSearch(term, advanced = false, num_results = 7, tbs = undefined, filter = undefined, lang = "en", country = "us", proxy = undefined, sleep_interval = 0, timeout = 5000) {
    let proxies = null;
    if (proxy) {
        if (proxy.startsWith("https")) {
            proxies = { "https": proxy };
        }
        else {
            proxies = { "http": proxy };
        }
    }
    // TODO: knowledge graph, answer box, etc.
    let start = 0;
    let results = [];
    let attempts = 0;
    const maxAttempts = 20; // Define a maximum number of attempts to prevent infinite loop
    while (start < num_results && attempts < maxAttempts) {
        try {
            const resp = await _req(term, num_results - start, lang, country, start, proxies, timeout, tbs, filter);
            const $ = cheerio.load(resp.data);
            const result_block = $("div.g");
            if (result_block.length === 0) {
                start += 1;
                attempts += 1;
            }
            else {
                attempts = 0; // Reset attempts if we have results
            }
            result_block.each((index, element) => {
                const linkElement = $(element).find("a");
                const link = linkElement && linkElement.attr("href") ? linkElement.attr("href") : null;
                const title = $(element).find("h3");
                const ogImage = $(element).find("img").eq(1).attr("src");
                const description_box = $(element).find("div[style='-webkit-line-clamp:2']");
                const answerBox = $(element).find(".mod").text();
                if (description_box) {
                    const description = description_box.text();
                    if (link && title && description) {
                        start += 1;
                        results.push(new entities_1.SearchResult(link, title.text(), description));
                    }
                }
            });
            await new Promise(resolve => setTimeout(resolve, sleep_interval * 1000));
        }
        catch (error) {
            if (error.message === 'Too many requests') {
                logger_1.logger.warn('Too many requests, breaking the loop');
                break;
            }
            throw error;
        }
        if (start === 0) {
            return results;
        }
    }
    if (attempts >= maxAttempts) {
        logger_1.logger.warn('Max attempts reached, breaking the loop');
    }
    return results;
}
exports.googleSearch = googleSearch;
//# sourceMappingURL=googlesearch.js.map