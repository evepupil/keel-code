import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseRoadmap, readDoc } from "@keel-code/docs";
import type { Engine } from "@keel-code/engine";
import { listPendingDecisions, readReviewState, resolveDecision } from "@keel-code/loop";
import type { RosterStore } from "@keel-code/roster";
import { Hono } from "hono";

/** 看板数据：roadmap 投影 + review credit + 待决策 + 名册。数据留仓库，这里只聚合。 */
export function boardRoutes(engine: Engine, store: RosterStore, reviewStateFile: string): Hono {
  const r = new Hono();
  const cwd = engine.cwd;

  r.get("/board", async (c) => {
    const roadmapPath = join(cwd, "docs", "roadmap.md");
    const roadmap = existsSync(roadmapPath) ? parseRoadmap(readDoc(cwd, "docs/roadmap.md")) : null;
    const review = readReviewState(reviewStateFile);
    const decisions = listPendingDecisions(cwd);
    const roster = (await store.entries()).filter(
      (e) => e.kind !== "subagent" && e.status !== "archived",
    );
    return c.json({ roadmap, review, decisions, roster });
  });

  r.post("/decisions/resolve", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { line?: number };
    if (typeof body.line !== "number") return c.json({ error: "line 必填" }, 400);
    const ok = resolveDecision(cwd, body.line);
    return ok
      ? c.json({ ok: true, decisions: listPendingDecisions(cwd) })
      : c.json({ error: "条目不存在" }, 404);
  });

  return r;
}
