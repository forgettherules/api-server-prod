"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractController = void 0;
const types_1 = require("./types");
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = require("dotenv");
const ranker_1 = require("../../lib/ranker");
const credit_billing_1 = require("../../services/billing/credit_billing");
const log_job_1 = require("../../services/logging/log_job");
const logger_1 = require("../../lib/logger");
const queue_service_1 = require("../../services/queue-service");
const queue_jobs_1 = require("../../services/queue-jobs");
const queue_jobs_2 = require("../../services/queue-jobs");
const job_priority_1 = require("../../lib/job-priority");
const llmExtract_1 = require("../../scraper/scrapeURL/transformers/llmExtract");
const blocklist_1 = require("../../scraper/WebScraper/utils/blocklist");
const map_1 = require("./map");
const build_document_1 = require("../../lib/extract/build-document");
(0, dotenv_1.configDotenv)();
const redis = new ioredis_1.default(process.env.REDIS_URL);
const MAX_EXTRACT_LIMIT = 100;
const MAX_RANKING_LIMIT = 10;
const INITIAL_SCORE_THRESHOLD = 0.75;
const FALLBACK_SCORE_THRESHOLD = 0.5;
const MIN_REQUIRED_LINKS = 1;
/**
 * Extracts data from the provided URLs based on the request parameters.
 * Currently in beta.
 * @param req - The request object containing authentication and extraction details.
 * @param res - The response object to send the extraction results.
 * @returns A promise that resolves when the extraction process is complete.
 */
