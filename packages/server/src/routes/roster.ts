import type { Engine, KeelSettings } from "@keel-code/engine";
import type { RosterStore } from "@keel-code/roster";
import { Hono } from "hono";

export function rosterRoutes(store: RosterStore, engine: Engine): Hono {
  const r = new Hono();

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
