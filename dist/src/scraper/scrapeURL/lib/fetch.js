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
exports.robustFetch = void 0;
const zod_1 = require("zod");
const uuid_1 = require("uuid");
const Sentry = __importStar(require("@sentry/node"));
async function robustFetch({ url, logger, method = "GET", body, headers, schema, ignoreResponse = false, ignoreFailure = false, requestId = (0, uuid_1.v4)(), tryCount = 1, tryCooldown, }) {
    const params = { url, logger, method, body, headers, schema, ignoreResponse, ignoreFailure, tryCount, tryCooldown };
    let request;
    try {
        request = await fetch(url, {
            method,
            headers: {
                ...(body instanceof FormData
                    ? ({})
                    : body !== undefined ? ({
                        "Content-Type": "application/json",
                    }) : {}),
                ...(headers !== undefined ? headers : {}),
            },
            ...(body instanceof FormData ? ({
                body,
            }) : body !== undefined ? ({
                body: JSON.stringify(body),
            }) : {}),
        });
    }
    catch (error) {
        if (!ignoreFailure) {
            Sentry.captureException(error);
            if (tryCount > 1) {
                logger.debug("Request failed, trying " + (tryCount - 1) + " more times", { params, error, requestId });
                return await robustFetch({
                    ...params,
                    requestId,
                    tryCount: tryCount - 1,
                });
            }
            else {
                logger.debug("Request failed", { params, error, requestId });
                throw new Error("Request failed", {
                    cause: {
                        params, requestId, error,
                    },
                });
            }
        }
        else {
            return null;
        }
    }
    if (ignoreResponse === true) {
        return null;
    }
    const response = {
        status: request.status,
        headers: request.headers,
        body: await request.text(), // NOTE: can this throw an exception?
    };
    if (request.status >= 300) {
        if (tryCount > 1) {
            logger.debug("Request sent failure status, trying " + (tryCount - 1) + " more times", { params, request, response, requestId });
            if (tryCooldown !== undefined) {
                await new Promise((resolve) => setTimeout(() => resolve(null), tryCooldown));
            }
            return await robustFetch({
                ...params,
                requestId,
                tryCount: tryCount - 1,
            });
        }
        else {
            logger.debug("Request sent failure status", { params, request, response, requestId });
            throw new Error("Request sent failure status", {
                cause: {
                    params, request, response, requestId,
                },
            });
        }
    }
    let data;
    try {
        data = JSON.parse(response.body);
    }
    catch (error) {
        logger.debug("Request sent malformed JSON", { params, request, response, requestId });
        throw new Error("Request sent malformed JSON", {
            cause: {
                params, request, response, requestId,
            },
        });
    }
    if (schema) {
        try {
            data = schema.parse(data);
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                logger.debug("Response does not match provided schema", { params, request, response, requestId, error, schema });
                throw new Error("Response does not match provided schema", {
                    cause: {
                        params, request, response, requestId,
                        error, schema,
                    }
                });
            }
            else {
                logger.debug("Parsing response with provided schema failed", { params, request, response, requestId, error, schema });
                throw new Error("Parsing response with provided schema failed", {
                    cause: {
                        params, request, response, requestId,
                        error, schema
                    }
                });
            }
        }
    }
    return data;
}
exports.robustFetch = robustFetch;
//# sourceMappingURL=fetch.js.map