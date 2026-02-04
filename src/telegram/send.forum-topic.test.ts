import { describe, expect, it } from "vitest";
import { resolveTelegramTopicColor, TELEGRAM_TOPIC_COLORS } from "./send.js";

describe("resolveTelegramTopicColor", () => {
  it("returns undefined for undefined", () => {
    expect(resolveTelegramTopicColor(undefined)).toBeUndefined();
  });

  it("passes through numeric values", () => {
    expect(resolveTelegramTopicColor(7322096)).toBe(7322096);
    expect(resolveTelegramTopicColor(16766590)).toBe(16766590);
  });

  it("resolves color names case-insensitively", () => {
    expect(resolveTelegramTopicColor("blue")).toBe(TELEGRAM_TOPIC_COLORS.blue);
    expect(resolveTelegramTopicColor("YELLOW")).toBe(TELEGRAM_TOPIC_COLORS.yellow);
    expect(resolveTelegramTopicColor("Purple")).toBe(TELEGRAM_TOPIC_COLORS.purple);
  });

  it("returns undefined for invalid color names", () => {
    expect(resolveTelegramTopicColor("orange")).toBeUndefined();
    expect(resolveTelegramTopicColor("")).toBeUndefined();
  });
});

describe("TELEGRAM_TOPIC_COLORS", () => {
  it("contains all 6 valid Telegram topic colors", () => {
    expect(Object.keys(TELEGRAM_TOPIC_COLORS)).toHaveLength(6);
    expect(TELEGRAM_TOPIC_COLORS.blue).toBe(7322096);
    expect(TELEGRAM_TOPIC_COLORS.yellow).toBe(16766590);
    expect(TELEGRAM_TOPIC_COLORS.purple).toBe(13338331);
    expect(TELEGRAM_TOPIC_COLORS.green).toBe(9367192);
    expect(TELEGRAM_TOPIC_COLORS.pink).toBe(16749490);
    expect(TELEGRAM_TOPIC_COLORS.red).toBe(16478047);
  });
});
