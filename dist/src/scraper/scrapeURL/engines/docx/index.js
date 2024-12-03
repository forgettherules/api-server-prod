"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeDOCX = void 0;
const downloadFile_1 = require("../utils/downloadFile");
const mammoth_1 = __importDefault(require("mammoth"));
async function scrapeDOCX(meta) {
    const { response, tempFilePath } = await (0, downloadFile_1.downloadFile)(meta.id, meta.url);
    return {
        url: response.url,
        statusCode: response.status,
        html: (await mammoth_1.default.convertToHtml({ path: tempFilePath })).value,
    };
}
exports.scrapeDOCX = scrapeDOCX;
//# sourceMappingURL=index.js.map