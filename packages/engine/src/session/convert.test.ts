import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { convertMessage, convertUsage } from "./convert.js";

describe("convertMessage", () => {
  it("assistant：保留文本 / 思考 / 工具调用，换算 usage", () => {
    const raw = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "hi" },
        { type: "toolCall", id: "c1", name: "write", arguments: { path: "a" } },
      ],
      api: "openai-completions",
      provider: "mock",
      model: "mock-1",
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
      },
      stopReason: "toolUse",
      timestamp: 123,
    } as unknown as AgentMessage;
    const m = convertMessage(raw);
    expect(m?.role).toBe("assistant");
    if (m?.role !== "assistant") throw new Error("类型不对");
    expect(m.content.map((p) => p.type)).toEqual(["thinking", "text", "toolCall"]);
    expect(m.usage.costTotal).toBeCloseTo(0.3);
    expect(m.stopReason).toBe("toolUse");
  });

  it("toolResult 与 user", () => {
    const tr = convertMessage({
      role: "toolResult",
      toolCallId: "c1",
      toolName: "write",
      content: [{ type: "text", text: "ok" }],
      isError: false,
      timestamp: 1,
    } as unknown as AgentMessage);
    expect(tr).toMatchObject({ role: "toolResult", toolName: "write", isError: false });
    const u = convertMessage({ role: "user", content: "hello", timestamp: 1 } as AgentMessage);
    expect(u).toEqual({ role: "user", content: "hello", timestamp: 1 });
  });

  it("未知角色返回 undefined", () => {
    expect(convertMessage({ role: "bashExecution" } as unknown as AgentMessage)).toBeUndefined();
  });

  it("convertUsage 容忍缺字段", () => {
    expect(convertUsage(undefined).totalTokens).toBe(0);
    expect(convertUsage({ input: 3 }).input).toBe(3);
  });
});
