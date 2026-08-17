/**
 * HTTP 应用：
 *   全局：/api/health、/api/workspaces、/api/providers、/api/models、/api/settings、/api/models/tiers
 *   工作区级：/api/w/:wid/…（project / sessions / roster / docs / board / approvals / mcp），
 *   工作区运行时懒加载，每个工作区一个带 basePath 的子应用，按 wid 缓存。
 *   WebSocket：/ws 一条连接复用，订阅与推送都带 workspaceId。
 */
import { basename } from "node:path";
import type { EngineHost } from "@keel-code/engine";
import type { ModelSelector } from "@keel-code/roster";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { tokenAuth } from "./auth.js";
import { approvalRoutes } from "./routes/approvals.js";
import { boardRoutes } from "./routes/board.js";
import { docRoutes } from "./routes/docs.js";
import { providerRoutes } from "./routes/providers.js";
import { rosterRoutes } from "./routes/roster.js";
import { sessionRoutes } from "./routes/sessions.js";
import { settingsRoutes } from "./routes/settings.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import type { KeelRuntime } from "./runtime.js";
import type { WorkspaceManager } from "./workspaces/manager.js";
import { WsHub } from "./ws/ws-hub.js";

export interface AppDeps {
  host: EngineHost;
  selector: ModelSelector;
  manager: WorkspaceManager;
  token: string;
  version: string;
  /** hono 的 upgradeWebSocket（由 node 适配器提供） */
  upgradeWebSocket: (
    handler: (c: unknown) => {
      onOpen?: (evt: unknown, ws: WSContext) => void;
      onMessage?: (evt: { data: unknown }, ws: WSContext) => void;
      onClose?: (evt: unknown, ws: WSContext) => void;
    },
  ) => unknown;
}

/** 一个工作区的全部路由，挂在 /api/w/<wid> 下。 */
export function buildWorkspaceApp(wid: string, rt: KeelRuntime): Hono {
  const app = new Hono().basePath(`/api/w/${wid}`);
  app.get("/project", (c) =>
    c.json({
      id: wid,
      cwd: rt.engine.cwd,
      name: basename(rt.engine.cwd),
      paths: rt.engine.paths,
    }),
  );
  app.route("/", sessionRoutes(rt.hub, rt.engine));
  app.route("/", rosterRoutes(rt.roster.store));
  app.route("/", docRoutes(rt.engine));
  app.route("/", boardRoutes(rt.engine, rt.roster.store, rt.loop.reviewStateFile));
  app.route("/", approvalRoutes(rt.approvals));
  app.get("/mcp", (c) => c.json(rt.mcp.status()));
  return app;
}

export function buildApp(deps: AppDeps): { app: Hono; wsHub: WsHub } {
  const app = new Hono();
  const wsHub = new WsHub(deps.manager);
  const workspaceApps = new Map<string, Hono>();
  deps.manager.onUnloaded((id) => workspaceApps.delete(id));

  const api = new Hono();
  api.use("*", tokenAuth(deps.token));
  api.get("/health", (c) =>
    c.json({
      ok: true,
      version: deps.version,
      pid: process.pid,
      home: deps.host.home,
      workspaces: deps.manager.list().length,
      loaded: deps.manager.loadedIds(),
    }),
  );
  api.route("/", providerRoutes(deps.host));
  api.route("/", settingsRoutes(deps.host, deps.selector));
  api.route("/", workspaceRoutes(deps.manager));

  // 工作区级：懒加载运行时 → 子应用（带 basePath，直接转发原始请求）
  api.all("/w/:wid/*", async (c) => {
    const wid = c.req.param("wid");
    let rt: KeelRuntime | undefined;
    try {
      rt = await deps.manager.get(wid);
    } catch (e) {
      return c.json(
        { error: `工作区启动失败：${e instanceof Error ? e.message : String(e)}` },
        500,
      );
    }
    if (!rt) return c.json({ error: "未知工作区" }, 404);
    let sub = workspaceApps.get(wid);
    if (!sub) {
      sub = buildWorkspaceApp(wid, rt);
      workspaceApps.set(wid, sub);
    }
    return sub.fetch(c.req.raw);
  });
  app.route("/api", api);

  app.get(
    "/ws",
    // biome-ignore lint/suspicious/noExplicitAny: hono 的 upgradeWebSocket 泛型与 node 适配器类型不完全一致
    deps.upgradeWebSocket((c: any) => {
      const url = new URL(c.req.url);
      const ok = url.searchParams.get("token") === deps.token;
      return {
        onOpen: (_evt: unknown, ws: WSContext) => {
          if (!ok) {
            ws.send(JSON.stringify({ type: "error", message: "unauthorized" }));
            ws.close(4401, "unauthorized");
            return;
          }
          wsHub.connect(ws);
        },
        onMessage: (evt: { data: unknown }, ws: WSContext) => {
          if (!ok) return;
          wsHub.message(ws, String(evt.data));
        },
        onClose: (_evt: unknown, ws: WSContext) => {
          wsHub.disconnect(ws);
        },
      };
    }) as never,
  );

  return { app, wsHub };
}
