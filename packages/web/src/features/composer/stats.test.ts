import { describe, expect, it } from "vitest";
import type { EngineMessage } from "../../api/types";
import { formatTok, runStatsOf } from "./stats";

const usage = (input: number, output: number, cacheRead: number) => ({
  input,
  output,
  cacheRead,
  cacheWrite: 0,
  totalTokens: input + output,
  costTotal: 0,
});

describe("runStatsOf", () => {
  it("累计轮次、工具步、token 与缓存命中", () => {
    const messages = [
      { role: "user", content: "a", timestamp: 1 },
      {
        role: "assistant",
        content: [],
        provider: "m",
        model: "m",
        usage: usage(100, 40, 400),
        stopReason: "stop",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "t",
        toolName: "read",
        content: [],
        isError: false,
        timestamp: 3,
      },
      { role: "user", content: "b", timestamp: 4 },
    ] as EngineMessage[];
    const s = runStatsOf(messages);
    expect(s.rounds).toBe(2);
    expect(s.steps).toBe(1);
    expect(s.input).toBe(100);
    expect(s.output).toBe(40);
    expect(s.cacheRead).toBe(400);
    expect(s.cacheHit).toBe(80);
  });
});

describe("formatTok", () => {
  it("缩写", () => {
    expect(formatTok(800)).toBe("800");
    expect(formatTok(1100)).toBe("1.1K");
  });
});
