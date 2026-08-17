import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RosterEntry } from "../types.js";
import { rosterFileName } from "./record.js";

/** 一条名册记录 → markdown（人读、git 有版本；名册只是导航，产物才是事实）。 */
export function renderRosterMarkdown(entry: RosterEntry): string {
  const r = entry.record;
  const list = (xs: string[] | undefined) =>
    xs?.length ? xs.map((x) => `- ${x}`).join("\n") : "- （无）";
  const lines = [
    `# ${entry.title}`,
    "",
    "> 由 keel 自动维护的名册投影。只用于导航；需求 / 设计文档、review 记录、代码仓库才是事实。",
    "",
    "| 字段 | 值 |",
    "|---|---|",
    `| id | \`${entry.id}\` |`,
    `| kind | ${entry.kind} |`,
    `| role | ${r.role ?? ""} |`,
    `| context-scope | ${r.contextScope ?? ""} |`,
    `| code-range | ${(r.codeRange ?? []).map((g) => `\`${g}\``).join(" ")} |`,
    `| model | ${entry.model.provider}/${entry.model.id} |`,
    `| status | ${entry.status} |`,
    `| last-active-at | ${entry.lastActiveAt} |`,
    `| base-commit | ${r.baseCommit ?? ""} |`,
    `| code-hash | ${r.codeHash ?? ""} |`,
    `| freshness | ${entry.freshness.level} |`,
    `| cost | $${entry.costUsd.toFixed(4)} |`,
    `| summary-version | ${r.summaryVersion ?? ""} |`,
    "",
    "## 当前认知",
    "",
    r.currentUnderstanding?.trim() || "（无）",
    "",
    "## 关键产物",
    "",
    list(r.keyArtifacts),
    "",
    "## 最近工作",
    "",
    r.recentWork?.trim() || "（无）",
    "",
    "## 未解决",
    "",
    list(r.unresolved),
    "",
    "## 适合接",
    "",
    list(r.suitableFor),
    "",
    "## 不适合接",
    "",
    list(r.notSuitableFor),
    "",
  ];
  return lines.join("\n");
}

/** 把全部名册记录写到 <cwd>/.keel/agents/，删掉已不存在的会话的旧文件。 */
export function writeProjection(cwd: string, entries: RosterEntry[]): void {
  const dir = join(cwd, ".keel", "agents");
  mkdirSync(dir, { recursive: true });
  const keep = new Set<string>();
  for (const e of entries) {
    const name = rosterFileName({
      id: e.id,
      title: e.title,
      kind: e.kind,
      model: e.model,
      thinkingLevel: "off",
      createdAt: "",
      updatedAt: "",
    });
    keep.add(name);
    writeFileSync(join(dir, name), renderRosterMarkdown(e));
  }
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md") || f === "README.md" || keep.has(f)) continue;
    // 只清理 keel 生成的带 8 位 id 后缀的文件
    if (/-[0-9a-f]{8}\.md$/.test(f)) unlinkSync(join(dir, f));
  }
}
