"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobPriority = exports.deleteJobPriority = exports.addJobPriority = void 0;
const queue_service_1 = require("../../src/services/queue-service");
const logger_1 = require("./logger");
const SET_KEY_PREFIX = "limit_team_id:";
async function addJobPriority(team_id, job_id) {
    try {
        const setKey = SET_KEY_PREFIX + team_id;
        // Add scrape job id to the set
        await queue_service_1.redisConnection.sadd(setKey, job_id);
        // This approach will reset the expiration time to 60 seconds every time a new job is added to the set.
        await queue_service_1.redisConnection.expire(setKey, 60);
    }
    catch (e) {
        logger_1.logger.error(`Add job priority (sadd) failed: ${team_id}, ${job_id}`);
    }
}
exports.addJobPriority = addJobPriority;
async function deleteJobPriority(team_id, job_id) {
    try {
        const setKey = SET_KEY_PREFIX + team_id;
        // remove job_id from the set
        await queue_service_1.redisConnection.srem(setKey, job_id);
    }
    catch (e) {
        logger_1.logger.error(`Delete job priority (srem) failed: ${team_id}, ${job_id}`);
    }
}
exports.deleteJobPriority = deleteJobPriority;
async function getJobPriority({ plan, team_id, basePriority = 10, }) {
    if (team_id === "d97c4ceb-290b-4957-8432-2b2a02727d95") {
        return 50;
    }
    try {
        const setKey = SET_KEY_PREFIX + team_id;
        // Get the length of the set
        const setLength = await queue_service_1.redisConnection.scard(setKey);
        // Determine the priority based on the plan and set length
        let planModifier = 1;
        let bucketLimit = 0;
        switch (plan) {
            case "free":
                bucketLimit = 25;
                planModifier = 0.5;
                break;
            case "hobby":
                bucketLimit = 100;
                planModifier = 0.3;
                break;
            case "standard":
            case "standardnew":
                bucketLimit = 200;
                planModifier = 0.2;
                break;
            case "growth":
            case "growthdouble":
                bucketLimit = 400;
                planModifier = 0.1;
                break;
            case "etier2c":
                bucketLimit = 1000;
                planModifier = 0.05;
                break;
            case "etier1a":
                bucketLimit = 1000;
                planModifier = 0.05;
                break;
            default:
                bucketLimit = 25;
                planModifier = 1;
                break;
        }
        // if length set is smaller than set, just return base priority
        if (setLength <= bucketLimit) {
            return basePriority;
        }
        else {
            // If not, we keep base priority + planModifier
            return Math.ceil(basePriority + Math.ceil((setLength - bucketLimit) * planModifier));
        }
    }
    catch (e) {
        logger_1.logger.error(`Get job priority failed: ${team_id}, ${plan}, ${basePriority}`);
        return basePriority;
    }
}
exports.getJobPriority = getJobPriority;
//# sourceMappingURL=job-priority.js.map