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
exports.waitForJob = exports.addScrapeJobs = exports.addScrapeJob = void 0;
const queue_service_1 = require("./queue-service");
const uuid_1 = require("uuid");
const Sentry = __importStar(require("@sentry/node"));
const concurrency_limit_1 = require("../lib/concurrency-limit");
async function addScrapeJobRaw(webScraperOptions, options, jobId, jobPriority = 10) {
    let concurrencyLimited = false;
    if (webScraperOptions && webScraperOptions.team_id && webScraperOptions.plan) {
        const now = Date.now();
        const limit = await (0, concurrency_limit_1.getConcurrencyLimitMax)(webScraperOptions.plan);
        (0, concurrency_limit_1.cleanOldConcurrencyLimitEntries)(webScraperOptions.team_id, now);
        concurrencyLimited = (await (0, concurrency_limit_1.getConcurrencyLimitActiveJobs)(webScraperOptions.team_id, now)).length >= limit;
    }
    if (concurrencyLimited) {
        await (0, concurrency_limit_1.pushConcurrencyLimitedJob)(webScraperOptions.team_id, {
            id: jobId,
            data: webScraperOptions,
            opts: {
                ...options,
                priority: jobPriority,
                jobId: jobId,
            },
            priority: jobPriority,
        });
    }
    else {
        if (webScraperOptions && webScraperOptions.team_id && webScraperOptions.plan) {
            await (0, concurrency_limit_1.pushConcurrencyLimitActiveJob)(webScraperOptions.team_id, jobId);
        }
        await (0, queue_service_1.getScrapeQueue)().add(jobId, webScraperOptions, {
            ...options,
            priority: jobPriority,
            jobId,
        });
    }
}
async function addScrapeJob(webScraperOptions, options = {}, jobId = (0, uuid_1.v4)(), jobPriority = 10) {
    if (Sentry.isInitialized()) {
        const size = JSON.stringify(webScraperOptions).length;
        return await Sentry.startSpan({
            name: "Add scrape job",
            op: "queue.publish",
            attributes: {
                "messaging.message.id": jobId,
                "messaging.destination.name": (0, queue_service_1.getScrapeQueue)().name,
                "messaging.message.body.size": size,
            },
        }, async (span) => {
            await addScrapeJobRaw({
                ...webScraperOptions,
                sentry: {
                    trace: Sentry.spanToTraceHeader(span),
                    baggage: Sentry.spanToBaggageHeader(span),
                    size,
                },
            }, options, jobId, jobPriority);
        });
    }
    else {
        await addScrapeJobRaw(webScraperOptions, options, jobId, jobPriority);
    }
}
exports.addScrapeJob = addScrapeJob;
async function addScrapeJobs(jobs) {
    // TODO: better
    await Promise.all(jobs.map(job => addScrapeJob(job.data, job.opts, job.opts.jobId, job.opts.priority)));
}
exports.addScrapeJobs = addScrapeJobs;
function waitForJob(jobId, timeout) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const int = setInterval(async () => {
            if (Date.now() >= start + timeout) {
                clearInterval(int);
                reject(new Error("Job wait "));
            }
            else {
                const state = await (0, queue_service_1.getScrapeQueue)().getJobState(jobId);
                if (state === "completed") {
                    clearInterval(int);
                    resolve((await (0, queue_service_1.getScrapeQueue)().getJob(jobId)).returnvalue);
                }
                else if (state === "failed") {
                    // console.log("failed", (await getScrapeQueue().getJob(jobId)).failedReason);
                    const job = await (0, queue_service_1.getScrapeQueue)().getJob(jobId);
                    if (job && job.failedReason !== "Concurrency limit hit") {
                        clearInterval(int);
                        reject(job.failedReason);
                    }
                }
            }
        }, 250);
    });
}
exports.waitForJob = waitForJob;
//# sourceMappingURL=queue-jobs.js.map