import { Hono } from "hono";
import type { ApprovalDecision, ApprovalServices } from "../services/approvals.js";

export function approvalRoutes(approvals: ApprovalServices): Hono {
  const r = new Hono();
  r.get("/approvals", (c) => c.json(approvals.pending()));
  r.post("/approvals/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { decision?: string };
    const d = body.decision as ApprovalDecision | undefined;
    if (d !== "allow" && d !== "deny" && d !== "allow-session") {
      return c.json({ error: "decision 必须是 allow / deny / allow-session" }, 400);
    }
    const ok = approvals.resolve(c.req.param("id"), d);
    return ok ? c.json({ ok: true }) : c.json({ error: "审批请求不存在或已处理" }, 404);
  });
  return r;
}
