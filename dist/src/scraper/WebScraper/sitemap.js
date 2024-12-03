"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSitemapData = exports.getLinksFromSitemap = void 0;
const axios_1 = __importDefault(require("axios"));
const timeout_1 = require("../../lib/timeout");
const xml2js_1 = require("xml2js");
const crawler_1 = require("./crawler");
const logger_1 = require("../../lib/logger");
const scrapeURL_1 = require("../scrapeURL");
const types_1 = require("../../controllers/v1/types");
async function getLinksFromSitemap({ sitemapUrl, allUrls = [], mode = 'axios' }) {
    try {
        let content = "";
        try {
            if (mode === 'axios' || process.env.FIRE_ENGINE_BETA_URL === '') {
                const response = await axios_1.default.get(sitemapUrl, { timeout: timeout_1.axiosTimeout });
                content = response.data;
            }
            else if (mode === 'fire-engine') {
                const response = await (0, scrapeURL_1.scrapeURL)("sitemap", sitemapUrl, types_1.scrapeOptions.parse({ formats: ["rawHtml"] }), { forceEngine: "fire-engine;tlsclient", v0DisableJsDom: true });
                if (!response.success) {
                    throw response.error;
                }
                content = response.document.rawHtml;
            }
        }
        catch (error) {
            logger_1.logger.error(`Request failed for ${sitemapUrl}: ${error.message}`);
            return allUrls;
        }
        const parsed = await (0, xml2js_1.parseStringPromise)(content);
        const root = parsed.urlset || parsed.sitemapindex;
        if (root && root.sitemap) {
            const sitemapPromises = root.sitemap
                .filter(sitemap => sitemap.loc && sitemap.loc.length > 0)
                .map(sitemap => getLinksFromSitemap({ sitemapUrl: sitemap.loc[0], allUrls, mode }));
            await Promise.all(sitemapPromises);
        }
        else if (root && root.url) {
            const validUrls = root.url
                .filter(url => url.loc && url.loc.length > 0 && !crawler_1.WebCrawler.prototype.isFile(url.loc[0]))
                .map(url => url.loc[0]);
            allUrls.push(...validUrls);
        }
    }
    catch (error) {
        logger_1.logger.debug(`Error processing sitemapUrl: ${sitemapUrl} | Error: ${error.message}`);
    }
    return allUrls;
}
exports.getLinksFromSitemap = getLinksFromSitemap;
const fetchSitemapData = async (url, timeout) => {
    const sitemapUrl = url.endsWith("/sitemap.xml") ? url : `${url}/sitemap.xml`;
    try {
        const response = await axios_1.default.get(sitemapUrl, { timeout: timeout || timeout_1.axiosTimeout });
        if (response.status === 200) {
            const xml = response.data;
            const parsedXml = await (0, xml2js_1.parseStringPromise)(xml);
            const sitemapData = [];
            if (parsedXml.urlset && parsedXml.urlset.url) {
                for (const urlElement of parsedXml.urlset.url) {
                    const sitemapEntry = { loc: urlElement.loc[0] };
                    if (urlElement.lastmod)
                        sitemapEntry.lastmod = urlElement.lastmod[0];
                    if (urlElement.changefreq)
                        sitemapEntry.changefreq = urlElement.changefreq[0];
                    if (urlElement.priority)
                        sitemapEntry.priority = Number(urlElement.priority[0]);
                    sitemapData.push(sitemapEntry);
                }
            }
            return sitemapData;
        }
        return null;
    }
    catch (error) {
        // Error handling for failed sitemap fetch
    }
    return [];
};
exports.fetchSitemapData = fetchSitemapData;
//# sourceMappingURL=sitemap.js.map