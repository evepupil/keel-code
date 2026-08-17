import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join, relative } from "node:path";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createEngineHost, type EngineHost } from "@keel-code/engine";
import { ModelSelector } from "@keel-code/roster";
import { WebSocketServer } from "ws";
import { buildApp } from "./app.js";
import type { KeelRuntime } from "./runtime.js";
import { WorkspaceManager } from "./workspaces/manager.js";
import { WorkspaceRegistry } from "./workspaces/registry.js";
import { clearWebState, type WebState, writeWebState } from "./workspaces/web-state.js";

export interface StartServerOptions {
  /** 启动时注册并打开的项目目录（可选；不给就只开工作台） */
  cwd?: string;
  homeDir?: string;
  /** 0 = 自动挑空闲端口 */
  port?: number;
  host?: string;
  token?: string;
  /** 已构建的 Web 工作台目录（含 index.html）；不给则只提供 API */
  staticDir?: string;
  version?: string;
  /** 复用已有宿主（测试用） */
  engineHost?: EngineHost;
  /** 工作区闲置多久释放，默认 30 分钟；0 = 不释放 */
  idleMs?: number;
  /** 无头：审批全部放行（测试用） */
  headless?: boolean;
  /** 写 ~/.keel/web.json 供 `keel web` 探活复用 */
  writeWebState?: boolean;
}

export interface RunningServer {
  /** 工作台入口（含令牌；注册了 cwd 时直达该工作区） */
  url: string;
  port: number;
  host: string;
  token: string;
  engineHost: EngineHost;
  manager: WorkspaceManager;
  /** options.cwd 对应的工作区 id */
  workspaceId?: string;
  /** 便捷：options.cwd 的运行时（已加载） */
  runtime?: KeelRuntime;
  close(): Promise<void>;
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const engineHost =
    options.engineHost ??
    (await createEngineHost(options.homeDir ? { homeDir: options.homeDir } : {}));
  const selector = new ModelSelector(engineHost);
  const registry = new WorkspaceRegistry(join(engineHost.home, "workspaces.json"));
  const manager = new WorkspaceManager({
    host: engineHost,
    registry,
    selector,
    ...(options.idleMs !== undefined ? { idleMs: options.idleMs } : {}),
    ...(options.headless ? { headless: true } : {}),
  });
  const token = options.token ?? randomBytes(16).toString("hex");
  const host = options.host ?? "127.0.0.1";
  const version = options.version ?? "0.0.0";

  const { app } = buildApp({
    host: engineHost,
    selector,
    manager,
    token,
    version,
    upgradeWebSocket,
  });

  if (options.staticDir && existsSync(join(options.staticDir, "index.html"))) {
    const root = relative(process.cwd(), options.staticDir) || ".";
    app.use("/*", serveStatic({ root }));
    const indexHtml = readFileSync(join(options.staticDir, "index.html"), "utf8");
    app.get("*", (c) => {
      if (c.req.path.startsWith("/api") || c.req.path === "/ws") return c.notFound();
      return c.html(indexHtml);
    });
  }

  const wss = new WebSocketServer({ noServer: true });
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve(
      {
        fetch: app.fetch,
        port: options.port ?? 0,
        hostname: host,
        websocket: { server: wss },
      },
      () => resolve(s),
    );
  });
  const port = (server.address() as AddressInfo).port;

  let workspaceId: string | undefined;
  let runtime: KeelRuntime | undefined;
  if (options.cwd) {
    workspaceId = manager.add(options.cwd).id;
    runtime = await manager.get(workspaceId);
  }
  const url = `http://${host}:${port}/?token=${token}${workspaceId ? `#/w/${workspaceId}` : ""}`;

  if (options.writeWebState) {
    const state: WebState = {
      port,
      host,
      token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    writeWebState(engineHost.home, state);
  }

  return {
    url,
    port,
    host,
    token,
    engineHost,
    manager,
    ...(workspaceId ? { workspaceId } : {}),
    ...(runtime ? { runtime } : {}),
    close: async () => {
      if (options.writeWebState) clearWebState(engineHost.home, process.pid);
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await manager.dispose();
      if (!options.engineHost) await engineHost.dispose();
    },
  };
}
