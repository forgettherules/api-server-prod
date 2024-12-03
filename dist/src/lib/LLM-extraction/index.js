"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCompletions = void 0;
const openai_1 = __importDefault(require("openai"));
const ajv_1 = __importDefault(require("ajv"));
const ajv = new ajv_1.default(); // Initialize AJV for JSON schema validation
const models_1 = require("./models");
const logger_1 = require("../logger");
// Generate completion using OpenAI
async function generateCompletions(documents, extractionOptions, mode) {
    // const schema = zodToJsonSchema(options.schema)
    const schema = extractionOptions?.extractionSchema;
    const systemPrompt = extractionOptions?.extractionPrompt;
    const prompt = extractionOptions?.userPrompt;
    const switchVariable = "openAI"; // Placholder, want to think more about how we abstract the model provider
    const completions = await Promise.all(documents.map(async (document) => {
        switch (switchVariable) {
            case "openAI":
                const llm = new openai_1.default();
                try {
                    const completionResult = await (0, models_1.generateOpenAICompletions)({
                        client: llm,
                        document: document,
                        schema: schema,
                        prompt: prompt,
                        systemPrompt: systemPrompt,
                        mode: mode,
                    });
                    // Validate the JSON output against the schema using AJV
                    if (schema) {
                        const validate = ajv.compile(schema);
                        if (!validate(completionResult.llm_extraction)) {
                            //TODO: add Custom Error handling middleware that bubbles this up with proper Error code, etc.
                            throw new Error(`JSON parsing error(s): ${validate.errors
                                ?.map((err) => err.message)
                                .join(", ")}\n\nLLM extraction did not match the extraction schema you provided. This could be because of a model hallucination, or an Error on our side. Try adjusting your prompt, and if it doesn't work reach out to support.`);
                        }
                    }
                    return completionResult;
                }
                catch (error) {
                    logger_1.logger.error(`Error generating completions: ${error}`);
                    throw error;
                }
            default:
                throw new Error("Invalid client");
        }
    }));
    return completions;
}
exports.generateCompletions = generateCompletions;
//# sourceMappingURL=index.js.map