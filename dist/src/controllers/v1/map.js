"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapController = exports.getMapResults = void 0;
const uuid_1 = require("uuid");
const types_1 = require("./types");
const crawl_redis_1 = require("../../lib/crawl-redis");
const dotenv_1 = require("dotenv");
const validateUrl_1 = require("../../lib/validateUrl");
const fireEngine_1 = require("../../search/fireEngine");
const credit_billing_1 = require("../../services/billing/credit_billing");
const log_job_1 = require("../../services/logging/log_job");
const map_cosine_1 = require("../../lib/map-cosine");
const logger_1 = require("../../lib/logger");
const ioredis_1 = __importDefault(require("ioredis"));
(0, dotenv_1.configDotenv)();
const redis = new ioredis_1.default(process.env.REDIS_URL);
// Max Links that /map can return
const MAX_MAP_LIMIT = 5000;
// Max Links that "Smart /map" can return
const MAX_FIRE_ENGINE_RESULTS = 1000;
async function getMapResults({ url, search, limit = MAX_MAP_LIMIT, ignoreSitemap = false, includeSubdomains = true, crawlerOptions = {}, teamId, plan, origin, includeMetadata = false, allowExternalLinks }) {
    const id = (0, uuid_1.v4)();
    let links = [url];
    let mapResults = [];
    const sc = {
        originUrl: url,
        crawlerOptions: {
            ...crawlerOptions,
            limit: crawlerOptions.sitemapOnly ? 10000000 : limit,
            scrapeOptions: undefined,
        },
        scrapeOptions: types_1.scrapeOptions.parse({}),
        internalOptions: {},
        team_id: teamId,
        createdAt: Date.now(),
        plan: plan,
    };
    const crawler = (0, crawl_redis_1.crawlToCrawler)(id, sc);
    // If sitemapOnly is true, only get links from sitemap
    if (crawlerOptions.sitemapOnly) {
        const sitemap = await crawler.tryGetSitemap(true, true);
        if (sitemap !== null) {
            sitemap.forEach((x) => {
                links.push(x.url);
            });
            links = links.slice(1)
                .map((x) => {
                try {
                    return (0, validateUrl_1.checkAndUpdateURLForMap)(x).url.trim();
                }
                catch (_) {
                    return null;
                }
            })
                .filter((x) => x !== null);
            // links = links.slice(1, limit); // don't slice, unnecessary
        }
    }
    else {
        let urlWithoutWww = url.replace("www.", "");
        let mapUrl = search && allowExternalLinks
            ? `${search} ${urlWithoutWww}`
            : search ? `${search} site:${urlWithoutWww}`
                : `site:${url}`;
        const resultsPerPage = 100;
        const maxPages = Math.ceil(Math.min(MAX_FIRE_ENGINE_RESULTS, limit) / resultsPerPage);
        const cacheKey = `fireEngineMap:${mapUrl}`;
        const cachedResult = await redis.get(cacheKey);
        let allResults = [];
        let pagePromises = [];
        if (cachedResult) {
            allResults = JSON.parse(cachedResult);
        }
        else {
            const fetchPage = async (page) => {
                return (0, fireEngine_1.fireEngineMap)(mapUrl, {
                    numResults: resultsPerPage,
                    page: page,
                });
            };
            pagePromises = Array.from({ length: maxPages }, (_, i) => fetchPage(i + 1));
            allResults = await Promise.all(pagePromises);
            await redis.set(cacheKey, JSON.stringify(allResults), "EX", 24 * 60 * 60); // Cache for 24 hours
        }
        // Parallelize sitemap fetch with serper search
        const [sitemap, ...searchResults] = await Promise.all([
            ignoreSitemap ? null : crawler.tryGetSitemap(true),
            ...(cachedResult ? [] : pagePromises),
        ]);
        if (!cachedResult) {
            allResults = searchResults;
        }
        if (sitemap !== null) {
            sitemap.forEach((x) => {
                links.push(x.url);
            });
        }
        mapResults = allResults
            .flat()
            .filter((result) => result !== null && result !== undefined);
        const minumumCutoff = Math.min(MAX_MAP_LIMIT, limit);
        if (mapResults.length > minumumCutoff) {
            mapResults = mapResults.slice(0, minumumCutoff);
        }
        if (mapResults.length > 0) {
            if (search) {
                // Ensure all map results are first, maintaining their order
                links = [
                    mapResults[0].url,
                    ...mapResults.slice(1).map((x) => x.url),
                    ...links,
                ];
            }
            else {
                mapResults.map((x) => {
                    links.push(x.url);
                });
            }
        }
        // Perform cosine similarity between the search query and the list of links
        if (search) {
            const searchQuery = search.toLowerCase();
            links = (0, map_cosine_1.performCosineSimilarity)(links, searchQuery);
        }
        links = links
            .map((x) => {
            try {
                return (0, validateUrl_1.checkAndUpdateURLForMap)(x).url.trim();
            }
            catch (_) {
                return null;
            }
        })
            .filter((x) => x !== null);
        // allows for subdomains to be included
        links = links.filter((x) => (0, validateUrl_1.isSameDomain)(x, url));
        // if includeSubdomains is false, filter out subdomains
        if (!includeSubdomains) {
            links = links.filter((x) => (0, validateUrl_1.isSameSubdomain)(x, url));
        }
        // remove duplicates that could be due to http/https or www
        links = (0, validateUrl_1.removeDuplicateUrls)(links);
    }
    const linksToReturn = crawlerOptions.sitemapOnly ? links : links.slice(0, limit);
    return {
        success: true,
        links: includeMetadata ? mapResults : linksToReturn,
        scrape_id: origin?.includes("website") ? id : undefined,
        job_id: id,
        time_taken: (new Date().getTime() - Date.now()) / 1000,
    };
}
exports.getMapResults = getMapResults;
async function mapController(req, res) {
    req.body = types_1.mapRequestSchema.parse(req.body);
    const result = await getMapResults({
        url: req.body.url,
        search: req.body.search,
        limit: req.body.limit,
        ignoreSitemap: req.body.ignoreSitemap,
        includeSubdomains: req.body.includeSubdomains,
        crawlerOptions: req.body,
        origin: req.body.origin,
        teamId: req.auth.team_id,
        plan: req.auth.plan,
    });
    // Bill the team
    (0, credit_billing_1.billTeam)(req.auth.team_id, req.acuc?.sub_id, 1).catch((error) => {
        logger_1.logger.error(`Failed to bill team ${req.auth.team_id} for 1 credit: ${error}`);
    });
    // Log the job
    (0, log_job_1.logJob)({
        job_id: result.job_id,
        success: result.links.length > 0,
        message: "Map completed",
        num_docs: result.links.length,
        docs: result.links,
        time_taken: result.time_taken,
        team_id: req.auth.team_id,
        mode: "map",
        url: req.body.url,
        crawlerOptions: {},
        scrapeOptions: {},
        origin: req.body.origin ?? "api",
        num_tokens: 0,
    });
    const response = {
        success: true,
        links: result.links,
        scrape_id: result.scrape_id
    };
    return res.status(200).json(response);
}
exports.mapController = mapController;
//# sourceMappingURL=map.js.map