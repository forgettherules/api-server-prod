"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callWebhook = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../lib/logger");
const supabase_1 = require("./supabase");
const dotenv_1 = require("dotenv");
const types_1 = require("../controllers/v1/types");
(0, dotenv_1.configDotenv)();
const callWebhook = async (teamId, id, data, specified, v1 = false, eventType = "crawl.page", awaitWebhook = false) => {
    try {
        const selfHostedUrl = process.env.SELF_HOSTED_WEBHOOK_URL?.replace("{{JOB_ID}}", id);
        const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
        let webhookUrl = specified ?? (selfHostedUrl ? types_1.webhookSchema.parse({ url: selfHostedUrl }) : undefined);
        // Only fetch the webhook URL from the database if the self-hosted webhook URL and specified webhook are not set
        // and the USE_DB_AUTHENTICATION environment variable is set to true
        if (!webhookUrl && useDbAuthentication) {
            const { data: webhooksData, error } = await supabase_1.supabase_service
                .from("webhooks")
                .select("url")
                .eq("team_id", teamId)
                .limit(1);
            if (error) {
                logger_1.logger.error(`Error fetching webhook URL for team ID: ${teamId}, error: ${error.message}`);
                return null;
            }
            if (!webhooksData || webhooksData.length === 0) {
                return null;
            }
            webhookUrl = webhooksData[0].url;
        }
        logger_1.logger.debug("Calling webhook...", { webhookUrl, teamId, specified, v1, eventType, awaitWebhook });
        if (!webhookUrl) {
            return null;
        }
        let dataToSend = [];
        if (data &&
            data.result &&
            data.result.links &&
            data.result.links.length !== 0) {
            for (let i = 0; i < data.result.links.length; i++) {
                if (v1) {
                    dataToSend.push(data.result.links[i].content);
                }
                else {
                    dataToSend.push({
                        content: data.result.links[i].content.content,
                        markdown: data.result.links[i].content.markdown,
                        metadata: data.result.links[i].content.metadata,
                    });
                }
            }
        }
        if (awaitWebhook) {
            try {
                await axios_1.default.post(webhookUrl.url, {
                    success: !v1
                        ? data.success
                        : eventType === "crawl.page"
                            ? data.success
                            : true,
                    type: eventType,
                    [v1 ? "id" : "jobId"]: id,
                    data: dataToSend,
                    error: !v1
                        ? data?.error || undefined
                        : eventType === "crawl.page"
                            ? data?.error || undefined
                            : undefined,
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        ...webhookUrl.headers,
                    },
                    timeout: v1 ? 10000 : 30000, // 10 seconds timeout (v1)
                });
            }
            catch (error) {
                logger_1.logger.error(`Axios error (0) sending webhook for team ID: ${teamId}, error: ${error.message}`);
            }
        }
        else {
            axios_1.default
                .post(webhookUrl.url, {
                success: !v1
                    ? data.success
                    : eventType === "crawl.page"
                        ? data.success
                        : true,
                type: eventType,
                [v1 ? "id" : "jobId"]: id,
                data: dataToSend,
                error: !v1
                    ? data?.error || undefined
                    : eventType === "crawl.page"
                        ? data?.error || undefined
                        : undefined,
            }, {
                headers: {
                    "Content-Type": "application/json",
                    ...webhookUrl.headers,
                },
            })
                .catch((error) => {
                logger_1.logger.error(`Axios error sending webhook for team ID: ${teamId}, error: ${error.message}`);
            });
        }
    }
    catch (error) {
        logger_1.logger.debug(`Error sending webhook for team ID: ${teamId}, error: ${error.message}`);
    }
};
exports.callWebhook = callWebhook;
//# sourceMappingURL=webhook.js.map