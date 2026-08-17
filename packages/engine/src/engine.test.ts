/**
 * 引擎端到端：mock OpenAI 服务 + 临时 keel 目录 + 临时项目。
 * 验证：创建会话 → 自定义工具执行 → 守卫拦截 write → 文本收尾 → 持久化 → 重开恢复 → 端点探测。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type MockOpenAIServer,
  makeTempKeelHome,
  makeTempProject,
  startMockOpenAIServer,
  type TempDir,
} from "@keel-code/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEngine } from "./engine.js";
import { Type } from "./index.js";
import type { Engine, EngineEvent } from "./types.js";

let mock: MockOpenAIServer;
let home: TempDir;
let project: TempDir;
let engine: Engine;

beforeAll(async () => {
  mock = await startMockOpenAIServer({ models: ["mock-1", "mock-cheap"] });
  home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1", "mock-cheap"] });
  project = makeTempProject({ files: { "README.md": "# demo\n" } });
  engine = await createEngine({ cwd: project.path, homeDir: home.path });
});

afterAll(async () => {
  await engine?.dispose();
  await mock?.close();
  home?.cleanup();
  project?.cleanup();
});

describe("模型与端点", () => {
  it("models.json 里的 mock provider 可见且已配置", () => {
    const p = engine.models.providers().find((x) => x.id === "mock");
    expect(p?.configured).toBe(true);
    expect(engine.models.list("mock").map((m) => m.id)).toEqual(["mock-1", "mock-cheap"]);
    expect(engine.models.get({ provider: "mock", id: "mock-cheap" })?.cost.input).toBe(1);
  });

  it("probe：端点可达、列出模型、标记 listedByEndpoint", async () => {
    const probes = await engine.models.probe({ providers: ["mock"] });
    const p = probes.find((x) => x.provider === "mock");
    expect(p?.reachable).toBe(true);
    expect(p?.latencyMs).toBeGreaterThanOrEqual(0);
    const m1 = p?.models.find((m) => m.id === "mock-1");
    expect(m1?.listedByEndpoint).toBe(true);
    expect(m1?.catalogKnown).toBe(true);
  });
});

describe("提供方目录", () => {
  it("added 只列 models.json 里的；upsert / 拉远端 / 删除闭环", async () => {
    const home2 = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1"] });
    const project2 = makeTempProject({ files: { "README.md": "# x\n" } });
    const e = await createEngine({ cwd: project2.path, homeDir: home2.path });
    try {
      expect(e.models.added().map((p) => p.id)).toEqual(["mock"]);
      expect(e.models.unusedBuiltins().some((p) => p.id === "mock")).toBe(false);

      const created = await e.models.upsertProvider({
        id: "acme",
        kind: "custom",
        name: "Acme",
        baseUrl: mock.baseUrl,
        api: "openai-completions",
        apiKey: "k",
        models: [{ id: "acme-1", name: "Acme 1" }],
      });
      expect(created.kind).toBe("custom");
      expect(e.models.added().map((p) => p.id)).toEqual(expect.arrayContaining(["mock", "acme"]));
      expect(e.models.list("acme").map((m) => m.id)).toEqual(["acme-1"]);
      const auth = JSON.parse(readFileSync(join(home2.path, "auth.json"), "utf8")) as {
        acme?: { key?: string };
      };
      expect(auth.acme?.key).toBe("k");

      const remote = await e.models.fetchRemoteModels({
        baseUrl: mock.baseUrl,
        api: "openai-completions",
        apiKey: "k",
      });
      expect(remote.url).toContain("/models");
      expect(remote.models.map((m) => m.id)).toEqual(
        expect.arrayContaining(["mock-1", "mock-cheap"]),
      );

      await e.models.removeProvider("acme");
      expect(e.models.added().map((p) => p.id)).toEqual(["mock"]);
    } finally {
      await e.dispose();
      home2.cleanup();
      project2.cleanup();
    }
  });
});

describe("会话闭环", () => {
  it("创建 → 工具 → 守卫 → 收尾 → 持久化 → 重开", async () => {
    // 自定义工具：只对 main 会话可见
    engine.tools.register(
      {
        name: "keel_echo",
        label: "echo",
        description: "回显文本",
        parameters: Type.Object({ text: Type.String() }),
        execute: async (params) => `echo: ${(params as { text: string }).text}`,
      },
      { kinds: ["main"] },
    );
    // 守卫：禁止写 blocked.txt
    const guardSeen: string[] = [];
    engine.hooks.onToolCall((i) => {
      guardSeen.push(i.toolName);
      if (i.toolName === "write" && String(i.input.path).includes("blocked")) {
        return { block: true, reason: "keel 守卫：blocked.txt 禁止写入" };
      }
      return undefined;
    });

    mock.enqueue(
      { toolCalls: [{ name: "keel_echo", arguments: { text: "hi" } }] },
      { toolCalls: [{ name: "write", arguments: { path: "blocked.txt", content: "x" } }] },
      { toolCalls: [{ name: "write", arguments: { path: "ok.txt", content: "fine" } }] },
      { text: "全部完成" },
    );

    const session = await engine.sessions.create({
      kind: "main",
      title: "主对话",
      model: { provider: "mock", id: "mock-1" },
      systemPrompt: "你是 keel 测试用主对话。",
    });
    expect(session.meta.kind).toBe("main");
    const events: EngineEvent[] = [];
    session.subscribe((e) => events.push(e));

    await session.prompt("开始");
    await session.waitForIdle();

    const messages = session.getMessages();
    const toolResults = messages.filter((m) => m.role === "toolResult");
    expect(toolResults.map((m) => (m.role === "toolResult" ? m.toolName : ""))).toEqual([
      "keel_echo",
      "write",
      "write",
    ]);
    const echo = toolResults[0];
    expect(
      echo?.role === "toolResult" && echo.content[0]?.type === "text" && echo.content[0].text,
    ).toBe("echo: hi");
    const blocked = toolResults[1];
    expect(blocked?.role === "toolResult" && blocked.isError).toBe(true);
    expect(JSON.stringify(blocked)).toContain("blocked.txt 禁止写入");
    expect(existsSync(join(project.path, "blocked.txt"))).toBe(false);
    expect(readFileSync(join(project.path, "ok.txt"), "utf8")).toBe("fine");
    expect(guardSeen).toEqual(["keel_echo", "write", "write"]);

    const last = messages.at(-1);
    expect(last?.role).toBe("assistant");
    if (last?.role === "assistant") {
      expect(last.content.some((p) => p.type === "text" && p.text.includes("全部完成"))).toBe(true);
    }
    // 事件流里有文本增量与工具执行
    expect(events.some((e) => e.type === "message_update" && e.delta.kind === "text")).toBe(true);
    expect(events.filter((e) => e.type === "tool_execution_end").length).toBe(3);
    expect(events.at(-1)?.type).toBe("idle");

    // 系统提示进入了请求：mock 记录的第一条 system 消息包含我们的提示
    const firstReq = mock.requests[0];
    const sys = firstReq?.messages.find((m) => (m as { role?: string }).role === "system") as
      | { content?: string }
      | undefined;
    expect(String(sys?.content ?? "")).toContain("keel 测试用主对话");
    // 自定义工具在工具列表里
    expect(JSON.stringify(firstReq?.tools)).toContain("keel_echo");

    // 自定义条目持久化 + 索引
    session.appendEntry("keel/test", { hello: 1 });
    expect(session.getEntries("keel/test")[0]?.data).toEqual({ hello: 1 });
    session.updateMeta({ title: "改名" });
    const list = await engine.sessions.list();
    expect(list.find((r) => r.meta.id === session.id)?.meta.title).toBe("改名");
    expect(session.getState().usage.totalTokens).toBeGreaterThan(0);

    // 重开：新引擎实例从磁盘恢复
    const id = session.id;
    session.dispose();
    const engine2 = await createEngine({ cwd: project.path, homeDir: home.path });
    const reopened = await engine2.sessions.open(id);
    expect(reopened.meta.title).toBe("改名");
    expect(reopened.getMessages().length).toBe(messages.length);
    expect(reopened.getEntries("keel/test").length).toBe(1);
    await engine2.dispose();
  });

  it("没有该模型时创建报错", async () => {
    await expect(
      engine.sessions.create({
        kind: "conversation",
        title: "x",
        model: { provider: "mock", id: "nope" },
      }),
    ).rejects.toThrow(/未知模型/);
  });
});
