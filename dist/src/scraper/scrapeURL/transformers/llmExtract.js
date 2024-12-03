"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performLLMExtract = exports.generateOpenAICompletions = exports.LLMRefusalError = void 0;
const openai_1 = __importDefault(require("openai"));
const tiktoken_1 = require("@dqbd/tiktoken");
const maxTokens = 32000;
const modifier = 4;
class LLMRefusalError extends Error {
    refusal;
    results;
    constructor(refusal) {
        super("LLM refused to extract the website's content");
        this.refusal = refusal;
    }
}
exports.LLMRefusalError = LLMRefusalError;
function normalizeSchema(x) {
    if (typeof x !== "object" || x === null)
        return x;
    if (x["$defs"] !== null && typeof x["$defs"] === "object") {
        x["$defs"] = Object.fromEntries(Object.entries(x["$defs"]).map(([name, schema]) => [name, normalizeSchema(schema)]));
    }
    if (x && x.anyOf) {
        x.anyOf = x.anyOf.map(x => normalizeSchema(x));
    }
    if (x && x.oneOf) {
        x.oneOf = x.oneOf.map(x => normalizeSchema(x));
    }
    if (x && x.allOf) {
        x.allOf = x.allOf.map(x => normalizeSchema(x));
    }
    if (x && x.not) {
        x.not = normalizeSchema(x.not);
    }
    if (x && x.type === "object") {
        return {
            ...x,
            properties: Object.fromEntries(Object.entries(x.properties).map(([k, v]) => [k, normalizeSchema(v)])),
            required: Object.keys(x.properties),
            additionalProperties: false,
        };
    }
    else if (x && x.type === "array") {
        return {
            ...x,
            items: normalizeSchema(x.items),
        };
    }
    else {
        return x;
    }
}
async function generateOpenAICompletions(logger, options, markdown, previousWarning, isExtractEndpoint) {
    let extract;
    let warning;
    const openai = new openai_1.default();
    const model = process.env.MODEL_NAME ?? "gpt-4o-mini";
    if (markdown === undefined) {
        throw new Error("document.markdown is undefined -- this is unexpected");
    }
    // count number of tokens
    let numTokens = 0;
    const encoder = (0, tiktoken_1.encoding_for_model)(model);
    try {
        // Encode the message into tokens
        const tokens = encoder.encode(markdown);
        // Return the number of tokens
        numTokens = tokens.length;
    }
    catch (error) {
        logger.warn("Calculating num tokens of string failed", { error, markdown });
        markdown = markdown.slice(0, maxTokens * modifier);
        let w = "Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens (" + maxTokens + ") we support.";
        warning = previousWarning === undefined ? w : w + " " + previousWarning;
    }
    finally {
        // Free the encoder resources after use
        encoder.free();
    }
    if (numTokens > maxTokens) {
        // trim the document to the maximum number of tokens, tokens != characters
        markdown = markdown.slice(0, maxTokens * modifier);
        const w = "The extraction content would have used more tokens (" + numTokens + ") than the maximum we allow (" + maxTokens + "). -- the input has been automatically trimmed.";
        warning = previousWarning === undefined ? w : w + " " + previousWarning;
    }
    let schema = options.schema;
    if (schema && schema.type === "array") {
        schema = {
            type: "object",
            properties: {
                items: options.schema,
            },
            required: ["items"],
            additionalProperties: false,
        };
    }
    else if (schema && typeof schema === 'object' && !schema.type) {
        schema = {
            type: "object",
            properties: Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, { type: value }])),
            required: Object.keys(schema),
            additionalProperties: false
        };
    }
    schema = normalizeSchema(schema);
    const jsonCompletion = await openai.beta.chat.completions.parse({
        model,
        temperature: 0,
        messages: [
            {
                role: "system",
                content: options.systemPrompt,
            },
            {
                role: "user",
                content: [{ type: "text", text: markdown }],
            },
            {
                role: "user",
                content: options.prompt !== undefined
                    ? `Transform the above content into structured JSON output based on the following user request: ${options.prompt}`
                    : "Transform the above content into structured JSON output.",
            },
        ],
        response_format: options.schema ? {
            type: "json_schema",
            json_schema: {
                name: "websiteContent",
                schema: schema,
                strict: true,
            }
        } : { type: "json_object" },
    });
    if (jsonCompletion.choices[0].message.refusal !== null) {
        throw new LLMRefusalError(jsonCompletion.choices[0].message.refusal);
    }
    extract = jsonCompletion.choices[0].message.parsed;
    if (extract === null && jsonCompletion.choices[0].message.content !== null) {
        try {
            if (!isExtractEndpoint) {
                extract = JSON.parse(jsonCompletion.choices[0].message.content);
            }
            else {
                const extractData = JSON.parse(jsonCompletion.choices[0].message.content);
                extract = extractData.data.extract;
            }
        }
        catch (e) {
            logger.error("Failed to parse returned JSON, no schema specified.", { error: e });
            throw new LLMRefusalError("Failed to parse returned JSON. Please specify a schema in the extract object.");
        }
    }
    // If the users actually wants the items object, they can specify it as 'required' in the schema
    // otherwise, we just return the items array
    if (options.schema && options.schema.type === "array" && !schema?.required?.includes("items")) {
        extract = extract?.items;
    }
    return { extract, warning, numTokens };
}
exports.generateOpenAICompletions = generateOpenAICompletions;
async function performLLMExtract(meta, document) {
    if (meta.options.formats.includes("extract")) {
        const { extract, warning } = await generateOpenAICompletions(meta.logger.child({ method: "performLLMExtract/generateOpenAICompletions" }), meta.options.extract, document.markdown, document.warning);
        document.extract = extract;
        document.warning = warning;
    }
    return document;
}
exports.performLLMExtract = performLLMExtract;
//# sourceMappingURL=llmExtract.js.map