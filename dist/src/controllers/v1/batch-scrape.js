"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchScrapeController = void 0;
const uuid_1 = require("uuid");
const types_1 = require("./types");
const crawl_redis_1 = require("../../lib/crawl-redis");
const crawl_log_1 = require("../../services/logging/crawl_log");
const job_priority_1 = require("../../lib/job-priority");
const queue_jobs_1 = require("../../services/queue-jobs");
const webhook_1 = require("../../services/webhook");
async function batchScrapeController(req, res) {
    req.body = types_1.batchScrapeRequestSchema.parse(req.body);
    const id = (0, uuid_1.v4)();
    await (0, crawl_log_1.logCrawl)(id, req.auth.team_id);
    let { remainingCredits } = req.account;
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
    if (!useDbAuthentication) {
        remainingCredits = Infinity;
    }
    const sc = {
        crawlerOptions: null,
        scrapeOptions: req.body,
        internalOptions: {},
        team_id: req.auth.team_id,
        createdAt: Date.now(),
        plan: req.auth.plan,
    };
    await (0, crawl_redis_1.saveCrawl)(id, sc);
    let jobPriority = 20;
    // If it is over 1000, we need to get the job priority,
    // otherwise we can use the default priority of 20
    if (req.body.urls.length > 1000) {
        // set base to 21
        jobPriority = await (0, job_priority_1.getJobPriority)({ plan: req.auth.plan, team_id: req.auth.team_id, basePriority: 21 });
    }
    const jobs = req.body.urls.map((x) => {
        return {
            data: {
                url: x,
                mode: "single_urls",
                team_id: req.auth.team_id,
                plan: req.auth.plan,
                crawlerOptions: null,
                scrapeOptions: req.body,
                origin: "api",
                crawl_id: id,
                sitemapped: true,
                v1: true,
                webhook: req.body.webhook,
            },
            opts: {
                jobId: (0, uuid_1.v4)(),
                priority: 20,
            },
        };
    });
    await (0, crawl_redis_1.lockURLs)(id, sc, jobs.map((x) => x.data.url));
    await (0, crawl_redis_1.addCrawlJobs)(id, jobs.map((x) => x.opts.jobId));
    await (0, queue_jobs_1.addScrapeJobs)(jobs);
    if (req.body.webhook) {
        await (0, webhook_1.callWebhook)(req.auth.team_id, id, null, req.body.webhook, true, "batch_scrape.started");
    }
    const protocol = process.env.ENV === "local" ? req.protocol : "https";
    return res.status(200).json({
        success: true,
        id,
        url: `${protocol}://${req.get("host")}/v1/batch/scrape/${id}`,
    });
}
exports.batchScrapeController = batchScrapeController;
//# sourceMappingURL=batch-scrape.js.map