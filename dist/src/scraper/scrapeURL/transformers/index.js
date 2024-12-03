"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTransformers = exports.transformerStack = exports.coerceFieldsToFormats = exports.deriveLinksFromHTML = exports.deriveMarkdownFromHTML = exports.deriveHTMLFromRawHTML = exports.deriveMetadataFromRawHTML = void 0;
const html_to_markdown_1 = require("../../../lib/html-to-markdown");
const removeUnwantedElements_1 = require("../lib/removeUnwantedElements");
const extractLinks_1 = require("../lib/extractLinks");
const extractMetadata_1 = require("../lib/extractMetadata");
const llmExtract_1 = require("./llmExtract");
const uploadScreenshot_1 = require("./uploadScreenshot");
const removeBase64Images_1 = require("./removeBase64Images");
const cache_1 = require("./cache");
function deriveMetadataFromRawHTML(meta, document) {
    if (document.rawHtml === undefined) {
        throw new Error("rawHtml is undefined -- this transformer is being called out of order");
    }
    document.metadata = {
        ...(0, extractMetadata_1.extractMetadata)(meta, document.rawHtml),
        ...document.metadata,
    };
    return document;
}
exports.deriveMetadataFromRawHTML = deriveMetadataFromRawHTML;
function deriveHTMLFromRawHTML(meta, document) {
    if (document.rawHtml === undefined) {
        throw new Error("rawHtml is undefined -- this transformer is being called out of order");
    }
    document.html = (0, removeUnwantedElements_1.removeUnwantedElements)(document.rawHtml, meta.options);
    return document;
}
exports.deriveHTMLFromRawHTML = deriveHTMLFromRawHTML;
async function deriveMarkdownFromHTML(_meta, document) {
    if (document.html === undefined) {
        throw new Error("html is undefined -- this transformer is being called out of order");
    }
    document.markdown = await (0, html_to_markdown_1.parseMarkdown)(document.html);
    return document;
}
exports.deriveMarkdownFromHTML = deriveMarkdownFromHTML;
function deriveLinksFromHTML(meta, document) {
    // Only derive if the formats has links
    if (meta.options.formats.includes("links")) {
        if (document.html === undefined) {
            throw new Error("html is undefined -- this transformer is being called out of order");
        }
        document.links = (0, extractLinks_1.extractLinks)(document.html, meta.url);
    }
    return document;
}
exports.deriveLinksFromHTML = deriveLinksFromHTML;
function coerceFieldsToFormats(meta, document) {
    const formats = new Set(meta.options.formats);
    if (!formats.has("markdown") && document.markdown !== undefined) {
        delete document.markdown;
    }
    else if (formats.has("markdown") && document.markdown === undefined) {
        meta.logger.warn("Request had format: markdown, but there was no markdown field in the result.");
    }
    if (!formats.has("rawHtml") && document.rawHtml !== undefined) {
        delete document.rawHtml;
    }
    else if (formats.has("rawHtml") && document.rawHtml === undefined) {
        meta.logger.warn("Request had format: rawHtml, but there was no rawHtml field in the result.");
    }
    if (!formats.has("html") && document.html !== undefined) {
        delete document.html;
    }
    else if (formats.has("html") && document.html === undefined) {
        meta.logger.warn("Request had format: html, but there was no html field in the result.");
    }
    if (!formats.has("screenshot") && !formats.has("screenshot@fullPage") && document.screenshot !== undefined) {
        meta.logger.warn("Removed screenshot from Document because it wasn't in formats -- this is very wasteful and indicates a bug.");
        delete document.screenshot;
    }
    else if ((formats.has("screenshot") || formats.has("screenshot@fullPage")) && document.screenshot === undefined) {
        meta.logger.warn("Request had format: screenshot / screenshot@fullPage, but there was no screenshot field in the result.");
    }
    if (!formats.has("links") && document.links !== undefined) {
        meta.logger.warn("Removed links from Document because it wasn't in formats -- this is wasteful and indicates a bug.");
        delete document.links;
    }
    else if (formats.has("links") && document.links === undefined) {
        meta.logger.warn("Request had format: links, but there was no links field in the result.");
    }
    if (!formats.has("extract") && document.extract !== undefined) {
        meta.logger.warn("Removed extract from Document because it wasn't in formats -- this is extremely wasteful and indicates a bug.");
        delete document.extract;
    }
    else if (formats.has("extract") && document.extract === undefined) {
        meta.logger.warn("Request had format: extract, but there was no extract field in the result.");
    }
    if (meta.options.actions === undefined || meta.options.actions.length === 0) {
        delete document.actions;
    }
    return document;
}
exports.coerceFieldsToFormats = coerceFieldsToFormats;
// TODO: allow some of these to run in parallel
exports.transformerStack = [
    cache_1.saveToCache,
    deriveHTMLFromRawHTML,
    deriveMarkdownFromHTML,
    deriveLinksFromHTML,
    deriveMetadataFromRawHTML,
    uploadScreenshot_1.uploadScreenshot,
    llmExtract_1.performLLMExtract,
    coerceFieldsToFormats,
    removeBase64Images_1.removeBase64Images,
];
async function executeTransformers(meta, document) {
    const executions = [];
    for (const transformer of exports.transformerStack) {
        const _meta = {
            ...meta,
            logger: meta.logger.child({ method: "executeTransformers/" + transformer.name }),
        };
        const start = Date.now();
        document = await transformer(_meta, document);
        executions.push([transformer.name, Date.now() - start]);
    }
    meta.logger.debug("Executed transformers.", { executions });
    return document;
}
exports.executeTransformers = executeTransformers;
//# sourceMappingURL=index.js.map