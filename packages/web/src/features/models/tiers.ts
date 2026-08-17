import type { ModelInfo, ModelTier } from "../../api/types";

export const TIERS: ModelTier[] = ["light", "standard", "flagship"];
export const TIER_LABEL: Record<ModelTier, string> = {
  light: "轻量",
  standard: "标准",
  flagship: "旗舰",
};

export const modelKeyOf = (m: { provider: string; id: string }): string => `${m.provider}/${m.id}`;

export function priceOf(m: ModelInfo): string {
  return m.cost.input || m.cost.output ? `$${m.cost.input}/${m.cost.output}` : "免费";
}
