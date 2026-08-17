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
let first: TempDir;
let second: TempDir;
let server: RunningServer;

const api = (path: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${server.port}/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-keel-token": server.token,
      ...(init.headers ?? {}),
    },
  });

const workspaceApi = (workspaceId: string, path: string, init: RequestInit = {}) =>
  api(`/w/${workspaceId}${path}`, init);

beforeAll(async () => {
  mock = await startMockOpenAIServer({ models: ["mock-1"] });
  home = makeTempKeelHome({ baseUrl: mock.baseUrl, models: ["mock-1"] });
  first = makeTempProject({ git: true, files: { "README.md": "first\n" } });
  second = makeTempProject({ git: true, files: { "README.md": "second\n" } });
  server = await startServer({
    cwd: first.path,
    homeDir: home.path,
    port: 0,
    idleMs: 0,
    headless: true,
  });
});

afterAll(async () => {
  await server?.close();
  await mock?.close();
  first?.cleanup();
  second?.cleanup();
  home?.cleanup();
});

describe("多工作区验收", () => {
  it("两个工作区的项目、会话和 WS 事件彼此隔离", async () => {
    const firstWorkspaceId = server.workspaceId;
    if (!firstWorkspaceId) throw new Error("启动项目工作区后应有 workspaceId");

    const added = (await (
      await api("/workspaces", {
        method: "POST",
        body: JSON.stringify({ path: second.path, name: "第二项目" }),
      })
    ).json()) as { id: string; name: string; loaded: boolean };
    expect(added.name).toBe("第二项目");
    expect(added.loaded).toBe(false);

    const firstProject = (await (await workspaceApi(firstWorkspaceId, "/project")).json()) as {
      cwd: string;
    };
    const secondProject = (await (await workspaceApi(added.id, "/project")).json()) as {
      cwd: string;
    };
    expect(firstProject.cwd).toBe(first.path);
    expect(secondProject.cwd).toBe(second.path);

    const firstSessions = (await (
      await workspaceApi(firstWorkspaceId, "/sessions?ensureMain=1")
    ).json()) as { meta: { id: string; title: string } }[];
    const secondSessions = (await (
      await workspaceApi(added.id, "/sessions?ensureMain=1")
    ).json()) as { meta: { id: string; title: string } }[];
    const firstMain = firstSessions.find((session) => session.meta.title === "主对话");
    const secondMain = secondSessions.find((session) => session.meta.title === "主对话");
    if (!firstMain || !secondMain) throw new Error("两个工作区都应有主对话");
    expect(firstMain.meta.id).not.toBe(secondMain.meta.id);

    const firstOnly = (await (await workspaceApi(firstWorkspaceId, "/sessions")).json()) as {
      meta: { id: string };
    }[];
    const secondOnly = (await (await workspaceApi(added.id, "/sessions")).json()) as {
      meta: { id: string }[];
    };
    expect(firstOnly.map((session) => session.meta.id)).not.toContain(secondMain.meta.id);
    expect(secondOnly.map((session) => session.meta.id)).not.toContain(firstMain.meta.id);

    const received: {
      type: string;
      workspaceId?: string;
      sessionId?: string;
      event?: { type: string };
    }[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${server.token}`);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      ws.on("message", (data) => {
        received.push(JSON.parse(String(data)) as (typeof received)[number]);
      });
      ws.send(
        JSON.stringify({
          type: "subscribe",
          workspaceId: firstWorkspaceId,
          sessionId: firstMain.meta.id,
        }),
      );
      ws.send(
        JSON.stringify({ type: "subscribe", workspaceId: added.id, sessionId: secondMain.meta.id }),
      );

      mock.enqueue({ text: "来自第一项目" }, { text: "来自第二项目" });
      expect(
        (
          await workspaceApi(firstWorkspaceId, `/sessions/${firstMain.meta.id}/prompt`, {
            method: "POST",
            body: JSON.stringify({ text: "第一项目消息" }),
          })
        ).status,
      ).toBe(202);
      await waitFor(
        () =>
          received.some(
            (message) =>
              message.type === "event" &&
              message.workspaceId === firstWorkspaceId &&
              message.sessionId === firstMain.meta.id &&
              message.event?.type === "idle",
          ),
        10_000,
      );

      expect(
        (
          await workspaceApi(added.id, `/sessions/${secondMain.meta.id}/prompt`, {
            method: "POST",
            body: JSON.stringify({ text: "第二项目消息" }),
          })
        ).status,
      ).toBe(202);
      await waitFor(
        () =>
          received.some(
            (message) =>
              message.type === "event" &&
              message.workspaceId === added.id &&
              message.sessionId === secondMain.meta.id &&
              message.event?.type === "idle",
          ),
        10_000,
      );

      const firstEvents = received.filter((message) => message.sessionId === firstMain.meta.id);
      const secondEvents = received.filter((message) => message.sessionId === secondMain.meta.id);
      expect(firstEvents.length).toBeGreaterThan(0);
      expect(secondEvents.length).toBeGreaterThan(0);
      expect(firstEvents.every((message) => message.workspaceId === server.workspaceId)).toBe(true);
      expect(secondEvents.every((message) => message.workspaceId === added.id)).toBe(true);
    } finally {
      ws.close();
    }
  });
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待多工作区事件超时");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
