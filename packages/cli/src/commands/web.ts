/**
 * `keel web [目录]`：任意目录一条命令打开含全部工作区的工作台。
 *   - 已有实例活着（~/.keel/web.json 探活通过）→ 把目录注册为工作区，开浏览器直达
 *   - 没有 → 默认后台起一个（日志 ~/.keel/web.log），等它就绪后再注册 + 开浏览器
 *   - --foreground 前台跑（调试 / 被后台模式派生时用）；--stop 停掉后台实例
 * 目录不是项目（无 .git 也无 .keel）时只开工作台，不注册。
 */
import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { resolveHomePaths } from "@keel-code/engine";
import {
  clearWebState,
  isProcessAlive,
  isProjectDir,
  pingWeb,
  readWebState,
  startServer,
  type WebState,
  webUrl,
} from "@keel-code/server";

export interface WebCommandOptions {
  /** 要注册 / 打开的目录（默认当前目录）；不是项目时只开工作台 */
  dir: string;
  homeDir?: string;
  port: number;
  open: boolean;
  foreground: boolean;
  stop: boolean;
  staticDir?: string;
  version: string;
  /** 后台派生时用的可执行入口（默认 process.argv[1]） */
  binPath?: string;
  log?: (line: string) => void;
}

interface RegisterResult {
  workspaceId?: string;
  url: string;
}

/** 找到活着的实例：web.json 存在 + pid 活着 + /api/health 通 */
export async function findLiveWeb(home: string): Promise<WebState | undefined> {
  const state = readWebState(home);
  if (!state) return undefined;
  if (!isProcessAlive(state.pid)) {
    clearWebState(home, state.pid);
    return undefined;
  }
  if (await pingWeb(state)) return state;
  return undefined;
}

/** 让运行中的实例注册目录（是项目才注册），返回直达 URL。 */
async function registerAndUrl(state: WebState, dir: string): Promise<RegisterResult> {
  if (!isProjectDir(dir)) return { url: webUrl(state) };
  const res = await fetch(`http://${state.host}:${state.port}/api/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-keel-token": state.token },
    body: JSON.stringify({ path: dir }),
  });
  if (!res.ok) return { url: webUrl(state) };
  const body = (await res.json()) as { id: string };
  return { workspaceId: body.id, url: webUrl(state, `/w/${body.id}`) };
}

async function stopWeb(home: string, log: (l: string) => void): Promise<number> {
  const state = readWebState(home);
  if (!state) {
    log("没有在跑的工作台。");
    return 0;
  }
  if (isProcessAlive(state.pid)) {
    try {
      process.kill(state.pid);
      log(`已停止工作台（pid ${state.pid}）。`);
    } catch (e) {
      log(`停止失败：${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  } else {
    log("工作台进程已不在，清理记录。");
  }
  clearWebState(home);
  return 0;
}

async function runForeground(o: WebCommandOptions, log: (l: string) => void): Promise<number> {
  const home = resolveHomePaths(o.homeDir).home;
  const live = await findLiveWeb(home);
  if (live) {
    const { url } = await registerAndUrl(live, o.dir);
    log(`工作台已在运行（pid ${live.pid}）：${url}`);
    log("要重启先 keel web --stop。");
    if (o.open) {
      const { openBrowser } = await import("../util/open-browser.js");
      openBrowser(url);
    }
    return 0;
  }
  const server = await startServer({
    ...(isProjectDir(o.dir) ? { cwd: o.dir } : {}),
    ...(o.homeDir ? { homeDir: o.homeDir } : {}),
    port: o.port,
    ...(o.staticDir ? { staticDir: o.staticDir } : {}),
    version: o.version,
    writeWebState: true,
  });
  log(`keel 工作台：${server.url}`);
  log(`工作区注册表：${join(home, "workspaces.json")}`);
  if (o.open && o.staticDir) {
    const { openBrowser } = await import("../util/open-browser.js");
    openBrowser(server.url);
  }
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  return 0;
}

/** 后台派生一个前台实例，等它写出 web.json 并探活通过。 */
async function spawnBackground(o: WebCommandOptions, home: string): Promise<WebState> {
  mkdirSync(home, { recursive: true });
  const logFile = join(home, "web.log");
  const out = openSync(logFile, "a");
  const bin = o.binPath ?? process.argv[1] ?? "";
  const args = [
    bin,
    "web",
    "--foreground",
    "--no-open",
    "--port",
    String(o.port),
    ...(o.homeDir ? ["--home", o.homeDir] : []),
    o.dir,
  ];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  child.unref();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const state = readWebState(home);
    if (state && state.pid === child.pid && (await pingWeb(state, 800))) return state;
    if (child.exitCode !== null) break;
  }
  throw new Error(`后台工作台没能启动，看日志：${logFile}`);
}

export async function runWebCommand(o: WebCommandOptions): Promise<number> {
  const log = o.log ?? ((l: string) => console.log(l));
  const home = resolveHomePaths(o.homeDir).home;
  if (o.stop) return stopWeb(home, log);
  if (o.foreground) return runForeground(o, log);
  let state = await findLiveWeb(home);
  if (!state) {
    log("后台启动工作台…");
    state = await spawnBackground(o, home);
  }
  const { url, workspaceId } = await registerAndUrl(state, o.dir);
  log(`keel 工作台：${url}`);
  if (workspaceId) log(`工作区：${o.dir}`);
  else log("当前目录不是项目（无 .git / .keel），只打开工作台。");
  if (o.open) {
    const { openBrowser } = await import("../util/open-browser.js");
    openBrowser(url);
  }
  return 0;
}
