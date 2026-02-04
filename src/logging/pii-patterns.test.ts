import { describe, expect, it } from "vitest";
import {
  DEFAULT_PII_ENTITIES,
  PII_ENTITY_KEYS,
  detectPiiInText,
  getPiiPatternsForEntities,
  redactPiiInText,
} from "./pii-patterns.js";

describe("pii-patterns", () => {
  describe("PII_ENTITY_KEYS", () => {
    it("includes expected entity keys", () => {
      expect(PII_ENTITY_KEYS).toContain("credit_card");
      expect(PII_ENTITY_KEYS).toContain("ssn");
      expect(PII_ENTITY_KEYS).toContain("email");
      expect(PII_ENTITY_KEYS).toContain("phone_number");
    });
  });

  describe("getPiiPatternsForEntities", () => {
    it("returns patterns for valid entity keys", () => {
      const patterns = getPiiPatternsForEntities(["ssn", "email"]);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("returns empty for empty input", () => {
      expect(getPiiPatternsForEntities([])).toEqual([]);
    });

    it("ignores unknown entity keys", () => {
      const patterns = getPiiPatternsForEntities(["ssn", "unknown_key", "email"]);
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe("detectPiiInText", () => {
    it("detects SSN with dashes", () => {
      const detected = detectPiiInText("My SSN is 123-45-6789.", ["ssn"]);
      expect(detected).toContain("ssn");
    });

    it("detects email", () => {
      const detected = detectPiiInText("Contact me at user@example.com", ["email"]);
      expect(detected).toContain("email");
    });

    it("detects credit card pattern", () => {
      const detected = detectPiiInText("Card: 4111 1111 1111 1111", ["credit_card"]);
      expect(detected).toContain("credit_card");
    });

    it("returns empty for benign text", () => {
      const detected = detectPiiInText(
        "Hi, can you help me schedule a meeting for tomorrow?",
        DEFAULT_PII_ENTITIES,
      );
      expect(detected).toEqual([]);
    });

    it("returns empty for empty text or entities", () => {
      expect(detectPiiInText("", ["ssn"])).toEqual([]);
      expect(detectPiiInText("123-45-6789", [])).toEqual([]);
    });
  });

  describe("redactPiiInText", () => {
    it("replaces SSN with placeholder", () => {
      const out = redactPiiInText("My SSN is 123-45-6789.", ["ssn"]);
      expect(out).not.toContain("123-45-6789");
      expect(out).toContain("[REDACTED]");
    });

    it("replaces email with placeholder", () => {
      const out = redactPiiInText("Contact user@example.com for help.", ["email"]);
      expect(out).not.toContain("user@example.com");
      expect(out).toContain("[REDACTED]");
    });

    it("replaces credit card with placeholder", () => {
      const out = redactPiiInText("Card 4111-1111-1111-1111", ["credit_card"]);
      expect(out).not.toContain("4111");
      expect(out).toContain("[REDACTED]");
    });

    it("leaves benign text unchanged", () => {
      const text = "Hi, can you help me schedule a meeting?";
      const out = redactPiiInText(text, DEFAULT_PII_ENTITIES);
      expect(out).toBe(text);
    });

    it("returns text unchanged for empty entities", () => {
      const text = "SSN: 123-45-6789";
      expect(redactPiiInText(text, [])).toBe(text);
    });

    it("returns text unchanged for empty text", () => {
      expect(redactPiiInText("", ["ssn"])).toBe("");
    });
  });
});
