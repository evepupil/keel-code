import { Hono } from "hono";
import type { WorkspaceManager } from "../workspaces/manager.js";
import { pickFolder } from "../workspaces/pick-folder.js";

export function workspaceRoutes(manager: WorkspaceManager): Hono {
  const r = new Hono();

  r.get("/workspaces", (c) => c.json(manager.list()));

  r.post("/workspaces", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; name?: string };
    if (!body.path || typeof body.path !== "string") return c.json({ error: "path 必填" }, 400);
    try {
      const view = manager.add(body.path, body.name);
      return c.json(view, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  /** 弹系统「选择文件夹」对话框（服务在本机才有意义） */
  r.post("/workspaces/pick", async (c) => {
    const result = await pickFolder();
    return c.json(result);
  });

  r.delete("/workspaces/:id", async (c) => {
    const ok = await manager.remove(c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  return r;
}
