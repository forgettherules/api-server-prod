"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushConcurrencyLimitedJob = exports.takeConcurrencyLimitedJob = exports.removeConcurrencyLimitActiveJob = exports.pushConcurrencyLimitActiveJob = exports.getConcurrencyLimitActiveJobs = exports.cleanOldConcurrencyLimitEntries = exports.getConcurrencyLimitMax = void 0;
const rate_limiter_1 = require("../services/rate-limiter");
const queue_service_1 = require("../services/queue-service");
const types_1 = require("../types");
const constructKey = (team_id) => "concurrency-limiter:" + team_id;
const constructQueueKey = (team_id) => "concurrency-limit-queue:" + team_id;
const stalledJobTimeoutMs = 2 * 60 * 1000;
function getConcurrencyLimitMax(plan) {
    return (0, rate_limiter_1.getRateLimiterPoints)(types_1.RateLimiterMode.Scrape, undefined, plan);
}
exports.getConcurrencyLimitMax = getConcurrencyLimitMax;
async function cleanOldConcurrencyLimitEntries(team_id, now = Date.now()) {
    await queue_service_1.redisConnection.zremrangebyscore(constructKey(team_id), -Infinity, now);
}
exports.cleanOldConcurrencyLimitEntries = cleanOldConcurrencyLimitEntries;
async function getConcurrencyLimitActiveJobs(team_id, now = Date.now()) {
    return await queue_service_1.redisConnection.zrangebyscore(constructKey(team_id), now, Infinity);
}
exports.getConcurrencyLimitActiveJobs = getConcurrencyLimitActiveJobs;
async function pushConcurrencyLimitActiveJob(team_id, id, now = Date.now()) {
    await queue_service_1.redisConnection.zadd(constructKey(team_id), now + stalledJobTimeoutMs, id);
}
exports.pushConcurrencyLimitActiveJob = pushConcurrencyLimitActiveJob;
async function removeConcurrencyLimitActiveJob(team_id, id) {
    await queue_service_1.redisConnection.zrem(constructKey(team_id), id);
}
exports.removeConcurrencyLimitActiveJob = removeConcurrencyLimitActiveJob;
async function takeConcurrencyLimitedJob(team_id) {
    const res = await queue_service_1.redisConnection.zmpop(1, constructQueueKey(team_id), "MIN");
    if (res === null || res === undefined) {
        return null;
    }
    return JSON.parse(res[1][0][0]);
}
exports.takeConcurrencyLimitedJob = takeConcurrencyLimitedJob;
async function pushConcurrencyLimitedJob(team_id, job) {
    await queue_service_1.redisConnection.zadd(constructQueueKey(team_id), job.priority ?? 1, JSON.stringify(job));
}
exports.pushConcurrencyLimitedJob = pushConcurrencyLimitedJob;
//# sourceMappingURL=concurrency-limit.js.map