"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlController = void 0;
const uuid_1 = require("uuid");
const types_1 = require("./types");
const crawl_redis_1 = require("../../lib/crawl-redis");
const crawl_log_1 = require("../../services/logging/crawl_log");
const queue_service_1 = require("../../services/queue-service");
const queue_jobs_1 = require("../../services/queue-jobs");
const logger_1 = require("../../lib/logger");
const job_priority_1 = require("../../lib/job-priority");
const webhook_1 = require("../../services/webhook");
const types_2 = require("./types");
async function crawlController(req, res) {
    req.body = types_1.crawlRequestSchema.parse(req.body);
    const id = (0, uuid_1.v4)();
    await (0, crawl_log_1.logCrawl)(id, req.auth.team_id);
    let { remainingCredits } = req.account;
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
    if (!useDbAuthentication) {
        remainingCredits = Infinity;
    }
    const crawlerOptions = {
        ...req.body,
        url: undefined,
        scrapeOptions: undefined,
    };
    const scrapeOptions = req.body.scrapeOptions;
    // TODO: @rafa, is this right? copied from v0
    if (Array.isArray(crawlerOptions.includePaths)) {
        for (const x of crawlerOptions.includePaths) {
            try {
                new RegExp(x);
            }
            catch (e) {
                return res.status(400).json({ success: false, error: e.message });
            }
        }
    }
    if (Array.isArray(crawlerOptions.excludePaths)) {
        for (const x of crawlerOptions.excludePaths) {
            try {
                new RegExp(x);
            }
            catch (e) {
                return res.status(400).json({ success: false, error: e.message });
            }
        }
    }
    crawlerOptions.limit = Math.min(remainingCredits, crawlerOptions.limit);
    const sc = {
        originUrl: req.body.url,
        crawlerOptions: (0, types_1.toLegacyCrawlerOptions)(crawlerOptions),
        scrapeOptions,
        internalOptions: {},
        team_id: req.auth.team_id,
        createdAt: Date.now(),
        plan: req.auth.plan,
    };
    const crawler = (0, crawl_redis_1.crawlToCrawler)(id, sc);
    try {
        sc.robots = await crawler.getRobotsTxt(scrapeOptions.skipTlsVerification);
    }
    catch (e) {
        logger_1.logger.debug(`[Crawl] Failed to get robots.txt (this is probably fine!): ${JSON.stringify(e)}`);
    }
    await (0, crawl_redis_1.saveCrawl)(id, sc);
    const sitemap = sc.crawlerOptions.ignoreSitemap
        ? null
        : await crawler.tryGetSitemap();
    if (sitemap !== null && sitemap.length > 0) {
        let jobPriority = 20;
        // If it is over 1000, we need to get the job priority,
        // otherwise we can use the default priority of 20
        if (sitemap.length > 1000) {
            // set base to 21
            jobPriority = await (0, job_priority_1.getJobPriority)({ plan: req.auth.plan, team_id: req.auth.team_id, basePriority: 21 });
        }
        const jobs = sitemap.map((x) => {
            const url = x.url;
            const uuid = (0, uuid_1.v4)();
            return {
                name: uuid,
                data: {
                    url,
                    mode: "single_urls",
                    team_id: req.auth.team_id,
                    plan: req.auth.plan,
                    crawlerOptions,
                    scrapeOptions,
                    origin: "api",
                    crawl_id: id,
                    sitemapped: true,
                    webhook: req.body.webhook,
                    v1: true,
                },
                opts: {
                    jobId: uuid,
                    priority: 20,
                },
            };
        });
        await (0, crawl_redis_1.lockURLs)(id, sc, jobs.map((x) => x.data.url));
        await (0, crawl_redis_1.addCrawlJobs)(id, jobs.map((x) => x.opts.jobId));
        await (0, queue_service_1.getScrapeQueue)().addBulk(jobs);
    }
    else {
        await (0, crawl_redis_1.lockURL)(id, sc, req.body.url);
        const jobId = (0, uuid_1.v4)();
        await (0, queue_jobs_1.addScrapeJob)({
            url: req.body.url,
            mode: "single_urls",
            team_id: req.auth.team_id,
            crawlerOptions,
            scrapeOptions: types_2.scrapeOptions.parse(scrapeOptions),
            plan: req.auth.plan,
            origin: "api",
            crawl_id: id,
            webhook: req.body.webhook,
            v1: true,
        }, {
            priority: 15,
        }, jobId);
        await (0, crawl_redis_1.addCrawlJob)(id, jobId);
    }
    if (req.body.webhook) {
        await (0, webhook_1.callWebhook)(req.auth.team_id, id, null, req.body.webhook, true, "crawl.started");
    }
    const protocol = process.env.ENV === "local" ? req.protocol : "https";
    return res.status(200).json({
        success: true,
        id,
        url: `${protocol}://${req.get("host")}/v1/crawl/${id}`,
    });
}
exports.crawlController = crawlController;
//# sourceMappingURL=crawl.js.map