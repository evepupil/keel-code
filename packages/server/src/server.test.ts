/**
 * 服务端集成：mock 模型 + 真 HTTP/WS。覆盖鉴权、provider 路由、会话创建 / 发消息 / 事件推送 / 恢复。
 */
import {
  type MockOpenAIServer,
  makeTempKeelHome,
  makeTempProject,
  startMockOpenAIServer,
  type TempDir,
} from "@keel-code/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { type RunningServer, startServer } from "./serve.js";

let mock: MockOpenAIServer;
let home: TempDir;
let project: TempDir;
let server: RunningServer;

/** 全局路由 */
const gapi = (path: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${server.port}/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-keel-token": server.token,
      ...(init.headers ?? {}),
    },
  });
/** 工作区级路由（/api/w/<wid>/…） */
const api = (path: string, init: RequestInit = {}) => gapi(`/w/${server.workspaceId}${path}`, init);

beforeAll(async () => {
  mock = await startMockOpenAIServer({ models: ["mock-1"] });
  home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1"] });
  project = makeTempProject();
  server = await startServer({ cwd: project.path, homeDir: home.path, port: 0, idleMs: 0 });
});

afterAll(async () => {
  await server?.close();
  await mock?.close();
  home?.cleanup();
  project?.cleanup();
});

