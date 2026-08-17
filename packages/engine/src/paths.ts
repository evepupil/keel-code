import { createHash } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
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
