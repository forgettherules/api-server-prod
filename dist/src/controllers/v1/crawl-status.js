"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlStatusController = exports.getJobs = exports.getJob = void 0;
const crawl_redis_1 = require("../../lib/crawl-redis");
const queue_service_1 = require("../../services/queue-service");
const supabase_jobs_1 = require("../../lib/supabase-jobs");
const dotenv_1 = require("dotenv");
(0, dotenv_1.configDotenv)();
async function getJob(id) {
    const job = await (0, queue_service_1.getScrapeQueue)().getJob(id);
    if (!job)
        return job;
    if (process.env.USE_DB_AUTHENTICATION === "true") {
        const supabaseData = await (0, supabase_jobs_1.supabaseGetJobById)(id);
        if (supabaseData) {
            job.returnvalue = supabaseData.docs;
        }
    }
    job.returnvalue = Array.isArray(job.returnvalue) ? job.returnvalue[0] : job.returnvalue;
    return job;
}
exports.getJob = getJob;
async function getJobs(ids) {
    const jobs = (await Promise.all(ids.map(x => (0, queue_service_1.getScrapeQueue)().getJob(x)))).filter(x => x);
    if (process.env.USE_DB_AUTHENTICATION === "true") {
        const supabaseData = await (0, supabase_jobs_1.supabaseGetJobsById)(ids);
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
async function crawlStatusController(req, res, isBatch = false) {
    const sc = await (0, crawl_redis_1.getCrawl)(req.params.jobId);
    if (!sc) {
        return res.status(404).json({ success: false, error: "Job not found" });
    }
    if (sc.team_id !== req.auth.team_id) {
        return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const start = typeof req.query.skip === "string" ? parseInt(req.query.skip, 10) : 0;
    const end = typeof req.query.limit === "string" ? (start + parseInt(req.query.limit, 10) - 1) : undefined;
    let jobIDs = await (0, crawl_redis_1.getCrawlJobs)(req.params.jobId);
    let jobStatuses = await Promise.all(jobIDs.map(async (x) => [x, await (0, queue_service_1.getScrapeQueue)().getJobState(x)]));
    const throttledJobs = new Set(...await (0, crawl_redis_1.getThrottledJobs)(req.auth.team_id));
    const throttledJobsSet = new Set(throttledJobs);
    const validJobStatuses = [];
    const validJobIDs = [];
    for (const [id, status] of jobStatuses) {
        if (!throttledJobsSet.has(id) && status !== "failed" && status !== "unknown") {
            validJobStatuses.push([id, status]);
            validJobIDs.push(id);
        }
    }
    const status = sc.cancelled ? "cancelled" : validJobStatuses.every(x => x[1] === "completed") ? "completed" : "scraping";
    // Use validJobIDs instead of jobIDs for further processing
    jobIDs = validJobIDs;
    const doneJobsLength = await (0, crawl_redis_1.getDoneJobsOrderedLength)(req.params.jobId);
    const doneJobsOrder = await (0, crawl_redis_1.getDoneJobsOrdered)(req.params.jobId, start, end ?? -1);
    let doneJobs = [];
    if (end === undefined) { // determine 10 megabyte limit
        let bytes = 0;
        const bytesLimit = 10485760; // 10 MiB in bytes
        const factor = 100; // chunking for faster retrieval
        for (let i = 0; i < doneJobsOrder.length && bytes < bytesLimit; i += factor) {
            // get current chunk and retrieve jobs
            const currentIDs = doneJobsOrder.slice(i, i + factor);
            const jobs = await getJobs(currentIDs);
            // iterate through jobs and add them one them one to the byte counter
            // both loops will break once we cross the byte counter
            for (let ii = 0; ii < jobs.length && bytes < bytesLimit; ii++) {
                const job = jobs[ii];
                doneJobs.push(job);
                bytes += JSON.stringify(job.returnvalue).length;
            }
        }
        // if we ran over the bytes limit, remove the last document, except if it's the only document
        if (bytes > bytesLimit && doneJobs.length !== 1) {
            doneJobs.splice(doneJobs.length - 1, 1);
        }
    }
    else {
        doneJobs = await getJobs(doneJobsOrder);
    }
    const data = doneJobs.map(x => x.returnvalue);
    const protocol = process.env.ENV === "local" ? req.protocol : "https";
    const nextURL = new URL(`${protocol}://${req.get("host")}/v1/${isBatch ? "batch/scrape" : "crawl"}/${req.params.jobId}`);
    nextURL.searchParams.set("skip", (start + data.length).toString());
    if (typeof req.query.limit === "string") {
        nextURL.searchParams.set("limit", req.query.limit);
    }
    if (data.length > 0) {
        if (!doneJobs[0].data.scrapeOptions.formats.includes("rawHtml")) {
            for (let ii = 0; ii < doneJobs.length; ii++) {
                if (data[ii]) {
                    delete data[ii].rawHtml;
                }
            }
        }
    }
    res.status(200).json({
        success: true,
        status,
        completed: doneJobsLength,
        total: jobIDs.length,
        creditsUsed: jobIDs.length,
        expiresAt: (await (0, crawl_redis_1.getCrawlExpiry)(req.params.jobId)).toISOString(),
        next: status !== "scraping" && (start + data.length) === doneJobsLength // if there's not gonna be any documents after this
            ? undefined
            : nextURL.href,
        data: data,
    });
}
exports.crawlStatusController = crawlStatusController;
//# sourceMappingURL=crawl-status.js.map