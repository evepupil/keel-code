/**
 * lint-on-write：写入完成后对该文件跑一次格式化（best effort，不阻塞、不报错）。
 * 探测顺序：项目里有 biome.json → biome format；有 prettier 配置或依赖 → prettier；都没有 → 跳过。
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";

const FORMATTABLE = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".md",
  ".vue",
  ".svelte",
  ".html",
  ".yaml",
  ".yml",
]);

export type Formatter = "biome" | "prettier" | null;

export function detectFormatter(cwd: string): Formatter {
  if (existsSync(join(cwd, "biome.json")) || existsSync(join(cwd, "biome.jsonc"))) return "biome";
  for (const f of [
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.js",
    ".prettierrc.cjs",
    "prettier.config.js",
    "prettier.config.mjs",
    "prettier.config.cjs",
  ]) {
    if (existsSync(join(cwd, f))) return "prettier";
  }
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      prettier?: unknown;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    if (pkg.prettier || pkg.devDependencies?.prettier || pkg.dependencies?.prettier)
      return "prettier";
    if (pkg.devDependencies?.["@biomejs/biome"]) return "biome";
  } catch {
    // 无 package.json
  }
  return null;
}

export function isFormattable(path: string): boolean {
  return FORMATTABLE.has(extname(path).toLowerCase());
}

/** 对单个文件跑格式化。失败静默（返回 false）。 */
export function formatFile(
  cwd: string,
  path: string,
  formatter = detectFormatter(cwd),
): Promise<boolean> {
  if (!formatter || !isFormattable(path)) return Promise.resolve(false);
  const abs = isAbsolute(path) ? path : resolve(cwd, path);
  if (!existsSync(abs)) return Promise.resolve(false);
  const bin = process.platform === "win32" ? "npx.cmd" : "npx";
  const args =
    formatter === "biome"
      ? ["--no-install", "biome", "format", "--write", abs]
      : ["--no-install", "prettier", "--write", abs];
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { cwd, windowsHide: true, timeout: 30_000, shell: process.platform === "win32" },
      (err) => resolve(!err),
    );
  });
}
