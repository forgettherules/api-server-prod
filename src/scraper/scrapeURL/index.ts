import { Logger } from "winston";
import * as Sentry from "@sentry/node";

import { Document, ScrapeOptions } from "../../controllers/v1/types";
import { logger } from "../../lib/logger";
import { buildFallbackList, Engine, EngineScrapeResult, FeatureFlag, scrapeURLWithEngine } from "./engines";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { AddFeatureError, EngineError, NoEnginesLeftError, SiteError, TimeoutError } from "./error";
import { executeTransformers } from "./transformers";
import { LLMRefusalError } from "./transformers/llmExtract";
import { urlSpecificParams } from "./lib/urlSpecificParams";

export type ScrapeUrlResponse = ({
    success: true,
    document: Document,
} | {
    success: false,
    error: any,
}) & {
    logs: any[],
    engines: EngineResultsTracker,
}

export type Meta = {
    id: string;
    url: string;
    options: ScrapeOptions;
    internalOptions: InternalOptions;
    logger: Logger;
    logs: any[];
    featureFlags: Set<FeatureFlag>;
}

function buildFeatureFlags(url: string, options: ScrapeOptions, internalOptions: InternalOptions): Set<FeatureFlag> {
    const flags: Set<FeatureFlag> = new Set();

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
function buildMetaObject(id: string, url: string, options: ScrapeOptions, internalOptions: InternalOptions): Meta {
    const specParams = urlSpecificParams[new URL(url).hostname.replace(/^www\./, "")];
    if (specParams !== undefined) {
        options = Object.assign(options, specParams.scrapeOptions);
        internalOptions = Object.assign(internalOptions, specParams.internalOptions);
    }

    const _logger = logger.child({ module: "ScrapeURL", scrapeId: id, scrapeURL: url });
    const logs: any[] = [];

    return {
        id, url, options, internalOptions,
        logger: _logger,
        logs,
        featureFlags: buildFeatureFlags(url, options, internalOptions),
    };
}

export type InternalOptions = {
    priority?: number; // Passed along to fire-engine
    forceEngine?: Engine;
    atsv?: boolean; // anti-bot solver, beta

    v0CrawlOnlyUrls?: boolean;
    v0UseFastMode?: boolean;
    v0DisableJsDom?: boolean;
};

export type EngineResultsTracker = { [E in Engine]?: ({
    state: "error",
    error: any,
    unexpected: boolean,
} | {
    state: "success",
    result: EngineScrapeResult & { markdown: string },
    factors: Record<string, boolean>,
    unsupportedFeatures: Set<FeatureFlag>,
} | {
    state: "timeout",
}) & {
    startedAt: number,
    finishedAt: number,
} };

export type EngineScrapeResultWithContext = {
    engine: Engine,
    unsupportedFeatures: Set<FeatureFlag>,
    result: (EngineScrapeResult & { markdown: string }),
};

function safeguardCircularError<T>(error: T): T {
    if (typeof error === "object" && error !== null && (error as any).results) {
        const newError = structuredClone(error);
        delete (newError as any).results;
        return newError;
    } else {
        return error;
    }
}

async function scrapeURLLoop(
    meta: Meta
): Promise<ScrapeUrlResponse> {
    meta.logger.info(`Scraping URL ${JSON.stringify(meta.url)}...`,);

    // TODO: handle sitemap data, see WebScraper/index.ts:280
    // TODO: ScrapeEvents

    const fallbackList = buildFallbackList(meta);

    const results: EngineResultsTracker = {};
    let result: EngineScrapeResultWithContext | null = null;

    for (const { engine, unsupportedFeatures } of fallbackList) {
        const startedAt = Date.now();
        try {
            meta.logger.info("Scraping via " + engine + "...");
            const _engineResult = await scrapeURLWithEngine(meta, engine);
            if (_engineResult.markdown === undefined) { // Some engines emit Markdown directly.
                _engineResult.markdown = await parseMarkdown(_engineResult.html);
            }
            const engineResult = _engineResult as EngineScrapeResult & { markdown: string };

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
                    result: engineResult as EngineScrapeResult & { markdown: string }
                };
                break;
            }
        } catch (error) {
            if (error instanceof EngineError) {
                meta.logger.info("Engine " + engine + " could not scrape the page.", { error });
                results[engine] = {
                    state: "error",
                    error: safeguardCircularError(error),
                    unexpected: false,
                    startedAt,
                    finishedAt: Date.now(),
                };
            } else if (error instanceof TimeoutError) {
                meta.logger.info("Engine " + engine + " timed out while scraping.", { error });
                results[engine] = {
                    state: "timeout",
                    startedAt,
                    finishedAt: Date.now(),
                };
            } else if (error instanceof AddFeatureError) {
                throw error;
            } else if (error instanceof LLMRefusalError) {
                results[engine] = {
                    state: "error",
                    error: safeguardCircularError(error),
                    unexpected: true,
                    startedAt,
                    finishedAt: Date.now(),
                }
                error.results = results;
                meta.logger.warn("LLM refusal encountered", { error });
                throw error;
            } else if (error instanceof SiteError) {
                throw error;
            } else {
                Sentry.captureException(error);
                meta.logger.info("An unexpected error happened while scraping with " + engine + ".", { error });
                results[engine] = {
                    state: "error",
                    error: safeguardCircularError(error),
                    unexpected: true,
                    startedAt,
                    finishedAt: Date.now(),
                }
            }
        }
    }

    if (result === null) {
        throw new NoEnginesLeftError(fallbackList.map(x => x.engine), results);
    }

    let document: Document = {
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
    }

    if (result.unsupportedFeatures.size > 0) {
        const warning = `The engine used does not support the following features: ${[...result.unsupportedFeatures].join(", ")} -- your scrape may be partial.`;
        meta.logger.warn(warning, { engine: result.engine, unsupportedFeatures: result.unsupportedFeatures });
        document.warning = document.warning !== undefined ? document.warning + " " + warning : warning;
    }

    document = await executeTransformers(meta, document);

    return {
        success: true,
        document,
        logs: meta.logs,
        engines: results,
    };
}

