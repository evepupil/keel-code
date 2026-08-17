/**
 * 闭环端到端（mock 模型）：
 * 无 review 提交被拒 → 实现 → 上报 → reviewer 第 1 轮 fail → 修复 → 上报 → 第 2 轮 pass → 提交放行 → 提交后 credit 刷新。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createEngine, type Engine, type EngineSession } from "@keel-code/engine";
import { registerGuards } from "@keel-code/guards";
import { assembleSystemPrompt } from "@keel-code/methodology";
import {
  type ConversationGateway,
  RosterStore,
  registerRosterTools,
  SubagentRunner,
} from "@keel-code/roster";
import {
  type MockOpenAIServer,
  makeTempKeelHome,
  makeTempProject,
  type RecordedRequest,
  startMockOpenAIServer,
  type TempDir,
} from "@keel-code/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readReviewState, reviewStatePath, writeReviewState } from "./credit/state.js";
import { treeHash } from "./credit/tree-hash.js";
import { decisionsPath } from "./decisions/file.js";
import {
  REVIEW_ENTRY,
  type ReviewEntryData,
  registerBatchReportTool,
} from "./report/orchestrator.js";

let mock: MockOpenAIServer;
let home: TempDir;
let project: TempDir;
let engine: Engine;
let gateway: ConversationGateway;
let stateFile: string;

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
      return e.sessions.create({
        kind: input.kind,
        title: input.title,
        systemPrompt,
        ...(input.role ? { role: input.role } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.extra ? { extra: input.extra } : {}),
        ...(input.tools ? { tools: input.tools } : {}),
      });
    },
    liveState: (id) => {
      const live = e.sessions.live(id);
      return live ? { isStreaming: live.getState().isStreaming } : undefined;
    },
  };
}

function text(req: RecordedRequest, role: string): string {
  return req.messages
    .filter((m) => (m as { role?: string }).role === role)
    .map((m) => {
      const c = (m as { content?: unknown }).content;
      return typeof c === "string" ? c : JSON.stringify(c ?? "");
    })
    .join("\n");
}

beforeAll(async () => {
  mock = await startMockOpenAIServer({ models: ["mock-1", "mock-strong"] });
  home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1", "mock-strong"] });
  project = makeTempProject({
    git: true,
    files: { "README.md": "# demo\n", "src/styles/tokens.ts": "export const t = 1;\n" },
  });
  engine = await createEngine({ cwd: project.path, homeDir: home.path });
  gateway = makeGateway(engine);
  stateFile = reviewStatePath(engine.paths.projectSessionsDir);
  const store = new RosterStore({ cwd: project.path, gateway });
  const runner = new SubagentRunner({ engine, gateway, defaultTimeoutMs: 20_000 });
  registerRosterTools({ engine, gateway, store, runner });
  registerBatchReportTool({
    engine,
    gateway,
    runner,
    reviewStateFile: stateFile,
    options: { maxRounds: 3 },
  });
  registerGuards({ engine, reviewStateFile: stateFile, projectGateTimeoutMs: 60_000 });
});

afterAll(async () => {
  await engine?.dispose();
  await mock?.close();
  home?.cleanup();
  project?.cleanup();
});

function toolResults(session: EngineSession) {
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

describe("闭环：修复-通过-提交链 + 跳过 review 被拒", () => {
  it("完整走一遍", async () => {
    mock.onRequest((req) => {
      const sys = text(req, "system");
      const users = text(req, "user");
      const isReviewer = sys.includes("你是一次性子 agent") && users.includes("独立 reviewer");
      const lastRole = (req.messages.at(-1) as { role?: string })?.role;
      if (isReviewer) {
        if (lastRole === "tool") return { text: "已提交结论。" };
        const round1 = users.includes("第 1 轮");
        return {
          toolCalls: [
            {
              name: "submit_result",
              arguments: round1
                ? {
                    verdict: "fail",
                    summary: "有一处硬编码",
                    findings: [
                      {
                        issue: "src/hello.ts 里颜色硬编码 #ff0000",
                        category: "deterministic",
                        file: "src/hello.ts",
                        suggestion: "改成从 tokens 取",
                      },
                    ],
                  }
                : { verdict: "pass", summary: "问题已修复，结构清晰", findings: [] },
            },
          ],
        };
      }
      if (!sys.includes("实现对话")) return { text: "ok" };
      const toolMsgs = req.messages.filter((m) => (m as { role?: string }).role === "tool").length;
      switch (toolMsgs) {
        case 0:
          return {
            toolCalls: [
              {
                name: "write",
                arguments: { path: "src/hello.ts", content: "export const color = '#ff0000';\n" },
              },
            ],
          };
        case 1:
          return {
            toolCalls: [
              { name: "bash", arguments: { command: "git add -A && git commit -q -m nothing" } },
            ],
          };
        case 2:
          return {
            toolCalls: [
              {
                name: "keel_batch_report",
                arguments: { batch: "hello 模块", scope: "src/hello.ts" },
              },
            ],
          };
        case 3:
          return {
            toolCalls: [
              {
                name: "write",
                arguments: {
                  path: "src/hello.ts",
                  content: "import { t } from './styles/tokens';\nexport const color = t;\n",
                },
              },
            ],
          };
        case 4:
          return {
            toolCalls: [
              {
                name: "keel_batch_report",
                arguments: { batch: "hello 模块（修复后）", scope: "src/hello.ts" },
              },
            ],
          };
        case 5:
          return {
            toolCalls: [
              {
                name: "bash",
                arguments: { command: "git add -A && git commit -q -m 'hello 模块'" },
              },
            ],
          };
        default:
          return { text: "已提交，向用户输出验收简述。" };
      }
    });

    const impl = await gateway.create({
      kind: "conversation",
      title: "hello 开发",
      role: "实现对话：负责 hello 模块",
    });
    await impl.prompt("实现 hello 模块");
    await impl.waitForIdle();

    const results = toolResults(impl);
    expect(results.map((r) => r.toolName)).toEqual([
      "write",
      "bash",
      "keel_batch_report",
      "write",
      "keel_batch_report",
      "bash",
    ]);
    // 1：改了代码但没 review 就提交 → 被拒
    expect(results[1]?.isError).toBe(true);
    expect(results[1]?.text).toContain("没有 review 通过记录");
    // 2：第 1 轮 fail → 修复指令
    expect(results[2]?.text).toContain("review 未通过（第 1/3 轮");
    expect(results[2]?.text).toContain("硬编码");
    // 4：第 2 轮 pass → review-pass
    expect(results[4]?.text).toContain("review 通过（第 2 轮");
    expect(results[4]?.text).toContain("验收简述");
    // 5：提交放行
    expect(results[5]?.isError).toBe(false);
    const log = execFileSync("git", ["log", "--oneline"], { cwd: project.path, encoding: "utf8" });
    expect(log).toContain("hello 模块");
    // review 状态：pass 记录 + 提交后树指纹刷新为当前树
    const state = readReviewState(stateFile);
    expect(state.roundsSincePass).toBe(0);
    expect(state.lastPass?.tree).toBe(await treeHash(project.path));
    // keel/review 条目：fix + pass 两条
    const entries = impl.getEntries(REVIEW_ENTRY).map((e) => e.data as ReviewEntryData);
    expect(entries.map((e) => e.action)).toEqual(["fix", "pass"]);
    expect(entries[1]?.treeHash).toBeDefined();
    // reviewer 用了与实现者不同的模型（反相位）
    expect(entries[0]?.reviewerModel?.id).toBe("mock-strong");
    // reviewer 子会话挂在实现对话下且只读
    const subs = (await engine.sessions.list()).filter((r) => r.meta.kind === "subagent");
    expect(subs.length).toBe(2);
    expect(subs.every((s) => s.meta.parentId === impl.id)).toBe(true);
    // 没有待决策
    expect(existsSync(decisionsPath(project.path))).toBe(false);
  });

  it("待决策：只有 decision 的结论挂起并落档", async () => {
    mock.onRequest((req) => {
      const sys = text(req, "system");
      const users = text(req, "user");
      const isReviewer = sys.includes("你是一次性子 agent") && users.includes("独立 reviewer");
      const lastRole = (req.messages.at(-1) as { role?: string })?.role;
      if (isReviewer) {
        if (lastRole === "tool") return { text: "done" };
        return {
          toolCalls: [
            {
              name: "submit_result",
              arguments: {
                verdict: "fail",
                findings: [
                  {
                    issue: "登录要不要支持匿名？需求没写",
                    category: "decision",
                    suggestion: "A 支持 / B 不支持",
                  },
                ],
              },
            },
          ],
        };
      }
      if (!sys.includes("实现对话")) return { text: "ok" };
      const toolMsgs = req.messages.filter((m) => (m as { role?: string }).role === "tool").length;
      if (toolMsgs === 0)
        return { toolCalls: [{ name: "keel_batch_report", arguments: { batch: "登录页" } }] };
      return { text: "已转述待决策。" };
    });
    const impl = await gateway.create({
      kind: "conversation",
      title: "登录开发",
      role: "实现对话：负责登录",
    });
    await impl.prompt("实现登录");
    await impl.waitForIdle();
    const r = toolResults(impl)[0];
    expect(r?.text).toContain("需要用户拍板");
    expect(readFileSync(decisionsPath(project.path), "utf8")).toContain(
      "[待决策] 登录要不要支持匿名",
    );
    const entries = impl.getEntries(REVIEW_ENTRY).map((e) => e.data as ReviewEntryData);
    expect(entries.at(-1)?.action).toBe("suspend");
  });

  it("连续三轮确定性问题：fix → fix → escalate", async () => {
    writeReviewState(stateFile, { roundsSincePass: 0, lastPass: null });
    mock.onRequest((req) => {
      const toolNames = (req.tools ?? []).map(
        (tool) => (tool as { function?: { name?: string } }).function?.name,
      );
      const lastRole = (req.messages.at(-1) as { role?: string })?.role;
      if (toolNames.includes("submit_result")) {
        if (lastRole === "tool") return { text: "review submitted" };
        return {
          toolCalls: [
            {
              name: "submit_result",
              arguments: {
                verdict: "fail",
                summary: "same deterministic issue remains",
                findings: [
                  {
                    issue: "deterministic issue remains",
                    category: "deterministic",
                    file: "src/a.ts",
                    suggestion: "apply the required fix",
                  },
                ],
              },
            },
          ],
        };
      }
      if (!toolNames.includes("keel_batch_report")) return { text: "background complete" };
      const reportCount = req.messages.filter(
        (m) => (m as { role?: string }).role === "tool",
      ).length;
      if (reportCount < 3) {
        return {
          toolCalls: [
            {
              name: "keel_batch_report",
              arguments: { batch: `escalation round ${reportCount + 1}`, scope: "src/a.ts" },
            },
          ],
        };
      }
      return { text: "escalation reported" };
    });

    const impl = await gateway.create({
      kind: "conversation",
      title: "three round escalation",
      role: "implementation conversation",
      model: { provider: "mock", id: "mock-1" },
    });
    await impl.prompt("run three review rounds");
    await impl.waitForIdle();

    const reports = toolResults(impl).filter((r) => r.toolName === "keel_batch_report");
    expect(reports).toHaveLength(3);
    expect(reports[0]?.text).toContain("1/3");
    expect(reports[1]?.text).toContain("2/3");
    expect(reports[2]?.text).toContain("3");
    const entries = impl.getEntries(REVIEW_ENTRY).map((e) => e.data as ReviewEntryData);
    expect(entries.map((e) => e.action)).toEqual(["fix", "fix", "escalate"]);
    expect(readReviewState(stateFile)).toMatchObject({ roundsSincePass: 3, lastPass: null });
    expect(readFileSync(decisionsPath(project.path), "utf8")).toContain("review");
  });
});
