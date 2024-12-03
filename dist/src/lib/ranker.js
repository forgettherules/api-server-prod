"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performRanking = void 0;
const dotenv_1 = require("dotenv");
const openai_1 = __importDefault(require("openai"));
(0, dotenv_1.configDotenv)();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
async function getEmbedding(text) {
    const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
        encoding_format: "float",
    });
    return embedding.data[0].embedding;
}
const cosineSimilarity = (vec1, vec2) => {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    if (magnitude1 === 0 || magnitude2 === 0)
        return 0;
    return dotProduct / (magnitude1 * magnitude2);
};
// Function to convert text to vector
const textToVector = (searchQuery, text) => {
    const words = searchQuery.toLowerCase().split(/\W+/);
    return words.map((word) => {
        const count = (text.toLowerCase().match(new RegExp(word, "g")) || [])
            .length;
        return count / text.length;
    });
};
async function performRanking(linksWithContext, links, searchQuery) {
    try {
        // Handle invalid inputs
        if (!searchQuery || !linksWithContext.length || !links.length) {
            return [];
        }
        // Sanitize search query by removing null characters
        const sanitizedQuery = searchQuery;
        // Generate embeddings for the search query
        const queryEmbedding = await getEmbedding(sanitizedQuery);
        // Generate embeddings for each link and calculate similarity
        const linksAndScores = await Promise.all(linksWithContext.map(async (linkWithContext, index) => {
            try {
                const linkEmbedding = await getEmbedding(linkWithContext);
                const score = cosineSimilarity(queryEmbedding, linkEmbedding);
                return {
                    link: links[index],
                    linkWithContext,
                    score,
                    originalIndex: index
                };
            }
            catch (err) {
                // If embedding fails for a link, return with score 0
                return {
                    link: links[index],
                    linkWithContext,
                    score: 0,
                    originalIndex: index
                };
            }
        }));
        // Sort links based on similarity scores while preserving original order for equal scores
        linksAndScores.sort((a, b) => {
            const scoreDiff = b.score - a.score;
            return scoreDiff === 0 ? a.originalIndex - b.originalIndex : scoreDiff;
        });
        return linksAndScores;
    }
    catch (error) {
        console.error(`Error performing semantic search: ${error}`);
        return [];
    }
}
exports.performRanking = performRanking;
//# sourceMappingURL=ranker.js.map