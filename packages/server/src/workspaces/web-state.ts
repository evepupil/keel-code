/**
 * `keel web` 单实例状态：~/.keel/web.json 记录正在跑的工作台（端口 / 令牌 / pid）。
 * CLI 用它探活：活着就复用，不活就重新起。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface WebState {
  port: number;
  host: string;
  token: string;
  pid: number;
  startedAt: string;
}

export function webStateFile(home: string): string {
  return join(home, "web.json");
}

export function readWebState(home: string): WebState | undefined {
  try {
    const raw = JSON.parse(readFileSync(webStateFile(home), "utf8")) as WebState;
    if (typeof raw.port !== "number" || typeof raw.token !== "string") return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

export function writeWebState(home: string, state: WebState): void {
  const file = webStateFile(home);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function clearWebState(home: string, onlyPid?: number): void {
  const file = webStateFile(home);
  if (!existsSync(file)) return;
  if (onlyPid !== undefined) {
    const cur = readWebState(home);
    if (cur && cur.pid !== onlyPid) return;
  }
  rmSync(file, { force: true });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM 说明进程在但没权限，也算活着
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** 探活：GET /api/health 带令牌，1.5 秒超时。 */
export async function pingWeb(state: WebState, timeoutMs = 1500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${state.host}:${state.port}/api/health`, {
      headers: { "x-keel-token": state.token },
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function webUrl(state: WebState, hash?: string): string {
  return `http://${state.host}:${state.port}/?token=${state.token}${hash ? `#${hash}` : ""}`;
}
