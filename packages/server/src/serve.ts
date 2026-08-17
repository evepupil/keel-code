import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join, relative } from "node:path";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createEngine, type Engine } from "@keel-code/engine";
import { WebSocketServer } from "ws";
import { buildApp } from "./app.js";
import { SessionHub } from "./hub.js";
import { type RosterServices, setupRoster } from "./services/roster.js";

export interface StartServerOptions {
  cwd: string;
  homeDir?: string;
  /** 0 = 自动挑空闲端口 */
  port?: number;
  host?: string;
  token?: string;
  /** 已构建的 Web 工作台目录（含 index.html）；不给则只提供 API */
  staticDir?: string;
  version?: string;
  /** 复用已有引擎（测试用） */
  engine?: Engine;
}

export interface RunningServer {
  url: string;
  port: number;
  token: string;
  engine: Engine;
  hub: SessionHub;
  roster: RosterServices;
  close(): Promise<void>;
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const engine =
    options.engine ??
    (await createEngine(
      options.homeDir ? { cwd: options.cwd, homeDir: options.homeDir } : { cwd: options.cwd },
    ));
  const hub = new SessionHub(engine);
  const roster = setupRoster(engine, hub);
  const token = options.token ?? randomBytes(16).toString("hex");
  const host = options.host ?? "127.0.0.1";
  const version = options.version ?? "0.0.0";

  const app = buildApp({ engine, hub, roster, token, version, upgradeWebSocket });

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
  const url = `http://${host}:${port}/?token=${token}`;

  return {
    url,
    port,
    token,
    engine,
    hub,
    roster,
    close: async () => {
      roster.dispose();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (!options.engine) await engine.dispose();
    },
  };
}
