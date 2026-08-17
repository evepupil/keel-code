import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../types.js";
import { HookBus, scopeMatches } from "./bus.js";

const meta = (kind: SessionMeta["kind"], role?: string): SessionMeta => {
  const m: SessionMeta = {
    id: "s1",
    kind,
    title: "t",
    model: { provider: "mock", id: "mock-1" },
    thinkingLevel: "off",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  if (role) m.role = role;
  return m;
};

describe("scopeMatches", () => {
  it("无作用域 = 全部匹配", () => {
    expect(scopeMatches(undefined, meta("main"))).toBe(true);
  });
  it("按 kind 过滤", () => {
    expect(scopeMatches({ kinds: ["conversation"] }, meta("main"))).toBe(false);
    expect(scopeMatches({ kinds: ["conversation"] }, meta("conversation"))).toBe(true);
  });
  it("自定义谓词", () => {
    const scope = { match: (m: SessionMeta) => m.role === "前端开发" };
    expect(scopeMatches(scope, meta("conversation", "前端开发"))).toBe(true);
    expect(scopeMatches(scope, meta("conversation", "引擎开发"))).toBe(false);
  });
});

describe("HookBus.tool_call 单调拒绝", () => {
  const input = (kind: SessionMeta["kind"] = "conversation") => ({
    sessionId: "s1",
    meta: meta(kind),
    cwd: "/p",
    toolCallId: "c1",
    toolName: "write",
    input: { path: "a.ts" } as Record<string, unknown>,
  });

  it("任一守卫拒绝即拒绝，后续守卫不再执行", async () => {
    const bus = new HookBus();
    const calls: string[] = [];
    bus.onToolCall(() => {
      calls.push("g1");
      return { block: true, reason: "no" };
    });
    bus.onToolCall(() => {
      calls.push("g2");
      return { block: false };
    });
    const r = await bus.runToolCall(input());
    expect(r).toEqual({ block: true, reason: "no" });
    expect(calls).toEqual(["g1"]);
  });

  it("作用域外的守卫不生效", async () => {
    const bus = new HookBus();
    bus.onToolCall(() => ({ block: true, reason: "只拦 conversation" }), {
      kinds: ["conversation"],
    });
    expect((await bus.runToolCall(input("main"))).block).toBeUndefined();
    expect((await bus.runToolCall(input("conversation"))).block).toBe(true);
  });

  it("守卫可原地改写参数", async () => {
    const bus = new HookBus();
    bus.onToolCall((i) => {
      i.input.path = "b.ts";
      return undefined;
    });
    const i = input();
    await bus.runToolCall(i);
    expect(i.input.path).toBe("b.ts");
  });

  it("退订后不再生效", async () => {
    const bus = new HookBus();
    const off = bus.onToolCall(() => ({ block: true }));
    off();
    expect((await bus.runToolCall(input())).block).toBeUndefined();
  });
});

describe("HookBus.before_agent_start 链式改系统提示", () => {
  it("后一个钩子看到前一个的结果", async () => {
    const bus = new HookBus();
    bus.onBeforeAgentStart((i) => ({ systemPrompt: `${i.systemPrompt}\nA` }));
    bus.onBeforeAgentStart((i) => ({ systemPrompt: `${i.systemPrompt}\nB` }));
    const r = await bus.runBeforeAgentStart({
      sessionId: "s1",
      meta: meta("main"),
      cwd: "/p",
      prompt: "hi",
      systemPrompt: "base",
    });
    expect(r.systemPrompt).toBe("base\nA\nB");
  });
  it("没人改则返回空对象", async () => {
    const bus = new HookBus();
    const r = await bus.runBeforeAgentStart({
      sessionId: "s1",
      meta: meta("main"),
      cwd: "/p",
      prompt: "hi",
      systemPrompt: "base",
    });
    expect(r).toEqual({});
  });
});

describe("HookBus 工具注册", () => {
  const def = (name: string) => ({
    name,
    label: name,
    description: name,
    parameters: {} as never,
    execute: async () => "ok",
  });
  it("按作用域返回工具", () => {
    const bus = new HookBus();
    bus.registerTool(def("all"));
    bus.registerTool(def("main_only"), { kinds: ["main"] });
    expect(bus.toolsFor(meta("main")).map((t) => t.name)).toEqual(["all", "main_only"]);
    expect(bus.toolsFor(meta("conversation")).map((t) => t.name)).toEqual(["all"]);
  });
  it("重名报错", () => {
    const bus = new HookBus();
    bus.registerTool(def("x"));
    expect(() => bus.registerTool(def("x"))).toThrow(/重复/);
  });
});
