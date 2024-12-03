"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.v1Router = exports.wrap = exports.authMiddleware = void 0;
const express_1 = __importDefault(require("express"));
const crawl_1 = require("../controllers/v1/crawl");
// import { crawlStatusController } from "../../src/controllers/v1/crawl-status";
const scrape_1 = require("../../src/controllers/v1/scrape");
const crawl_status_1 = require("../controllers/v1/crawl-status");
const map_1 = require("../controllers/v1/map");
const types_1 = require("../types");
const auth_1 = require("../controllers/auth");
const create_1 = require("../services/idempotency/create");
const validate_1 = require("../services/idempotency/validate");
const credit_billing_1 = require("../services/billing/credit_billing");
const express_ws_1 = __importDefault(require("express-ws"));
const crawl_status_ws_1 = require("../controllers/v1/crawl-status-ws");
const blocklist_1 = require("../scraper/WebScraper/utils/blocklist");
const crawl_cancel_1 = require("../controllers/v1/crawl-cancel");
const logger_1 = require("../lib/logger");
const scrape_status_1 = require("../controllers/v1/scrape-status");
const concurrency_check_1 = require("../controllers/v1/concurrency-check");
const batch_scrape_1 = require("../controllers/v1/batch-scrape");
const extract_1 = require("../controllers/v1/extract");
// import { crawlPreviewController } from "../../src/controllers/v1/crawlPreview";
// import { crawlJobStatusPreviewController } from "../../src/controllers/v1/status";
// import { searchController } from "../../src/controllers/v1/search";
// import { crawlCancelController } from "../../src/controllers/v1/crawl-cancel";
// import { keyAuthController } from "../../src/controllers/v1/keyAuth";
// import { livenessController } from "../controllers/v1/liveness";
// import { readinessController } from "../controllers/v1/readiness";
function checkCreditsMiddleware(minimum) {
    return (req, res, next) => {
        (async () => {
            if (!minimum && req.body) {
                minimum = req.body?.limit ?? req.body?.urls?.length ?? 1;
            }
            const { success, remainingCredits, chunk } = await (0, credit_billing_1.checkTeamCredits)(req.acuc, req.auth.team_id, minimum ?? 1);
            if (chunk) {
                req.acuc = chunk;
            }
            if (!success) {
                logger_1.logger.error(`Insufficient credits: ${JSON.stringify({ team_id: req.auth.team_id, minimum, remainingCredits })}`);
                if (!res.headersSent) {
                    return res.status(402).json({ success: false, error: "Insufficient credits to perform this request. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing or try changing the request limit to a lower value." });
                }
            }
            req.account = { remainingCredits };
            next();
        })()
            .catch(err => next(err));
    };
}
function authMiddleware(rateLimiterMode) {
    return (req, res, next) => {
        (async () => {
            const auth = await (0, auth_1.authenticateUser)(req, res, rateLimiterMode);
            if (!auth.success) {
                if (!res.headersSent) {
                    return res.status(auth.status).json({ success: false, error: auth.error });
                }
                else {
                    return;
                }
            }
            const { team_id, plan, chunk } = auth;
            req.auth = { team_id, plan };
            req.acuc = chunk ?? undefined;
            if (chunk) {
                req.account = { remainingCredits: chunk.remaining_credits };
            }
            next();
        })()
            .catch(err => next(err));
    };
}
exports.authMiddleware = authMiddleware;
function idempotencyMiddleware(req, res, next) {
    (async () => {
        if (req.headers["x-idempotency-key"]) {
            const isIdempotencyValid = await (0, validate_1.validateIdempotencyKey)(req);
            if (!isIdempotencyValid) {
                if (!res.headersSent) {
                    return res.status(409).json({ success: false, error: "Idempotency key already used" });
                }
            }
            (0, create_1.createIdempotencyKey)(req);
        }
        next();
    })()
        .catch(err => next(err));
}
function blocklistMiddleware(req, res, next) {
    if (typeof req.body.url === "string" && (0, blocklist_1.isUrlBlocked)(req.body.url)) {
        if (!res.headersSent) {
            return res.status(403).json({ success: false, error: "URL is blocked intentionally. Firecrawl currently does not support social media scraping due to policy restrictions." });
        }
    }
    next();
}
function wrap(controller) {
    return (req, res, next) => {
        controller(req, res)
            .catch(err => next(err));
    };
}
exports.wrap = wrap;
(0, express_ws_1.default)((0, express_1.default)());
exports.v1Router = express_1.default.Router();
exports.v1Router.post("/scrape", authMiddleware(types_1.RateLimiterMode.Scrape), checkCreditsMiddleware(1), blocklistMiddleware, wrap(scrape_1.scrapeController));
exports.v1Router.post("/crawl", authMiddleware(types_1.RateLimiterMode.Crawl), checkCreditsMiddleware(), blocklistMiddleware, idempotencyMiddleware, wrap(crawl_1.crawlController));
exports.v1Router.post("/batch/scrape", authMiddleware(types_1.RateLimiterMode.Crawl), checkCreditsMiddleware(), blocklistMiddleware, idempotencyMiddleware, wrap(batch_scrape_1.batchScrapeController));
exports.v1Router.post("/map", authMiddleware(types_1.RateLimiterMode.Map), checkCreditsMiddleware(1), blocklistMiddleware, wrap(map_1.mapController));
exports.v1Router.get("/crawl/:jobId", authMiddleware(types_1.RateLimiterMode.CrawlStatus), wrap(crawl_status_1.crawlStatusController));
exports.v1Router.get("/batch/scrape/:jobId", authMiddleware(types_1.RateLimiterMode.CrawlStatus), 
// Yes, it uses the same controller as the normal crawl status controller
wrap((req, res) => (0, crawl_status_1.crawlStatusController)(req, res, true)));
exports.v1Router.get("/scrape/:jobId", wrap(scrape_status_1.scrapeStatusController));
exports.v1Router.get("/concurrency-check", authMiddleware(types_1.RateLimiterMode.CrawlStatus), wrap(concurrency_check_1.concurrencyCheckController));
exports.v1Router.ws("/crawl/:jobId", crawl_status_ws_1.crawlStatusWSController);
exports.v1Router.post("/extract", authMiddleware(types_1.RateLimiterMode.Scrape), checkCreditsMiddleware(1), wrap(extract_1.extractController));
// v1Router.post("/crawlWebsitePreview", crawlPreviewController);
exports.v1Router.delete("/crawl/:jobId", authMiddleware(types_1.RateLimiterMode.CrawlStatus), crawl_cancel_1.crawlCancelController);
// v1Router.get("/checkJobStatus/:jobId", crawlJobStatusPreviewController);
// // Auth route for key based authentication
// v1Router.get("/keyAuth", keyAuthController);
// // Search routes
// v0Router.post("/search", searchController);
// Health/Probe routes
// v1Router.get("/health/liveness", livenessController);
// v1Router.get("/health/readiness", readinessController);
//# sourceMappingURL=v1.js.map