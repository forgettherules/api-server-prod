"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeURLWithScrapingBee = void 0;
const scrapingbee_1 = require("scrapingbee");
const specialtyHandler_1 = require("../utils/specialtyHandler");
const axios_1 = require("axios");
const error_1 = require("../../error");
const client = new scrapingbee_1.ScrapingBeeClient(process.env.SCRAPING_BEE_API_KEY);
function scrapeURLWithScrapingBee(wait_browser) {
    return async (meta) => {
        let response;
        try {
            response = await client.get({
                url: meta.url,
                params: {
                    timeout: 15000, // TODO: dynamic timeout based on request timeout
                    wait_browser: wait_browser,
                    wait: Math.min(meta.options.waitFor, 35000),
                    transparent_status_code: true,
                    json_response: true,
                    screenshot: meta.options.formats.includes("screenshot"),
                    screenshot_full_page: meta.options.formats.includes("screenshot@fullPage"),
                },
                headers: {
                    "ScrapingService-Request": "TRUE", // this is sent to the page, not to ScrapingBee - mogery
                },
            });
        }
        catch (error) {
            if (error instanceof axios_1.AxiosError && error.response !== undefined) {
                response = error.response;
            }
            else {
                throw error;
            }
        }
        const data = response.data;
        const body = JSON.parse(new TextDecoder().decode(data));
        const headers = body.headers ?? {};
        const isHiddenEngineError = !(headers["Date"] ?? headers["date"] ?? headers["Content-Type"] ?? headers["content-type"]);
        if (body.errors || body.body?.error || isHiddenEngineError) {
            meta.logger.error("ScrapingBee threw an error", { body: body.body?.error ?? body.errors ?? body.body ?? body });
            throw new error_1.EngineError("Engine error #34", { cause: { body, statusCode: response.status } });
        }
        if (typeof body.body !== "string") {
            meta.logger.error("ScrapingBee: Body is not string??", { body });
            throw new error_1.EngineError("Engine error #35", { cause: { body, statusCode: response.status } });
        }
        (0, specialtyHandler_1.specialtyScrapeCheck)(meta.logger.child({ method: "scrapeURLWithScrapingBee/specialtyScrapeCheck" }), body.headers);
        return {
            url: body["resolved-url"] ?? meta.url,
            html: body.body,
            error: response.status >= 300 ? response.statusText : undefined,
            statusCode: response.status,
            ...(body.screenshot ? ({
                screenshot: `data:image/png;base64,${body.screenshot}`,
            }) : {}),
        };
    };
}
exports.scrapeURLWithScrapingBee = scrapeURLWithScrapingBee;
//# sourceMappingURL=index.js.map