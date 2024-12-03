"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeURLWithPlaywright = void 0;
const zod_1 = require("zod");
const error_1 = require("../../error");
const fetch_1 = require("../../lib/fetch");
async function scrapeURLWithPlaywright(meta) {
    const timeout = 20000 + meta.options.waitFor;
    const response = await Promise.race([
        await (0, fetch_1.robustFetch)({
            url: process.env.PLAYWRIGHT_MICROSERVICE_URL,
            headers: {
                "Content-Type": "application/json",
            },
            body: {
                url: meta.url,
                wait_after_load: meta.options.waitFor,
                timeout,
                headers: meta.options.headers,
            },
            method: "POST",
            logger: meta.logger.child("scrapeURLWithPlaywright/robustFetch"),
            schema: zod_1.z.object({
                content: zod_1.z.string(),
                pageStatusCode: zod_1.z.number(),
                pageError: zod_1.z.string().optional(),
            }),
        }),
        (async () => {
            await new Promise((resolve) => setTimeout(() => resolve(null), 20000));
            throw new error_1.TimeoutError("Playwright was unable to scrape the page before timing out", { cause: { timeout } });
        })(),
    ]);
    return {
        url: meta.url, // TODO: impove redirect following
        html: response.content,
        statusCode: response.pageStatusCode,
        error: response.pageError,
    };
}
exports.scrapeURLWithPlaywright = scrapeURLWithPlaywright;
//# sourceMappingURL=index.js.map