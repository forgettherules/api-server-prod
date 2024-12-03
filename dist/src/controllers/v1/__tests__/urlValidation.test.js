"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../types");
describe("URL Schema Validation", () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });
    it("should prepend http:// to URLs without a protocol", () => {
        const result = types_1.url.parse("example.com");
        expect(result).toBe("http://example.com");
    });
    it("should allow valid URLs with http or https", () => {
        expect(() => types_1.url.parse("http://example.com")).not.toThrow();
        expect(() => types_1.url.parse("https://example.com")).not.toThrow();
    });
    it("should allow valid URLs with http or https", () => {
        expect(() => types_1.url.parse("example.com")).not.toThrow();
    });
    it("should reject URLs with unsupported protocols", () => {
        expect(() => types_1.url.parse("ftp://example.com")).toThrow("Invalid URL");
    });
    it("should reject URLs without a valid top-level domain", () => {
        expect(() => types_1.url.parse("http://example")).toThrow("URL must have a valid top-level domain or be a valid path");
    });
    it("should reject blocked URLs", () => {
        expect(() => types_1.url.parse("https://facebook.com")).toThrow("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
    });
    it("should handle URLs with subdomains correctly", () => {
        expect(() => types_1.url.parse("http://sub.example.com")).not.toThrow();
        expect(() => types_1.url.parse("https://blog.example.com")).not.toThrow();
    });
    it("should handle URLs with paths correctly", () => {
        expect(() => types_1.url.parse("http://example.com/path")).not.toThrow();
        expect(() => types_1.url.parse("https://example.com/another/path")).not.toThrow();
    });
    it("should handle URLs with subdomains that are blocked", () => {
        expect(() => types_1.url.parse("https://sub.facebook.com")).toThrow("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
    });
    it("should handle URLs with paths that are blocked", () => {
        expect(() => types_1.url.parse("http://facebook.com/path")).toThrow("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
        expect(() => types_1.url.parse("https://facebook.com/another/path")).toThrow("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
    });
    it("should reject malformed URLs starting with 'http://http'", () => {
        expect(() => types_1.url.parse("http://http://example.com")).toThrow("Invalid URL. Invalid protocol.");
    });
    it("should reject malformed URLs containing multiple 'http://'", () => {
        expect(() => types_1.url.parse("http://example.com/http://example.com")).not.toThrow();
    });
    it("should reject malformed URLs containing multiple 'http://'", () => {
        expect(() => types_1.url.parse("http://ex ample.com/")).toThrow("Invalid URL");
    });
});
//# sourceMappingURL=urlValidation.test.js.map