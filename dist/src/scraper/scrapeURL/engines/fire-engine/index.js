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
exports.scrapeURLWithFireEngineTLSClient = exports.scrapeURLWithFireEnginePlaywright = exports.scrapeURLWithFireEngineChromeCDP = exports.defaultTimeout = void 0;
const scrape_1 = require("./scrape");
const checkStatus_1 = require("./checkStatus");
const error_1 = require("../../error");
const Sentry = __importStar(require("@sentry/node"));
const specialtyHandler_1 = require("../utils/specialtyHandler");
exports.defaultTimeout = 10000;
// This function does not take `Meta` on purpose. It may not access any
// meta values to construct the request -- that must be done by the
// `scrapeURLWithFireEngine*` functions.
async function performFireEngineScrape(logger, request, timeout = exports.defaultTimeout) {
    const scrape = await (0, scrape_1.fireEngineScrape)(logger.child({ method: "fireEngineScrape" }), request);
    const startTime = Date.now();
    const errorLimit = 3;
    let errors = [];
    let status = undefined;
    while (status === undefined) {
        if (errors.length >= errorLimit) {
            logger.error("Error limit hit.", { errors });
            throw new Error("Error limit hit. See e.cause.errors for errors.", { cause: { errors } });
        }
        if (Date.now() - startTime > timeout) {
            logger.info("Fire-engine was unable to scrape the page before timing out.", { errors, timeout });
            throw new error_1.TimeoutError("Fire-engine was unable to scrape the page before timing out", { cause: { errors, timeout } });
        }
        try {
            status = await (0, checkStatus_1.fireEngineCheckStatus)(logger.child({ method: "fireEngineCheckStatus" }), scrape.jobId);
        }
        catch (error) {
            if (error instanceof checkStatus_1.StillProcessingError) {
                // nop
            }
            else if (error instanceof error_1.EngineError || error instanceof error_1.SiteError) {
                logger.debug("Fire-engine scrape job failed.", { error, jobId: scrape.jobId });
                throw error;
            }
            else {
                Sentry.captureException(error);
                errors.push(error);
                logger.debug(`An unexpeceted error occurred while calling checkStatus. Error counter is now at ${errors.length}.`, { error, jobId: scrape.jobId });
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return status;
}
async function scrapeURLWithFireEngineChromeCDP(meta) {
    const actions = [
        // Transform waitFor option into an action (unsupported by chrome-cdp)
        ...(meta.options.waitFor !== 0 ? [{
                type: "wait",
                milliseconds: meta.options.waitFor,
            }] : []),
        // Transform screenshot format into an action (unsupported by chrome-cdp)
        ...(meta.options.formats.includes("screenshot") || meta.options.formats.includes("screenshot@fullPage") ? [{
                type: "screenshot",
                fullPage: meta.options.formats.includes("screenshot@fullPage"),
            }] : []),
        // Include specified actions
        ...(meta.options.actions ?? []),
    ];
    const request = {
        url: meta.url,
        engine: "chrome-cdp",
        instantReturn: true,
        skipTlsVerification: meta.options.skipTlsVerification,
        headers: meta.options.headers,
        ...(actions.length > 0 ? ({
            actions,
        }) : {}),
        priority: meta.internalOptions.priority,
        geolocation: meta.options.geolocation,
        mobile: meta.options.mobile,
        timeout: meta.options.timeout === undefined ? 300000 : undefined, // TODO: better timeout logic
        // TODO: scrollXPaths
    };
    const totalWait = actions.reduce((a, x) => x.type === "wait" ? (x.milliseconds ?? 1000) + a : a, 0);
    let response = await performFireEngineScrape(meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/callFireEngine", request }), request, meta.options.timeout !== undefined
        ? exports.defaultTimeout + totalWait
        : Infinity);
    (0, specialtyHandler_1.specialtyScrapeCheck)(meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/specialtyScrapeCheck" }), response.responseHeaders);
    if (meta.options.formats.includes("screenshot") || meta.options.formats.includes("screenshot@fullPage")) {
        meta.logger.debug("Transforming screenshots from actions into screenshot field", { screenshots: response.screenshots });
        response.screenshot = (response.screenshots ?? [])[0];
        (response.screenshots ?? []).splice(0, 1);
        meta.logger.debug("Screenshot transformation done", { screenshots: response.screenshots, screenshot: response.screenshot });
    }
    if (!response.url) {
        meta.logger.warn("Fire-engine did not return the response's URL", { response, sourceURL: meta.url });
    }
    return {
        url: response.url ?? meta.url,
        html: response.content,
        error: response.pageError,
        statusCode: response.pageStatusCode,
        screenshot: response.screenshot,
        ...(actions.length > 0 ? {
            actions: {
                screenshots: response.screenshots ?? [],
                scrapes: response.actionContent ?? [],
            }
        } : {}),
    };
}
exports.scrapeURLWithFireEngineChromeCDP = scrapeURLWithFireEngineChromeCDP;
async function scrapeURLWithFireEnginePlaywright(meta) {
    const request = {
        url: meta.url,
        engine: "playwright",
        instantReturn: true,
        headers: meta.options.headers,
        priority: meta.internalOptions.priority,
        screenshot: meta.options.formats.includes("screenshot"),
        fullPageScreenshot: meta.options.formats.includes("screenshot@fullPage"),
        wait: meta.options.waitFor,
        geolocation: meta.options.geolocation,
        timeout: meta.options.timeout === undefined ? 300000 : undefined, // TODO: better timeout logic
    };
    let response = await performFireEngineScrape(meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/callFireEngine", request }), request, meta.options.timeout !== undefined
        ? exports.defaultTimeout + meta.options.waitFor
        : Infinity);
    (0, specialtyHandler_1.specialtyScrapeCheck)(meta.logger.child({ method: "scrapeURLWithFireEnginePlaywright/specialtyScrapeCheck" }), response.responseHeaders);
    if (!response.url) {
        meta.logger.warn("Fire-engine did not return the response's URL", { response, sourceURL: meta.url });
    }
    return {
        url: response.url ?? meta.url,
        html: response.content,
        error: response.pageError,
        statusCode: response.pageStatusCode,
        ...(response.screenshots !== undefined && response.screenshots.length > 0 ? ({
            screenshot: response.screenshots[0],
        }) : {}),
    };
}
exports.scrapeURLWithFireEnginePlaywright = scrapeURLWithFireEnginePlaywright;
async function scrapeURLWithFireEngineTLSClient(meta) {
    const request = {
        url: meta.url,
        engine: "tlsclient",
        instantReturn: true,
        headers: meta.options.headers,
        priority: meta.internalOptions.priority,
        atsv: meta.internalOptions.atsv,
        geolocation: meta.options.geolocation,
        disableJsDom: meta.internalOptions.v0DisableJsDom,
        timeout: meta.options.timeout === undefined ? 300000 : undefined, // TODO: better timeout logic
    };
    let response = await performFireEngineScrape(meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/callFireEngine", request }), request, meta.options.timeout !== undefined
        ? exports.defaultTimeout
        : Infinity);
    (0, specialtyHandler_1.specialtyScrapeCheck)(meta.logger.child({ method: "scrapeURLWithFireEngineTLSClient/specialtyScrapeCheck" }), response.responseHeaders);
    if (!response.url) {
        meta.logger.warn("Fire-engine did not return the response's URL", { response, sourceURL: meta.url });
    }
    return {
        url: response.url ?? meta.url,
        html: response.content,
        error: response.pageError,
        statusCode: response.pageStatusCode,
    };
}
exports.scrapeURLWithFireEngineTLSClient = scrapeURLWithFireEngineTLSClient;
//# sourceMappingURL=index.js.map