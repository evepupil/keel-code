import { describe, expect, it } from "vitest";
import type { EngineMessage } from "../api/types";
import { applyEngineEvent, emptyChat } from "./apply-event";

const assistant = (text: string, ts = 1): EngineMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "mock",
  model: "m",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0 },
  stopReason: "stop",
  timestamp: ts,
});

describe("applyEngineEvent", () => {
  it("流式：start → update 替换 → end 定稿", () => {
    let c = applyEngineEvent(emptyChat(), { type: "agent_start" });
    expect(c.streaming).toBe(true);
    c = applyEngineEvent(c, { type: "message_start", message: assistant("") });
    c = applyEngineEvent(c, {
      type: "message_update",
      message: assistant("你"),
      delta: { kind: "text", text: "你", contentIndex: 0 },
    });
    c = applyEngineEvent(c, {
      type: "message_update",
      message: assistant("你好"),
      delta: { kind: "text", text: "好", contentIndex: 0 },
    });
    expect(c.messages).toHaveLength(1);
    c = applyEngineEvent(c, { type: "message_end", message: assistant("你好！") });
    expect(c.messages).toHaveLength(1);
    expect(c.streamingIndex).toBeNull();
    const m = c.messages[0];
    expect(m?.role === "assistant" && m.content[0]?.type === "text" && m.content[0].text).toBe(
      "你好！",
    );
    c = applyEngineEvent(c, { type: "idle" });
    expect(c.streaming).toBe(false);
    expect(c.needsResync).toBe(true);
  });

  it("工具结果消息按 message_end 追加，且不重复", () => {
    const tr: EngineMessage = {
      role: "toolResult",
      toolCallId: "c1",
      toolName: "read",
      content: [{ type: "text", text: "ok" }],
      isError: false,
      timestamp: 5,
    };
    let c = applyEngineEvent(emptyChat(), { type: "message_start", message: tr });
    c = applyEngineEvent(c, { type: "message_end", message: tr });
    expect(c.messages).toHaveLength(1);
  });

  it("工具执行中的状态随 start / end 增删", () => {
    let c = applyEngineEvent(emptyChat(), {
      type: "tool_execution_start",
      toolCallId: "c1",
      toolName: "bash",
      args: {},
    });
    expect(Object.keys(c.activeTools)).toEqual(["c1"]);
    c = applyEngineEvent(c, {
      type: "tool_execution_end",
      toolCallId: "c1",
      toolName: "bash",
      result: {},
      isError: false,
    });
    expect(Object.keys(c.activeTools)).toEqual([]);
  });
});
