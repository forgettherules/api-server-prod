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
require("dotenv/config");
require("./sentry");
const Sentry = __importStar(require("@sentry/node"));
const custom_error_1 = require("../lib/custom-error");
const queue_service_1 = require("./queue-service");
const runWebScraper_1 = require("../main/runWebScraper");
const webhook_1 = require("./webhook");
const log_job_1 = require("./logging/log_job");
const logger_1 = require("../lib/logger");
const bullmq_1 = require("bullmq");
const system_monitor_1 = __importDefault(require("./system-monitor"));
const uuid_1 = require("uuid");
const crawl_redis_1 = require("../lib/crawl-redis");
const queue_jobs_1 = require("./queue-jobs");
const job_priority_1 = require("../../src/lib/job-priority");
const crawl_status_1 = require("..//controllers/v1/crawl-status");
const dotenv_1 = require("dotenv");
const types_1 = require("../controllers/v1/types");
const concurrency_limit_1 = require("../lib/concurrency-limit");
(0, dotenv_1.configDotenv)();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const workerLockDuration = Number(process.env.WORKER_LOCK_DURATION) || 60000;
const workerStalledCheckInterval = Number(process.env.WORKER_STALLED_CHECK_INTERVAL) || 30000;
const jobLockExtendInterval = Number(process.env.JOB_LOCK_EXTEND_INTERVAL) || 15000;
const jobLockExtensionTime = Number(process.env.JOB_LOCK_EXTENSION_TIME) || 60000;
const cantAcceptConnectionInterval = Number(process.env.CANT_ACCEPT_CONNECTION_INTERVAL) || 2000;
const connectionMonitorInterval = Number(process.env.CONNECTION_MONITOR_INTERVAL) || 10;
const gotJobInterval = Number(process.env.CONNECTION_MONITOR_INTERVAL) || 20;
async function finishCrawlIfNeeded(job, sc) {
    if (await (0, crawl_redis_1.finishCrawl)(job.data.crawl_id)) {
        if (!job.data.v1) {
            const jobIDs = await (0, crawl_redis_1.getCrawlJobs)(job.data.crawl_id);
            const jobs = (await (0, crawl_status_1.getJobs)(jobIDs)).sort((a, b) => a.timestamp - b.timestamp);
            // const jobStatuses = await Promise.all(jobs.map((x) => x.getState()));
            const jobStatus = sc.cancelled // || jobStatuses.some((x) => x === "failed")
                ? "failed"
                : "completed";
            const fullDocs = jobs.map((x) => x.returnvalue ? (Array.isArray(x.returnvalue) ? x.returnvalue[0] : x.returnvalue) : null).filter(x => x !== null);
            await (0, log_job_1.logJob)({
                job_id: job.data.crawl_id,
                success: jobStatus === "completed",
                message: sc.cancelled ? "Cancelled" : undefined,
                num_docs: fullDocs.length,
                docs: [],
                time_taken: (Date.now() - sc.createdAt) / 1000,
                team_id: job.data.team_id,
                mode: job.data.crawlerOptions !== null ? "crawl" : "batch_scrape",
                url: sc.originUrl,
                scrapeOptions: sc.scrapeOptions,
                crawlerOptions: sc.crawlerOptions,
                origin: job.data.origin,
            });
            const data = {
                success: jobStatus !== "failed",
                result: {
                    links: fullDocs.map((doc) => {
                        return {
                            content: doc,
                            source: doc?.metadata?.sourceURL ?? doc?.url ?? "",
                        };
                    }),
                },
                project_id: job.data.project_id,
                docs: fullDocs,
            };
            // v0 web hooks, call when done with all the data
            if (!job.data.v1) {
                (0, webhook_1.callWebhook)(job.data.team_id, job.data.crawl_id, data, job.data.webhook, job.data.v1, job.data.crawlerOptions !== null ? "crawl.completed" : "batch_scrape.completed");
            }
        }
        else {
            const jobIDs = await (0, crawl_redis_1.getCrawlJobs)(job.data.crawl_id);
            const jobStatus = sc.cancelled
                ? "failed"
                : "completed";
            // v1 web hooks, call when done with no data, but with event completed
            if (job.data.v1 && job.data.webhook) {
                (0, webhook_1.callWebhook)(job.data.team_id, job.data.crawl_id, [], job.data.webhook, job.data.v1, job.data.crawlerOptions !== null ? "crawl.completed" : "batch_scrape.completed");
            }
            await (0, log_job_1.logJob)({
                job_id: job.data.crawl_id,
                success: jobStatus === "completed",
                message: sc.cancelled ? "Cancelled" : undefined,
                num_docs: jobIDs.length,
                docs: [],
                time_taken: (Date.now() - sc.createdAt) / 1000,
                team_id: job.data.team_id,
                scrapeOptions: sc.scrapeOptions,
                mode: job.data.crawlerOptions !== null ? "crawl" : "batch_scrape",
                url: sc?.originUrl ?? (job.data.crawlerOptions === null ? "Batch Scrape" : "Unknown"),
                crawlerOptions: sc.crawlerOptions,
                origin: job.data.origin,
            }, true);
        }
    }
}
const processJobInternal = async (token, job) => {
    const extendLockInterval = setInterval(async () => {
        logger_1.logger.info(`🐂 Worker extending lock on job ${job.id}`);
        await job.extendLock(token, jobLockExtensionTime);
    }, jobLockExtendInterval);
    await (0, job_priority_1.addJobPriority)(job.data.team_id, job.id);
    let err = null;
    try {
        const result = await processJob(job, token);
        if (result.success) {
            try {
                if (job.data.crawl_id && process.env.USE_DB_AUTHENTICATION === "true") {
                    await job.moveToCompleted(null, token, false);
                }
                else {
                    await job.moveToCompleted(result.document, token, false);
                }
            }
            catch (e) { }
        }
        else {
            await job.moveToFailed(result.error, token, false);
        }
    }
    catch (error) {
        console.log("Job failed, error:", error);
        Sentry.captureException(error);
        err = error;
        await job.moveToFailed(error, token, false);
    }
    finally {
        await (0, job_priority_1.deleteJobPriority)(job.data.team_id, job.id);
        clearInterval(extendLockInterval);
    }
    return err;
};
let isShuttingDown = false;
process.on("SIGINT", () => {
    console.log("Received SIGTERM. Shutting down gracefully...");
    isShuttingDown = true;
});
process.on("SIGTERM", () => {
    console.log("Received SIGTERM. Shutting down gracefully...");
    isShuttingDown = true;
});
let cantAcceptConnectionCount = 0;
const workerFun = async (queue, processJobInternal) => {
    const worker = new bullmq_1.Worker(queue.name, null, {
        connection: queue_service_1.redisConnection,
        lockDuration: 1 * 60 * 1000, // 1 minute
        // lockRenewTime: 15 * 1000, // 15 seconds
        stalledInterval: 30 * 1000, // 30 seconds
        maxStalledCount: 10, // 10 times
    });
    worker.startStalledCheckTimer();
    const monitor = await system_monitor_1.default;
    while (true) {
        if (isShuttingDown) {
            console.log("No longer accepting new jobs. SIGINT");
            break;
        }
        const token = (0, uuid_1.v4)();
        const canAcceptConnection = await monitor.acceptConnection();
        if (!canAcceptConnection) {
            console.log("Cant accept connection");
            cantAcceptConnectionCount++;
            if (cantAcceptConnectionCount >= 25) {
                logger_1.logger.error("WORKER STALLED", {
                    cpuUsage: await monitor.checkCpuUsage(),
                    memoryUsage: await monitor.checkMemoryUsage(),
                });
            }
            await sleep(cantAcceptConnectionInterval); // more sleep
            continue;
        }
        else {
            cantAcceptConnectionCount = 0;
        }
        const job = await worker.getNextJob(token);
        if (job) {
            async function afterJobDone(job) {
                if (job.id && job.data && job.data.team_id && job.data.plan) {
                    await (0, concurrency_limit_1.removeConcurrencyLimitActiveJob)(job.data.team_id, job.id);
                    (0, concurrency_limit_1.cleanOldConcurrencyLimitEntries)(job.data.team_id);
                    // Queue up next job, if it exists
                    // No need to check if we're under the limit here -- if the current job is finished,
                    // we are 1 under the limit, assuming the job insertion logic never over-inserts. - MG
                    const nextJob = await (0, concurrency_limit_1.takeConcurrencyLimitedJob)(job.data.team_id);
                    if (nextJob !== null) {
                        await (0, concurrency_limit_1.pushConcurrencyLimitActiveJob)(job.data.team_id, nextJob.id);
                        await queue.add(nextJob.id, {
                            ...nextJob.data,
                            concurrencyLimitHit: true,
                        }, {
                            ...nextJob.opts,
                            jobId: nextJob.id,
                            priority: nextJob.priority,
                        });
                    }
                }
            }
            if (job.data && job.data.sentry && Sentry.isInitialized()) {
                Sentry.continueTrace({
                    sentryTrace: job.data.sentry.trace,
                    baggage: job.data.sentry.baggage,
                }, () => {
                    Sentry.startSpan({
                        name: "Scrape job",
                        attributes: {
                            job: job.id,
                            worker: process.env.FLY_MACHINE_ID ?? worker.id,
                        },
                    }, async (span) => {
                        await Sentry.startSpan({
                            name: "Process scrape job",
                            op: "queue.process",
                            attributes: {
                                "messaging.message.id": job.id,
                                "messaging.destination.name": (0, queue_service_1.getScrapeQueue)().name,
                                "messaging.message.body.size": job.data.sentry.size,
                                "messaging.message.receive.latency": Date.now() - (job.processedOn ?? job.timestamp),
                                "messaging.message.retry.count": job.attemptsMade,
                            },
                        }, async () => {
                            let res;
                            try {
                                res = await processJobInternal(token, job);
                            }
                            finally {
                                await afterJobDone(job);
                            }
                            if (res !== null) {
                                span.setStatus({ code: 2 }); // ERROR
                            }
                            else {
                                span.setStatus({ code: 1 }); // OK
                            }
                        });
                    });
                });
            }
            else {
                Sentry.startSpan({
                    name: "Scrape job",
                    attributes: {
                        job: job.id,
                        worker: process.env.FLY_MACHINE_ID ?? worker.id,
                    },
                }, () => {
                    processJobInternal(token, job)
                        .finally(() => afterJobDone(job));
                });
            }
            await sleep(gotJobInterval);
        }
        else {
            await sleep(connectionMonitorInterval);
        }
    }
};
workerFun((0, queue_service_1.getScrapeQueue)(), processJobInternal);
async function processJob(job, token) {
    logger_1.logger.info(`🐂 Worker taking job ${job.id}`);
    // Check if the job URL is researchhub and block it immediately
    // TODO: remove this once solve the root issue
    if (job.data.url &&
        (job.data.url.includes("researchhub.com") ||
            job.data.url.includes("ebay.com") ||
            job.data.url.includes("youtube.com") ||
            job.data.url.includes("microsoft.com"))) {
        logger_1.logger.info(`🐂 Blocking job ${job.id} with URL ${job.data.url}`);
        const data = {
            success: false,
            document: null,
            project_id: job.data.project_id,
            error: "URL is blocked. Suspecious activity detected. Please contact help@firecrawl.com if you believe this is an error.",
        };
        return data;
    }
    try {
        job.updateProgress({
            current: 1,
            total: 100,
            current_step: "SCRAPING",
            current_url: "",
        });
        const start = Date.now();
        const pipeline = await Promise.race([
            (0, runWebScraper_1.startWebScraperPipeline)({
                job,
                token,
            }),
            ...(job.data.scrapeOptions.timeout !== undefined ? [
                (async () => {
                    await sleep(job.data.scrapeOptions.timeout);
                    throw new Error("timeout");
                })(),
            ] : [])
        ]);
        if (!pipeline.success) {
            // TODO: let's Not do this
            throw pipeline.error;
        }
        const end = Date.now();
        const timeTakenInSeconds = (end - start) / 1000;
        const doc = pipeline.document;
        const rawHtml = doc.rawHtml ?? "";
        const data = {
            success: true,
            result: {
                links: [{
                        content: doc,
                        source: doc?.metadata?.sourceURL ?? doc?.metadata?.url ?? "",
                    }],
            },
            project_id: job.data.project_id,
            document: doc,
        };
        if (job.data.webhook && job.data.mode !== "crawl" && job.data.v1) {
            await (0, webhook_1.callWebhook)(job.data.team_id, job.data.crawl_id, data, job.data.webhook, job.data.v1, job.data.crawlerOptions !== null ? "crawl.page" : "batch_scrape.page", true);
        }
        if (job.data.crawl_id) {
            const sc = (await (0, crawl_redis_1.getCrawl)(job.data.crawl_id));
            if (doc.metadata.url !== undefined && doc.metadata.sourceURL !== undefined && (0, crawl_redis_1.normalizeURL)(doc.metadata.url, sc) !== (0, crawl_redis_1.normalizeURL)(doc.metadata.sourceURL, sc)) {
                logger_1.logger.debug("Was redirected, locking new URL...");
                await (0, crawl_redis_1.lockURL)(job.data.crawl_id, sc, doc.metadata.url);
            }
            await (0, log_job_1.logJob)({
                job_id: job.id,
                success: true,
                num_docs: 1,
                docs: [doc],
                time_taken: timeTakenInSeconds,
                team_id: job.data.team_id,
                mode: job.data.mode,
                url: job.data.url,
                crawlerOptions: sc.crawlerOptions,
                scrapeOptions: job.data.scrapeOptions,
                origin: job.data.origin,
                crawl_id: job.data.crawl_id,
            }, true);
            await (0, crawl_redis_1.addCrawlJobDone)(job.data.crawl_id, job.id);
            if (job.data.crawlerOptions !== null) {
                if (!sc.cancelled) {
                    const crawler = (0, crawl_redis_1.crawlToCrawler)(job.data.crawl_id, sc, doc.metadata.url ?? doc.metadata.sourceURL ?? sc.originUrl);
                    const links = crawler.filterLinks(crawler.extractLinksFromHTML(rawHtml ?? "", doc.metadata?.url ?? doc.metadata?.sourceURL ?? sc.originUrl), Infinity, sc.crawlerOptions?.maxDepth ?? 10);
                    for (const link of links) {
                        if (await (0, crawl_redis_1.lockURL)(job.data.crawl_id, sc, link)) {
                            // This seems to work really welel
                            const jobPriority = await (0, job_priority_1.getJobPriority)({
                                plan: sc.plan,
                                team_id: sc.team_id,
                                basePriority: job.data.crawl_id ? 20 : 10,
                            });
                            const jobId = (0, uuid_1.v4)();
                            // console.log("plan: ",  sc.plan);
                            // console.log("team_id: ", sc.team_id)
                            // console.log("base priority: ", job.data.crawl_id ? 20 : 10)
                            // console.log("job priority: " , jobPriority, "\n\n\n")
                            await (0, queue_jobs_1.addScrapeJob)({
                                url: link,
                                mode: "single_urls",
                                team_id: sc.team_id,
                                scrapeOptions: types_1.scrapeOptions.parse(sc.scrapeOptions),
                                internalOptions: sc.internalOptions,
                                plan: job.data.plan,
                                origin: job.data.origin,
                                crawl_id: job.data.crawl_id,
                                webhook: job.data.webhook,
                                v1: job.data.v1,
                            }, {}, jobId, jobPriority);
                            await (0, crawl_redis_1.addCrawlJob)(job.data.crawl_id, jobId);
                        }
                    }
                }
            }
            await finishCrawlIfNeeded(job, sc);
        }
        logger_1.logger.info(`🐂 Job done ${job.id}`);
        return data;
    }
    catch (error) {
        const isEarlyTimeout = error instanceof Error && error.message === "timeout";
        if (!isEarlyTimeout) {
            logger_1.logger.error(`🐂 Job errored ${job.id} - ${error}`);
            Sentry.captureException(error, {
                data: {
                    job: job.id,
                },
            });
            if (error instanceof custom_error_1.CustomError) {
                // Here we handle the error, then save the failed job
                logger_1.logger.error(error.message); // or any other error handling
            }
            logger_1.logger.error(error);
            if (error.stack) {
                logger_1.logger.error(error.stack);
            }
        }
        else {
            logger_1.logger.error(`🐂 Job timed out ${job.id}`);
        }
        const data = {
            success: false,
            document: null,
            project_id: job.data.project_id,
            error: error instanceof Error ? error : typeof error === "string" ? new Error(error) : new Error(JSON.stringify(error)),
        };
        if (!job.data.v1 && (job.data.mode === "crawl" || job.data.crawl_id)) {
            (0, webhook_1.callWebhook)(job.data.team_id, job.data.crawl_id ?? job.id, data, job.data.webhook, job.data.v1, job.data.crawlerOptions !== null ? "crawl.page" : "batch_scrape.page");
        }
        // if (job.data.v1) {
        //   callWebhook(
        //     job.data.team_id,
        //     job.id as string,
        //     [],
        //     job.data.webhook,
        //     job.data.v1,
        //     "crawl.failed"
        //   );
        // }
        if (job.data.crawl_id) {
            const sc = (await (0, crawl_redis_1.getCrawl)(job.data.crawl_id));
            await (0, crawl_redis_1.addCrawlJobDone)(job.data.crawl_id, job.id);
            await (0, log_job_1.logJob)({
                job_id: job.id,
                success: false,
                message: typeof error === "string"
                    ? error
                    : error.message ??
                        "Something went wrong... Contact help@mendable.ai",
                num_docs: 0,
                docs: [],
                time_taken: 0,
                team_id: job.data.team_id,
                mode: job.data.mode,
                url: job.data.url,
                crawlerOptions: sc.crawlerOptions,
                scrapeOptions: job.data.scrapeOptions,
                origin: job.data.origin,
                crawl_id: job.data.crawl_id,
            }, true);
            await finishCrawlIfNeeded(job, sc);
            // await logJob({
            //   job_id: job.data.crawl_id,
            //   success: false,
            //   message:
            //     typeof error === "string"
            //       ? error
            //       : error.message ??
            //         "Something went wrong... Contact help@mendable.ai",
            //   num_docs: 0,
            //   docs: [],
            //   time_taken: 0,
            //   team_id: job.data.team_id,
            //   mode: job.data.crawlerOptions !== null ? "crawl" : "batch_scrape",
            //   url: sc ? sc.originUrl ?? job.data.url : job.data.url,
            //   crawlerOptions: sc ? sc.crawlerOptions : undefined,
            //   scrapeOptions: sc ? sc.scrapeOptions : job.data.scrapeOptions,
            //   origin: job.data.origin,
            // });
        }
        // done(null, data);
        return data;
    }
}
// wsq.process(
//   Math.floor(Number(process.env.NUM_WORKERS_PER_QUEUE ?? 8)),
//   processJob
// );
// wsq.on("waiting", j => ScrapeEvents.logJobEvent(j, "waiting"));
// wsq.on("active", j => ScrapeEvents.logJobEvent(j, "active"));
// wsq.on("completed", j => ScrapeEvents.logJobEvent(j, "completed"));
// wsq.on("paused", j => ScrapeEvents.logJobEvent(j, "paused"));
// wsq.on("resumed", j => ScrapeEvents.logJobEvent(j, "resumed"));
// wsq.on("removed", j => ScrapeEvents.logJobEvent(j, "removed"));
//# sourceMappingURL=queue-worker.js.map