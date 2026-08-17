import { describe, expect, it } from "vitest";
import { formatRelative, formatTokens } from "./format";

describe("formatTokens", () => {
  it("按量级缩写", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(800)).toBe("800");
    expect(formatTokens(1100)).toBe("1.1K");
    expect(formatTokens(19_800)).toBe("19.8K");
    expect(formatTokens(19_800_000)).toBe("19.8M");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-08-17T12:00:00.000Z");
  it("按间隔选单位", () => {
    expect(formatRelative("2026-08-17T11:59:40.000Z", now)).toBe("刚刚");
    expect(formatRelative("2026-08-17T11:50:00.000Z", now)).toBe("10分钟");
    expect(formatRelative("2026-08-17T09:00:00.000Z", now)).toBe("3小时");
    expect(formatRelative("2026-08-16T12:00:00.000Z", now)).toBe("1天");
    expect(formatRelative("2026-06-17T12:00:00.000Z", now)).toBe("2个月");
  });
});
