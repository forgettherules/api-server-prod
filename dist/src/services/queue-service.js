"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScrapeQueue = exports.scrapeQueueName = exports.redisConnection = void 0;
const bullmq_1 = require("bullmq");
const logger_1 = require("../lib/logger");
const ioredis_1 = __importDefault(require("ioredis"));
let scrapeQueue;
exports.redisConnection = new ioredis_1.default(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});
exports.scrapeQueueName = "{scrapeQueue}";
function getScrapeQueue() {
    if (!scrapeQueue) {
        scrapeQueue = new bullmq_1.Queue(exports.scrapeQueueName, {
            connection: exports.redisConnection,
            defaultJobOptions: {
                removeOnComplete: {
                    age: 90000, // 25 hours
                },
                removeOnFail: {
                    age: 90000, // 25 hours
                },
            },
        }
        //   {
        //   settings: {
        //     lockDuration: 1 * 60 * 1000, // 1 minute in milliseconds,
        //     lockRenewTime: 15 * 1000, // 15 seconds in milliseconds
        //     stalledInterval: 30 * 1000,
        //     maxStalledCount: 10,
        //   },
        //   defaultJobOptions:{
        //     attempts: 5
        //   }
        // }
        );
        logger_1.logger.info("Web scraper queue created");
    }
    return scrapeQueue;
}
exports.getScrapeQueue = getScrapeQueue;
// === REMOVED IN FAVOR OF POLLING -- NOT RELIABLE
// import { QueueEvents } from 'bullmq';
// export const scrapeQueueEvents = new QueueEvents(scrapeQueueName, { connection: redisConnection.duplicate() });
//# sourceMappingURL=queue-service.js.map