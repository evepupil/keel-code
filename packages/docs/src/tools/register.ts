/**
 * 设计确认相关的 AI 工具（作用域 main + conversation）：
 * - keel_design_confirm：到确认点，请求用户在 Web 里批注文档（写 keel/design-confirm 条目 → UI 弹卡片）
 * - keel_doc_changes：读文档的批注块 + git diff（AI 据此逐条回显理解）
 * - keel_design_freeze：用户确认后写冻结标记（可选清理批注块）
 */
import { existsSync } from "node:fs";
import type { Engine, HookScope, Unsubscribe } from "@keel-code/engine";
import { Type } from "@keel-code/engine";
import { parseAnnotations, stripAnnotations } from "../annotations/blocks.js";
import { fileDiff, shortHead } from "../files/git-diff.js";
import { readDoc, resolveInside, writeDoc } from "../files/safe-path.js";
import { applyFreeze, readFreeze } from "../freeze/marker.js";

export const DESIGN_CONFIRM_ENTRY = "keel/design-confirm";
export const DESIGN_FREEZE_ENTRY = "keel/design-freeze";

export interface DesignConfirmData {
  at: string;
  path: string;
  summary: string;
}

export interface RegisterDocToolsDeps {
  engine: Engine;
  getSession: (id: string) => Promise<{ appendEntry(type: string, data: unknown): void }>;
}

export function registerDocTools(deps: RegisterDocToolsDeps): Unsubscribe {
  const { engine } = deps;
  const cwd = engine.cwd;
  const scope: HookScope = { kinds: ["main", "conversation"] };
  const offs: Unsubscribe[] = [];

  offs.push(
    engine.tools.register(
      {
        name: "keel_design_confirm",
        label: "请求设计确认",
        description:
          "设计文档写好后到确认点：调用它，工作台会弹出「设计文档待确认」卡片，用户点开就能在文档上批注 / 直改。之后等用户说改完了，再用 keel_doc_changes 读改动并逐条回显理解；用户确认后 keel_design_freeze 冻结。",
        parameters: Type.Object({
          path: Type.String({
            description: "设计文档路径（相对项目根，如 docs/模块设计/登录.md）",
          }),
          summary: Type.String({ description: "一句话说明这份设计解决什么、请用户重点看哪里" }),
        }),
        execute: async (params, ctx) => {
          const p = params as { path: string; summary: string };
          if (!existsSync(resolveInside(cwd, p.path)))
            return `文档不存在：${p.path}，先写好设计文档再请求确认。`;
          const session = await deps.getSession(ctx.sessionId);
          session.appendEntry(DESIGN_CONFIRM_ENTRY, {
            at: new Date().toISOString(),
            path: p.path,
            summary: p.summary,
          } satisfies DesignConfirmData);
          return `已请求用户确认 ${p.path}。工作台会打开文档供批注 / 直改。请停下等用户回复；用户说改完了，再调用 keel_doc_changes 读改动。`;
        },
      },
      scope,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_doc_changes",
        label: "读文档改动",
        description:
          "读取一份文档的批注块（> [!批注] …）与相对 HEAD 的 diff，用于逐条回显「你改的是 X，我理解为 Y」。",
        parameters: Type.Object({ path: Type.String() }),
        execute: async (params) => {
          const p = params as { path: string };
          if (!existsSync(resolveInside(cwd, p.path))) return `文档不存在：${p.path}`;
          const text = readDoc(cwd, p.path);
          const notes = parseAnnotations(text);
          const diff = await fileDiff(cwd, p.path);
          const frozen = readFreeze(text);
          const lines: string[] = [];
          lines.push(`# ${p.path}`);
          if (frozen) lines.push(`当前冻结标记：${frozen.commit} · ${frozen.at}`);
          lines.push("");
          lines.push(`## 批注块（${notes.length} 条）`);
          if (notes.length === 0) lines.push("（无）");
          notes.forEach((n, i) => {
            lines.push(`${i + 1}. [第 ${n.line + 1} 行] 锚点：「${n.anchor}」`);
            lines.push(`   批注：${n.text || "（空）"}`);
          });
          lines.push("");
          lines.push("## 相对 HEAD 的 diff");
          lines.push(diff.trim() ? "```diff" : "（无未提交改动）");
          if (diff.trim()) {
            lines.push(
              diff.length > 12000 ? `${diff.slice(0, 12000)}\n…（已截断）` : diff.trimEnd(),
            );
            lines.push("```");
          }
          lines.push("");
          lines.push(
            "下一步：把每条批注 / 改动翻译成具体设计变化，逐条回显「你改的是 X，我理解为要变成 Y，对吗？」，等用户确认后再改文档正文并调用 keel_design_freeze。",
          );
          return lines.join("\n");
        },
      },
      scope,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_design_freeze",
        label: "冻结设计",
        description:
          "用户确认设计后调用：在文档头部写「设计已确认 · 冻结版本」标记，默认顺手清理批注块。冻结后才允许实现。",
        parameters: Type.Object({
          path: Type.String(),
          note: Type.Optional(Type.String({ description: "备注（如「按批注修订后确认」）" })),
          keepAnnotations: Type.Optional(Type.Boolean({ description: "保留批注块（默认清理）" })),
        }),
        execute: async (params, ctx) => {
          const p = params as { path: string; note?: string; keepAnnotations?: boolean };
          if (!existsSync(resolveInside(cwd, p.path))) return `文档不存在：${p.path}`;
          let text = readDoc(cwd, p.path);
          let removed = 0;
          if (!p.keepAnnotations) {
            const r = stripAnnotations(text);
            text = r.text;
            removed = r.removed;
          }
          const commit = (await shortHead(cwd)) ?? "uncommitted";
          const at = new Date().toISOString();
          text = applyFreeze(text, { commit, at, ...(p.note ? { note: p.note } : {}) });
          writeDoc(cwd, p.path, text);
          const session = await deps.getSession(ctx.sessionId);
          session.appendEntry(DESIGN_FREEZE_ENTRY, {
            at,
            path: p.path,
            commit,
            note: p.note ?? "",
          });
          return `已冻结 ${p.path}（基于 ${commit}${removed ? `，清理了 ${removed} 条批注块` : ""}）。请把文档改动提交（纯文档提交不需要 review），然后开始分批实现。`;
        },
      },
      scope,
    ),
  );

  return () => {
    for (const off of offs) off();
  };
}