export async function scrapeURL(
    id: string,
    url: string,
    options: ScrapeOptions,
    internalOptions: InternalOptions = {},
): Promise<ScrapeUrlResponse> {
    const meta = buildMetaObject(id, url, options, internalOptions);
    try {
        while (true) {
            try {
                return await scrapeURLLoop(meta);
            } catch (error) {
                if (error instanceof AddFeatureError && meta.internalOptions.forceEngine === undefined) {
                    meta.logger.debug("More feature flags requested by scraper: adding " + error.featureFlags.join(", "), { error, existingFlags: meta.featureFlags });
                    meta.featureFlags = new Set([...meta.featureFlags].concat(error.featureFlags));
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        let results: EngineResultsTracker = {};

        if (error instanceof NoEnginesLeftError) {
            meta.logger.warn("scrapeURL: All scraping engines failed!", { error });
            results = error.results;
        } else if (error instanceof LLMRefusalError) {
            meta.logger.warn("scrapeURL: LLM refused to extract content", { error });
            results = error.results!;
        } else if (error instanceof Error && error.message.includes("Invalid schema for response_format")) { // TODO: seperate into custom error
            meta.logger.warn("scrapeURL: LLM schema error", { error });
            // TODO: results?
        } else if (error instanceof SiteError) {
            meta.logger.warn("scrapeURL: Site failed to load in browser", { error });
        } else {
            Sentry.captureException(error);
            meta.logger.error("scrapeURL: Unexpected error happened", { error });
            // TODO: results?
        }

        return {
            success: false,
            error,
            logs: meta.logs,
            engines: results,
        }
    }
}