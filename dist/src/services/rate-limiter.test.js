"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rate_limiter_1 = require("./rate-limiter");
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
describe("Rate Limiter Service", () => {
    beforeAll(async () => {
        try {
            await rate_limiter_1.redisRateLimitClient.connect();
            // if (process.env.REDIS_RATE_LIMIT_URL === "redis://localhost:6379") {
            //   console.log("Erasing all keys");
            //   // erase all the keys that start with "test-prefix"
            //   const keys = await redisRateLimitClient.keys("test-prefix:*");
            //   if (keys.length > 0) {
            //     await redisRateLimitClient.del(...keys);
            //   }
            // }
        }
        catch (error) { }
    });
    afterAll(async () => {
        try {
            // if (process.env.REDIS_RATE_LIMIT_URL === "redis://localhost:6379") {
            await rate_limiter_1.redisRateLimitClient.disconnect();
            // }
        }
        catch (error) { }
    });
    it("should return the testSuiteRateLimiter for specific tokens", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:a01ccae");
        expect(limiter).toBe(rate_limiter_1.testSuiteRateLimiter);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:6254cf9");
        expect(limiter2).toBe(rate_limiter_1.testSuiteRateLimiter);
    });
    it("should return the serverRateLimiter if mode is not found", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("nonexistent", "test-prefix:someToken");
        expect(limiter.points).toBe(rate_limiter_1.serverRateLimiter.points);
    });
    it("should return the correct rate limiter based on mode and plan", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(2);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someToken", "standard");
        expect(limiter2.points).toBe(100);
        const limiter3 = (0, rate_limiter_1.getRateLimiter)("search", "test-prefix:someToken", "growth");
        expect(limiter3.points).toBe(500);
        const limiter4 = (0, rate_limiter_1.getRateLimiter)("crawlStatus", "test-prefix:someToken", "growth");
        expect(limiter4.points).toBe(250);
    });
    it("should return the default rate limiter if plan is not provided", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:someToken");
        expect(limiter.points).toBe(3);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someToken");
        expect(limiter2.points).toBe(20);
    });
    it("should create a new RateLimiterRedis instance with correct parameters", () => {
        const keyPrefix = "test-prefix";
        const points = 10;
        const limiter = new rate_limiter_flexible_1.RateLimiterRedis({
            storeClient: rate_limiter_1.redisRateLimitClient,
            keyPrefix,
            points,
            duration: 60,
        });
        expect(limiter.keyPrefix).toBe(keyPrefix);
        expect(limiter.points).toBe(points);
        expect(limiter.duration).toBe(60);
    });
    it("should return the correct rate limiter for 'preview' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("preview", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(5);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("preview", "test-prefix:someToken");
        expect(limiter2.points).toBe(5);
    });
    it("should return the correct rate limiter for 'account' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("account", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(100);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("account", "test-prefix:someToken");
        expect(limiter2.points).toBe(100);
    });
    it("should return the correct rate limiter for 'crawlStatus' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawlStatus", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(150);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("crawlStatus", "test-prefix:someToken");
        expect(limiter2.points).toBe(250);
    });
    it("should consume points correctly for 'crawl' mode", async () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:someTokenCRAWL", "free");
        const consumePoints = 1;
        const res = await limiter.consume("test-prefix:someTokenCRAWL", consumePoints);
        expect(res.remainingPoints).toBe(1);
    });
    it("should consume points correctly for 'scrape' mode (DEFAULT)", async () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someTokenX");
        const consumePoints = 4;
        const res = await limiter.consume("test-prefix:someTokenX", consumePoints);
        expect(res.remainingPoints).toBe(16);
    });
    it("should consume points correctly for 'scrape' mode (HOBBY)", async () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someTokenXY", "hobby");
        expect(limiter.points).toBe(20);
        const consumePoints = 5;
        const res = await limiter.consume("test-prefix:someTokenXY", consumePoints);
        expect(res.consumedPoints).toBe(5);
        expect(res.remainingPoints).toBe(15);
    });
    it("should return the correct rate limiter for 'crawl' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(2);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:someToken", "starter");
        expect(limiter2.points).toBe(10);
        const limiter3 = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:someToken", "standard");
        expect(limiter3.points).toBe(5);
    });
    it("should return the correct rate limiter for 'scrape' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(10);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someToken", "starter");
        expect(limiter2.points).toBe(100);
        const limiter3 = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someToken", "standard");
        expect(limiter3.points).toBe(100);
        const limiter4 = (0, rate_limiter_1.getRateLimiter)("scrape", "test-prefix:someToken", "growth");
        expect(limiter4.points).toBe(1000);
    });
    it("should return the correct rate limiter for 'search' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("search", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(5);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("search", "test-prefix:someToken", "starter");
        expect(limiter2.points).toBe(50);
        const limiter3 = (0, rate_limiter_1.getRateLimiter)("search", "test-prefix:someToken", "standard");
        expect(limiter3.points).toBe(50);
    });
    it("should return the correct rate limiter for 'preview' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("preview", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(5);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("preview", "test-prefix:someToken");
        expect(limiter2.points).toBe(5);
    });
    it("should return the correct rate limiter for 'account' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("account", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(100);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("account", "test-prefix:someToken");
        expect(limiter2.points).toBe(100);
    });
    it("should return the correct rate limiter for 'crawlStatus' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawlStatus", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(150);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("crawlStatus", "test-prefix:someToken");
        expect(limiter2.points).toBe(250);
    });
    it("should return the correct rate limiter for 'testSuite' mode", () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("testSuite", "test-prefix:someToken", "free");
        expect(limiter.points).toBe(10000);
        const limiter2 = (0, rate_limiter_1.getRateLimiter)("testSuite", "test-prefix:someToken");
        expect(limiter2.points).toBe(10000);
    });
    it("should throw an error when consuming more points than available", async () => {
        const limiter = (0, rate_limiter_1.getRateLimiter)("crawl", "test-prefix:someToken");
        const consumePoints = limiter.points + 1;
        try {
            await limiter.consume("test-prefix:someToken", consumePoints);
        }
        catch (error) {
            // expect remaining points to be 0
            const res = await limiter.get("test-prefix:someToken");
            expect(res?.remainingPoints).toBe(0);
        }
    });
    it("should reset points after duration", async () => {
        const keyPrefix = "test-prefix";
        const points = 10;
        const duration = 1; // 1 second
        const limiter = new rate_limiter_flexible_1.RateLimiterRedis({
            storeClient: rate_limiter_1.redisRateLimitClient,
            keyPrefix,
            points,
            duration,
        });
        const consumePoints = 5;
        await limiter.consume("test-prefix:someToken", consumePoints);
        await new Promise((resolve) => setTimeout(resolve, duration * 1000 + 100)); // Wait for duration + 100ms
        const res = await limiter.consume("test-prefix:someToken", consumePoints);
        expect(res.remainingPoints).toBe(points - consumePoints);
    });
});
//# sourceMappingURL=rate-limiter.test.js.map