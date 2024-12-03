"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteError = exports.AddFeatureError = exports.NoEnginesLeftError = exports.TimeoutError = exports.EngineError = void 0;
class EngineError extends Error {
    constructor(message, options) {
        super(message, options);
    }
}
exports.EngineError = EngineError;
class TimeoutError extends Error {
    constructor(message, options) {
        super(message, options);
    }
}
exports.TimeoutError = TimeoutError;
class NoEnginesLeftError extends Error {
    fallbackList;
    results;
    constructor(fallbackList, results) {
        super("All scraping engines failed! -- Double check the URL to make sure it's not broken. If the issue persists, contact us at help@firecrawl.com.");
        this.fallbackList = fallbackList;
        this.results = results;
    }
}
exports.NoEnginesLeftError = NoEnginesLeftError;
class AddFeatureError extends Error {
    featureFlags;
    constructor(featureFlags) {
        super("New feature flags have been discovered: " + featureFlags.join(", "));
        this.featureFlags = featureFlags;
    }
}
exports.AddFeatureError = AddFeatureError;
class SiteError extends Error {
    code;
    constructor(code) {
        super("Specified URL is failing to load in the browser. Error code: " + code);
        this.code = code;
    }
}
exports.SiteError = SiteError;
//# sourceMappingURL=error.js.map