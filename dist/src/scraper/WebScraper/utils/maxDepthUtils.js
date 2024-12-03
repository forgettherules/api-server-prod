"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getURLDepth = exports.getAdjustedMaxDepth = void 0;
function getAdjustedMaxDepth(url, maxCrawlDepth) {
    const baseURLDepth = getURLDepth(url);
    const adjustedMaxDepth = maxCrawlDepth + baseURLDepth;
    return adjustedMaxDepth;
}
exports.getAdjustedMaxDepth = getAdjustedMaxDepth;
function getURLDepth(url) {
    const pathSplits = new URL(url).pathname.split('/').filter(x => x !== "" && x !== "index.php" && x !== "index.html");
    return pathSplits.length;
}
exports.getURLDepth = getURLDepth;
//# sourceMappingURL=maxDepthUtils.js.map