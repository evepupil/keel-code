/**
 * 能力档 → 具体模型的落实（确定性代码，AI 只说档次）：
 * 候选 = 已启用 + 该档（缺省 standard）+ provider 最近探测可达 → 首选优先 → 缺档顺位回退并说明。
 */
import type { Engine, KeelSettings, ModelInfo, ModelRef, ModelTier } from "@keel-code/engine";

export const TIERS: ModelTier[] = ["light", "standard", "flagship"];
export const TIER_LABEL: Record<ModelTier, string> = {
  light: "轻量",
  standard: "标准",
  flagship: "旗舰",
};
/** 缺档时的回退顺序 */
const FALLBACK: Record<ModelTier, ModelTier[]> = {
  flagship: ["flagship", "standard", "light"],
  standard: ["standard", "flagship", "light"],
  light: ["light", "standard", "flagship"],
};
/** 各类对话的默认档（用户可在设置里改） */
export const DEFAULT_KIND_TIERS: Record<string, ModelTier> = {
  main: "flagship",
  conversation: "standard",
  subagent: "standard",
  reviewer: "flagship",
  docPrune: "light",
};

export const modelKeyOf = (m: ModelRef): string => `${m.provider}/${m.id}`;

export function tierOfModel(settings: KeelSettings, m: ModelRef): ModelTier {
  return settings.modelTiers?.[modelKeyOf(m)] ?? "standard";
}

export function isDisabled(settings: KeelSettings, m: ModelRef): boolean {
  return (settings.modelDisabled ?? []).includes(modelKeyOf(m));
}

export function kindTier(settings: KeelSettings, kind: string): ModelTier {
  return settings.kindTiers?.[kind] ?? DEFAULT_KIND_TIERS[kind] ?? "standard";
}

export interface ResolveInput {
  tier: ModelTier;
  /** 尽量避开的模型（如 reviewer 避开实现者） */
  avoid?: ModelRef;
  /** 硬排除（如端点不可达）；由 selector 内部填充 */
}

export interface ResolveResult {
  model: ModelInfo;
  tier: ModelTier;
  /** 实际落到的档（与请求不同即发生了回退） */
  resolvedTier: ModelTier;
  note: string;
}

export interface TierView {
  tier: ModelTier;
  label: string;
  /** 会落到的模型（考虑首选与可达） */
  resolved: ModelInfo | null;
  /** 该档全部候选（已启用），按优先顺序 */
  candidates: ModelInfo[];
  /** 缺档回退到的档 */
  fallbackTo?: ModelTier;
}

interface ProbeCacheEntry {
  reachable: boolean;
  at: number;
  latencyMs?: number;
  error?: string;
}

export interface ModelSelectorOptions {
  /** 探测缓存有效期，默认 5 分钟 */
  probeTtlMs?: number;
  /** 复探超时，默认 5 秒 */
  probeTimeoutMs?: number;
}

/** 按能力档选模型；带 provider 可达性缓存。 */
export class ModelSelector {
  private readonly cache = new Map<string, ProbeCacheEntry>();

  constructor(
    private readonly engine: Engine,
    private readonly options: ModelSelectorOptions = {},
  ) {}

  /** 某 provider 是否可达（缓存过期就复探）。 */
  async providerReachable(providerId: string, now = Date.now()): Promise<boolean> {
    const ttl = this.options.probeTtlMs ?? 5 * 60 * 1000;
    const hit = this.cache.get(providerId);
    if (hit && now - hit.at < ttl) return hit.reachable;
    try {
      const [p] = await this.engine.models.probe({
        providers: [providerId],
        timeoutMs: this.options.probeTimeoutMs ?? 5000,
      });
      const entry: ProbeCacheEntry = {
        reachable: p?.reachable ?? false,
        at: now,
        ...(p?.latencyMs !== undefined ? { latencyMs: p.latencyMs } : {}),
        ...(p?.error ? { error: p.error } : {}),
      };
      this.cache.set(providerId, entry);
      return entry.reachable;
    } catch (e) {
      this.cache.set(providerId, { reachable: false, at: now, error: String(e) });
      return false;
    }
  }

