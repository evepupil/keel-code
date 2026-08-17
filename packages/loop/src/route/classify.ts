/**
 * review 结论的分类路由（纯函数）：
 * - 只有待决策 → suspend（挂起等用户）
 * - 通过且无确定性问题 → pass
 * - 轮次到上限 → escalate（升级为待决策）
 * - 否则 → fix（回传修复指令）
 * 「无需动作」类 finding 不算问题（否则会卡死闭环）。
 */
export type FindingCategory = "deterministic" | "decision";

export interface Finding {
  issue: string;
  category: FindingCategory;
  file?: string;
  suggestion?: string;
}

export interface ReviewVerdict {
  verdict: "pass" | "fail";
  summary?: string;
  findings: Finding[];
}

export type RouteAction = "pass" | "fix" | "suspend" | "escalate";

export interface RouteResult {
  action: RouteAction;
  deterministic: Finding[];
  decisions: Finding[];
  notes: Finding[];
}

const NOOP_RE = /^(无需|不用|无需修改|确认无误|无问题|没有问题|不需要)/;

export function isNoopFinding(f: Finding): boolean {
  return f.category === "deterministic" && NOOP_RE.test((f.suggestion ?? "").trim());
}

export function classify(verdict: ReviewVerdict, round: number, maxRounds: number): RouteResult {
  const findings = verdict.findings ?? [];
  const notes = findings.filter(isNoopFinding);
  const deterministic = findings.filter((f) => f.category === "deterministic" && !isNoopFinding(f));
  const decisions = findings.filter((f) => f.category === "decision");
  const base = { deterministic, decisions, notes };
  if (deterministic.length === 0 && decisions.length > 0) return { action: "suspend", ...base };
  if (verdict.verdict === "pass" && deterministic.length === 0) return { action: "pass", ...base };
  if (round >= maxRounds) return { action: "escalate", ...base };
  return { action: "fix", ...base };
}

export function formatFindings(list: Finding[]): string {
  return list
    .map(
      (f, i) =>
        `${i + 1}. [${f.category}]${f.file ? ` (${f.file})` : ""} ${f.issue}${
          f.suggestion ? `\n   → 建议：${f.suggestion}` : ""
        }`,
    )
    .join("\n");
}
