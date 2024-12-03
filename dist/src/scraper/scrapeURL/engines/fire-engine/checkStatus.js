"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fireEngineCheckStatus = exports.StillProcessingError = void 0;
const Sentry = __importStar(require("@sentry/node"));
const zod_1 = require("zod");
const fetch_1 = require("../../lib/fetch");
const error_1 = require("../../error");
const successSchema = zod_1.z.object({
    jobId: zod_1.z.string(),
    state: zod_1.z.literal("completed"),
    processing: zod_1.z.literal(false),
    // timeTaken: z.number(),
    content: zod_1.z.string(),
    url: zod_1.z.string().optional(),
    pageStatusCode: zod_1.z.number(),
    pageError: zod_1.z.string().optional(),
    // TODO: this needs to be non-optional, might need fixes on f-e side to ensure reliability
    responseHeaders: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    // timeTakenCookie: z.number().optional(),
    // timeTakenRequest: z.number().optional(),
    // legacy: playwright only
    screenshot: zod_1.z.string().optional(),
    // new: actions
    screenshots: zod_1.z.string().array().optional(),
    actionContent: zod_1.z.object({
        url: zod_1.z.string(),
        html: zod_1.z.string(),
    }).array().optional(),
});
const processingSchema = zod_1.z.object({
    jobId: zod_1.z.string(),
    state: zod_1.z.enum(["delayed", "active", "waiting", "waiting-children", "unknown", "prioritized"]),
    processing: zod_1.z.boolean(),
});
const failedSchema = zod_1.z.object({
    jobId: zod_1.z.string(),
    state: zod_1.z.literal("failed"),
    processing: zod_1.z.literal(false),
    error: zod_1.z.string(),
});
class StillProcessingError extends Error {
    constructor(jobId) {
        super("Job is still under processing", { cause: { jobId } });
    }
}
exports.StillProcessingError = StillProcessingError;
async function fireEngineCheckStatus(logger, jobId) {
    const fireEngineURL = process.env.FIRE_ENGINE_BETA_URL;
    const status = await Sentry.startSpan({
        name: "fire-engine: Check status",
        attributes: {
            jobId,
        }
    }, async (span) => {
        return await (0, fetch_1.robustFetch)({
            url: `${fireEngineURL}/scrape/${jobId}`,
            method: "GET",
            logger: logger.child({ method: "fireEngineCheckStatus/robustFetch" }),
            headers: {
                ...(Sentry.isInitialized() ? ({
                    "sentry-trace": Sentry.spanToTraceHeader(span),
                    "baggage": Sentry.spanToBaggageHeader(span),
                }) : {}),
            },
        });
    });
    const successParse = successSchema.safeParse(status);
    const processingParse = processingSchema.safeParse(status);
    const failedParse = failedSchema.safeParse(status);
    if (successParse.success) {
        logger.debug("Scrape succeeded!", { jobId });
        return successParse.data;
    }
    else if (processingParse.success) {
        throw new StillProcessingError(jobId);
    }
    else if (failedParse.success) {
        logger.debug("Scrape job failed", { status, jobId });
        if (typeof status.error === "string" && status.error.includes("Chrome error: ")) {
            throw new error_1.SiteError(status.error.split("Chrome error: ")[1]);
        }
        else {
            throw new error_1.EngineError("Scrape job failed", {
                cause: {
                    status, jobId
                }
            });
        }
    }
    else {
        logger.debug("Check status returned response not matched by any schema", { status, jobId });
        throw new Error("Check status returned response not matched by any schema", {
            cause: {
                status, jobId
            }
        });
    }
}
exports.fireEngineCheckStatus = fireEngineCheckStatus;
//# sourceMappingURL=checkStatus.js.map