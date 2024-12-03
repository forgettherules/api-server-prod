"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeURLWithEngine = exports.buildFallbackList = exports.engineOptions = exports.featureFlagOptions = exports.featureFlags = exports.engines = void 0;
const docx_1 = require("./docx");
const fire_engine_1 = require("./fire-engine");
const pdf_1 = require("./pdf");
const scrapingbee_1 = require("./scrapingbee");
const fetch_1 = require("./fetch");
const playwright_1 = require("./playwright");
const cache_1 = require("./cache");
const useScrapingBee = process.env.SCRAPING_BEE_API_KEY !== '' && process.env.SCRAPING_BEE_API_KEY !== undefined;
const useFireEngine = process.env.FIRE_ENGINE_BETA_URL !== '' && process.env.FIRE_ENGINE_BETA_URL !== undefined;
const usePlaywright = process.env.PLAYWRIGHT_MICROSERVICE_URL !== '' && process.env.PLAYWRIGHT_MICROSERVICE_URL !== undefined;
const useCache = process.env.CACHE_REDIS_URL !== '' && process.env.CACHE_REDIS_URL !== undefined;
exports.engines = [
    // ...(useCache ? [ "cache" as const ] : []),
    ...(useFireEngine ? ["fire-engine;chrome-cdp", "fire-engine;playwright", "fire-engine;tlsclient"] : []),
    ...(useScrapingBee ? ["scrapingbee", "scrapingbeeLoad"] : []),
    ...(usePlaywright ? ["playwright"] : []),
    "fetch",
    "pdf",
    "docx",
];
exports.featureFlags = [
    "actions",
    "waitFor",
    "screenshot",
    "screenshot@fullScreen",
    "pdf",
    "docx",
    "atsv",
    "location",
    "mobile",
    "skipTlsVerification",
    "useFastMode",
];
exports.featureFlagOptions = {
    "actions": { priority: 20 },
    "waitFor": { priority: 1 },
    "screenshot": { priority: 10 },
    "screenshot@fullScreen": { priority: 10 },
    "pdf": { priority: 100 },
    "docx": { priority: 100 },
    "atsv": { priority: 90 }, // NOTE: should atsv force to tlsclient? adjust priority if not
    "useFastMode": { priority: 90 },
    "location": { priority: 10 },
    "mobile": { priority: 10 },
    "skipTlsVerification": { priority: 10 },
};
const engineHandlers = {
    "cache": cache_1.scrapeCache,
    "fire-engine;chrome-cdp": fire_engine_1.scrapeURLWithFireEngineChromeCDP,
    "fire-engine;playwright": fire_engine_1.scrapeURLWithFireEnginePlaywright,
    "fire-engine;tlsclient": fire_engine_1.scrapeURLWithFireEngineTLSClient,
    "scrapingbee": (0, scrapingbee_1.scrapeURLWithScrapingBee)("domcontentloaded"),
    "scrapingbeeLoad": (0, scrapingbee_1.scrapeURLWithScrapingBee)("networkidle2"),
    "playwright": playwright_1.scrapeURLWithPlaywright,
    "fetch": fetch_1.scrapeURLWithFetch,
    "pdf": pdf_1.scrapePDF,
    "docx": docx_1.scrapeDOCX,
};
exports.engineOptions = {
    "cache": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": false, // TODO: figure this out
            "docx": false, // TODO: figure this out
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": false,
        },
        quality: 1000, // cache should always be tried first
    },
    "fire-engine;chrome-cdp": {
        features: {
            "actions": true,
            "waitFor": true, // through actions transform
            "screenshot": true, // through actions transform
            "screenshot@fullScreen": true, // through actions transform
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": true,
            "mobile": true,
            "skipTlsVerification": true,
            "useFastMode": false,
        },
        quality: 50,
    },
    "fire-engine;playwright": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": true,
            "screenshot@fullScreen": true,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": false,
        },
        quality: 40,
    },
    "scrapingbee": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": true,
            "screenshot@fullScreen": true,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": false,
        },
        quality: 30,
    },
    "scrapingbeeLoad": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": true,
            "screenshot@fullScreen": true,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": false,
        },
        quality: 29,
    },
    "playwright": {
        features: {
            "actions": false,
            "waitFor": true,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": false,
        },
        quality: 20,
    },
    "fire-engine;tlsclient": {
        features: {
            "actions": false,
            "waitFor": false,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": false,
            "docx": false,
            "atsv": true,
            "location": true,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": true,
        },
        quality: 10,
    },
    "fetch": {
        features: {
            "actions": false,
            "waitFor": false,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": false,
            "docx": false,
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": true,
        },
        quality: 5,
    },
    "pdf": {
        features: {
            "actions": false,
            "waitFor": false,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": true,
            "docx": false,
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": true,
        },
        quality: -10,
    },
    "docx": {
        features: {
            "actions": false,
            "waitFor": false,
            "screenshot": false,
            "screenshot@fullScreen": false,
            "pdf": false,
            "docx": true,
            "atsv": false,
            "location": false,
            "mobile": false,
            "skipTlsVerification": false,
            "useFastMode": true,
        },
        quality: -10,
    },
};
function buildFallbackList(meta) {
    const prioritySum = [...meta.featureFlags].reduce((a, x) => a + exports.featureFlagOptions[x].priority, 0);
    const priorityThreshold = Math.floor(prioritySum / 2);
    let selectedEngines = [];
    const currentEngines = meta.internalOptions.forceEngine !== undefined ? [meta.internalOptions.forceEngine] : exports.engines;
    for (const engine of currentEngines) {
        const supportedFlags = new Set([...Object.entries(exports.engineOptions[engine].features).filter(([k, v]) => meta.featureFlags.has(k) && v === true).map(([k, _]) => k)]);
        const supportScore = [...supportedFlags].reduce((a, x) => a + exports.featureFlagOptions[x].priority, 0);
        const unsupportedFeatures = new Set([...meta.featureFlags]);
        for (const flag of meta.featureFlags) {
            if (supportedFlags.has(flag)) {
                unsupportedFeatures.delete(flag);
            }
        }
        if (supportScore >= priorityThreshold) {
            selectedEngines.push({ engine, supportScore, unsupportedFeatures });
            meta.logger.debug(`Engine ${engine} meets feature priority threshold`, { supportScore, prioritySum, priorityThreshold, featureFlags: [...meta.featureFlags], unsupportedFeatures });
        }
        else {
            meta.logger.debug(`Engine ${engine} does not meet feature priority threshold`, { supportScore, prioritySum, priorityThreshold, featureFlags: [...meta.featureFlags], unsupportedFeatures });
        }
    }
    if (selectedEngines.some(x => exports.engineOptions[x.engine].quality > 0)) {
        selectedEngines = selectedEngines.filter(x => exports.engineOptions[x.engine].quality > 0);
    }
    selectedEngines.sort((a, b) => b.supportScore - a.supportScore || exports.engineOptions[b.engine].quality - exports.engineOptions[a.engine].quality);
    return selectedEngines;
}
exports.buildFallbackList = buildFallbackList;
async function scrapeURLWithEngine(meta, engine) {
    const fn = engineHandlers[engine];
    const logger = meta.logger.child({ method: fn.name ?? "scrapeURLWithEngine", engine });
    const _meta = {
        ...meta,
        logger,
    };
    return await fn(_meta);
}
exports.scrapeURLWithEngine = scrapeURLWithEngine;
//# sourceMappingURL=index.js.map