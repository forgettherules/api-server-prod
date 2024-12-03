"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlToCrawler = exports.lockURLs = exports.lockURL = exports.generateURLPermutations = exports.normalizeURL = exports.getThrottledJobs = exports.getCrawlJobs = exports.finishCrawl = exports.isCrawlFinishedLocked = exports.isCrawlFinished = exports.getDoneJobsOrdered = exports.getDoneJobsOrderedLength = exports.addCrawlJobDone = exports.addCrawlJobs = exports.addCrawlJob = exports.getCrawlExpiry = exports.getCrawl = exports.saveCrawl = void 0;
const crawler_1 = require("../scraper/WebScraper/crawler");
const queue_service_1 = require("../services/queue-service");
const maxDepthUtils_1 = require("../scraper/WebScraper/utils/maxDepthUtils");
async function saveCrawl(id, crawl) {
    await queue_service_1.redisConnection.set("crawl:" + id, JSON.stringify(crawl));
    await queue_service_1.redisConnection.expire("crawl:" + id, 24 * 60 * 60, "NX");
}
exports.saveCrawl = saveCrawl;
async function getCrawl(id) {
    const x = await queue_service_1.redisConnection.get("crawl:" + id);
    if (x === null) {
        return null;
    }
    return JSON.parse(x);
}
exports.getCrawl = getCrawl;
async function getCrawlExpiry(id) {
    const d = new Date();
    const ttl = await queue_service_1.redisConnection.pttl("crawl:" + id);
    d.setMilliseconds(d.getMilliseconds() + ttl);
    d.setMilliseconds(0);
    return d;
}
exports.getCrawlExpiry = getCrawlExpiry;
async function addCrawlJob(id, job_id) {
    await queue_service_1.redisConnection.sadd("crawl:" + id + ":jobs", job_id);
    await queue_service_1.redisConnection.expire("crawl:" + id + ":jobs", 24 * 60 * 60, "NX");
}
exports.addCrawlJob = addCrawlJob;
async function addCrawlJobs(id, job_ids) {
    await queue_service_1.redisConnection.sadd("crawl:" + id + ":jobs", ...job_ids);
    await queue_service_1.redisConnection.expire("crawl:" + id + ":jobs", 24 * 60 * 60, "NX");
}
exports.addCrawlJobs = addCrawlJobs;
async function addCrawlJobDone(id, job_id) {
    await queue_service_1.redisConnection.sadd("crawl:" + id + ":jobs_done", job_id);
    await queue_service_1.redisConnection.rpush("crawl:" + id + ":jobs_done_ordered", job_id);
    await queue_service_1.redisConnection.expire("crawl:" + id + ":jobs_done", 24 * 60 * 60, "NX");
    await queue_service_1.redisConnection.expire("crawl:" + id + ":jobs_done_ordered", 24 * 60 * 60, "NX");
}
exports.addCrawlJobDone = addCrawlJobDone;
async function getDoneJobsOrderedLength(id) {
    return await queue_service_1.redisConnection.llen("crawl:" + id + ":jobs_done_ordered");
}
exports.getDoneJobsOrderedLength = getDoneJobsOrderedLength;
async function getDoneJobsOrdered(id, start = 0, end = -1) {
    return await queue_service_1.redisConnection.lrange("crawl:" + id + ":jobs_done_ordered", start, end);
}
exports.getDoneJobsOrdered = getDoneJobsOrdered;
async function isCrawlFinished(id) {
    return (await queue_service_1.redisConnection.scard("crawl:" + id + ":jobs_done")) === (await queue_service_1.redisConnection.scard("crawl:" + id + ":jobs"));
}
exports.isCrawlFinished = isCrawlFinished;
async function isCrawlFinishedLocked(id) {
    return (await queue_service_1.redisConnection.exists("crawl:" + id + ":finish"));
}
exports.isCrawlFinishedLocked = isCrawlFinishedLocked;
async function finishCrawl(id) {
    if (await isCrawlFinished(id)) {
        const set = await queue_service_1.redisConnection.setnx("crawl:" + id + ":finish", "yes");
        if (set === 1) {
            await queue_service_1.redisConnection.expire("crawl:" + id + ":finish", 24 * 60 * 60);
        }
        return set === 1;
    }
}
exports.finishCrawl = finishCrawl;
async function getCrawlJobs(id) {
    return await queue_service_1.redisConnection.smembers("crawl:" + id + ":jobs");
}
exports.getCrawlJobs = getCrawlJobs;
async function getThrottledJobs(teamId) {
    return await queue_service_1.redisConnection.zrangebyscore("concurrency-limiter:" + teamId + ":throttled", Date.now(), Infinity);
}
exports.getThrottledJobs = getThrottledJobs;
function normalizeURL(url, sc) {
    const urlO = new URL(url);
    if (!sc.crawlerOptions || sc.crawlerOptions.ignoreQueryParameters) {
        urlO.search = "";
    }
    urlO.hash = "";
    return urlO.href;
}
exports.normalizeURL = normalizeURL;
function generateURLPermutations(url) {
    const urlO = new URL(url);
    // Construct two versions, one with www., one without
    const urlWithWWW = new URL(urlO);
    const urlWithoutWWW = new URL(urlO);
    if (urlO.hostname.startsWith("www.")) {
        urlWithoutWWW.hostname = urlWithWWW.hostname.slice(4);
    }
    else {
        urlWithWWW.hostname = "www." + urlWithoutWWW.hostname;
    }
    let permutations = [urlWithWWW, urlWithoutWWW];
    // Construct more versions for http/https
    permutations = permutations.flatMap(urlO => {
        if (!["http:", "https:"].includes(urlO.protocol)) {
            return [urlO];
        }
        const urlWithHTTP = new URL(urlO);
        const urlWithHTTPS = new URL(urlO);
        urlWithHTTP.protocol = "http:";
        urlWithHTTPS.protocol = "https:";
        return [urlWithHTTP, urlWithHTTPS];
    });
    return permutations;
}
exports.generateURLPermutations = generateURLPermutations;
async function lockURL(id, sc, url) {
    if (typeof sc.crawlerOptions?.limit === "number") {
        if (await queue_service_1.redisConnection.scard("crawl:" + id + ":visited_unique") >= sc.crawlerOptions.limit) {
            return false;
        }
    }
    url = normalizeURL(url, sc);
    await queue_service_1.redisConnection.sadd("crawl:" + id + ":visited_unique", url);
    await queue_service_1.redisConnection.expire("crawl:" + id + ":visited_unique", 24 * 60 * 60, "NX");
    let res;
    if (!sc.crawlerOptions?.deduplicateSimilarURLs) {
        res = (await queue_service_1.redisConnection.sadd("crawl:" + id + ":visited", url)) !== 0;
    }
    else {
        const permutations = generateURLPermutations(url);
        const x = (await queue_service_1.redisConnection.sadd("crawl:" + id + ":visited", ...permutations.map(x => x.href)));
        res = x === permutations.length;
    }
    await queue_service_1.redisConnection.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");
    return res;
}
exports.lockURL = lockURL;
/// NOTE: does not check limit. only use if limit is checked beforehand e.g. with sitemap
async function lockURLs(id, sc, urls) {
    urls = urls.map(url => {
        return normalizeURL(url, sc);
    });
    const res = (await queue_service_1.redisConnection.sadd("crawl:" + id + ":visited", ...urls)) !== 0;
    await queue_service_1.redisConnection.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");
    return res;
}
exports.lockURLs = lockURLs;
function crawlToCrawler(id, sc, newBase) {
    const crawler = new crawler_1.WebCrawler({
        jobId: id,
        initialUrl: sc.originUrl,
        baseUrl: newBase ? new URL(newBase).origin : undefined,
        includes: sc.crawlerOptions?.includes ?? [],
        excludes: sc.crawlerOptions?.excludes ?? [],
        maxCrawledLinks: sc.crawlerOptions?.maxCrawledLinks ?? 1000,
        maxCrawledDepth: (0, maxDepthUtils_1.getAdjustedMaxDepth)(sc.originUrl, sc.crawlerOptions?.maxDepth ?? 10),
        limit: sc.crawlerOptions?.limit ?? 10000,
        generateImgAltText: sc.crawlerOptions?.generateImgAltText ?? false,
        allowBackwardCrawling: sc.crawlerOptions?.allowBackwardCrawling ?? false,
        allowExternalContentLinks: sc.crawlerOptions?.allowExternalContentLinks ?? false,
        allowSubdomains: sc.crawlerOptions?.allowSubdomains ?? false,
        ignoreRobotsTxt: sc.crawlerOptions?.ignoreRobotsTxt ?? false,
    });
    if (sc.robots !== undefined) {
        try {
            crawler.importRobotsTxt(sc.robots);
        }
        catch (_) { }
    }
    return crawler;
}
exports.crawlToCrawler = crawlToCrawler;
//# sourceMappingURL=crawl-redis.js.map