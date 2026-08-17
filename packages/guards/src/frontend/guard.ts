/**
 * guard-frontend：设计系统没建好之前，拦截业务页面的写入。纯判定，不碰引擎。
 *
 * - 写入类工具（write / edit / 自定义写入）命中业务页路径（pages / views / screens / app 路由页 / routes）
 * - 且路径不在设计系统目录（components/ui、design-system、styles、tokens）
 * - 且项目里找不到设计系统标志文件（token 文件 / design-system 目录 / tailwind 配置）
 * → 拒绝并给原因（先建 token + 基础组件）。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const WRITE_TOOL_RE = /^(write|edit|str[-_]?replace|create[-_]?file|apply[-_]?patch)$/i;

const BUSINESS_PAGE_RE =
  /(^|\/)(src\/)?(pages|views|screens|routes)\/.+\.(tsx|jsx|vue|svelte|astro|html)$|(^|\/)app\/.*page\.(tsx|jsx)$/i;
const DESIGN_SYSTEM_DIR_RE =
  /(^|\/)(components\/ui|design-system|design_system|styles|tokens?)(\/|$)/i;

/** 设计系统「已建立」的标志：任一存在即可。 */
export const DESIGN_SYSTEM_MARKERS = [
  "src/styles/tokens.ts",
  "src/styles/tokens.css",
  "src/styles/tokens.js",
  "src/design-system/tokens.ts",
  "src/design-system/tokens.css",
  "src/design-system/index.ts",
  "src/tokens.ts",
  "src/tokens.css",
  "styles/tokens.css",
  "app/tokens.css",
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
];

export function isBusinessPagePath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  return BUSINESS_PAGE_RE.test(p) && !DESIGN_SYSTEM_DIR_RE.test(p);
}

export function hasDesignSystem(cwd: string, markers: string[] = DESIGN_SYSTEM_MARKERS): boolean {
  return markers.some((m) => existsSync(join(cwd, m)));
}

/** 从工具参数里递归收集字符串（路径可能藏在 path / file_path / filePath 等字段）。 */
export function collectPaths(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["path", "file_path", "filePath", "file", "target"]) {
    const v = input[key];
    if (typeof v === "string") out.push(v);
  }
  if (out.length === 0) {
    for (const v of Object.values(input)) if (typeof v === "string" && /[\\/]/.test(v)) out.push(v);
  }
  return out;
}

export interface FrontendGuardInput {
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
  markers?: string[];
}

/** 返回拒绝原因；undefined = 放行。 */
export function judgeFrontendWrite(i: FrontendGuardInput): string | undefined {
  if (!WRITE_TOOL_RE.test(i.toolName)) return undefined;
  const hit = collectPaths(i.input).find(isBusinessPagePath);
  if (!hit) return undefined;
  if (hasDesignSystem(i.cwd, i.markers)) return undefined;
  return [
    `keel guard-frontend 拦截：${hit} 是业务页面，但项目还没有设计系统。`,
    "先建 token（色板 / 字体配对 / 间距 / 圆角 / 阴影 / 控件尺寸）和基础组件，再写业务页。",
    `建立标志（任一存在即放行）：${DESIGN_SYSTEM_MARKERS.slice(0, 6).join("、")} 等。`,
    "逃生舱：.keel/config.json → guards.frontend=false（关闭动作会留在仓库里）。",
  ].join("\n");
}
