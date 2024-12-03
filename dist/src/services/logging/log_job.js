"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logJob = void 0;
const supabase_1 = require("../supabase");
const posthog_1 = require("../posthog");
require("dotenv/config");
const logger_1 = require("../../lib/logger");
const dotenv_1 = require("dotenv");
(0, dotenv_1.configDotenv)();
async function logJob(job, force = false) {
    try {
        const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
        if (!useDbAuthentication) {
            return;
        }
        // Redact any pages that have an authorization header
        if (job.scrapeOptions &&
            job.scrapeOptions.headers &&
            job.scrapeOptions.headers["Authorization"]) {
            job.scrapeOptions.headers["Authorization"] = "REDACTED";
            job.docs = [{ content: "REDACTED DUE TO AUTHORIZATION HEADER", html: "REDACTED DUE TO AUTHORIZATION HEADER" }];
        }
        const jobColumn = {
            job_id: job.job_id ? job.job_id : null,
            success: job.success,
            message: job.message,
            num_docs: job.num_docs,
            docs: job.docs,
            time_taken: job.time_taken,
            team_id: job.team_id === "preview" ? null : job.team_id,
            mode: job.mode,
            url: job.url,
            crawler_options: job.crawlerOptions,
            page_options: job.scrapeOptions,
            origin: job.origin,
            num_tokens: job.num_tokens,
            retry: !!job.retry,
            crawl_id: job.crawl_id,
        };
        if (force) {
            let i = 0, done = false;
            while (i++ <= 10) {
                try {
                    const { error } = await supabase_1.supabase_service
                        .from("firecrawl_jobs")
                        .insert([jobColumn]);
                    if (error) {
                        logger_1.logger.error("Failed to log job due to Supabase error -- trying again", { error, scrapeId: job.job_id });
                        await new Promise((resolve) => setTimeout(() => resolve(), 75));
                    }
                    else {
                        done = true;
                        break;
                    }
                }
                catch (error) {
                    logger_1.logger.error("Failed to log job due to thrown error -- trying again", { error, scrapeId: job.job_id });
                    await new Promise((resolve) => setTimeout(() => resolve(), 75));
                }
            }
            if (done) {
                logger_1.logger.debug("Job logged successfully!", { scrapeId: job.job_id });
            }
            else {
                logger_1.logger.error("Failed to log job!", { scrapeId: job.job_id });
            }
        }
        else {
            const { error } = await supabase_1.supabase_service
                .from("firecrawl_jobs")
                .insert([jobColumn]);
            if (error) {
                logger_1.logger.error(`Error logging job: ${error.message}`, { error, scrapeId: job.job_id });
            }
            else {
                logger_1.logger.debug("Job logged successfully!", { scrapeId: job.job_id });
            }
        }
        if (process.env.POSTHOG_API_KEY && !job.crawl_id) {
            let phLog = {
                distinctId: "from-api", //* To identify this on the group level, setting distinctid to a static string per posthog docs: https://posthog.com/docs/product-analytics/group-analytics#advanced-server-side-only-capturing-group-events-without-a-user
                ...(job.team_id !== "preview" && {
                    groups: { team: job.team_id },
                }), //* Identifying event on this team
                event: "job-logged",
                properties: {
                    success: job.success,
                    message: job.message,
                    num_docs: job.num_docs,
                    time_taken: job.time_taken,
                    team_id: job.team_id === "preview" ? null : job.team_id,
                    mode: job.mode,
                    url: job.url,
                    crawler_options: job.crawlerOptions,
                    page_options: job.scrapeOptions,
                    origin: job.origin,
                    num_tokens: job.num_tokens,
                    retry: job.retry,
                },
            };
            if (job.mode !== "single_urls") {
                posthog_1.posthog.capture(phLog);
            }
        }
    }
    catch (error) {
        logger_1.logger.error(`Error logging job: ${error.message}`);
    }
}
exports.logJob = logJob;
//# sourceMappingURL=log_job.js.map