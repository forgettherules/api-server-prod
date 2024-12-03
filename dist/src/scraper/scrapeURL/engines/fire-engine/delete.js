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
exports.fireEngineDelete = void 0;
const Sentry = __importStar(require("@sentry/node"));
const fetch_1 = require("../../lib/fetch");
async function fireEngineDelete(logger, jobId) {
    const fireEngineURL = process.env.FIRE_ENGINE_BETA_URL;
    await Sentry.startSpan({
        name: "fire-engine: Delete scrape",
        attributes: {
            jobId,
        }
    }, async (span) => {
        await (0, fetch_1.robustFetch)({
            url: `${fireEngineURL}/scrape/${jobId}`,
            method: "DELETE",
            headers: {
                ...(Sentry.isInitialized() ? ({
                    "sentry-trace": Sentry.spanToTraceHeader(span),
                    "baggage": Sentry.spanToBaggageHeader(span),
                }) : {}),
            },
            ignoreResponse: true,
            ignoreFailure: true,
            logger: logger.child({ method: "fireEngineDelete/robustFetch", jobId }),
        });
    });
    // We do not care whether this fails or not.
}
exports.fireEngineDelete = fireEngineDelete;
//# sourceMappingURL=delete.js.map