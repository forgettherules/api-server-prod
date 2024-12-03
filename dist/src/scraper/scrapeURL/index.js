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
exports.scrapeURL = void 0;
const Sentry = __importStar(require("@sentry/node"));
const logger_1 = require("../../lib/logger");
const engines_1 = require("./engines");
const html_to_markdown_1 = require("../../lib/html-to-markdown");
const error_1 = require("./error");
const transformers_1 = require("./transformers");
const llmExtract_1 = require("./transformers/llmExtract");
const urlSpecificParams_1 = require("./lib/urlSpecificParams");
function buildFeatureFlags(url, options, internalOptions) {
    const flags = new Set();
    if (options.actions !== undefined) {
        flags.add("actions");
    }
    if (options.formats.includes("screenshot")) {
        flags.add("screenshot");
    }
    if (options.formats.includes("screenshot@fullPage")) {
        flags.add("screenshot@fullScreen");
    }
    if (options.waitFor !== 0) {
        flags.add("waitFor");
    }
    if (internalOptions.atsv) {
        flags.add("atsv");
    }
    if (options.location || options.geolocation) {
        flags.add("location");
    }
    if (options.mobile) {
        flags.add("mobile");
    }
    if (options.skipTlsVerification) {
        flags.add("skipTlsVerification");
    }
    if (internalOptions.v0UseFastMode) {
        flags.add("useFastMode");
    }
    const urlO = new URL(url);
    if (urlO.pathname.endsWith(".pdf")) {
        flags.add("pdf");
    }
    if (urlO.pathname.endsWith(".docx")) {
        flags.add("docx");
    }
    return flags;
}
// The meta object contains all required information to perform a scrape.
// For example, the scrape ID, URL, options, feature flags, logs that occur while scraping.
// The meta object is usually immutable, except for the logs array, and in edge cases (e.g. a new feature is suddenly required)
// Having a meta object that is treated as immutable helps the code stay clean and easily tracable,
// while also retaining the benefits that WebScraper had from its OOP design.
function buildMetaObject(id, url, options, internalOptions) {
    const specParams = urlSpecificParams_1.urlSpecificParams[new URL(url).hostname.replace(/^www\./, "")];
    if (specParams !== undefined) {
        options = Object.assign(options, specParams.scrapeOptions);
        internalOptions = Object.assign(internalOptions, specParams.internalOptions);
    }
    const _logger = logger_1.logger.child({ module: "ScrapeURL", scrapeId: id, scrapeURL: url });
    const logs = [];
    return {
        id, url, options, internalOptions,
        logger: _logger,
        logs,
        featureFlags: buildFeatureFlags(url, options, internalOptions),
    };
}
function safeguardCircularError(error) {
    if (typeof error === "object" && error !== null && error.results) {
        const newError = structuredClone(error);
        delete newError.results;
        return newError;
    }
    else {
        return error;
    }
}
async function scrapeURLLoop(meta) {
    meta.logger.info(`Scraping URL ${JSON.stringify(meta.url)}...`);
    // TODO: handle sitemap data, see WebScraper/index.ts:280
    // TODO: ScrapeEvents
    const fallbackList = (0, engines_1.buildFallbackList)(meta);
    const results = {};
    let result = null;
    for (const { engine, unsupportedFeatures } of fallbackList) {
        const startedAt = Date.now();
        try {
            meta.logger.info("Scraping via " + engine + "...");
            const _engineResult = await (0, engines_1.scrapeURLWithEngine)(meta, engine);
            if (_engineResult.markdown === undefined) { // Some engines emit Markdown directly.
                _engineResult.markdown = await (0, html_to_markdown_1.parseMarkdown)(_engineResult.html);
            }
            const engineResult = _engineResult;
            // Success factors
            const isLongEnough = engineResult.markdown.length >= 20;
            const isGoodStatusCode = (engineResult.statusCode >= 200 && engineResult.statusCode < 300) || engineResult.statusCode === 304;
            const hasNoPageError = engineResult.error === undefined;
            results[engine] = {
                state: "success",
                result: engineResult,
                factors: { isLongEnough, isGoodStatusCode, hasNoPageError },
                unsupportedFeatures,
                startedAt,
                finishedAt: Date.now(),
            };
            // NOTE: TODO: what to do when status code is bad is tough...
            // we cannot just rely on text because error messages can be brief and not hit the limit
            // should we just use all the fallbacks and pick the one with the longest text? - mogery
            if (isLongEnough || !isGoodStatusCode) {
                meta.logger.info("Scrape via " + engine + " deemed successful.", { factors: { isLongEnough, isGoodStatusCode, hasNoPageError } });
                result = {
                    engine,
                    unsupportedFeatures,
                    result: engineResult
                };
                break;
            }
        }
        catch (error) {
            if (error instanceof error_1.EngineError) {
                meta.logger.info("Engine " + engine + " could not scrape the page.", { error });
                results[engine] = {
                    state: "error",
                    error: safeguardCircularError(error),
                    unexpected: false,
                    startedAt,
                    finishedAt: Date.now(),
                };
            }
            else if (error instanceof error_1.TimeoutError) {
                meta.logger.info("Engine " + engine + " timed out while scraping.", { error });
                results[engine] = {
                    state: "timeout",
                    startedAt,
                    finishedAt: Date.now(),
                };
            }
            else if (error instanceof error_1.AddFeatureError) {
                throw error;
            }
            else if (error instanceof llmExtract_1.LLMRefusalError) {
                results[engine] = {
                    state: "error",
                    error: safeguardCircularError(error),
                    unexpected: true,
                    startedAt,
                    finishedAt: Date.now(),
                };
                error.results = results;
                meta.logger.warn("LLM refusal encountered", { error });
                throw error;
            }
            else if (error instanceof error_1.SiteError) {
                throw error;
            }
            else {
                Sentry.captureException(error);
                meta.logger.info("An unexpected error happened while scraping with " + engine + ".", { error });
                results[engine] = {
                    state: "error",
                    error: safeguardCircularError(error),
                    unexpected: true,
                    startedAt,
                    finishedAt: Date.now(),
                };
            }
        }
    }
    if (result === null) {
        throw new error_1.NoEnginesLeftError(fallbackList.map(x => x.engine), results);
    }
    let document = {
        markdown: result.result.markdown,
        rawHtml: result.result.html,
        screenshot: result.result.screenshot,
        actions: result.result.actions,
        metadata: {
            sourceURL: meta.url,
            url: result.result.url,
            statusCode: result.result.statusCode,
            error: result.result.error,
        },
    };
    if (result.unsupportedFeatures.size > 0) {
        const warning = `The engine used does not support the following features: ${[...result.unsupportedFeatures].join(", ")} -- your scrape may be partial.`;
        meta.logger.warn(warning, { engine: result.engine, unsupportedFeatures: result.unsupportedFeatures });
        document.warning = document.warning !== undefined ? document.warning + " " + warning : warning;
    }
    document = await (0, transformers_1.executeTransformers)(meta, document);
    return {
        success: true,
        document,
        logs: meta.logs,
        engines: results,
    };
}
async function scrapeURL(id, url, options, internalOptions = {}) {
    const meta = buildMetaObject(id, url, options, internalOptions);
    try {
        while (true) {
            try {
                return await scrapeURLLoop(meta);
            }
            catch (error) {
                if (error instanceof error_1.AddFeatureError && meta.internalOptions.forceEngine === undefined) {
                    meta.logger.debug("More feature flags requested by scraper: adding " + error.featureFlags.join(", "), { error, existingFlags: meta.featureFlags });
                    meta.featureFlags = new Set([...meta.featureFlags].concat(error.featureFlags));
                }
                else {
                    throw error;
                }
            }
        }
    }
    catch (error) {
        let results = {};
        if (error instanceof error_1.NoEnginesLeftError) {
            meta.logger.warn("scrapeURL: All scraping engines failed!", { error });
            results = error.results;
        }
        else if (error instanceof llmExtract_1.LLMRefusalError) {
            meta.logger.warn("scrapeURL: LLM refused to extract content", { error });
            results = error.results;
        }
        else if (error instanceof Error && error.message.includes("Invalid schema for response_format")) { // TODO: seperate into custom error
            meta.logger.warn("scrapeURL: LLM schema error", { error });
            // TODO: results?
        }
        else if (error instanceof error_1.SiteError) {
            meta.logger.warn("scrapeURL: Site failed to load in browser", { error });
        }
        else {
            Sentry.captureException(error);
            meta.logger.error("scrapeURL: Unexpected error happened", { error });
            // TODO: results?
        }
        return {
            success: false,
            error,
            logs: meta.logs,
            engines: results,
        };
    }
}
exports.scrapeURL = scrapeURL;
//# sourceMappingURL=index.js.map