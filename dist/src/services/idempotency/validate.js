"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateIdempotencyKey = void 0;
const supabase_1 = require("../supabase");
const uuid_1 = require("uuid");
const logger_1 = require("../../../src/lib/logger");
async function validateIdempotencyKey(req) {
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (!idempotencyKey) {
        // // not returning for missing idempotency key for now
        return true;
    }
    // Ensure idempotencyKey is treated as a string
    const key = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;
    if (!(0, uuid_1.validate)(key)) {
        logger_1.logger.debug("Invalid idempotency key provided in the request headers.");
        return false;
    }
    const { data, error } = await supabase_1.supabase_service
        .from("idempotency_keys")
        .select("key")
        .eq("key", idempotencyKey);
    if (error) {
        logger_1.logger.error(`Error validating idempotency key: ${error}`);
    }
    if (!data || data.length === 0) {
        return true;
    }
    return false;
}
exports.validateIdempotencyKey = validateIdempotencyKey;
//# sourceMappingURL=validate.js.map