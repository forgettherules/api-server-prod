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
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlPreviewController = void 0;
const auth_1 = require("../auth");
const types_1 = require("../../../src/types");
const blocklist_1 = require("../../../src/scraper/WebScraper/utils/blocklist");
const uuid_1 = require("uuid");
const logger_1 = require("../../../src/lib/logger");
const crawl_redis_1 = require("../../../src/lib/crawl-redis");
const queue_jobs_1 = require("../../../src/services/queue-jobs");
const validateUrl_1 = require("../../../src/lib/validateUrl");
const Sentry = __importStar(require("@sentry/node"));
const types_2 = require("../v1/types");
async function crawlPreviewController(req, res) {
    try {
        const auth = await (0, auth_1.authenticateUser)(req, res, types_1.RateLimiterMode.Preview);
        const team_id = "preview";
        if (!auth.success) {
            return res.status(auth.status).json({ error: auth.error });
        }
        const { plan } = auth;
        let url = req.body.url;
        if (!url) {
            return res.status(400).json({ error: "Url is required" });
        }
        try {
            url = (0, validateUrl_1.checkAndUpdateURL)(url).url;
        }
        catch (e) {
            return res
                .status(e instanceof Error && e.message === "Invalid URL" ? 400 : 500)
                .json({ error: e.message ?? e });
        }
        if ((0, blocklist_1.isUrlBlocked)(url)) {
            return res
                .status(403)
                .json({
                error: "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.",
            });
        }
        const crawlerOptions = req.body.crawlerOptions ?? {};
        const pageOptions = req.body.pageOptions ?? { onlyMainContent: false, includeHtml: false, removeTags: [] };
        // if (mode === "single_urls" && !url.includes(",")) { // NOTE: do we need this?
        //   try {
        //     const a = new WebScraperDataProvider();
        //     await a.setOptions({
        //       jobId: uuidv4(),
        //       mode: "single_urls",
        //       urls: [url],
        //       crawlerOptions: { ...crawlerOptions, returnOnlyUrls: true },
        //       pageOptions: pageOptions,
        //     });
        //     const docs = await a.getDocuments(false, (progress) => {
        //       job.updateProgress({
        //         current: progress.current,
        //         total: progress.total,
        //         current_step: "SCRAPING",
        //         current_url: progress.currentDocumentUrl,
        //       });
        //     });
        //     return res.json({
        //       success: true,
        //       documents: docs,
        //     });
        //   } catch (error) {
        //     logger.error(error);
        //     return res.status(500).json({ error: error.message });
        //   }
        // }
        const id = (0, uuid_1.v4)();
        let robots;
        try {
            robots = await this.getRobotsTxt();
        }
        catch (_) { }
        const { scrapeOptions, internalOptions } = (0, types_2.fromLegacyScrapeOptions)(pageOptions, undefined, undefined);
        const sc = {
            originUrl: url,
            crawlerOptions,
            scrapeOptions,
            internalOptions,
            team_id,
            plan,
            robots,
            createdAt: Date.now(),
        };
        await (0, crawl_redis_1.saveCrawl)(id, sc);
        const crawler = (0, crawl_redis_1.crawlToCrawler)(id, sc);
        const sitemap = sc.crawlerOptions?.ignoreSitemap ? null : await crawler.tryGetSitemap();
        if (sitemap !== null) {
            for (const url of sitemap.map(x => x.url)) {
                await (0, crawl_redis_1.lockURL)(id, sc, url);
                const jobId = (0, uuid_1.v4)();
                await (0, queue_jobs_1.addScrapeJob)({
                    url,
                    mode: "single_urls",
                    team_id,
                    plan: plan,
                    crawlerOptions,
                    scrapeOptions,
                    internalOptions,
                    origin: "website-preview",
                    crawl_id: id,
                    sitemapped: true,
                }, {}, jobId);
                await (0, crawl_redis_1.addCrawlJob)(id, jobId);
            }
        }
        else {
            await (0, crawl_redis_1.lockURL)(id, sc, url);
            const jobId = (0, uuid_1.v4)();
            await (0, queue_jobs_1.addScrapeJob)({
                url,
                mode: "single_urls",
                team_id,
                plan: plan,
                crawlerOptions,
                scrapeOptions,
                internalOptions,
                origin: "website-preview",
                crawl_id: id,
            }, {}, jobId);
            await (0, crawl_redis_1.addCrawlJob)(id, jobId);
        }
        res.json({ jobId: id });
    }
    catch (error) {
        Sentry.captureException(error);
        logger_1.logger.error(error);
        return res.status(500).json({ error: error.message });
    }
}
exports.crawlPreviewController = crawlPreviewController;
//# sourceMappingURL=crawlPreview.js.map