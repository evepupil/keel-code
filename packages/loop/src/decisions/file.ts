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
  return listPendingDecisions(cwd).length;
}

export interface PendingDecision {
  /** 在文件中的行号（0 基），用于解决时删除 */
  line: number;
  /** 所属批次标题（最近的 ## 标题） */
  section: string;
  text: string;
}

/** 列出全部待决策条目。 */
export function listPendingDecisions(cwd: string): PendingDecision[] {
  const file = decisionsPath(cwd);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n");
  const out: PendingDecision[] = [];
  let section = "";
  lines.forEach((l, i) => {
    if (l.startsWith("## ")) section = l.slice(3).trim();
    else if (l.trimStart().startsWith("- [待决策]")) {
      out.push({ line: i, section, text: l.trim().replace(/^- \[待决策\]\s*/, "") });
    }
  });
  return out;
}

/** 解决一条待决策：按行号删除；空掉的批次小节顺手删掉。返回是否删除成功。 */
export function resolveDecision(cwd: string, line: number): boolean {
  const file = decisionsPath(cwd);
  if (!existsSync(file)) return false;
  const lines = readFileSync(file, "utf8").split("\n");
  if (!(lines[line] ?? "").trimStart().startsWith("- [待决策]")) return false;
  lines.splice(line, 1);
  const cleaned: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (l.startsWith("## ")) {
      let j = i + 1;
      let hasItem = false;
      while (j < lines.length && !(lines[j] ?? "").startsWith("## ")) {
        if ((lines[j] ?? "").trimStart().startsWith("- [待决策]")) hasItem = true;
        j++;
      }
      if (!hasItem) {
        i = j - 1;
        continue;
      }
    }
    cleaned.push(l);
  }
  writeFileSync(
    file,
    `${cleaned
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd()}\n`,
  );
  return true;
}
