import { describe, expect, it } from "vitest";
import { computeFreshness, formatIdle } from "./freshness.js";

const NOW = Date.parse("2026-08-17T12:00:00.000Z");
const MIN = 60_000;

describe("computeFreshness", () => {
  it("缓存在 + 代码没变 = fresh", () => {
    const f = computeFreshness({
      record: { baseCommit: "abc", codeHash: "h1" },
      lastActiveAt: new Date(NOW - 2 * MIN).toISOString(),
      now: NOW,
      cacheTtlMs: 5 * MIN,
      currentCommit: "abc",
      currentCodeHash: "h1",
    });
    expect(f.level).toBe("fresh");
    expect(f.reasons).toEqual([]);
  });
  it("缓存过期但代码没变 = cache-expired", () => {
    const f = computeFreshness({
      record: { baseCommit: "abc", codeHash: "h1" },
      lastActiveAt: new Date(NOW - 30 * MIN).toISOString(),
      now: NOW,
      cacheTtlMs: 5 * MIN,
      currentCommit: "abc",
      currentCodeHash: "h1",
    });
    expect(f.level).toBe("cache-expired");
    expect(f.reasons[0]).toContain("30 分钟");
  });
  it("commit 变了 = code-changed；两者都变 = stale", () => {
    const changed = computeFreshness({
      record: { baseCommit: "abc", codeHash: "h1" },
      lastActiveAt: new Date(NOW - MIN).toISOString(),
      now: NOW,
      cacheTtlMs: 5 * MIN,
      currentCommit: "def",
      currentCodeHash: "h1",
    });
    expect(changed.level).toBe("code-changed");
    const stale = computeFreshness({
      record: { baseCommit: "abc", codeHash: "h1" },
      lastActiveAt: new Date(NOW - 60 * MIN).toISOString(),
      now: NOW,
      cacheTtlMs: 5 * MIN,
      currentCommit: "abc",
      currentCodeHash: "h2",
    });
    expect(stale.level).toBe("stale");
    expect(stale.codeChanged).toBe(true);
  });
  it("没有基准信息时不判代码变化", () => {
    const f = computeFreshness({
      record: {},
      lastActiveAt: new Date(NOW - MIN).toISOString(),
      now: NOW,
      cacheTtlMs: 5 * MIN,
      currentCommit: "zzz",
      currentCodeHash: "h9",
    });
    expect(f.level).toBe("fresh");
  });
});

describe("formatIdle", () => {
  it("分钟 / 小时 / 天", () => {
    expect(formatIdle(10_000)).toBe("不到 1 分钟");
    expect(formatIdle(7 * MIN)).toBe("7 分钟");
    expect(formatIdle(3 * 60 * MIN)).toBe("3 小时");
    expect(formatIdle(72 * 60 * MIN)).toBe("3 天");
  });
});
