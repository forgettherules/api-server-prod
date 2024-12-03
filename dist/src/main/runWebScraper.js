"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWebScraper = exports.startWebScraperPipeline = void 0;
const credit_billing_1 = require("../services/billing/credit_billing");
const supabase_1 = require("../services/supabase");
const logger_1 = require("../lib/logger");
const scrape_events_1 = require("../lib/scrape-events");
const dotenv_1 = require("dotenv");
const scrapeURL_1 = require("../scraper/scrapeURL");
(0, dotenv_1.configDotenv)();
async function startWebScraperPipeline({ job, token, }) {
    return (await runWebScraper({
        url: job.data.url,
        mode: job.data.mode,
        scrapeOptions: {
            ...job.data.scrapeOptions,
            ...(job.data.crawl_id ? ({
                formats: job.data.scrapeOptions.formats.concat(["rawHtml"]),
            }) : {}),
        },
        internalOptions: job.data.internalOptions,
        // onSuccess: (result, mode) => {
        //   logger.debug(`🐂 Job completed ${job.id}`);
        //   saveJob(job, result, token, mode);
        // },
        // onError: (error) => {
        //   logger.error(`🐂 Job failed ${job.id}`);
        //   ScrapeEvents.logJobEvent(job, "failed");
        // },
        team_id: job.data.team_id,
        bull_job_id: job.id.toString(),
        priority: job.opts.priority,
        is_scrape: job.data.is_scrape ?? false,
    }));
}
exports.startWebScraperPipeline = startWebScraperPipeline;
async function runWebScraper({ url, mode, scrapeOptions, internalOptions, 
// onSuccess,
// onError,
team_id, bull_job_id, priority, is_scrape = false, }) {
    let response = undefined;
    let engines = {};
    try {
        response = await (0, scrapeURL_1.scrapeURL)(bull_job_id, url, scrapeOptions, { priority, ...internalOptions });
        if (!response.success) {
            if (response.error instanceof Error) {
                throw response.error;
            }
            else {
                throw new Error("scrapeURL error: " + (Array.isArray(response.error) ? JSON.stringify(response.error) : typeof response.error === "object" ? JSON.stringify({ ...response.error }) : response.error));
            }
        }
        if (is_scrape === false) {
            let creditsToBeBilled = 1; // Assuming 1 credit per document
            if (scrapeOptions.extract) {
                creditsToBeBilled = 5;
            }
            (0, credit_billing_1.billTeam)(team_id, undefined, creditsToBeBilled).catch(error => {
                logger_1.logger.error(`Failed to bill team ${team_id} for ${creditsToBeBilled} credits: ${error}`);
                // Optionally, you could notify an admin or add to a retry queue here
            });
        }
        // This is where the returnvalue from the job is set
        // onSuccess(response.document, mode);
        engines = response.engines;
        return response;
    }
    catch (error) {
        engines = response !== undefined ? response.engines : ((typeof error === "object" && error !== null ? error.results ?? {} : {}));
        if (response !== undefined) {
            return {
                ...response,
                success: false,
                error,
            };
        }
        else {
            return { success: false, error, logs: ["no logs -- error coming from runWebScraper"], engines };
        }
        // onError(error);
    }
    finally {
        const engineOrder = Object.entries(engines).sort((a, b) => a[1].startedAt - b[1].startedAt).map(x => x[0]);
        for (const engine of engineOrder) {
            const result = engines[engine];
            scrape_events_1.ScrapeEvents.insert(bull_job_id, {
                type: "scrape",
                url,
                method: engine,
                result: {
                    success: result.state === "success",
                    response_code: (result.state === "success" ? result.result.statusCode : undefined),
                    response_size: (result.state === "success" ? result.result.html.length : undefined),
                    error: (result.state === "error" ? result.error : result.state === "timeout" ? "Timed out" : undefined),
                    time_taken: result.finishedAt - result.startedAt,
                },
            });
        }
    }
}
exports.runWebScraper = runWebScraper;
const saveJob = async (job, result, token, mode, engines) => {
    try {
        const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
        if (useDbAuthentication) {
            const { data, error } = await supabase_1.supabase_service
                .from("firecrawl_jobs")
                .update({ docs: result })
                .eq("job_id", job.id);
            if (error)
                throw new Error(error.message);
            // try {
            //   if (mode === "crawl") {
            //     await job.moveToCompleted(null, token, false);
            //   } else {
            //     await job.moveToCompleted(result, token, false);
            //   }
            // } catch (error) {
            //   // I think the job won't exist here anymore
            // }
            // } else {
            //   try {
            //     await job.moveToCompleted(result, token, false);
            //   } catch (error) {
            //     // I think the job won't exist here anymore
            //   }
        }
        scrape_events_1.ScrapeEvents.logJobEvent(job, "completed");
    }
    catch (error) {
        logger_1.logger.error(`🐂 Failed to update job status: ${error}`);
    }
};
//# sourceMappingURL=runWebScraper.js.map