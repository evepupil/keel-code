import { existsSync } from "node:fs";
import {
  fileDiff,
  insertAnnotationAfterLine,
  listDocs,
  parseAnnotations,
  readDoc,
  readFreeze,
  resolveInside,
  writeDoc,
} from "@keel-code/docs";
import type { Engine } from "@keel-code/engine";
import { Hono } from "hono";

/** 文档 API：只服务项目内的 markdown；写入限 docs/ 与 .keel/。 */
export function docRoutes(engine: Engine): Hono {
  const r = new Hono();
  const cwd = engine.cwd;

  r.get("/docs", (c) => {
    const dir = c.req.query("dir") ?? "docs";
    try {
      return c.json(listDocs(cwd, dir));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  r.get("/docs/read", async (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path 必填" }, 400);
    try {
      if (!existsSync(resolveInside(cwd, path))) return c.json({ error: "文件不存在" }, 404);
      const content = readDoc(cwd, path);
      const withDiff = c.req.query("diff") === "1";
      return c.json({
        path,
        content,
        annotations: parseAnnotations(content),
        freeze: readFreeze(content) ?? null,
        diff: withDiff ? await fileDiff(cwd, path) : undefined,
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  r.put("/docs/write", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; content?: string };
    if (!body.path || typeof body.content !== "string")
      return c.json({ error: "path 与 content 必填" }, 400);
    try {
      writeDoc(cwd, body.path, body.content);
      return c.json({ ok: true, annotations: parseAnnotations(body.content) });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  r.post("/docs/annotate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      path?: string;
      line?: number;
      text?: string;
    };
    if (!body.path || typeof body.line !== "number" || !body.text?.trim()) {
      return c.json({ error: "path / line / text 必填" }, 400);
    }
    try {
      const content = readDoc(cwd, body.path);
      const next = insertAnnotationAfterLine(content, body.line, body.text.trim());
      writeDoc(cwd, body.path, next);
      return c.json({ ok: true, content: next, annotations: parseAnnotations(next) });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  return r;
}
