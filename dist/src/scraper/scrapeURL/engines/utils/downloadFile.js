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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFile = exports.fetchFileToBuffer = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const node_fs_1 = require("node:fs");
const error_1 = require("../../error");
const stream_1 = require("stream");
const uuid_1 = require("uuid");
const undici = __importStar(require("undici"));
async function fetchFileToBuffer(url) {
    const response = await fetch(url); // TODO: maybe we could use tlsclient for this? for proxying
    return {
        response,
        buffer: Buffer.from(await response.arrayBuffer()),
    };
}
exports.fetchFileToBuffer = fetchFileToBuffer;
async function downloadFile(id, url) {
    const tempFilePath = path_1.default.join(os_1.default.tmpdir(), `tempFile-${id}--${(0, uuid_1.v4)()}`);
    const tempFileWrite = (0, node_fs_1.createWriteStream)(tempFilePath);
    // TODO: maybe we could use tlsclient for this? for proxying
    // use undici to ignore SSL for now
    const response = await undici.fetch(url, {
        dispatcher: new undici.Agent({
            connect: {
                rejectUnauthorized: false,
            },
        })
    });
    // This should never happen in the current state of JS (2024), but let's check anyways.
    if (response.body === null) {
        throw new error_1.EngineError("Response body was null", { cause: { response } });
    }
    response.body.pipeTo(stream_1.Writable.toWeb(tempFileWrite));
    await new Promise((resolve, reject) => {
        tempFileWrite.on("finish", () => resolve(null));
        tempFileWrite.on("error", (error) => {
            reject(new error_1.EngineError("Failed to write to temp file", { cause: { error } }));
        });
    });
    return {
        response,
        tempFilePath,
    };
}
exports.downloadFile = downloadFile;
//# sourceMappingURL=downloadFile.js.map