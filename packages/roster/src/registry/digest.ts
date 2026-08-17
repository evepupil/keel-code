import type { RosterEntry } from "../types.js";
import { formatIdle } from "./freshness.js";

const LEVEL_LABEL: Record<RosterEntry["freshness"]["level"], string> = {
  fresh: "新鲜",
  "cache-expired": "缓存已过期",
  "code-changed": "代码已变",
  stale: "过期",
};

/** 名册导航摘要（给主对话看的紧凑文本，不含对话正文）。 */
export function renderRosterDigest(
  entries: RosterEntry[],
  options: { includeArchived?: boolean; includeSubagents?: boolean } = {},
): string {
  const list = entries.filter(
    (e) =>
      (options.includeArchived || e.status !== "archived") &&
      (options.includeSubagents || e.kind !== "subagent"),
  );
  if (list.length === 0) return "名册为空：还没有其他对话。";
  const lines: string[] = [];
  for (const e of list) {
    const r = e.record;
    const head = `- ${e.kind === "main" ? "主对话" : e.kind === "subagent" ? "子 agent" : "对话"}「${e.title}」 id=${e.id}`;
    const parts = [
      `模型 ${e.model.provider}/${e.model.id}`,
      `状态 ${e.status}`,
      `新鲜度 ${LEVEL_LABEL[e.freshness.level]}${e.freshness.reasons.length ? `（${e.freshness.reasons.join("；")}）` : ""}`,
      `上次活动 ${formatIdle(e.freshness.idleMs)}前`,
      `${e.messageCount} 条消息`,
      `费用 $${e.costUsd.toFixed(3)}`,
    ];
    lines.push(`${head}\n  ${parts.join(" | ")}`);
    if (r.role) lines.push(`  职责：${r.role}`);
    if (r.contextScope) lines.push(`  上下文领域：${r.contextScope}`);
    if (r.codeRange?.length) lines.push(`  代码范围：${r.codeRange.join(", ")}`);
    if (r.currentUnderstanding) lines.push(`  当前认知：${truncate(r.currentUnderstanding, 200)}`);
    if (r.recentWork) lines.push(`  最近工作：${truncate(r.recentWork, 160)}`);
    if (r.unresolved?.length) lines.push(`  未解决：${r.unresolved.slice(0, 5).join("；")}`);
    if (r.suitableFor?.length) lines.push(`  适合接：${r.suitableFor.join("；")}`);
    if (r.notSuitableFor?.length) lines.push(`  不适合接：${r.notSuitableFor.join("；")}`);
  }
  lines.push("");
  lines.push(
    "复用判据：新鲜 → 直接 keel_conversation_send；缓存已过期但代码没变 → 摘要还可信，可续聊也可按摘要新建；代码已变 / 过期 → 先让它重建认知（或按摘要新建）。",
  );
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
