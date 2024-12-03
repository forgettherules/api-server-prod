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
exports.scrapeController = exports.scrapeHelper = void 0;
const credit_billing_1 = require("../../services/billing/credit_billing");
const auth_1 = require("../auth");
const types_1 = require("../../types");
const log_job_1 = require("../../services/logging/log_job");
const types_2 = require("../v1/types");
const blocklist_1 = require("../../scraper/WebScraper/utils/blocklist"); // Import the isUrlBlocked function
const helpers_1 = require("../../lib/LLM-extraction/helpers");
const default_values_1 = require("../../lib/default-values");
const queue_jobs_1 = require("../../services/queue-jobs");
const queue_service_1 = require("../../services/queue-service");
const uuid_1 = require("uuid");
const logger_1 = require("../../lib/logger");
const Sentry = __importStar(require("@sentry/node"));
const job_priority_1 = require("../../lib/job-priority");
const types_3 = require("../v1/types");
const zod_1 = require("zod");
async function scrapeHelper(jobId, req, team_id, crawlerOptions, pageOptions, extractorOptions, timeout, plan) {
    const url = types_2.url.parse(req.body.url);
    if (typeof url !== "string") {
        return { success: false, error: "Url is required", returnCode: 400 };
    }
    if ((0, blocklist_1.isUrlBlocked)(url)) {
        return {
            success: false,
            error: "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.",
            returnCode: 403,
        };
    }
    const jobPriority = await (0, job_priority_1.getJobPriority)({ plan, team_id, basePriority: 10 });
    const { scrapeOptions, internalOptions } = (0, types_2.fromLegacyCombo)(pageOptions, extractorOptions, timeout, crawlerOptions);
    await (0, queue_jobs_1.addScrapeJob)({
        url,
        mode: "single_urls",
        team_id,
        scrapeOptions,
        internalOptions,
        plan: plan,
        origin: req.body.origin ?? default_values_1.defaultOrigin,
        is_scrape: true,
    }, {}, jobId, jobPriority);
    let doc;
    const err = await Sentry.startSpan({
        name: "Wait for job to finish",
        op: "bullmq.wait",
        attributes: { job: jobId },
    }, async (span) => {
        try {
            doc = (await (0, queue_jobs_1.waitForJob)(jobId, timeout));
        }
        catch (e) {
            if (e instanceof Error && (e.message.startsWith("Job wait") || e.message === "timeout")) {
                span.setAttribute("timedOut", true);
                return {
                    success: false,
                    error: "Request timed out",
                    returnCode: 408,
                };
            }
            else if (typeof e === "string" &&
                (e.includes("Error generating completions: ") ||
                    e.includes("Invalid schema for function") ||
                    e.includes("LLM extraction did not match the extraction schema you provided."))) {
                return {
                    success: false,
                    error: e,
                    returnCode: 500,
                };
            }
            else {
                throw e;
            }
        }
        span.setAttribute("result", JSON.stringify(doc));
        return null;
    });
    if (err !== null) {
        return err;
    }
    await (0, queue_service_1.getScrapeQueue)().remove(jobId);
    if (!doc) {
        console.error("!!! PANIC DOC IS", doc);
        return {
            success: true,
            error: "No page found",
            returnCode: 200,
            data: doc,
        };
    }
    delete doc.index;
    delete doc.provider;
    // Remove rawHtml if pageOptions.rawHtml is false and extractorOptions.mode is llm-extraction-from-raw-html
    if (!pageOptions.includeRawHtml &&
        extractorOptions.mode == "llm-extraction-from-raw-html") {
        if (doc.rawHtml) {
            delete doc.rawHtml;
        }
    }
    if (!pageOptions.includeHtml) {
        if (doc.html) {
            delete doc.html;
        }
    }
    return {
        success: true,
        data: (0, types_2.toLegacyDocument)(doc, internalOptions),
        returnCode: 200,
    };
}
exports.scrapeHelper = scrapeHelper;
async function scrapeController(req, res) {
    try {
        let earlyReturn = false;
        // make sure to authenticate user first, Bearer <token>
        const auth = await (0, auth_1.authenticateUser)(req, res, types_1.RateLimiterMode.Scrape);
        if (!auth.success) {
            return res.status(auth.status).json({ error: auth.error });
        }
        const { team_id, plan, chunk } = auth;
        const crawlerOptions = req.body.crawlerOptions ?? {};
        const pageOptions = { ...default_values_1.defaultPageOptions, ...req.body.pageOptions };
        const extractorOptions = {
            ...default_values_1.defaultExtractorOptions,
            ...req.body.extractorOptions,
        };
        const origin = req.body.origin ?? default_values_1.defaultOrigin;
        let timeout = req.body.timeout ?? default_values_1.defaultTimeout;
        if (extractorOptions.mode.includes("llm-extraction")) {
            if (typeof extractorOptions.extractionSchema !== "object" ||
                extractorOptions.extractionSchema === null) {
                return res.status(400).json({
                    error: "extractorOptions.extractionSchema must be an object if llm-extraction mode is specified",
                });
            }
            pageOptions.onlyMainContent = true;
            timeout = req.body.timeout ?? 90000;
        }
        // checkCredits
        try {
            const { success: creditsCheckSuccess, message: creditsCheckMessage } = await (0, credit_billing_1.checkTeamCredits)(chunk, team_id, 1);
            if (!creditsCheckSuccess) {
                earlyReturn = true;
                return res.status(402).json({ error: "Insufficient credits. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing" });
            }
        }
        catch (error) {
            logger_1.logger.error(error);
            earlyReturn = true;
            return res.status(500).json({
                error: "Error checking team credits. Please contact help@firecrawl.com for help.",
            });
        }
        const jobId = (0, uuid_1.v4)();
        const startTime = new Date().getTime();
        const result = await scrapeHelper(jobId, req, team_id, crawlerOptions, pageOptions, extractorOptions, timeout, plan);
        const endTime = new Date().getTime();
        const timeTakenInSeconds = (endTime - startTime) / 1000;
        const numTokens = result.data && result.data.markdown
            ? (0, helpers_1.numTokensFromString)(result.data.markdown, "gpt-3.5-turbo")
            : 0;
        if (result.success) {
            let creditsToBeBilled = 1;
            const creditsPerLLMExtract = 4;
            if (extractorOptions.mode.includes("llm-extraction")) {
                // creditsToBeBilled = creditsToBeBilled + (creditsPerLLMExtract * filteredDocs.length);
                creditsToBeBilled += creditsPerLLMExtract;
            }
            let startTimeBilling = new Date().getTime();
            if (earlyReturn) {
                // Don't bill if we're early returning
                return;
            }
            if (creditsToBeBilled > 0) {
                // billing for doc done on queue end, bill only for llm extraction
                (0, credit_billing_1.billTeam)(team_id, chunk?.sub_id, creditsToBeBilled).catch(error => {
                    logger_1.logger.error(`Failed to bill team ${team_id} for ${creditsToBeBilled} credits: ${error}`);
                    // Optionally, you could notify an admin or add to a retry queue here
                });
            }
        }
        let doc = result.data;
        if (!pageOptions || !pageOptions.includeRawHtml) {
            if (doc && doc.rawHtml) {
                delete doc.rawHtml;
            }
        }
        if (pageOptions && pageOptions.includeExtract) {
            if (!pageOptions.includeMarkdown && doc && doc.markdown) {
                delete doc.markdown;
            }
        }
        const { scrapeOptions } = (0, types_3.fromLegacyScrapeOptions)(pageOptions, extractorOptions, timeout);
        (0, log_job_1.logJob)({
            job_id: jobId,
            success: result.success,
            message: result.error,
            num_docs: 1,
            docs: [doc],
            time_taken: timeTakenInSeconds,
            team_id: team_id,
            mode: "scrape",
            url: req.body.url,
            crawlerOptions: crawlerOptions,
            scrapeOptions,
            origin: origin,
            num_tokens: numTokens,
        });
        return res.status(result.returnCode).json(result);
    }
    catch (error) {
        Sentry.captureException(error);
        logger_1.logger.error(error);
        return res.status(500).json({
            error: error instanceof zod_1.ZodError
                ? "Invalid URL"
                : typeof error === "string"
                    ? error
                    : error?.message ?? "Internal Server Error",
        });
    }
}
exports.scrapeController = scrapeController;
//# sourceMappingURL=scrape.js.map