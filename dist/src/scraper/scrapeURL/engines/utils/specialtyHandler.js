"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.specialtyScrapeCheck = void 0;
const error_1 = require("../../error");
function specialtyScrapeCheck(logger, headers) {
    const contentType = (Object.entries(headers ?? {}).find(x => x[0].toLowerCase() === "content-type") ?? [])[1];
    if (contentType === undefined) {
        logger.warn("Failed to check contentType -- was not present in headers", { headers });
    }
    else if (contentType === "application/pdf" || contentType.startsWith("application/pdf;")) { // .pdf
        throw new error_1.AddFeatureError(["pdf"]);
    }
    else if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || contentType.startsWith("application/vnd.openxmlformats-officedocument.wordprocessingml.document;")) { // .docx
        throw new error_1.AddFeatureError(["docx"]);
    }
}
exports.specialtyScrapeCheck = specialtyScrapeCheck;
//# sourceMappingURL=specialtyHandler.js.map