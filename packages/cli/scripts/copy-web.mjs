// prepack：把 Web 工作台构建产物复制进 CLI 包（发布形态 <cli>/web/index.html）。
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "..", "web", "dist");
const dst = resolve(here, "..", "web");
if (!existsSync(resolve(src, "index.html"))) {
  console.error("未找到 packages/web/dist/index.html，先运行 pnpm build");
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`已复制 Web 产物到 ${dst}`);
