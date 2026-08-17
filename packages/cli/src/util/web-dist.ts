import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 找 Web 工作台的构建产物：
 * 1. 发布形态：<cli 包>/web/index.html
 * 2. monorepo 开发形态：<repo>/packages/web/dist/index.html
 */
export function findWebDist(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "web"),
    resolve(here, "..", "..", "web"),
    resolve(here, "..", "..", "..", "web", "dist"),
    resolve(here, "..", "..", "web", "dist"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c;
  }
  return undefined;
}
