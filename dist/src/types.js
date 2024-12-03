"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationType = exports.RateLimiterMode = void 0;
var RateLimiterMode;
(function (RateLimiterMode) {
    RateLimiterMode["Crawl"] = "crawl";
    RateLimiterMode["CrawlStatus"] = "crawlStatus";
    RateLimiterMode["Scrape"] = "scrape";
    RateLimiterMode["Preview"] = "preview";
    RateLimiterMode["Search"] = "search";
    RateLimiterMode["Map"] = "map";
})(RateLimiterMode || (exports.RateLimiterMode = RateLimiterMode = {}));
var NotificationType;
(function (NotificationType) {
    NotificationType["APPROACHING_LIMIT"] = "approachingLimit";
    NotificationType["LIMIT_REACHED"] = "limitReached";
    NotificationType["RATE_LIMIT_REACHED"] = "rateLimitReached";
    NotificationType["AUTO_RECHARGE_SUCCESS"] = "autoRechargeSuccess";
    NotificationType["AUTO_RECHARGE_FAILED"] = "autoRechargeFailed";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
//# sourceMappingURL=types.js.map