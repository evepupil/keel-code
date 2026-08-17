import type { RosterStore } from "@keel-code/roster";
import { Hono } from "hono";

export function rosterRoutes(store: RosterStore): Hono {
  const r = new Hono();

  r.get("/roster", async (c) => c.json(await store.entries()));

  r.get("/roster/:id", async (c) => {
    const entry = await store.entry(c.req.param("id"));
    return entry ? c.json(entry) : c.json({ error: "not found" }, 404);
  });

  return r;
}
