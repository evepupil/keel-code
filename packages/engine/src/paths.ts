import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { KeelPaths } from "./types.js";

/** 把项目目录变成稳定、可读的目录名：<basename>-<hash12>。Windows 上大小写与斜杠归一化。 */
export function projectDirName(cwd: string): string {
  let real = resolve(cwd);
  try {
    real = realpathSync.native(real);
  } catch {
    // 目录可能尚不存在（测试），退回 resolve 结果
  }
  const normalized = process.platform === "win32" ? real.replace(/\\/g, "/").toLowerCase() : real;
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  const slug =
    basename(real)
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project";
  return `${slug}-${hash}`;
}

export function resolveKeelPaths(cwd: string, homeDir?: string): KeelPaths {
  const home = resolve(homeDir ?? process.env.KEEL_HOME ?? join(homedir(), ".keel"));
  const sessionsRoot = join(home, "sessions");
  const projectSessionsDir = join(sessionsRoot, projectDirName(cwd));
  return {
    home,
    authFile: join(home, "auth.json"),
    modelsFile: join(home, "models.json"),
    settingsFile: join(home, "settings.json"),
    piAgentDir: join(home, "pi"),
    sessionsRoot,
    projectSessionsDir,
    projectIndexFile: join(projectSessionsDir, "index.json"),
  };
}

export function ensureKeelDirs(paths: KeelPaths): void {
  for (const dir of [paths.home, paths.piAgentDir, paths.sessionsRoot, paths.projectSessionsDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 首次启动时把 pi 自己的凭据（~/.pi/agent/auth.json）导入 keel（~/.keel/auth.json）：
 * 只补 keel 里没有的 provider，不覆盖；任何一步失败都静默跳过。
 * 返回导入的 provider id 列表。
 */
export function importPiCredentials(
  paths: KeelPaths,
  piAuthFile = join(homedir(), ".pi", "agent", "auth.json"),
): string[] {
  try {
    if (!existsSync(piAuthFile)) return [];
    const src = JSON.parse(readFileSync(piAuthFile, "utf8")) as Record<string, unknown>;
    let dst: Record<string, unknown> = {};
    if (existsSync(paths.authFile)) {
      try {
        dst = JSON.parse(readFileSync(paths.authFile, "utf8")) as Record<string, unknown>;
      } catch {
        dst = {};
      }
    }
    const imported: string[] = [];
    for (const [provider, cred] of Object.entries(src)) {
      if (cred && typeof cred === "object" && !(provider in dst)) {
        dst[provider] = cred;
        imported.push(provider);
      }
    }
    if (imported.length > 0) writeFileSync(paths.authFile, `${JSON.stringify(dst, null, 2)}\n`);
    return imported;
  } catch {
    return [];
  }
}
