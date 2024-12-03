"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.concurrencyCheckController = void 0;
const queue_service_1 = require("../../services/queue-service");
// Basically just middleware and error wrapping
async function concurrencyCheckController(req, res) {
    const concurrencyLimiterKey = "concurrency-limiter:" + req.auth.team_id;
    const now = Date.now();
    const activeJobsOfTeam = await queue_service_1.redisConnection.zrangebyscore(concurrencyLimiterKey, now, Infinity);
    return res
        .status(200)
        .json({ success: true, concurrency: activeJobsOfTeam.length });
}
exports.concurrencyCheckController = concurrencyCheckController;
//# sourceMappingURL=concurrency-check.js.map