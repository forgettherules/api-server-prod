"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRateLimiter = exports.getRateLimiterPoints = exports.etier2aRateLimiter = exports.etier1aRateLimiter = exports.scrapeStatusRateLimiter = exports.manualRateLimiter = exports.devBRateLimiter = exports.testSuiteRateLimiter = exports.serverRateLimiter = exports.redisRateLimitClient = void 0;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const ioredis_1 = __importDefault(require("ioredis"));
const RATE_LIMITS = {
    crawl: {
        default: 3,
        free: 2,
        starter: 10,
        standard: 5,
        standardOld: 40,
        scale: 50,
        hobby: 3,
        standardNew: 10,
        standardnew: 10,
        growth: 50,
        growthdouble: 50,
        etier2c: 300,
        etier1a: 1000,
        etier2a: 300,
    },
    scrape: {
        default: 20,
        free: 10,
        starter: 100,
        standard: 100,
        standardOld: 100,
        scale: 500,
        hobby: 20,
        standardNew: 100,
        standardnew: 100,
        growth: 1000,
        growthdouble: 1000,
        etier2c: 2500,
        etier1a: 1000,
        etier2a: 2500,
    },
    search: {
        default: 20,
        free: 5,
        starter: 50,
        standard: 50,
        standardOld: 40,
        scale: 500,
        hobby: 10,
        standardNew: 50,
        standardnew: 50,
        growth: 500,
        growthdouble: 500,
        etier2c: 2500,
        etier1a: 1000,
        etier2a: 2500,
    },
    map: {
        default: 20,
        free: 5,
        starter: 50,
        standard: 50,
        standardOld: 50,
        scale: 500,
        hobby: 10,
        standardNew: 50,
        standardnew: 50,
        growth: 500,
        growthdouble: 500,
        etier2c: 2500,
        etier1a: 1000,
        etier2a: 2500,
    },
    preview: {
        free: 5,
        default: 5,
    },
    account: {
        free: 100,
        default: 100,
    },
    crawlStatus: {
        free: 300,
        default: 500,
    },
    testSuite: {
        free: 10000,
        default: 10000,
    },
};
exports.redisRateLimitClient = new ioredis_1.default(process.env.REDIS_RATE_LIMIT_URL);
const createRateLimiter = (keyPrefix, points) => new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: exports.redisRateLimitClient,
    keyPrefix,
    points,
    duration: 60, // Duration in seconds
});
exports.serverRateLimiter = createRateLimiter("server", RATE_LIMITS.account.default);
exports.testSuiteRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: exports.redisRateLimitClient,
    keyPrefix: "test-suite",
    points: 10000,
    duration: 60, // Duration in seconds
});
exports.devBRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: exports.redisRateLimitClient,
    keyPrefix: "dev-b",
    points: 1200,
    duration: 60, // Duration in seconds
});
exports.manualRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: exports.redisRateLimitClient,
    keyPrefix: "manual",
    points: 2000,
    duration: 60, // Duration in seconds
});
exports.scrapeStatusRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: exports.redisRateLimitClient,
    keyPrefix: "scrape-status",
    points: 400,
    duration: 60, // Duration in seconds
});
exports.etier1aRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: exports.redisRateLimitClient,
    keyPrefix: "etier1a",
    points: 10000,
    duration: 60, // Duration in seconds
});
exports.etier2aRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: exports.redisRateLimitClient,
    keyPrefix: "etier2a",
    points: 2500,
    duration: 60, // Duration in seconds
});
const testSuiteTokens = [
    "a01ccae",
    "6254cf9",
    "0f96e673",
    "23befa1b",
    "69141c4",
    "48f9a97",
    "5dc70ad",
    "e5e60e5",
    "65181ba",
    "77c85b7",
    "8567275",
    "6c46abb",
    "cb0ff78",
    "fd769b2",
    "4c2638d",
    "cbb3462", // don't remove (s-ai)
    "824abcd" // don't remove (s-ai)
];
const manual = ["69be9e74-7624-4990-b20d-08e0acc70cf6"];
function makePlanKey(plan) {
    return plan ? plan.replace("-", "") : "default"; // "default"
}
function getRateLimiterPoints(mode, token, plan, teamId) {
    const rateLimitConfig = RATE_LIMITS[mode]; // {default : 5}
    if (!rateLimitConfig)
        return RATE_LIMITS.account.default;
    const points = rateLimitConfig[makePlanKey(plan)] || rateLimitConfig.default; // 5
    return points;
}
exports.getRateLimiterPoints = getRateLimiterPoints;
function getRateLimiter(mode, token, plan, teamId) {
    if (token && testSuiteTokens.some(testToken => token.includes(testToken))) {
        return exports.testSuiteRateLimiter;
    }
    if (teamId && teamId === process.env.DEV_B_TEAM_ID) {
        return exports.devBRateLimiter;
    }
    if (teamId && teamId === process.env.ETIER1A_TEAM_ID) {
        return exports.etier1aRateLimiter;
    }
    if (teamId && teamId === process.env.ETIER2A_TEAM_ID) {
        return exports.etier2aRateLimiter;
    }
    if (teamId && teamId === process.env.ETIER2D_TEAM_ID) {
        return exports.etier2aRateLimiter;
    }
    if (teamId && manual.includes(teamId)) {
        return exports.manualRateLimiter;
    }
    return createRateLimiter(`${mode}-${makePlanKey(plan)}`, getRateLimiterPoints(mode, token, plan, teamId));
}
exports.getRateLimiter = getRateLimiter;
//# sourceMappingURL=rate-limiter.js.map