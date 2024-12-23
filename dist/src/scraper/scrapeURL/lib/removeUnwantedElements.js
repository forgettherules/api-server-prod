"use strict";
// TODO: refactor
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeUnwantedElements = void 0;
const cheerio_1 = require("cheerio");
const excludeNonMainTags = [
    "header",
    "footer",
    "nav",
    "aside",
    ".header",
    ".top",
    ".navbar",
    "#header",
    ".footer",
    ".bottom",
    "#footer",
    ".sidebar",
    ".side",
    ".aside",
    "#sidebar",
    ".modal",
    ".popup",
    "#modal",
    ".overlay",
    ".ad",
    ".ads",
    ".advert",
    "#ad",
    ".lang-selector",
    ".language",
    "#language-selector",
    ".social",
    ".social-media",
    ".social-links",
    "#social",
    ".menu",
    ".navigation",
    "#nav",
    ".breadcrumbs",
    "#breadcrumbs",
    "#search-form",
    ".search",
    "#search",
    ".share",
    "#share",
    ".widget",
    "#widget",
    ".cookie",
    "#cookie"
];
const removeUnwantedElements = (html, scrapeOptions) => {
    const soup = (0, cheerio_1.load)(html);
    if (scrapeOptions.includeTags && scrapeOptions.includeTags.filter(x => x.trim().length !== 0).length > 0) {
        // Create a new root element to hold the tags to keep
        const newRoot = (0, cheerio_1.load)("<div></div>")("div");
        scrapeOptions.includeTags.forEach((tag) => {
            soup(tag).each((_, element) => {
                newRoot.append(soup(element).clone());
            });
        });
        return newRoot.html() ?? "";
    }
    soup("script, style, noscript, meta, head").remove();
    if (scrapeOptions.excludeTags && scrapeOptions.excludeTags.filter(x => x.trim().length !== 0).length > 0) {
        scrapeOptions.excludeTags.forEach((tag) => {
            let elementsToRemove;
            if (tag.startsWith("*") && tag.endsWith("*")) {
                let classMatch = false;
                const regexPattern = new RegExp(tag.slice(1, -1), "i");
                elementsToRemove = soup("*").filter((i, element) => {
                    if (element.type === "tag") {
                        const attributes = element.attribs;
                        const tagNameMatches = regexPattern.test(element.name);
                        const attributesMatch = Object.keys(attributes).some((attr) => regexPattern.test(`${attr}="${attributes[attr]}"`));
                        if (tag.startsWith("*.")) {
                            classMatch = Object.keys(attributes).some((attr) => regexPattern.test(`class="${attributes[attr]}"`));
                        }
                        return tagNameMatches || attributesMatch || classMatch;
                    }
                    return false;
                });
            }
            else {
                elementsToRemove = soup(tag);
            }
            elementsToRemove.remove();
        });
    }
    if (scrapeOptions.onlyMainContent) {
        excludeNonMainTags.forEach((tag) => {
            const elementsToRemove = soup(tag);
            elementsToRemove.remove();
        });
    }
    const cleanedHtml = soup.html();
    return cleanedHtml;
};
exports.removeUnwantedElements = removeUnwantedElements;
//# sourceMappingURL=removeUnwantedElements.js.map