/**
 * 名册 / 对话工具 / 子 agent 端到端：mock 模型驱动主对话调用工具。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createEngine, type Engine, type EngineSession } from "@keel-code/engine";
import { assembleSystemPrompt } from "@keel-code/methodology";
import {
  type MockOpenAIServer,
  makeTempKeelHome,
  makeTempProject,
  startMockOpenAIServer,
  type TempDir,
} from "@keel-code/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RosterStore } from "./registry/store.js";
import { SubagentRunner } from "./subagents/run.js";
import { registerRosterTools } from "./tools/register.js";
import type { ConversationGateway } from "./types.js";

let mock: MockOpenAIServer;
let home: TempDir;
let project: TempDir;
let engine: Engine;
let gateway: ConversationGateway;
let store: RosterStore;

/** 测试用最小网关：直接用引擎（服务端里由 SessionHub 实现同样的接口）。 */
function makeGateway(e: Engine): ConversationGateway {
  return {
    list: () => e.sessions.list(),
    get: async (id) => e.sessions.live(id) ?? e.sessions.open(id),
    create: async (input) => {
      const systemPrompt =
        input.systemPrompt ??
        assembleSystemPrompt(
          input.role ? { kind: input.kind, role: input.role } : { kind: input.kind },
        );
      const s = await e.sessions.create({
        kind: input.kind,
        title: input.title,
        systemPrompt,
        ...(input.role ? { role: input.role } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.extra ? { extra: input.extra } : {}),
        ...(input.tools ? { tools: input.tools } : {}),
      });
      if (input.initialMessage) void s.prompt(input.initialMessage);
      return s;
    },
    liveState: (id) => {
      const live = e.sessions.live(id);
      return live ? { isStreaming: live.getState().isStreaming } : undefined;
    },
  };
}

beforeAll(async () => {
  mock = await startMockOpenAIServer({ models: ["mock-1", "mock-cheap"] });
  home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1", "mock-cheap"] });
  project = makeTempProject({ git: true, files: { "src/a.ts": "export const a = 1;\n" } });
  engine = await createEngine({ cwd: project.path, homeDir: home.path });
  gateway = makeGateway(engine);
  store = new RosterStore({ cwd: project.path, gateway });
  const runner = new SubagentRunner({ engine, gateway, defaultTimeoutMs: 20_000 });
  registerRosterTools({ engine, gateway, store, runner });
});

afterAll(async () => {
  await engine?.dispose();
  await mock?.close();
  home?.cleanup();
  project?.cleanup();
});

function toolResults(
  session: EngineSession,
): { toolName: string; text: string; isError: boolean }[] {
  return session
    .getMessages()
    .filter((m) => m.role === "toolResult")
    .map((m) =>
      m.role === "toolResult"
        ? {
            toolName: m.toolName,
            text: m.content.map((c) => (c.type === "text" ? c.text : "")).join(""),
            isError: m.isError,
          }
        : { toolName: "", text: "", isError: false },
    );
}

