"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchProcess = void 0;
async function batchProcess(array, batchSize, asyncFunction) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
        const batch = array.slice(i, i + batchSize);
        batches.push(batch);
    }
    for (const batch of batches) {
        await Promise.all(batch.map((item, i) => asyncFunction(item, i)));
    }
}
exports.batchProcess = batchProcess;
//# sourceMappingURL=batch-process.js.map