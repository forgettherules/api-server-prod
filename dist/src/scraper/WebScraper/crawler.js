"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebCrawler = void 0;
const axios_1 = __importStar(require("axios"));
const cheerio_1 = require("cheerio");
const url_1 = require("url");
const sitemap_1 = require("./sitemap");
const robots_parser_1 = __importDefault(require("robots-parser"));
const maxDepthUtils_1 = require("./utils/maxDepthUtils");
const timeout_1 = require("../../../src/lib/timeout");
const logger_1 = require("../../../src/lib/logger");
const https_1 = __importDefault(require("https"));
class WebCrawler {
    jobId;
    initialUrl;
    baseUrl;
    includes;
    excludes;
    maxCrawledLinks;
    maxCrawledDepth;
    visited = new Set();
    crawledUrls = new Map();
    limit;
    robotsTxtUrl;
    robots;
    generateImgAltText;
    allowBackwardCrawling;
    allowExternalContentLinks;
    allowSubdomains;
    ignoreRobotsTxt;
    constructor({ jobId, initialUrl, baseUrl, includes, excludes, maxCrawledLinks = 10000, limit = 10000, generateImgAltText = false, maxCrawledDepth = 10, allowBackwardCrawling = false, allowExternalContentLinks = false, allowSubdomains = false, ignoreRobotsTxt = false, }) {
        this.jobId = jobId;
        this.initialUrl = initialUrl;
        this.baseUrl = baseUrl ?? new url_1.URL(initialUrl).origin;
        this.includes = Array.isArray(includes) ? includes : [];
        this.excludes = Array.isArray(excludes) ? excludes : [];
        this.limit = limit;
        this.robotsTxtUrl = `${this.baseUrl}/robots.txt`;
        this.robots = (0, robots_parser_1.default)(this.robotsTxtUrl, "");
        // Deprecated, use limit instead
        this.maxCrawledLinks = maxCrawledLinks ?? limit;
        this.maxCrawledDepth = maxCrawledDepth ?? 10;
        this.generateImgAltText = generateImgAltText ?? false;
        this.allowBackwardCrawling = allowBackwardCrawling ?? false;
        this.allowExternalContentLinks = allowExternalContentLinks ?? false;
        this.allowSubdomains = allowSubdomains ?? false;
        this.ignoreRobotsTxt = ignoreRobotsTxt ?? false;
    }
    filterLinks(sitemapLinks, limit, maxDepth, fromMap = false) {
        // If the initial URL is a sitemap.xml, skip filtering
        if (this.initialUrl.endsWith('sitemap.xml') && fromMap) {
            return sitemapLinks.slice(0, limit);
        }
        return sitemapLinks
            .filter((link) => {
            let url;
            try {
                url = new url_1.URL(link.trim(), this.baseUrl);
            }
            catch (error) {
                logger_1.logger.debug(`Error processing link: ${link} | Error: ${error.message}`);
                return false;
            }
            const path = url.pathname;
            const depth = (0, maxDepthUtils_1.getURLDepth)(url.toString());
            // Check if the link exceeds the maximum depth allowed
            if (depth > maxDepth) {
                return false;
            }
            // Check if the link should be excluded
            if (this.excludes.length > 0 && this.excludes[0] !== "") {
                if (this.excludes.some((excludePattern) => new RegExp(excludePattern).test(path))) {
                    return false;
                }
            }
            // Check if the link matches the include patterns, if any are specified
            if (this.includes.length > 0 && this.includes[0] !== "") {
                if (!this.includes.some((includePattern) => new RegExp(includePattern).test(path))) {
                    return false;
                }
            }
            // Normalize the initial URL and the link to account for www and non-www versions
            const normalizedInitialUrl = new url_1.URL(this.initialUrl);
            let normalizedLink;
            try {
                normalizedLink = new url_1.URL(link);
            }
            catch (_) {
                return false;
            }
            const initialHostname = normalizedInitialUrl.hostname.replace(/^www\./, '');
            const linkHostname = normalizedLink.hostname.replace(/^www\./, '');
            // Ensure the protocol and hostname match, and the path starts with the initial URL's path
            // commented to able to handling external link on allowExternalContentLinks
            // if (linkHostname !== initialHostname) {
            //   return false;
            // }
            if (!this.allowBackwardCrawling) {
                if (!normalizedLink.pathname.startsWith(normalizedInitialUrl.pathname)) {
                    return false;
                }
            }
            const isAllowed = this.ignoreRobotsTxt ? true : (this.robots.isAllowed(link, "FireCrawlAgent") ?? true);
            // Check if the link is disallowed by robots.txt
            if (!isAllowed) {
                logger_1.logger.debug(`Link disallowed by robots.txt: ${link}`);
                return false;
            }
            if (this.isFile(link)) {
                return false;
            }
            return true;
        })
            .slice(0, limit);
    }
    async getRobotsTxt(skipTlsVerification = false) {
        let extraArgs = {};
        if (skipTlsVerification) {
            extraArgs["httpsAgent"] = new https_1.default.Agent({
                rejectUnauthorized: false
            });
        }
        const response = await axios_1.default.get(this.robotsTxtUrl, { timeout: timeout_1.axiosTimeout, ...extraArgs });
        return response.data;
    }
    importRobotsTxt(txt) {
        this.robots = (0, robots_parser_1.default)(this.robotsTxtUrl, txt);
    }
    async tryGetSitemap(fromMap = false, onlySitemap = false) {
        logger_1.logger.debug(`Fetching sitemap links from ${this.initialUrl}`);
        const sitemapLinks = await this.tryFetchSitemapLinks(this.initialUrl);
        if (fromMap && onlySitemap) {
            return sitemapLinks.map(link => ({ url: link, html: "" }));
        }
        if (sitemapLinks.length > 0) {
            let filteredLinks = this.filterLinks(sitemapLinks, this.limit, this.maxCrawledDepth, fromMap);
            return filteredLinks.map(link => ({ url: link, html: "" }));
        }
        return null;
    }
    filterURL(href, url) {
        let fullUrl = href;
        if (!href.startsWith("http")) {
            try {
                fullUrl = new url_1.URL(href, url).toString();
            }
            catch (_) {
                return null;
            }
        }
        let urlObj;
        try {
            urlObj = new url_1.URL(fullUrl);
        }
        catch (_) {
            return null;
        }
        const path = urlObj.pathname;
        if (this.isInternalLink(fullUrl)) { // INTERNAL LINKS
            if (this.isInternalLink(fullUrl) &&
                this.noSections(fullUrl) &&
                !this.matchesExcludes(path) &&
                this.isRobotsAllowed(fullUrl, this.ignoreRobotsTxt)) {
                return fullUrl;
            }
        }
        else { // EXTERNAL LINKS
            if (this.isInternalLink(url) &&
                this.allowExternalContentLinks &&
                !this.isSocialMediaOrEmail(fullUrl) &&
                !this.matchesExcludes(fullUrl, true) &&
                !this.isExternalMainPage(fullUrl)) {
                return fullUrl;
            }
        }
        if (this.allowSubdomains && !this.isSocialMediaOrEmail(fullUrl) && this.isSubdomain(fullUrl)) {
            return fullUrl;
        }
        return null;
    }
    extractLinksFromHTML(html, url) {
        let links = [];
        const $ = (0, cheerio_1.load)(html);
        $("a").each((_, element) => {
            let href = $(element).attr("href");
            if (href) {
                if (href.match(/^https?:\/[^\/]/)) {
                    href = href.replace(/^https?:\//, "$&/");
                }
                const u = this.filterURL(href, url);
                if (u !== null) {
                    links.push(u);
                }
            }
        });
        // Extract links from iframes with inline src
        $("iframe").each((_, element) => {
            const src = $(element).attr("src");
            if (src && src.startsWith("data:text/html")) {
                const iframeHtml = decodeURIComponent(src.split(",")[1]);
                const iframeLinks = this.extractLinksFromHTML(iframeHtml, url);
                links = links.concat(iframeLinks);
            }
        });
        return links;
    }
    isRobotsAllowed(url, ignoreRobotsTxt = false) {
        return (ignoreRobotsTxt ? true : (this.robots ? (this.robots.isAllowed(url, "FireCrawlAgent") ?? true) : true));
    }
    matchesExcludes(url, onlyDomains = false) {
        return this.excludes.some((pattern) => {
            if (onlyDomains)
                return this.matchesExcludesExternalDomains(url);
            return this.excludes.some((pattern) => new RegExp(pattern).test(url));
        });
    }
    // supported formats: "example.com/blog", "https://example.com", "blog.example.com", "example.com"
    matchesExcludesExternalDomains(url) {
        try {
            const urlObj = new url_1.URL(url);
            const hostname = urlObj.hostname;
            const pathname = urlObj.pathname;
            for (let domain of this.excludes) {
                let domainObj = new url_1.URL('http://' + domain.replace(/^https?:\/\//, ''));
                let domainHostname = domainObj.hostname;
                let domainPathname = domainObj.pathname;
                if (hostname === domainHostname || hostname.endsWith(`.${domainHostname}`)) {
                    if (pathname.startsWith(domainPathname)) {
                        return true;
                    }
                }
            }
            return false;
        }
        catch (e) {
            return false;
        }
    }
    isExternalMainPage(url) {
        return !Boolean(url.split("/").slice(3).filter(subArray => subArray.length > 0).length);
    }
    noSections(link) {
        return !link.includes("#");
    }
    isInternalLink(link) {
        const urlObj = new url_1.URL(link, this.baseUrl);
        const baseDomain = this.baseUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").trim();
        const linkDomain = urlObj.hostname.replace(/^www\./, "").trim();
        return linkDomain === baseDomain;
    }
    isSubdomain(link) {
        return new url_1.URL(link, this.baseUrl).hostname.endsWith("." + new url_1.URL(this.baseUrl).hostname.split(".").slice(-2).join("."));
    }
    isFile(url) {
        const fileExtensions = [
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".css",
            ".js",
            ".ico",
            ".svg",
            ".tiff",
            // ".pdf", 
            ".zip",
            ".exe",
            ".dmg",
            ".mp4",
            ".mp3",
            ".pptx",
            // ".docx",
            ".xlsx",
            ".xml",
            ".avi",
            ".flv",
            ".woff",
            ".ttf",
            ".woff2",
            ".webp",
            ".inc"
        ];
        try {
            const urlWithoutQuery = url.split('?')[0].toLowerCase();
            return fileExtensions.some((ext) => urlWithoutQuery.endsWith(ext));
        }
        catch (error) {
            logger_1.logger.error(`Error processing URL in isFile: ${error}`);
            return false;
        }
    }
    isSocialMediaOrEmail(url) {
        const socialMediaOrEmail = [
            "facebook.com",
            "twitter.com",
            "linkedin.com",
            "instagram.com",
            "pinterest.com",
            "mailto:",
            "github.com",
            "calendly.com",
            "discord.gg",
            "discord.com",
        ];
        return socialMediaOrEmail.some((ext) => url.includes(ext));
    }
    async tryFetchSitemapLinks(url) {
        const normalizeUrl = (url) => {
            url = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
            if (url.endsWith("/")) {
                url = url.slice(0, -1);
            }
            return url;
        };
        const sitemapUrl = url.endsWith(".xml")
            ? url
            : `${url}/sitemap.xml`;
        let sitemapLinks = [];
        try {
            const response = await axios_1.default.get(sitemapUrl, { timeout: timeout_1.axiosTimeout });
            if (response.status === 200) {
                sitemapLinks = await (0, sitemap_1.getLinksFromSitemap)({ sitemapUrl });
            }
        }
        catch (error) {
            logger_1.logger.debug(`Failed to fetch sitemap with axios from ${sitemapUrl}: ${error}`);
            if (error instanceof axios_1.AxiosError && error.response?.status === 404) {
                // ignore 404
            }
            else {
                const response = await (0, sitemap_1.getLinksFromSitemap)({ sitemapUrl, mode: 'fire-engine' });
                if (response) {
                    sitemapLinks = response;
                }
            }
        }
        if (sitemapLinks.length === 0) {
            const baseUrlSitemap = `${this.baseUrl}/sitemap.xml`;
            try {
                const response = await axios_1.default.get(baseUrlSitemap, { timeout: timeout_1.axiosTimeout });
                if (response.status === 200) {
                    sitemapLinks = await (0, sitemap_1.getLinksFromSitemap)({ sitemapUrl: baseUrlSitemap, mode: 'fire-engine' });
                }
            }
            catch (error) {
                logger_1.logger.debug(`Failed to fetch sitemap from ${baseUrlSitemap}: ${error}`);
                if (error instanceof axios_1.AxiosError && error.response?.status === 404) {
                    // ignore 404
                }
                else {
                    sitemapLinks = await (0, sitemap_1.getLinksFromSitemap)({ sitemapUrl: baseUrlSitemap, mode: 'fire-engine' });
                }
            }
        }
        const normalizedUrl = normalizeUrl(url);
        const normalizedSitemapLinks = sitemapLinks.map(link => normalizeUrl(link));
        // has to be greater than 0 to avoid adding the initial URL to the sitemap links, and preventing crawler to crawl
        if (!normalizedSitemapLinks.includes(normalizedUrl) && sitemapLinks.length > 0) {
            sitemapLinks.push(url);
        }
        return sitemapLinks;
    }
}
exports.WebCrawler = WebCrawler;
//# sourceMappingURL=crawler.js.map