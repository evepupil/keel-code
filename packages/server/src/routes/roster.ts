import type { Engine, KeelSettings } from "@keel-code/engine";
import type { ModelSelector, RosterStore } from "@keel-code/roster";
import { DEFAULT_KIND_TIERS } from "@keel-code/roster";
import { Hono } from "hono";

export function rosterRoutes(store: RosterStore, engine: Engine, selector?: ModelSelector): Hono {
  const r = new Hono();

  /** 能力档总览：每档落到谁、候选、回退；各类默认档；探测缓存 */
  r.get("/models/tiers", async (c) => {
    if (!selector) return c.json({ tiers: [], kindTiers: DEFAULT_KIND_TIERS, probes: {} });
    const settings = engine.settings.get();
    return c.json({
      tiers: await selector.overview(),
      kindTiers: { ...DEFAULT_KIND_TIERS, ...(settings.kindTiers ?? {}) },
      probes: selector.probeSnapshot(),
    });
  });

  r.get("/roster", async (c) => c.json(await store.entries()));

  r.get("/roster/:id", async (c) => {
    const entry = await store.entry(c.req.param("id"));
    return entry ? c.json(entry) : c.json({ error: "not found" }, 404);
  });

  r.get("/settings", (c) => c.json(engine.settings.get()));

  r.patch("/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<KeelSettings>;
    return c.json(engine.settings.update(body));
  });

  return r;
}
