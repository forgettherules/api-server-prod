"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeController = void 0;
const logger_1 = require("../../lib/logger");
const types_1 = require("./types");
const credit_billing_1 = require("../../services/billing/credit_billing");
const uuid_1 = require("uuid");
const queue_jobs_1 = require("../../services/queue-jobs");
const log_job_1 = require("../../services/logging/log_job");
const job_priority_1 = require("../../lib/job-priority");
const queue_service_1 = require("../../services/queue-service");
async function scrapeController(req, res) {
    req.body = types_1.scrapeRequestSchema.parse(req.body);
    let earlyReturn = false;
    const origin = req.body.origin;
    const timeout = req.body.timeout;
    const jobId = (0, uuid_1.v4)();
    const startTime = new Date().getTime();
    const jobPriority = await (0, job_priority_1.getJobPriority)({
        plan: req.auth.plan,
        team_id: req.auth.team_id,
        basePriority: 10,
    });
    await (0, queue_jobs_1.addScrapeJob)({
        url: req.body.url,
        mode: "single_urls",
        team_id: req.auth.team_id,
        scrapeOptions: req.body,
        internalOptions: {},
        plan: req.auth.plan,
        origin: req.body.origin,
        is_scrape: true,
    }, {}, jobId, jobPriority);
    const totalWait = (req.body.waitFor ?? 0) + (req.body.actions ?? []).reduce((a, x) => (x.type === "wait" ? x.milliseconds ?? 0 : 0) + a, 0);
    let doc;
    try {
        doc = await (0, queue_jobs_1.waitForJob)(jobId, timeout + totalWait); // TODO: better types for this
    }
    catch (e) {
        logger_1.logger.error(`Error in scrapeController: ${e}`);
        if (e instanceof Error && (e.message.startsWith("Job wait") || e.message === "timeout")) {
            return res.status(408).json({
                success: false,
                error: "Request timed out",
            });
        }
        else {
            return res.status(500).json({
                success: false,
                error: `(Internal server error) - ${(e && e.message) ? e.message : e}`,
            });
        }
    }
    await (0, queue_service_1.getScrapeQueue)().remove(jobId);
    const endTime = new Date().getTime();
    const timeTakenInSeconds = (endTime - startTime) / 1000;
    const numTokens = doc && doc.extract
        // ? numTokensFromString(doc.markdown, "gpt-3.5-turbo")
        ? 0 // TODO: fix
        : 0;
    let creditsToBeBilled = 1; // Assuming 1 credit per document
    if (earlyReturn) {
        // Don't bill if we're early returning
        return;
    }
    if (req.body.extract && req.body.formats.includes("extract")) {
        creditsToBeBilled = 5;
    }
    (0, credit_billing_1.billTeam)(req.auth.team_id, req.acuc?.sub_id, creditsToBeBilled).catch(error => {
        logger_1.logger.error(`Failed to bill team ${req.auth.team_id} for ${creditsToBeBilled} credits: ${error}`);
        // Optionally, you could notify an admin or add to a retry queue here
    });
    if (!req.body.formats.includes("rawHtml")) {
        if (doc && doc.rawHtml) {
            delete doc.rawHtml;
        }
    }
    (0, log_job_1.logJob)({
        job_id: jobId,
        success: true,
        message: "Scrape completed",
        num_docs: 1,
        docs: [doc],
        time_taken: timeTakenInSeconds,
        team_id: req.auth.team_id,
        mode: "scrape",
        url: req.body.url,
        scrapeOptions: req.body,
        origin: origin,
        num_tokens: numTokens,
    });
    return res.status(200).json({
        success: true,
        data: doc,
        scrape_id: origin?.includes("website") ? jobId : undefined,
    });
}
exports.scrapeController = scrapeController;
//# sourceMappingURL=scrape.js.map