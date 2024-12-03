"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rerankDocuments = void 0;
const cohere_ai_1 = require("cohere-ai");
const cohere = new cohere_ai_1.CohereClient({
    token: process.env.COHERE_API_KEY,
});
async function rerankDocuments(documents, query, topN = 3, model = "rerank-english-v3.0") {
    const rerank = await cohere.v2.rerank({
        documents,
        query,
        topN,
        model,
        returnDocuments: true,
    });
    return rerank.results.sort((a, b) => b.relevanceScore - a.relevanceScore).map(x => ({ document: x.document, index: x.index, relevanceScore: x.relevanceScore }));
}
exports.rerankDocuments = rerankDocuments;
//# sourceMappingURL=reranker.js.map