async function extractController(req, res) {
    const selfHosted = process.env.USE_DB_AUTHENTICATION !== "true";
    req.body = types_1.extractRequestSchema.parse(req.body);
    const id = crypto.randomUUID();
    let links = [];
    let docs = [];
    const earlyReturn = false;
    // Process all URLs in parallel
    const urlPromises = req.body.urls.map(async (url) => {
        if (url.includes('/*') || req.body.allowExternalLinks) {
            // Handle glob pattern URLs
            const baseUrl = url.replace('/*', '');
            // const pathPrefix = baseUrl.split('/').slice(3).join('/'); // Get path after domain if any
            const allowExternalLinks = req.body.allowExternalLinks ?? true;
            let urlWithoutWww = baseUrl.replace("www.", "");
            let mapUrl = req.body.prompt && allowExternalLinks
                ? `${req.body.prompt} ${urlWithoutWww}`
                : req.body.prompt ? `${req.body.prompt} site:${urlWithoutWww}`
                    : `site:${urlWithoutWww}`;
            const mapResults = await (0, map_1.getMapResults)({
                url: baseUrl,
                search: req.body.prompt,
                teamId: req.auth.team_id,
                plan: req.auth.plan,
                allowExternalLinks,
                origin: req.body.origin,
                limit: req.body.limit,
                // If we're self-hosted, we don't want to ignore the sitemap, due to our fire-engine mapping
                ignoreSitemap: !selfHosted ? true : false,
                includeMetadata: true,
                includeSubdomains: req.body.includeSubdomains,
            });
            let mappedLinks = mapResults.links;
            // Limit number of links to MAX_EXTRACT_LIMIT
            mappedLinks = mappedLinks.slice(0, MAX_EXTRACT_LIMIT);
            let mappedLinksRerank = mappedLinks.map(x => `url: ${x.url}, title: ${x.title}, description: ${x.description}`);
            // Filter by path prefix if present
            // wrong
            // if (pathPrefix) {
            //   mappedLinks = mappedLinks.filter(x => x.url && x.url.includes(`/${pathPrefix}/`));
            // }
            if (req.body.prompt) {
                // Get similarity scores between the search query and each link's context
                const linksAndScores = await (0, ranker_1.performRanking)(mappedLinksRerank, mappedLinks.map(l => l.url), mapUrl);
                // First try with high threshold
                let filteredLinks = filterAndProcessLinks(mappedLinks, linksAndScores, INITIAL_SCORE_THRESHOLD);
                // If we don't have enough high-quality links, try with lower threshold
                if (filteredLinks.length < MIN_REQUIRED_LINKS) {
                    logger_1.logger.info(`Only found ${filteredLinks.length} links with score > ${INITIAL_SCORE_THRESHOLD}. Trying lower threshold...`);
                    filteredLinks = filterAndProcessLinks(mappedLinks, linksAndScores, FALLBACK_SCORE_THRESHOLD);
                    if (filteredLinks.length === 0) {
                        // If still no results, take top N results regardless of score
                        logger_1.logger.warn(`No links found with score > ${FALLBACK_SCORE_THRESHOLD}. Taking top ${MIN_REQUIRED_LINKS} results.`);
                        filteredLinks = linksAndScores
                            .sort((a, b) => b.score - a.score)
                            .slice(0, MIN_REQUIRED_LINKS)
                            .map(x => mappedLinks.find(link => link.url === x.link))
                            .filter((x) => x !== undefined && x.url !== undefined && !(0, blocklist_1.isUrlBlocked)(x.url));
                    }
                }
                mappedLinks = filteredLinks.slice(0, MAX_RANKING_LIMIT);
            }
            return mappedLinks.map(x => x.url);
        }
        else {
            // Handle direct URLs without glob pattern
            if (!(0, blocklist_1.isUrlBlocked)(url)) {
                return [url];
            }
            return [];
        }
    });
    // Wait for all URL processing to complete and flatten results
    const processedUrls = await Promise.all(urlPromises);
    links.push(...processedUrls.flat());
    if (links.length === 0) {
        return res.status(400).json({
            success: false,
            error: "No valid URLs found to scrape. Try adjusting your search criteria or including more URLs."
        });
    }
    // Scrape all links in parallel with retries
    const scrapePromises = links.map(async (url) => {
        const origin = req.body.origin || "api";
        const timeout = Math.floor((req.body.timeout || 40000) * 0.7) || 30000; // Use 70% of total timeout for individual scrapes
        const jobId = crypto.randomUUID();
        const jobPriority = await (0, job_priority_1.getJobPriority)({
            plan: req.auth.plan,
            team_id: req.auth.team_id,
            basePriority: 10,
        });
        await (0, queue_jobs_2.addScrapeJob)({
            url,
            mode: "single_urls",
            team_id: req.auth.team_id,
            scrapeOptions: types_1.scrapeOptions.parse({}),
            internalOptions: {},
            plan: req.auth.plan,
            origin,
            is_scrape: true,
        }, {}, jobId, jobPriority);
        try {
            const doc = await (0, queue_jobs_1.waitForJob)(jobId, timeout);
            await (0, queue_service_1.getScrapeQueue)().remove(jobId);
            if (earlyReturn) {
                return null;
            }
            return doc;
        }
        catch (e) {
            logger_1.logger.error(`Error in scrapeController: ${e}`);
            if (e instanceof Error && (e.message.startsWith("Job wait") || e.message === "timeout")) {
                throw {
                    status: 408,
                    error: "Request timed out"
                };
            }
            else {
                throw {
                    status: 500,
                    error: `(Internal server error) - ${(e && e.message) ? e.message : e}`
                };
            }
        }
    });
    try {
        const results = await Promise.all(scrapePromises);
        docs.push(...results.filter(doc => doc !== null).map(x => x));
    }
    catch (e) {
        return res.status(e.status).json({
            success: false,
            error: e.error
        });
    }
    const completions = await (0, llmExtract_1.generateOpenAICompletions)(logger_1.logger.child({ method: "extractController/generateOpenAICompletions" }), {
        mode: "llm",
        systemPrompt: "Always prioritize using the provided content to answer the question. Do not make up an answer. Be concise and follow the schema if provided.",
        prompt: req.body.prompt,
        schema: req.body.schema,
    }, docs.map(x => (0, build_document_1.buildDocument)(x)).join('\n'), undefined, true // isExtractEndpoint
    );
    // TODO: change this later
    // While on beta, we're billing 5 credits per link discovered/scraped.
    (0, credit_billing_1.billTeam)(req.auth.team_id, req.acuc?.sub_id, links.length * 5).catch(error => {
        logger_1.logger.error(`Failed to bill team ${req.auth.team_id} for ${links.length * 5} credits: ${error}`);
    });
    let data = completions.extract ?? {};
    let warning = completions.warning;
    (0, log_job_1.logJob)({
        job_id: id,
        success: true,
        message: "Extract completed",
        num_docs: 1,
        docs: data,
        time_taken: (new Date().getTime() - Date.now()) / 1000,
        team_id: req.auth.team_id,
        mode: "extract",
        url: req.body.urls.join(", "),
        scrapeOptions: req.body,
        origin: req.body.origin ?? "api",
        num_tokens: completions.numTokens ?? 0
    });
    return res.status(200).json({
        success: true,
        data: data,
        scrape_id: id,
        warning: warning
    });
}
exports.extractController = extractController;
/**
 * Filters links based on their similarity score to the search query.
 * @param mappedLinks - The list of mapped links to filter.
 * @param linksAndScores - The list of links and their similarity scores.
 * @param threshold - The score threshold to filter by.
 * @returns The filtered list of links.
 */
function filterAndProcessLinks(mappedLinks, linksAndScores, threshold) {
    return linksAndScores
        .filter(x => x.score > threshold)
        .map(x => mappedLinks.find(link => link.url === x.link))
        .filter((x) => x !== undefined && x.url !== undefined && !(0, blocklist_1.isUrlBlocked)(x.url));
}
//# sourceMappingURL=extract.js.map