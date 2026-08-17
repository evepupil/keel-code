import type { Engine } from "@keel-code/engine";
import { Hono } from "hono";

export function providerRoutes(engine: Pick<Engine, "models">): Hono {
  const r = new Hono();

  r.get("/providers", (c) => {
    if (c.req.query("scope") === "all") return c.json(engine.models.providers());
    return c.json(engine.models.added());
  });

  r.get("/providers/builtins", (c) => c.json(engine.models.unusedBuiltins()));

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

  r.get("/providers/:id/catalog", (c) => {
    const cat = engine.models.catalog(c.req.param("id"));
    if (!cat) return c.json({ error: "未添加该提供方" }, 404);
    return c.json(cat);
  });

  r.put("/providers/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      kind?: "builtin" | "custom";
      name?: string;
      baseUrl?: string;
      api?: string;
      apiKey?: string;
      models?: {
        id: string;
        name?: string;
        reasoning?: boolean;
        input?: ("text" | "image")[];
        cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
        contextWindow?: number;
        maxTokens?: number;
      }[];
    };
    try {
      const info = await engine.models.upsertProvider({
        id,
        kind: body.kind ?? "custom",
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
        ...(body.api !== undefined ? { api: body.api } : {}),
        ...(body.apiKey !== undefined ? { apiKey: body.apiKey } : {}),
        ...(body.models !== undefined ? { models: body.models } : {}),
      });
      return c.json(info);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  r.delete("/providers/:id", async (c) => {
    await engine.models.removeProvider(c.req.param("id"));
    return c.json({ ok: true });
  });

  r.post("/providers/fetch-models", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      providerId?: string;
      baseUrl?: string;
      api?: string;
      apiKey?: string;
    };
    if (!body.providerId && (!body.baseUrl || !body.api)) {
      return c.json({ error: "providerId，或 baseUrl + api 必填" }, 400);
    }
    try {
      return c.json(
        await engine.models.fetchRemoteModels({
          ...(body.providerId ? { providerId: body.providerId } : {}),
          ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
          ...(body.api ? { api: body.api } : {}),
          ...(body.apiKey ? { apiKey: body.apiKey } : {}),
        }),
      );
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
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
