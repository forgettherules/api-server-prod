"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDocument = void 0;
function buildDocument(document) {
    const metadata = document.metadata;
    const markdown = document.markdown;
    // for each key in the metadata allow up to 250 characters
    const metadataString = Object.entries(metadata).map(([key, value]) => {
        return `${key}: ${value?.toString().slice(0, 250)}`;
    }).join('\n');
    const documentMetadataString = `\n- - - - - Page metadata - - - - -\n${metadataString}`;
    const documentString = `${markdown}${documentMetadataString}`;
    return documentString;
}
exports.buildDocument = buildDocument;
//# sourceMappingURL=build-document.js.map