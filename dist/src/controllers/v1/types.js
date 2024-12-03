"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLegacyDocument = exports.fromLegacyCombo = exports.fromLegacyScrapeOptions = exports.fromLegacyCrawlerOptions = exports.toLegacyCrawlerOptions = exports.mapRequestSchema = exports.crawlRequestSchema = exports.batchScrapeRequestSchema = exports.webhookSchema = exports.scrapeRequestSchema = exports.extractRequestSchema = exports.extractV1Options = exports.scrapeOptions = exports.actionsSchema = exports.extractOptions = exports.url = void 0;
const zod_1 = require("zod");
const blocklist_1 = require("../../scraper/WebScraper/utils/blocklist");
const validateUrl_1 = require("../../lib/validateUrl");
const validate_country_1 = require("../../lib/validate-country");
exports.url = zod_1.z.preprocess((x) => {
    if (!(0, validateUrl_1.protocolIncluded)(x)) {
        return `http://${x}`;
    }
    return x;
}, zod_1.z
    .string()
    .url()
    .regex(/^https?:\/\//, "URL uses unsupported protocol")
    .refine((x) => /\.[a-z]{2,}([\/?#]|$)/i.test(x), "URL must have a valid top-level domain or be a valid path")
    .refine((x) => {
    try {
        (0, validateUrl_1.checkUrl)(x);
        return true;
    }
    catch (_) {
        return false;
    }
}, "Invalid URL")
    .refine((x) => !(0, blocklist_1.isUrlBlocked)(x), "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it."));
const strictMessage = "Unrecognized key in body -- please review the v1 API documentation for request body changes";
exports.extractOptions = zod_1.z.object({
    mode: zod_1.z.enum(["llm"]).default("llm"),
    schema: zod_1.z.any().optional(),
    systemPrompt: zod_1.z.string().default("Based on the information on the page, extract all the information from the schema in JSON format. Try to extract all the fields even those that might not be marked as required."),
    prompt: zod_1.z.string().optional()
}).strict(strictMessage);
exports.actionsSchema = zod_1.z.array(zod_1.z.union([
    zod_1.z.object({
        type: zod_1.z.literal("wait"),
        milliseconds: zod_1.z.number().int().positive().finite().optional(),
        selector: zod_1.z.string().optional(),
    }).refine((data) => (data.milliseconds !== undefined || data.selector !== undefined) && !(data.milliseconds !== undefined && data.selector !== undefined), {
        message: "Either 'milliseconds' or 'selector' must be provided, but not both.",
    }),
    zod_1.z.object({
        type: zod_1.z.literal("click"),
        selector: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("screenshot"),
        fullPage: zod_1.z.boolean().default(false),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("write"),
        text: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("press"),
        key: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("scroll"),
        direction: zod_1.z.enum(["up", "down"]).optional().default("down"),
        selector: zod_1.z.string().optional(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("scrape"),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("executeJavascript"),
        script: zod_1.z.string()
    }),
]));
exports.scrapeOptions = zod_1.z.object({
    formats: zod_1.z
        .enum([
        "markdown",
        "html",
        "rawHtml",
        "links",
        "screenshot",
        "screenshot@fullPage",
        "extract"
    ])
        .array()
        .optional()
        .default(["markdown"])
        .refine(x => !(x.includes("screenshot") && x.includes("screenshot@fullPage")), "You may only specify either screenshot or screenshot@fullPage"),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    includeTags: zod_1.z.string().array().optional(),
    excludeTags: zod_1.z.string().array().optional(),
    onlyMainContent: zod_1.z.boolean().default(true),
    timeout: zod_1.z.number().int().positive().finite().safe().optional(),
    waitFor: zod_1.z.number().int().nonnegative().finite().safe().default(0),
    extract: exports.extractOptions.optional(),
    mobile: zod_1.z.boolean().default(false),
    parsePDF: zod_1.z.boolean().default(true),
    actions: exports.actionsSchema.optional(),
    // New
    location: zod_1.z.object({
        country: zod_1.z.string().optional().refine((val) => !val || Object.keys(validate_country_1.countries).includes(val.toUpperCase()), {
            message: "Invalid country code. Please use a valid ISO 3166-1 alpha-2 country code.",
        }).transform(val => val ? val.toUpperCase() : 'US'),
        languages: zod_1.z.string().array().optional(),
    }).optional(),
    // Deprecated
    geolocation: zod_1.z.object({
        country: zod_1.z.string().optional().refine((val) => !val || Object.keys(validate_country_1.countries).includes(val.toUpperCase()), {
            message: "Invalid country code. Please use a valid ISO 3166-1 alpha-2 country code.",
        }).transform(val => val ? val.toUpperCase() : 'US'),
        languages: zod_1.z.string().array().optional(),
    }).optional(),
    skipTlsVerification: zod_1.z.boolean().default(false),
    removeBase64Images: zod_1.z.boolean().default(true),
}).strict(strictMessage);
exports.extractV1Options = zod_1.z.object({
    urls: exports.url.array(),
    prompt: zod_1.z.string().optional(),
    schema: zod_1.z.any().optional(),
    limit: zod_1.z.number().int().positive().finite().safe().optional(),
    ignoreSitemap: zod_1.z.boolean().default(false),
    includeSubdomains: zod_1.z.boolean().default(true),
    allowExternalLinks: zod_1.z.boolean().default(false),
    origin: zod_1.z.string().optional().default("api"),
    timeout: zod_1.z.number().int().positive().finite().safe().default(60000)
}).strict(strictMessage);
exports.extractRequestSchema = exports.extractV1Options;
exports.scrapeRequestSchema = exports.scrapeOptions.omit({ timeout: true }).extend({
    url: exports.url,
    origin: zod_1.z.string().optional().default("api"),
    timeout: zod_1.z.number().int().positive().finite().safe().default(30000),
}).strict(strictMessage).refine((obj) => {
    const hasExtractFormat = obj.formats?.includes("extract");
    const hasExtractOptions = obj.extract !== undefined;
    return (hasExtractFormat && hasExtractOptions) || (!hasExtractFormat && !hasExtractOptions);
}, {
    message: "When 'extract' format is specified, 'extract' options must be provided, and vice versa",
}).transform((obj) => {
    if ((obj.formats?.includes("extract") || obj.extract) && !obj.timeout) {
        return { ...obj, timeout: 60000 };
    }
    return obj;
});
exports.webhookSchema = zod_1.z.preprocess(x => {
    if (typeof x === "string") {
        return { url: x };
    }
    else {
        return x;
    }
}, zod_1.z.object({
    url: zod_1.z.string().url(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).default({}),
}).strict(strictMessage));
exports.batchScrapeRequestSchema = exports.scrapeOptions.extend({
    urls: exports.url.array(),
    origin: zod_1.z.string().optional().default("api"),
    webhook: exports.webhookSchema.optional(),
}).strict(strictMessage).refine((obj) => {
    const hasExtractFormat = obj.formats?.includes("extract");
    const hasExtractOptions = obj.extract !== undefined;
    return (hasExtractFormat && hasExtractOptions) || (!hasExtractFormat && !hasExtractOptions);
}, {
    message: "When 'extract' format is specified, 'extract' options must be provided, and vice versa",
});
const crawlerOptions = zod_1.z.object({
    includePaths: zod_1.z.string().array().default([]),
    excludePaths: zod_1.z.string().array().default([]),
    maxDepth: zod_1.z.number().default(10), // default?
    limit: zod_1.z.number().default(10000), // default?
    allowBackwardLinks: zod_1.z.boolean().default(false), // >> TODO: CHANGE THIS NAME???
    allowExternalLinks: zod_1.z.boolean().default(false),
    allowSubdomains: zod_1.z.boolean().default(false),
    ignoreRobotsTxt: zod_1.z.boolean().default(false),
    ignoreSitemap: zod_1.z.boolean().default(true),
    deduplicateSimilarURLs: zod_1.z.boolean().default(true),
    ignoreQueryParameters: zod_1.z.boolean().default(false),
}).strict(strictMessage);
exports.crawlRequestSchema = crawlerOptions.extend({
    url: exports.url,
    origin: zod_1.z.string().optional().default("api"),
    scrapeOptions: exports.scrapeOptions.default({}),
    webhook: exports.webhookSchema.optional(),
    limit: zod_1.z.number().default(10000),
}).strict(strictMessage);
exports.mapRequestSchema = crawlerOptions.extend({
    url: exports.url,
    origin: zod_1.z.string().optional().default("api"),
    includeSubdomains: zod_1.z.boolean().default(true),
    search: zod_1.z.string().optional(),
    ignoreSitemap: zod_1.z.boolean().default(false),
    sitemapOnly: zod_1.z.boolean().default(false),
    limit: zod_1.z.number().min(1).max(5000).default(5000),
}).strict(strictMessage);
function toLegacyCrawlerOptions(x) {
    return {
        includes: x.includePaths,
        excludes: x.excludePaths,
        maxCrawledLinks: x.limit,
        maxDepth: x.maxDepth,
        limit: x.limit,
        generateImgAltText: false,
        allowBackwardCrawling: x.allowBackwardLinks,
        allowExternalContentLinks: x.allowExternalLinks,
        allowSubdomains: x.allowSubdomains,
        ignoreRobotsTxt: x.ignoreRobotsTxt,
        ignoreSitemap: x.ignoreSitemap,
        deduplicateSimilarURLs: x.deduplicateSimilarURLs,
        ignoreQueryParameters: x.ignoreQueryParameters,
    };
}
exports.toLegacyCrawlerOptions = toLegacyCrawlerOptions;
function fromLegacyCrawlerOptions(x) {
    return {
        crawlOptions: crawlerOptions.parse({
            includePaths: x.includes,
            excludePaths: x.excludes,
            limit: x.maxCrawledLinks ?? x.limit,
            maxDepth: x.maxDepth,
            allowBackwardLinks: x.allowBackwardCrawling,
            allowExternalLinks: x.allowExternalContentLinks,
            allowSubdomains: x.allowSubdomains,
            ignoreRobotsTxt: x.ignoreRobotsTxt,
            ignoreSitemap: x.ignoreSitemap,
            deduplicateSimilarURLs: x.deduplicateSimilarURLs,
            ignoreQueryParameters: x.ignoreQueryParameters,
        }),
        internalOptions: {
            v0CrawlOnlyUrls: x.returnOnlyUrls,
        },
    };
}
exports.fromLegacyCrawlerOptions = fromLegacyCrawlerOptions;
function fromLegacyScrapeOptions(pageOptions, extractorOptions, timeout) {
    return {
        scrapeOptions: exports.scrapeOptions.parse({
            formats: [
                (pageOptions.includeMarkdown ?? true) ? "markdown" : null,
                (pageOptions.includeHtml ?? false) ? "html" : null,
                (pageOptions.includeRawHtml ?? false) ? "rawHtml" : null,
                (pageOptions.screenshot ?? false) ? "screenshot" : null,
                (pageOptions.fullPageScreenshot ?? false) ? "screenshot@fullPage" : null,
                (extractorOptions !== undefined && extractorOptions.mode.includes("llm-extraction")) ? "extract" : null,
                "links"
            ].filter(x => x !== null),
            waitFor: pageOptions.waitFor,
            headers: pageOptions.headers,
            includeTags: (typeof pageOptions.onlyIncludeTags === "string" ? [pageOptions.onlyIncludeTags] : pageOptions.onlyIncludeTags),
            excludeTags: (typeof pageOptions.removeTags === "string" ? [pageOptions.removeTags] : pageOptions.removeTags),
            onlyMainContent: pageOptions.onlyMainContent ?? false,
            timeout: timeout,
            parsePDF: pageOptions.parsePDF,
            actions: pageOptions.actions,
            location: pageOptions.geolocation,
            skipTlsVerification: pageOptions.skipTlsVerification,
            removeBase64Images: pageOptions.removeBase64Images,
            extract: extractorOptions !== undefined && extractorOptions.mode.includes("llm-extraction") ? {
                systemPrompt: extractorOptions.extractionPrompt,
                prompt: extractorOptions.userPrompt,
                schema: extractorOptions.extractionSchema,
            } : undefined,
            mobile: pageOptions.mobile,
        }),
        internalOptions: {
            atsv: pageOptions.atsv,
            v0DisableJsDom: pageOptions.disableJsDom,
            v0UseFastMode: pageOptions.useFastMode,
        },
        // TODO: fallback, fetchPageContent, replaceAllPathsWithAbsolutePaths, includeLinks
    };
}
exports.fromLegacyScrapeOptions = fromLegacyScrapeOptions;
function fromLegacyCombo(pageOptions, extractorOptions, timeout, crawlerOptions) {
    const { scrapeOptions, internalOptions: i1 } = fromLegacyScrapeOptions(pageOptions, extractorOptions, timeout);
    const { internalOptions: i2 } = fromLegacyCrawlerOptions(crawlerOptions);
    return { scrapeOptions, internalOptions: Object.assign(i1, i2) };
}
exports.fromLegacyCombo = fromLegacyCombo;
function toLegacyDocument(document, internalOptions) {
    if (internalOptions.v0CrawlOnlyUrls) {
        return { url: document.metadata.sourceURL };
    }
    return {
        content: document.markdown,
        markdown: document.markdown,
        html: document.html,
        rawHtml: document.rawHtml,
        linksOnPage: document.links,
        llm_extraction: document.extract,
        metadata: {
            ...document.metadata,
            error: undefined,
            statusCode: undefined,
            pageError: document.metadata.error,
            pageStatusCode: document.metadata.statusCode,
            screenshot: document.screenshot,
        },
        actions: document.actions,
        warning: document.warning,
    };
}
exports.toLegacyDocument = toLegacyDocument;
//# sourceMappingURL=types.js.map