describe("主对话：探测 → 创建对话 → 名册 → 子 agent", () => {
  it("完整走一遍", async () => {
    // 主对话的脚本：探测 → 创建前端对话（选便宜模型）→ 列名册 → 派 clean 子 agent → 收尾
    mock.onRequest((req) => {
      const sys = String((req.messages[0] as { content?: string })?.content ?? "");
      const isMain = sys.includes("主对话职责");
      const isSub = sys.includes("你是一次性子 agent");
      const isConv = sys.includes("负责整个前端");
      const lastRole = (req.messages.at(-1) as { role?: string })?.role;
      if (isSub) return { text: "子 agent 结论：src/a.ts 导出常量 a。" };
      if (isConv) return { text: "前端对话已就位。" };
      if (!isMain) return { text: "ok" };
      const toolMsgs = req.messages.filter((m) => (m as { role?: string }).role === "tool").length;
      if (lastRole !== "tool") {
        return { toolCalls: [{ name: "keel_providers_probe", arguments: {} }] };
      }
      switch (toolMsgs) {
        case 1:
          return {
            toolCalls: [
              {
                name: "keel_conversation_create",
                arguments: {
                  title: "前端开发",
                  role: "负责整个前端（src/web/**），维护设计系统与页面",
                  model: { provider: "mock", id: "mock-cheap" },
                  contextScope: "前端",
                  codeRange: ["src/**"],
                  initialMessage: "先自我介绍",
                },
              },
            ],
          };
        case 2:
          return { toolCalls: [{ name: "keel_conversation_list", arguments: {} }] };
        case 3:
          return {
            toolCalls: [
              {
                name: "keel_agent_run",
                arguments: {
                  mode: "clean",
                  task: "读一下 src/a.ts 说说它导出了什么",
                  readOnly: true,
                },
              },
            ],
          };
        default:
          return { text: "调度完成。" };
      }
    });

    const main = await gateway.create({ kind: "main", title: "主对话" });
    await main.prompt("开始安排前端工作");
    await main.waitForIdle();

    const results = toolResults(main);
    expect(results.map((r) => r.toolName)).toEqual([
      "keel_providers_probe",
      "keel_conversation_create",
      "keel_conversation_list",
      "keel_agent_run",
    ]);
    // 探测：列出 mock 端点与模型档位
    expect(results[0]?.text).toContain("mock/mock-cheap");
    expect(results[0]?.text).toMatch(/档位/);
    // 创建：对话存在、职责与模型正确、名册投影已写
    expect(results[1]?.text).toContain("已创建对话「前端开发」");
    const list = await engine.sessions.list();
    const fe = list.find((r) => r.meta.title === "前端开发");
    expect(fe?.meta.kind).toBe("conversation");
    expect(fe?.meta.model.id).toBe("mock-cheap");
    expect(fe?.meta.role).toContain("负责整个前端");
    const agentsDir = join(project.path, ".keel", "agents");
    expect(existsSync(agentsDir)).toBe(true);
    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    expect(files.some((f) => f.startsWith("前端开发-"))).toBe(true);
    const md = readFileSync(
      join(agentsDir, files.find((f) => f.startsWith("前端开发-")) ?? ""),
      "utf8",
    );
    expect(md).toContain("| code-range | `src/**` |");
    expect(md).toMatch(/\| base-commit \| [0-9a-f]{40} \|/);
    // 名册：包含前端对话与新鲜度
    expect(results[2]?.text).toContain("「前端开发」");
    expect(results[2]?.text).toMatch(/新鲜度 新鲜/);
    // 子 agent：完成，会话挂在主对话下，只读工具集
    expect(results[3]?.text).toContain("子 agent 完成");
    expect(results[3]?.text).toContain("导出常量 a");
    const sub = (await engine.sessions.list()).find((r) => r.meta.kind === "subagent");
    expect(sub?.meta.parentId).toBe(main.id);
    expect(sub?.meta.extra?.subagentFinished).toBe("completed");
    // 子 agent 请求里只有只读工具 + 没有 keel_* 主对话工具
    const subReq = mock.requests.find((r) =>
      String((r.messages[0] as { content?: string })?.content ?? "").includes("你是一次性子 agent"),
    );
    const subToolNames = (subReq?.tools ?? []).map(
      (t) => (t as { function?: { name?: string } }).function?.name,
    );
    expect(subToolNames).toContain("read");
    expect(subToolNames).not.toContain("write");
    expect(subToolNames).not.toContain("keel_conversation_create");
    // 前端对话收到了 initialMessage 并回复
    const feSession = await gateway.get(fe?.meta.id ?? "");
    await feSession.waitForIdle();
    expect(feSession.getMessages().some((m) => m.role === "assistant")).toBe(true);
  });

  it("普通对话更新名册后，改动代码范围内文件 → 新鲜度变 code-changed", async () => {
    const list = await engine.sessions.list();
    const fe = list.find((r) => r.meta.title === "前端开发");
    if (!fe) throw new Error("前端对话不存在");
    await store.update(fe.meta.id, {
      currentUnderstanding: "设计系统已建好",
      recentWork: "建 token",
    });
    let entry = await store.entry(fe.meta.id);
    expect(entry?.freshness.level).toBe("fresh");
    expect(entry?.record.currentUnderstanding).toBe("设计系统已建好");
    // 动 code-range 内的文件（未提交改动也算）
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(project.path, "src", "a.ts"), "export const a = 2;\n");
    entry = await store.entry(fe.meta.id);
    expect(entry?.freshness.level).toBe("code-changed");
    expect(entry?.freshness.reasons.join()).toContain("代码范围内容已变化");
  });
});
