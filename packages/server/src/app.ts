import { basename } from "node:path";
import type { Engine } from "@keel-code/engine";
import type { McpManager } from "@keel-code/mcp";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { tokenAuth } from "./auth.js";
import type { SessionHub } from "./hub.js";
import { approvalRoutes } from "./routes/approvals.js";
import { boardRoutes } from "./routes/board.js";
import { docRoutes } from "./routes/docs.js";
import { providerRoutes } from "./routes/providers.js";
import { rosterRoutes } from "./routes/roster.js";
import { sessionRoutes } from "./routes/sessions.js";
import type { ApprovalServices } from "./services/approvals.js";
import type { LoopServices } from "./services/loop.js";
import type { RosterServices } from "./services/roster.js";
import { WsHub } from "./ws/ws-hub.js";

export interface AppDeps {
  engine: Engine;
  hub: SessionHub;
  roster: RosterServices;
  loop: LoopServices;
  approvals: ApprovalServices;
  mcp: McpManager;
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

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  const wsHub = new WsHub(deps.hub, deps.approvals);

  const api = new Hono();
  api.use("*", tokenAuth(deps.token));
  api.get("/health", (c) =>
    c.json({
      ok: true,
      version: deps.version,
      cwd: deps.engine.cwd,
      name: basename(deps.engine.cwd),
    }),
  );
  api.get("/project", (c) =>
    c.json({ cwd: deps.engine.cwd, name: basename(deps.engine.cwd), paths: deps.engine.paths }),
  );
  api.route("/", providerRoutes(deps.engine));
  api.route("/", sessionRoutes(deps.hub, deps.engine));
  api.route("/", rosterRoutes(deps.roster.store, deps.engine, deps.roster.selector));
  api.route("/", docRoutes(deps.engine));
  api.route("/", boardRoutes(deps.engine, deps.roster.store, deps.loop.reviewStateFile));
  api.route("/", approvalRoutes(deps.approvals));
  api.get("/mcp", (c) => c.json(deps.mcp.status()));
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

  return app;
}
