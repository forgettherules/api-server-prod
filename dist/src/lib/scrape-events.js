"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapeEvents = void 0;
const supabase_1 = require("../services/supabase");
const logger_1 = require("./logger");
const dotenv_1 = require("dotenv");
(0, dotenv_1.configDotenv)();
class ScrapeEvents {
    static async insert(jobId, content) {
        if (jobId === "TEST")
            return null;
        const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
        if (useDbAuthentication) {
            try {
                const result = await supabase_1.supabase_service.from("scrape_events").insert({
                    job_id: jobId,
                    type: content.type,
                    content: content,
                    // created_at
                }).select().single();
                return result.data.id;
            }
            catch (error) {
                // logger.error(`Error inserting scrape event: ${error}`);
                return null;
            }
        }
        return null;
    }
    static async updateScrapeResult(logId, result) {
        if (logId === null)
            return;
        try {
            const previousLog = (await supabase_1.supabase_service.from("scrape_events").select().eq("id", logId).single()).data;
            await supabase_1.supabase_service.from("scrape_events").update({
                content: {
                    ...previousLog.content,
                    result,
                }
            }).eq("id", logId);
        }
        catch (error) {
            logger_1.logger.error(`Error updating scrape result: ${error}`);
        }
    }
    static async logJobEvent(job, event) {
        try {
            await this.insert((job.id ? job.id : job), {
                type: "queue",
                event,
                worker: process.env.FLY_MACHINE_ID,
            });
        }
        catch (error) {
            logger_1.logger.error(`Error logging job event: ${error}`);
        }
    }
}
exports.ScrapeEvents = ScrapeEvents;
//# sourceMappingURL=scrape-events.js.map