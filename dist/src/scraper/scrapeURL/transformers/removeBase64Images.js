"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeBase64Images = void 0;
const regex = /(!\[.*?\])\(data:image\/.*?;base64,.*?\)/g;
function removeBase64Images(meta, document) {
    if (meta.options.removeBase64Images && document.markdown !== undefined) {
        document.markdown = document.markdown.replace(regex, '$1(<Base64-Image-Removed>)');
    }
    return document;
}
exports.removeBase64Images = removeBase64Images;
//# sourceMappingURL=removeBase64Images.js.map