describe("鉴权与基础路由", () => {
  it("没令牌 401，有令牌 200", async () => {
    const r1 = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    expect(r1.status).toBe(401);
    const r2 = await gapi("/health");
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("providers / models / probe", async () => {
    const providers = (await (await gapi("/providers")).json()) as {
      id: string;
      configured: boolean;
    }[];
    expect(providers.find((p) => p.id === "mock")?.configured).toBe(true);
    const models = (await (await gapi("/models?available=1")).json()) as { id: string }[];
    expect(models.map((m) => m.id)).toContain("mock-1");
    const probe = (await (await gapi("/providers/probe?providers=mock")).json()) as {
      provider: string;
      reachable: boolean;
    }[];
    expect(probe[0]?.reachable).toBe(true);
  });
});

describe("会话", () => {
  it("ensureMain 自动建主对话；创建 / 发消息 / WS 事件 / 读取", async () => {
    const list = (await (await api("/sessions?ensureMain=1")).json()) as {
      meta: { id: string; kind: string; title: string };
    }[];
    const main = list.find((r) => r.meta.kind === "main");
    expect(main?.meta.title).toBe("主对话");

    // 参数校验
    expect((await api("/sessions", { method: "POST", body: JSON.stringify({}) })).status).toBe(400);

    const created = (await (
      await api("/sessions", {
        method: "POST",
        body: JSON.stringify({
          kind: "conversation",
          title: "前端对话",
          role: "负责整个前端",
          model: { provider: "mock", id: "mock-1" },
        }),
      })
    ).json()) as { meta: { id: string; role?: string } };
    expect(created.meta.role).toBe("负责整个前端");
    const id = created.meta.id;

    // WS 订阅
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${server.token}`);
    const received: { type: string; sessionId?: string; event?: { type: string } }[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });
    ws.on("message", (data) => {
      received.push(JSON.parse(String(data)) as (typeof received)[number]);
    });
    ws.send(JSON.stringify({ type: "subscribe", workspaceId: server.workspaceId, sessionId: id }));

    mock.enqueue({ text: "你好，前端对话在此" });
    const promptRes = await api(`/sessions/${id}/prompt`, {
      method: "POST",
      body: JSON.stringify({ text: "自我介绍" }),
    });
    expect(promptRes.status).toBe(202);

    // 等 idle 事件
    await waitFor(
      () => received.some((m) => m.type === "event" && m.event?.type === "idle"),
      10_000,
    );
    expect(received.some((m) => m.event?.type === "message_update")).toBe(true);
    ws.close();

    const detail = (await (await api(`/sessions/${id}`)).json()) as {
      messages: { role: string }[];
      state: { isStreaming: boolean };
    };
    expect(detail.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(detail.state.isStreaming).toBe(false);

    // 系统提示带职责段
    const sys = mock.requests
      .at(-1)
      ?.messages.find((m) => (m as { role: string }).role === "system") as
      | { content: string }
      | undefined;
    expect(sys?.content).toContain("负责整个前端");
    expect(sys?.content).toContain("keel-code 方法论");

    // PATCH 改标题
    const patched = (await (
      await api(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title: "前端" }) })
    ).json()) as { meta: { title: string } };
    expect(patched.meta.title).toBe("前端");

    // 未知会话 404
    expect((await api("/sessions/nope")).status).toBe(404);
  });

  it("名册路由与设置；主对话拿到对话工具", async () => {
    const roster = (await (await api("/roster")).json()) as {
      id: string;
      kind: string;
      freshness: { level: string };
      costUsd: number;
    }[];
    expect(roster.length).toBeGreaterThanOrEqual(2);
    expect(roster.every((e) => typeof e.freshness.level === "string")).toBe(true);

    const patched = (await (
      await gapi("/settings", {
        method: "PATCH",
        body: JSON.stringify({ modelLocks: { reviewer: { provider: "mock", id: "mock-1" } } }),
      })
    ).json()) as { modelLocks?: Record<string, { id: string }> };
    expect(patched.modelLocks?.reviewer?.id).toBe("mock-1");
    const settings = (await (await gapi("/settings")).json()) as {
      modelLocks?: Record<string, unknown>;
    };
    expect(settings.modelLocks?.reviewer).toBeDefined();

    const list = (await (await api("/sessions")).json()) as {
      meta: { id: string; kind: string };
    }[];
    const main = list.find((r) => r.meta.kind === "main");
    if (!main) throw new Error("没有主对话");
    mock.enqueue({ text: "主对话在此" });
    await api(`/sessions/${main.meta.id}/prompt`, {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
    });
    await waitFor(
      () =>
        mock.requests.some((r) =>
          JSON.stringify(r.tools ?? []).includes("keel_conversation_create"),
        ),
      10_000,
    );
    const req = mock.requests.find((r) =>
      JSON.stringify(r.tools ?? []).includes("keel_conversation_create"),
    );
    const names = (req?.tools ?? []).map(
      (t) => (t as { function?: { name?: string } }).function?.name,
    );
    expect(names).toContain("keel_providers_probe");
    expect(names).toContain("keel_agent_run");
    expect(names).not.toContain("keel_report_to_main");
  });

  it("文档 API：写（限 docs/）→ 批注 → 读；看板聚合", async () => {
    const forbidden = await api("/docs/write", {
      method: "PUT",
      body: JSON.stringify({ path: "src/evil.md", content: "x" }),
    });
    expect(forbidden.status).toBe(400);
    const w = await api("/docs/write", {
      method: "PUT",
      body: JSON.stringify({
        path: "docs/模块设计/登录.md",
        content: ["# 登录", "", "## 职责", "", "邮箱密码登录。", ""].join("\n"),
      }),
    });
    expect(w.status).toBe(200);
    const a = (await (
      await api("/docs/annotate", {
        method: "POST",
        body: JSON.stringify({ path: "docs/模块设计/登录.md", line: 4, text: "还要手机号" }),
      })
    ).json()) as { annotations: { text: string; anchor: string }[] };
    expect(a.annotations[0]).toMatchObject({ text: "还要手机号", anchor: "邮箱密码登录。" });
    const read = (await (await api("/docs/read?path=docs/模块设计/登录.md&diff=1")).json()) as {
      content: string;
      annotations: unknown[];
      freeze: unknown;
    };
    expect(read.content).toContain("[!批注]");
    expect(read.annotations).toHaveLength(1);
    expect(read.freeze).toBeNull();
    const list = (await (await api("/docs")).json()) as { path: string }[];
    expect(list.map((d) => d.path)).toContain("docs/模块设计/登录.md");

    await api("/docs/write", {
      method: "PUT",
      body: JSON.stringify({
        path: "docs/roadmap.md",
        content: [
          "# R",
          "",
          "## 目标",
          "",
          "做事。",
          "",
          "| 里程碑 | 目标 | 状态 | 依赖 | 模块文档 | 退出标准 |",
          "|---|---|---|---|---|---|",
          "| M0 | 初始化 | 已完成 | 无 | [登录](模块设计/登录.md) | ok |",
          "",
        ].join("\n"),
      }),
    });
    const board = (await (await api("/board")).json()) as {
      roadmap: { milestones: { id: string }[] } | null;
      decisions: unknown[];
      roster: unknown[];
      review: { lastPass: unknown };
    };
    expect(board.roadmap?.milestones[0]?.id).toBe("M0");
    expect(board.decisions).toEqual([]);
    expect(board.roster.length).toBeGreaterThan(0);
    expect(board.review.lastPass).toBeNull();
  });

  it("工作区：列表 / 加入 / 懒加载 / 未知 404 / 移除", async () => {
    const list = (await (await gapi("/workspaces")).json()) as {
      id: string;
      path: string;
      loaded: boolean;
      isProject: boolean;
    }[];
    expect(list.find((w) => w.id === server.workspaceId)?.loaded).toBe(true);
    // 加入第二个工作区（临时目录，不是项目）
    const other = makeTempProject();
    try {
      const added = (await (
        await gapi("/workspaces", { method: "POST", body: JSON.stringify({ path: other.path }) })
      ).json()) as { id: string; loaded: boolean };
      expect(added.loaded).toBe(false);
      // 第一次访问工作区级路由才加载
      const proj = (await (await gapi(`/w/${added.id}/project`)).json()) as { cwd: string };
      expect(proj.cwd).toBe(other.path);
      const again = (await (await gapi("/workspaces")).json()) as { id: string; loaded: boolean }[];
      expect(again.find((w) => w.id === added.id)?.loaded).toBe(true);
      expect((await gapi("/w/nope/sessions")).status).toBe(404);
      expect((await gapi("/workspaces", { method: "POST", body: "{}" })).status).toBe(400);
      expect((await gapi(`/workspaces/${added.id}`, { method: "DELETE" })).status).toBe(200);
      expect((await gapi(`/w/${added.id}/project`)).status).toBe(404);
    } finally {
      other.cleanup();
    }
  });

  it("WS 令牌错误被拒", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=wrong`);
    const code = await new Promise<number>((resolve) => {
      ws.on("close", (c) => resolve(c));
      ws.on("error", () => resolve(-1));
    });
    expect(code).toBe(4401);
  });
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时");
    await new Promise((r) => setTimeout(r, 25));
  }
}
