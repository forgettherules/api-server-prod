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
exports.scrapePDF = void 0;
const node_fs_1 = require("node:fs");
const marked = __importStar(require("marked"));
const fetch_1 = require("../../lib/fetch");
const zod_1 = require("zod");
const Sentry = __importStar(require("@sentry/node"));
const escape_html_1 = __importDefault(require("escape-html"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const downloadFile_1 = require("../utils/downloadFile");
async function scrapePDFWithLlamaParse(meta, tempFilePath) {
    meta.logger.debug("Processing PDF document with LlamaIndex", { tempFilePath });
    const uploadForm = new FormData();
    // This is utterly stupid but it works! - mogery
    uploadForm.append("file", {
        [Symbol.toStringTag]: "Blob",
        name: tempFilePath,
        stream() {
            return (0, node_fs_1.createReadStream)(tempFilePath);
        },
        arrayBuffer() {
            throw Error("Unimplemented in mock Blob: arrayBuffer");
        },
        size: (await node_fs_1.promises.stat(tempFilePath)).size,
        text() {
            throw Error("Unimplemented in mock Blob: text");
        },
        slice(start, end, contentType) {
            throw Error("Unimplemented in mock Blob: slice");
        },
        type: "application/pdf",
    });
    const upload = await (0, fetch_1.robustFetch)({
        url: "https://api.cloud.llamaindex.ai/api/parsing/upload",
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.LLAMAPARSE_API_KEY}`,
        },
        body: uploadForm,
        logger: meta.logger.child({ method: "scrapePDFWithLlamaParse/upload/robustFetch" }),
        schema: zod_1.z.object({
            id: zod_1.z.string(),
        }),
    });
    const jobId = upload.id;
    // TODO: timeout, retries
    const result = await (0, fetch_1.robustFetch)({
        url: `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
        method: "GET",
        headers: {
            "Authorization": `Bearer ${process.env.LLAMAPARSE_API_KEY}`,
        },
        logger: meta.logger.child({ method: "scrapePDFWithLlamaParse/result/robustFetch" }),
        schema: zod_1.z.object({
            markdown: zod_1.z.string(),
        }),
        tryCount: 32,
        tryCooldown: 250,
    });
    return {
        markdown: result.markdown,
        html: await marked.parse(result.markdown, { async: true }),
    };
}
async function scrapePDFWithParsePDF(meta, tempFilePath) {
    meta.logger.debug("Processing PDF document with parse-pdf", { tempFilePath });
    const result = await (0, pdf_parse_1.default)(await node_fs_1.promises.readFile(tempFilePath));
    const escaped = (0, escape_html_1.default)(result.text);
    return {
        markdown: escaped,
        html: escaped,
    };
}
async function scrapePDF(meta) {
    if (!meta.options.parsePDF) {
        const file = await (0, downloadFile_1.fetchFileToBuffer)(meta.url);
        const content = file.buffer.toString("base64");
        return {
            url: file.response.url,
            statusCode: file.response.status,
            html: content,
            markdown: content,
        };
    }
    const { response, tempFilePath } = await (0, downloadFile_1.downloadFile)(meta.id, meta.url);
    let result = null;
    if (process.env.LLAMAPARSE_API_KEY) {
        try {
            result = await scrapePDFWithLlamaParse({
                ...meta,
                logger: meta.logger.child({ method: "scrapePDF/scrapePDFWithLlamaParse" }),
            }, tempFilePath);
        }
        catch (error) {
            meta.logger.warn("LlamaParse failed to parse PDF -- falling back to parse-pdf", { error });
            Sentry.captureException(error);
        }
    }
    if (result === null) {
        result = await scrapePDFWithParsePDF({
            ...meta,
            logger: meta.logger.child({ method: "scrapePDF/scrapePDFWithParsePDF" }),
        }, tempFilePath);
    }
    await node_fs_1.promises.unlink(tempFilePath);
    return {
        url: response.url,
        statusCode: response.status,
        html: result.html,
        markdown: result.markdown,
    };
}
exports.scrapePDF = scrapePDF;
//# sourceMappingURL=index.js.map