import type { ModelInfo, ModelRef, ProviderProbe } from "@keel-code/engine";
import type { ModelLocks } from "../types.js";

export type ModelTier = "cheap" | "balanced" | "strong" | "unknown";

/** 按输入单价粗分档（美元 / 百万 token）。目录里没有单价的归 unknown。 */
export function tierOf(m: Pick<ModelInfo, "cost">): ModelTier {
  const input = m.cost.input;
  const output = m.cost.output;
  if (!input && !output) return "unknown";
  if (input <= 0.6) return "cheap";
  if (input <= 3.5) return "balanced";
  return "strong";
}

/** 名册工具里给模型看的探测摘要：紧凑表格文本，不吐整份 JSON。 */
export function renderProbeDigest(probes: ProviderProbe[]): string {
  if (probes.length === 0) return "没有已配置凭据的 provider。请在设置里配置 API key。";
  const lines: string[] = [];
  for (const p of probes) {
    const state = p.reachable
      ? `可达 ${p.latencyMs ?? "?"}ms`
      : `不可达${p.error ? `（${p.error}）` : ""}`;
    lines.push(`## ${p.name} (${p.provider}) — ${state}`);
    const usable = p.models.filter((m) => m.catalogKnown);
    if (usable.length === 0) {
      lines.push("（目录里没有可直接使用的模型）");
      continue;
    }
    lines.push("| 模型 | 档位 | 输入/输出 $/M | 上下文 | 推理 | 端点确认 |");
    lines.push("|---|---|---|---|---|---|");
    for (const m of usable) {
      lines.push(
        `| ${m.provider}/${m.id} | ${tierOf(m)} | ${m.cost.input}/${m.cost.output} | ${
          m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k` : "?"
        } | ${m.reasoning ? "是" : "否"} | ${m.listedByEndpoint ? "有" : "无"} |`,
      );
    }
    const extra = p.models.filter((m) => !m.catalogKnown).length;
    if (extra > 0)
      lines.push(`（端点另列出 ${extra} 个目录未知的模型，单价 / 上下文未知，暂不可直接选用）`);
  }
  lines.push("");
  lines.push(
    "挑选建议：需求讨论 / 设计 / 复杂实现用 strong；跑测试、批量改名、文档修剪、格式修复用 cheap；reviewer 用与实现者不同的 strong 模型。用户锁定优先。",
  );
  return lines.join("\n");
}

/** 应用用户锁定：锁定存在则覆盖请求的模型，并返回说明。 */
export function applyLock(
  kind: keyof ModelLocks,
  requested: ModelRef | undefined,
  locks: ModelLocks | undefined,
): { model: ModelRef | undefined; note?: string } {
  const lock = locks?.[kind];
  if (!lock) return { model: requested };
  if (requested && (requested.provider !== lock.provider || requested.id !== lock.id)) {
    return {
      model: lock,
      note: `用户已锁定 ${kind} 类对话使用 ${lock.provider}/${lock.id}，已覆盖你选的 ${requested.provider}/${requested.id}。`,
    };
  }
  return { model: lock };
}
