"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOpenAICompletions = void 0;
const helpers_1 = require("./helpers");
const maxTokens = 32000;
const modifier = 4;
const defaultPrompt = "You are a professional web scraper. Extract the contents of the webpage";
function prepareOpenAIDoc(document, mode) {
    let markdown = document.markdown;
    let extractionTarget = document.markdown;
    if (mode === "raw-html") {
        extractionTarget = document.rawHtml;
    }
    // Check if the markdown content exists in the document
    if (!extractionTarget) {
        return null;
        // throw new Error(
        //   `${mode} content is missing in the document. This is likely due to an error in the scraping process. Please try again or reach out to help@mendable.ai`
        // );
    }
    // count number of tokens
    const numTokens = (0, helpers_1.numTokensFromString)(extractionTarget, "gpt-4");
    if (numTokens > maxTokens) {
        // trim the document to the maximum number of tokens, tokens != characters
        extractionTarget = extractionTarget.slice(0, maxTokens * modifier);
    }
    return [[{ type: "text", text: extractionTarget }], numTokens];
}
async function generateOpenAICompletions({ client, model = process.env.MODEL_NAME || "gpt-4o-mini", document, schema, //TODO - add zod dynamic type checking
systemPrompt = defaultPrompt, prompt, temperature, mode, }) {
    const openai = client;
    const preparedDoc = prepareOpenAIDoc(document, mode);
    if (preparedDoc === null) {
        return {
            ...document,
            warning: "LLM extraction was not performed since the document's content is empty or missing.",
        };
    }
    const [content, numTokens] = preparedDoc;
    let completion;
    let llmExtraction;
    if (prompt && !schema) {
        const jsonCompletion = await openai.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                { role: "user", content },
                {
                    role: "user",
                    content: `Transform the above content into structured json output based on the following user request: ${prompt}`,
                },
            ],
            response_format: { type: "json_object" },
            temperature,
        });
        try {
            llmExtraction = JSON.parse((jsonCompletion.choices[0].message.content ?? "").trim());
        }
        catch (e) {
            throw new Error("Invalid JSON");
        }
    }
    else {
        completion = await openai.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                { role: "user", content },
            ],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "extract_content",
                        description: "Extracts the content from the given webpage(s)",
                        parameters: schema,
                    },
                },
            ],
            tool_choice: { type: "function", function: { name: "extract_content" } },
            temperature,
        });
        const c = completion.choices[0].message.tool_calls[0].function.arguments;
        // Extract the LLM extraction content from the completion response
        try {
            llmExtraction = JSON.parse(c);
        }
        catch (e) {
            throw new Error("Invalid JSON");
        }
    }
    // Return the document with the LLM extraction content added
    return {
        ...document,
        llm_extraction: llmExtraction,
        warning: numTokens > maxTokens
            ? `Page was trimmed to fit the maximum token limit defined by the LLM model (Max: ${maxTokens} tokens, Attemped: ${numTokens} tokens). If results are not good, email us at help@mendable.ai so we can help you.`
            : undefined,
    };
}
exports.generateOpenAICompletions = generateOpenAICompletions;
//# sourceMappingURL=models.js.map