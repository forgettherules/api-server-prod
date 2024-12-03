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
exports.crawlStatusController = exports.getJobs = void 0;
const auth_1 = require("../auth");
const types_1 = require("../../../src/types");
const queue_service_1 = require("../../../src/services/queue-service");
const logger_1 = require("../../../src/lib/logger");
const crawl_redis_1 = require("../../../src/lib/crawl-redis");
const supabase_jobs_1 = require("../../../src/lib/supabase-jobs");
const Sentry = __importStar(require("@sentry/node"));
const dotenv_1 = require("dotenv");
const types_2 = require("../v1/types");
(0, dotenv_1.configDotenv)();
async function getJobs(crawlId, ids) {
    const jobs = (await Promise.all(ids.map(x => (0, queue_service_1.getScrapeQueue)().getJob(x)))).filter(x => x);
    if (process.env.USE_DB_AUTHENTICATION === "true") {
        const supabaseData = await (0, supabase_jobs_1.supabaseGetJobsByCrawlId)(crawlId);
        supabaseData.forEach(x => {
            const job = jobs.find(y => y.id === x.job_id);
            if (job) {
                job.returnvalue = x.docs;
            }
        });
    }
    jobs.forEach(job => {
        job.returnvalue = Array.isArray(job.returnvalue) ? job.returnvalue[0] : job.returnvalue;
    });
    return jobs;
}
exports.getJobs = getJobs;
async function crawlStatusController(req, res) {
    try {
        const auth = await (0, auth_1.authenticateUser)(req, res, types_1.RateLimiterMode.CrawlStatus);
        if (!auth.success) {
            return res.status(auth.status).json({ error: auth.error });
        }
        const { team_id } = auth;
        const sc = await (0, crawl_redis_1.getCrawl)(req.params.jobId);
        if (!sc) {
            return res.status(404).json({ error: "Job not found" });
        }
        if (sc.team_id !== team_id) {
            return res.status(403).json({ error: "Forbidden" });
        }
        let jobIDs = await (0, crawl_redis_1.getCrawlJobs)(req.params.jobId);
        let jobs = await getJobs(req.params.jobId, jobIDs);
        let jobStatuses = await Promise.all(jobs.map(x => x.getState()));
        // Combine jobs and jobStatuses into a single array of objects
        let jobsWithStatuses = jobs.map((job, index) => ({
            job,
            status: jobStatuses[index]
        }));
        // Filter out failed jobs
        jobsWithStatuses = jobsWithStatuses.filter(x => x.status !== "failed" && x.status !== "unknown");
        // Sort jobs by timestamp
        jobsWithStatuses.sort((a, b) => a.job.timestamp - b.job.timestamp);
        // Extract sorted jobs and statuses
        jobs = jobsWithStatuses.map(x => x.job);
        jobStatuses = jobsWithStatuses.map(x => x.status);
        const jobStatus = sc.cancelled ? "failed" : jobStatuses.every(x => x === "completed") ? "completed" : "active";
        const data = jobs.filter(x => x.failedReason !== "Concurreny limit hit" && x.returnvalue !== null).map(x => Array.isArray(x.returnvalue) ? x.returnvalue[0] : x.returnvalue);
        if (jobs.length > 0 &&
            jobs[0].data &&
            jobs[0].data.pageOptions &&
            !jobs[0].data.pageOptions.includeRawHtml) {
            data.forEach(item => {
                if (item) {
                    delete item.rawHtml;
                }
            });
        }
        res.json({
            status: jobStatus,
            current: jobStatuses.filter(x => x === "completed" || x === "failed").length,
            total: jobs.length,
            data: jobStatus === "completed" ? data.map(x => (0, types_2.toLegacyDocument)(x, sc.internalOptions)) : null,
            partial_data: jobStatus === "completed" ? [] : data.filter(x => x !== null).map(x => (0, types_2.toLegacyDocument)(x, sc.internalOptions)),
        });
    }
    catch (error) {
        Sentry.captureException(error);
        logger_1.logger.error(error);
        return res.status(500).json({ error: error.message });
    }
}
exports.crawlStatusController = crawlStatusController;
//# sourceMappingURL=crawl-status.js.map