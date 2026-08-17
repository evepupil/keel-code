import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Finding } from "../route/classify.js";

export const DECISIONS_REL = join("docs", "review", "待决策.md");

const HEADER = "# 待决策\n\n需用户拍板的问题（来自 review；解决后从此处删除）。\n";

export function decisionsPath(cwd: string): string {
  return join(cwd, DECISIONS_REL);
}

/** 追加一批待决策条目到 docs/review/待决策.md（文件不存在则建）。 */
export function appendDecisions(
  cwd: string,
  findings: Finding[],
  batch: string,
  at = new Date(),
): void {
  const file = decisionsPath(cwd);
  mkdirSync(dirname(file), { recursive: true });
  const stamp = at.toISOString().replace("T", " ").slice(0, 19);
  const block = [
    "",
    `## ${stamp} · 批次：${batch.slice(0, 80)}`,
    "",
    ...findings.map(
      (f) =>
        `- [待决策]${f.file ? ` (${f.file})` : ""} ${f.issue}${f.suggestion ? ` ｜可选：${f.suggestion}` : ""}`,
    ),
    "",
  ].join("\n");
  const head = existsSync(file) ? readFileSync(file, "utf8") : HEADER;
  writeFileSync(file, head + block);
}

/** 统计文件里还剩多少条待决策（以「- [待决策]」开头的行）。 */
export function countPendingDecisions(cwd: string): number {
  const file = decisionsPath(cwd);
  if (!existsSync(file)) return 0;
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trimStart().startsWith("- [待决策]")).length;
}
