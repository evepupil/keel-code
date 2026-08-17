import type { Engine, SessionKind, ThinkingLevel } from "@keel-code/engine";
import { Hono } from "hono";
import type { SessionHub } from "../hub.js";

const KINDS: SessionKind[] = ["main", "conversation", "subagent"];
const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

interface CreateBody {
  kind?: string;
  title?: string;
  role?: string;
  model?: { provider?: string; id?: string };
  thinkingLevel?: string;
  parentId?: string;
  initialMessage?: string;
}

interface PatchBody {
  title?: string;
  model?: { provider?: string; id?: string };
  thinkingLevel?: string;
  archived?: boolean;
  role?: string;
}

function parseModel(m: CreateBody["model"]): { provider: string; id: string } | undefined {
  if (m && typeof m.provider === "string" && typeof m.id === "string") {
    return { provider: m.provider, id: m.id };
  }
  return undefined;
}

export function sessionRoutes(hub: SessionHub, engine: Engine): Hono {
  const r = new Hono();

  r.get("/sessions", async (c) => {
    if (c.req.query("ensureMain") === "1") await hub.ensureMain();
    const list = await hub.list();
    return c.json(
      list.map((rec) => ({
        ...rec,
        live: hub.liveState(rec.meta.id) ?? null,
      })),
    );
  });

  r.post("/sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as CreateBody;
    const kind = KINDS.includes(body.kind as SessionKind) ? (body.kind as SessionKind) : undefined;
    if (!kind || !body.title) return c.json({ error: "kind 与 title 必填" }, 400);
    const level = LEVELS.includes(body.thinkingLevel as ThinkingLevel)
      ? (body.thinkingLevel as ThinkingLevel)
      : undefined;
    try {
      const model = parseModel(body.model);
      const session = await hub.create({
        kind,
        title: body.title,
        ...(body.role ? { role: body.role } : {}),
        ...(model ? { model } : {}),
        ...(level ? { thinkingLevel: level } : {}),
        ...(body.parentId ? { parentId: body.parentId } : {}),
        ...(body.initialMessage ? { initialMessage: body.initialMessage } : {}),
      });
      return c.json({ meta: session.meta }, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  r.get("/sessions/:id", async (c) => {
    try {
      const s = await hub.get(c.req.param("id"));
      return c.json({ meta: s.meta, messages: s.getMessages(), state: s.getState() });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
    }
  });

  r.post("/sessions/:id/prompt", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      text?: string;
      deliverAs?: "steer" | "followUp";
    };
    if (!body.text?.trim()) return c.json({ error: "text 必填" }, 400);
    try {
      const s = await hub.get(c.req.param("id"));
      const opts = body.deliverAs ? { deliverAs: body.deliverAs } : {};
      // 不等待整轮结束；事件走 WebSocket
      void s.prompt(body.text, opts).catch((e: unknown) => {
        console.error(`[keel-server] prompt 失败（${s.id}）：`, e);
      });
      return c.json({ ok: true }, 202);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
    }
  });

  r.post("/sessions/:id/abort", async (c) => {
    try {
      const s = await hub.get(c.req.param("id"));
      await s.abort();
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
    }
  });

  r.patch("/sessions/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as PatchBody;
    try {
      const s = await hub.get(c.req.param("id"));
      const model = parseModel(body.model);
      if (model) {
        if (!engine.models.get(model)) return c.json({ error: "未知模型" }, 400);
        await s.setModel(model);
      }
      if (LEVELS.includes(body.thinkingLevel as ThinkingLevel)) {
        s.setThinkingLevel(body.thinkingLevel as ThinkingLevel);
      }
      const patch: Record<string, unknown> = {};
      if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
      if (typeof body.archived === "boolean") patch.archived = body.archived;
      if (typeof body.role === "string") patch.role = body.role;
      if (Object.keys(patch).length > 0) s.updateMeta(patch);
      return c.json({ meta: s.meta });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
    }
  });

  return r;
}