  /** 记录运行中发现的故障（401 / 超时），让该 provider 冷却一段时间。 */
  markUnhealthy(providerId: string, error: string, now = Date.now()): void {
    this.cache.set(providerId, { reachable: false, at: now, error });
  }

  probeSnapshot(): Record<string, ProbeCacheEntry> {
    return Object.fromEntries(this.cache.entries());
  }

  /** 该档的候选（已启用、按首选优先），不含可达性判断。 */
  candidates(tier: ModelTier, all: ModelInfo[], settings: KeelSettings): ModelInfo[] {
    const list = all.filter((m) => !isDisabled(settings, m) && tierOfModel(settings, m) === tier);
    const preferred = settings.preferred?.[tier];
    if (!preferred) return list;
    return [
      ...list.filter((m) => modelKeyOf(m) === preferred),
      ...list.filter((m) => modelKeyOf(m) !== preferred),
    ];
  }

  /** 落实一个档；避开 avoid（除非只剩它）。 */
  async resolve(input: ResolveInput): Promise<ResolveResult | undefined> {
    const settings = this.engine.settings.get();
    const all = await this.engine.models.available();
    for (const t of FALLBACK[input.tier]) {
      const cands = this.candidates(t, all, settings);
      const usable: ModelInfo[] = [];
      for (const m of cands) {
        if (await this.providerReachable(m.provider)) usable.push(m);
      }
      if (usable.length === 0) continue;
      const avoidKey = input.avoid ? modelKeyOf(input.avoid) : undefined;
      const pick = usable.find((m) => modelKeyOf(m) !== avoidKey) ?? usable[0];
      if (!pick) continue;
      const fell = t !== input.tier;
      const note = fell
        ? `${TIER_LABEL[input.tier]}档没有可用模型，回退到${TIER_LABEL[t]}档：${modelKeyOf(pick)}`
        : `${TIER_LABEL[t]}档 → ${modelKeyOf(pick)}${avoidKey && modelKeyOf(pick) === avoidKey ? "（同档只有它，未能避开实现者）" : ""}`;
      return { model: pick, tier: input.tier, resolvedTier: t, note };
    }
    return undefined;
  }

  /** 给设置页 / AI 看的三档总览。 */
  async overview(): Promise<TierView[]> {
    const settings = this.engine.settings.get();
    const all = await this.engine.models.available();
    const views: TierView[] = [];
    for (const tier of TIERS) {
      const cands = this.candidates(tier, all, settings);
      const r = await this.resolve({ tier });
      const view: TierView = {
        tier,
        label: TIER_LABEL[tier],
        resolved: r?.model ?? null,
        candidates: cands,
      };
      if (r && r.resolvedTier !== tier) view.fallbackTo = r.resolvedTier;
      views.push(view);
    }
    return views;
  }
}

/** 给主对话看的档次摘要（替代原来的整张模型表）。 */
export function renderTierDigest(views: TierView[], kindTiers: Record<string, ModelTier>): string {
  const lines = ["能力档（你只需要说档次，系统会落到具体模型）："];
  for (const v of views) {
    const target = v.resolved
      ? `${v.resolved.provider}/${v.resolved.id}（$${v.resolved.cost.input}/${v.resolved.cost.output} 每百万，${Math.round(v.resolved.contextWindow / 1000)}k）`
      : "（无可用模型）";
    lines.push(
      `- ${v.label}：${target}${v.fallbackTo ? `　← 本档无可用，回退到${TIER_LABEL[v.fallbackTo]}档` : ""}；候选 ${v.candidates.length} 个`,
    );
  }
  lines.push(
    `各类默认档：主对话=${TIER_LABEL[kindTiers.main ?? "flagship"]}、普通对话=${TIER_LABEL[kindTiers.conversation ?? "standard"]}、子 agent=${TIER_LABEL[kindTiers.subagent ?? "standard"]}、reviewer=${TIER_LABEL[kindTiers.reviewer ?? "flagship"]}、文档修剪=${TIER_LABEL[kindTiers.docPrune ?? "light"]}。`,
  );
  lines.push(
    "建议：需求讨论 / 设计 / 疑难实现用旗舰；普通实现用标准；跑测试、批量改名、只读探索用轻量。不确定就不传 tier，按类别默认。",
  );
  return lines.join("\n");
}
