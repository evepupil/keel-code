import type { Engine, KeelSettings } from "@keel-code/engine";
import { DEFAULT_KIND_TIERS, type ModelSelector } from "@keel-code/roster";
import { Hono } from "hono";

/** 用户级设置与能力档总览（跨工作区共享）。 */
export function settingsRoutes(
  host: Pick<Engine, "settings">,
  selector: ModelSelector | undefined,
): Hono {
  const r = new Hono();

  r.get("/settings", (c) => c.json(host.settings.get()));

  r.patch("/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<KeelSettings>;
    return c.json(host.settings.update(body));
  });

  /** 能力档总览：每档落到谁、候选、回退；各类默认档；探测缓存 */
  r.get("/models/tiers", async (c) => {
    if (!selector) return c.json({ tiers: [], kindTiers: DEFAULT_KIND_TIERS, probes: {} });
    const settings = host.settings.get();
    return c.json({
      tiers: await selector.overview(),
      kindTiers: { ...DEFAULT_KIND_TIERS, ...(settings.kindTiers ?? {}) },
      probes: selector.probeSnapshot(),
    });
  });

  return r;
}
