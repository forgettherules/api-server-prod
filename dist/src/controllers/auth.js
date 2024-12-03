"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supaAuthenticateUser = exports.authenticateUser = exports.clearACUC = exports.getACUC = exports.setCachedACUC = void 0;
const parseApi_1 = require("../lib/parseApi");
const rate_limiter_1 = require("../services/rate-limiter");
const types_1 = require("../types");
const supabase_1 = require("../services/supabase");
const withAuth_1 = require("../lib/withAuth");
const logger_1 = require("../lib/logger");
const redlock_1 = require("../services/redlock");
const redis_1 = require("../services/redis");
const redis_2 = require("../services/redis");
const uuid_1 = require("uuid");
// const { data, error } = await supabase_service
//     .from('api_keys')
//     .select(`
//       key,
//       team_id,
//       teams (
//         subscriptions (
//           price_id
//         )
//       )
//     `)
//     .eq('key', normalizedApi)
//     .limit(1)
//     .single();
function normalizedApiIsUuid(potentialUuid) {
    // Check if the string is a valid UUID
    return (0, uuid_1.validate)(potentialUuid);
}
async function setCachedACUC(api_key, acuc) {
    const cacheKeyACUC = `acuc_${api_key}`;
    const redLockKey = `lock_${cacheKeyACUC}`;
    try {
        await redlock_1.redlock.using([redLockKey], 10000, {}, async (signal) => {
            if (typeof acuc === "function") {
                acuc = acuc(JSON.parse(await (0, redis_1.getValue)(cacheKeyACUC) ?? "null"));
                if (acuc === null) {
                    if (signal.aborted) {
                        throw signal.error;
                    }
                    return;
                }
            }
            if (signal.aborted) {
                throw signal.error;
            }
            // Cache for 10 minutes. This means that changing subscription tier could have
            // a maximum of 10 minutes of a delay. - mogery
            await (0, redis_2.setValue)(cacheKeyACUC, JSON.stringify(acuc), 600, true);
        });
    }
    catch (error) {
        logger_1.logger.error(`Error updating cached ACUC ${cacheKeyACUC}: ${error}`);
    }
}
exports.setCachedACUC = setCachedACUC;
async function getACUC(api_key, cacheOnly = false, useCache = true) {
    const cacheKeyACUC = `acuc_${api_key}`;
    if (useCache) {
        const cachedACUC = await (0, redis_1.getValue)(cacheKeyACUC);
        if (cachedACUC !== null) {
            return JSON.parse(cachedACUC);
        }
    }
    if (!cacheOnly) {
        let data;
        let error;
        let retries = 0;
        const maxRetries = 5;
        while (retries < maxRetries) {
            ({ data, error } = await supabase_1.supabase_service.rpc("auth_credit_usage_chunk_test_21_credit_pack", { input_key: api_key }));
            if (!error) {
                break;
            }
            logger_1.logger.warn(`Failed to retrieve authentication and credit usage data after ${retries}, trying again...`);
            retries++;
            if (retries === maxRetries) {
                throw new Error("Failed to retrieve authentication and credit usage data after 3 attempts: " +
                    JSON.stringify(error));
            }
            // Wait for a short time before retrying
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const chunk = data.length === 0 ? null : data[0].team_id === null ? null : data[0];
        // NOTE: Should we cache null chunks? - mogery
        if (chunk !== null && useCache) {
            setCachedACUC(api_key, chunk);
        }
        // console.log(chunk);
        return chunk;
    }
    else {
        return null;
    }
}
exports.getACUC = getACUC;
async function clearACUC(api_key) {
    const cacheKeyACUC = `acuc_${api_key}`;
    await (0, redis_1.deleteKey)(cacheKeyACUC);
}
exports.clearACUC = clearACUC;
async function authenticateUser(req, res, mode) {
    return (0, withAuth_1.withAuth)(supaAuthenticateUser, { success: true, chunk: null, team_id: "bypass" })(req, res, mode);
}
exports.authenticateUser = authenticateUser;
async function supaAuthenticateUser(req, res, mode) {
    const authHeader = req.headers.authorization ??
        (req.headers["sec-websocket-protocol"]
            ? `Bearer ${req.headers["sec-websocket-protocol"]}`
            : null);
    if (!authHeader) {
        return { success: false, error: "Unauthorized", status: 401 };
    }
    const token = authHeader.split(" ")[1]; // Extract the token from "Bearer <token>"
    if (!token) {
        return {
            success: false,
            error: "Unauthorized: Token missing",
            status: 401,
        };
    }
    const incomingIP = (req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress);
    const iptoken = incomingIP + token;
    let rateLimiter;
    let subscriptionData = null;
    let normalizedApi;
    let teamId = null;
    let priceId = null;
    let chunk = null;
    if (token == "this_is_just_a_preview_token") {
        if (mode == types_1.RateLimiterMode.CrawlStatus) {
            rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.CrawlStatus, token);
        }
        else {
            rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.Preview, token);
        }
        teamId = "preview";
    }
    else {
        normalizedApi = (0, parseApi_1.parseApi)(token);
        if (!normalizedApiIsUuid(normalizedApi)) {
            return {
                success: false,
                error: "Unauthorized: Invalid token",
                status: 401,
            };
        }
        chunk = await getACUC(normalizedApi);
        if (chunk === null) {
            return {
                success: false,
                error: "Unauthorized: Invalid token",
                status: 401,
            };
        }
        teamId = chunk.team_id;
        priceId = chunk.price_id;
        const plan = getPlanByPriceId(priceId);
        subscriptionData = {
            team_id: teamId,
            plan,
        };
        switch (mode) {
            case types_1.RateLimiterMode.Crawl:
                rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.Crawl, token, subscriptionData.plan);
                break;
            case types_1.RateLimiterMode.Scrape:
                rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.Scrape, token, subscriptionData.plan, teamId);
                break;
            case types_1.RateLimiterMode.Search:
                rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.Search, token, subscriptionData.plan);
                break;
            case types_1.RateLimiterMode.Map:
                rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.Map, token, subscriptionData.plan);
                break;
            case types_1.RateLimiterMode.CrawlStatus:
                rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.CrawlStatus, token);
                break;
            case types_1.RateLimiterMode.Preview:
                rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.Preview, token);
                break;
            default:
                rateLimiter = (0, rate_limiter_1.getRateLimiter)(types_1.RateLimiterMode.Crawl, token);
                break;
            // case RateLimiterMode.Search:
            //   rateLimiter = await searchRateLimiter(RateLimiterMode.Search, token);
            //   break;
        }
    }
    const team_endpoint_token = token === "this_is_just_a_preview_token" ? iptoken : teamId;
    try {
        await rateLimiter.consume(team_endpoint_token);
    }
    catch (rateLimiterRes) {
        logger_1.logger.error(`Rate limit exceeded: ${rateLimiterRes}`);
        const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
        const retryDate = new Date(Date.now() + rateLimiterRes.msBeforeNext);
        // We can only send a rate limit email every 7 days, send notification already has the date in between checking
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        // await sendNotification(team_id, NotificationType.RATE_LIMIT_REACHED, startDate.toISOString(), endDate.toISOString());
        return {
            success: false,
            error: `Rate limit exceeded. Consumed (req/min): ${rateLimiterRes.consumedPoints}, Remaining (req/min): ${rateLimiterRes.remainingPoints}. Upgrade your plan at https://firecrawl.dev/pricing for increased rate limits or please retry after ${secs}s, resets at ${retryDate}`,
            status: 429,
        };
    }
    if (token === "this_is_just_a_preview_token" &&
        (mode === types_1.RateLimiterMode.Scrape ||
            mode === types_1.RateLimiterMode.Preview ||
            mode === types_1.RateLimiterMode.Map ||
            mode === types_1.RateLimiterMode.Crawl ||
            mode === types_1.RateLimiterMode.CrawlStatus ||
            mode === types_1.RateLimiterMode.Search)) {
        return { success: true, team_id: "preview", chunk: null };
        // check the origin of the request and make sure its from firecrawl.dev
        // const origin = req.headers.origin;
        // if (origin && origin.includes("firecrawl.dev")){
        //   return { success: true, team_id: "preview" };
        // }
        // if(process.env.ENV !== "production") {
        //   return { success: true, team_id: "preview" };
        // }
        // return { success: false, error: "Unauthorized: Invalid token", status: 401 };
    }
    return {
        success: true,
        team_id: teamId ?? undefined,
        plan: (subscriptionData?.plan ?? ""),
        chunk,
    };
}
exports.supaAuthenticateUser = supaAuthenticateUser;
function getPlanByPriceId(price_id) {
    switch (price_id) {
        case process.env.STRIPE_PRICE_ID_STARTER:
            return "starter";
        case process.env.STRIPE_PRICE_ID_STANDARD:
            return "standard";
        case process.env.STRIPE_PRICE_ID_SCALE:
            return "scale";
        case process.env.STRIPE_PRICE_ID_HOBBY:
        case process.env.STRIPE_PRICE_ID_HOBBY_YEARLY:
            return "hobby";
        case process.env.STRIPE_PRICE_ID_STANDARD_NEW:
        case process.env.STRIPE_PRICE_ID_STANDARD_NEW_YEARLY:
            return "standardnew";
        case process.env.STRIPE_PRICE_ID_GROWTH:
        case process.env.STRIPE_PRICE_ID_GROWTH_YEARLY:
        case process.env.STRIPE_PRICE_ID_SCALE_2M:
            return "growth";
        case process.env.STRIPE_PRICE_ID_GROWTH_DOUBLE_MONTHLY:
            return "growthdouble";
        case process.env.STRIPE_PRICE_ID_ETIER2C:
            return "etier2c";
        case process.env.STRIPE_PRICE_ID_ETIER1A_MONTHLY: //ocqh
            return "etier1a";
        default:
            return "free";
    }
}
//# sourceMappingURL=auth.js.map