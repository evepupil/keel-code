import type { Engine, ModelRef } from "@keel-code/engine";
import { type ModelLocks, tierOf } from "@keel-code/roster";

/**
 * reviewer 用哪个模型：用户锁定优先；否则挑一个与实现者不同的 strong 模型（避免同一模型的盲区）；
 * 没有就任意不同的；再没有就只能同款。
 */
export async function pickReviewerModel(
  engine: Engine,
  implementer: ModelRef,
  locks: ModelLocks | undefined,
): Promise<{ model: ModelRef; note: string }> {
  if (locks?.reviewer) return { model: locks.reviewer, note: "用户锁定" };
  const available = await engine.models.available();
  const others = available.filter(
    (m) => !(m.provider === implementer.provider && m.id === implementer.id),
  );
  const strong = others.find((m) => tierOf(m) === "strong");
  if (strong) return { model: { provider: strong.provider, id: strong.id }, note: "反相位 strong" };
  const any = others[0];
  if (any) return { model: { provider: any.provider, id: any.id }, note: "反相位" };
  return { model: implementer, note: "只有一个可用模型，与实现者同款" };
}
