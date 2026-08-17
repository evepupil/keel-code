import type { Engine } from "@keel-code/engine";
import { Hono } from "hono";

export function providerRoutes(engine: Pick<Engine, "models">): Hono {
  const r = new Hono();

  r.get("/providers", (c) => c.json(engine.models.providers()));

  r.get("/providers/probe", async (c) => {
    const raw = c.req.query("providers");
    const providers = raw ? raw.split(",").filter(Boolean) : undefined;
    const timeoutRaw = c.req.query("timeoutMs");
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    const result = await engine.models.probe({
      ...(providers ? { providers } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    });
    return c.json(result);
  });

  r.put("/providers/:id/key", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { apiKey?: string };
    if (!body.apiKey || typeof body.apiKey !== "string") {
      return c.json({ error: "apiKey 必填" }, 400);
    }
    await engine.models.setApiKey(c.req.param("id"), body.apiKey);
    return c.json({ ok: true });
  });

  r.delete("/providers/:id/key", async (c) => {
    await engine.models.removeApiKey(c.req.param("id"));
    return c.json({ ok: true });
  });

  r.get("/models", async (c) => {
    if (c.req.query("available") === "1") return c.json(await engine.models.available());
    const provider = c.req.query("provider");
    return c.json(engine.models.list(provider ?? undefined));
  });

  return r;
}
