/**
 * 把三道闸挂到引擎钩子上：
 * - tool_call：guard-frontend（写业务页前先有设计系统）、commit-gate（review credit + 项目门禁）
 * - tool_result：lint-on-write（写后格式化）
 * 每条都按 .keel/config.json 的开关实时判断（逃生舱）。
 */
import type { Engine, HookScope, Unsubscribe } from "@keel-code/engine";
import { isGitRepo, readReviewState, treeHash } from "@keel-code/loop";
import { changedPaths, isDocsOnlyChange } from "./commit/docs-only.js";
import { extractCommand, isGitCommit, judgeReviewCredit, runProjectGate } from "./commit/gate.js";
import { readProjectConfig } from "./config/keel-config.js";
import { collectPaths, judgeFrontendWrite, WRITE_TOOL_RE } from "./frontend/guard.js";
import { formatFile } from "./lint/on-write.js";

export interface RegisterGuardsDeps {
  engine: Engine;
  /** review 状态文件（与闭环编排器共用） */
  reviewStateFile: string;
  /** 项目门禁超时 */
  projectGateTimeoutMs?: number;
  /** 提交成功后回调（刷新 review credit 的树指纹） */
  onCommitted?: () => Promise<void> | void;
}

export function registerGuards(deps: RegisterGuardsDeps): Unsubscribe {
  const { engine } = deps;
  const cwd = engine.cwd;
  // 守卫只作用于会写代码的会话；reviewer 等子 agent 本就只读
  const scope: HookScope = { kinds: ["main", "conversation", "subagent"] };
  const offs: Unsubscribe[] = [];

  offs.push(
    engine.hooks.onToolCall((i) => {
      const cfg = readProjectConfig(cwd);
      if (!cfg.guards.frontend) return undefined;
      const reason = judgeFrontendWrite({ toolName: i.toolName, input: i.input, cwd });
      return reason ? { block: true, reason } : undefined;
    }, scope),
  );

  offs.push(
    engine.hooks.onToolCall(async (i) => {
      if (!/bash|shell|pwsh|terminal|cmd/i.test(i.toolName)) return undefined;
      const command = extractCommand(i.input);
      if (!command || !isGitCommit(command)) return undefined;
      const cfg = readProjectConfig(cwd);
      // 纯文档提交（docs/ .keel/ *.md）不需要 review，也不跑项目门禁
      if (isDocsOnlyChange(await changedPaths(cwd))) return undefined;
      if (cfg.guards.commitGate && cfg.loop) {
        const tree = (await isGitRepo(cwd)) ? await treeHash(cwd) : "no-git";
        const reason = judgeReviewCredit({
          reviewState: readReviewState(deps.reviewStateFile),
          currentTree: tree,
        });
        if (reason) return { block: true, reason };
      }
      if (cfg.guards.projectGate) {
        const r = await runProjectGate(cwd, deps.projectGateTimeoutMs);
        if (!r.ok) {
          return {
            block: true,
            reason: `keel commit-gate 拦截：项目门禁未通过（${r.ran.join("、")}）。修好再提交。输出尾部：\n${r.output}`,
          };
        }
      }
      return undefined;
    }, scope),
  );

  offs.push(
    engine.hooks.onToolResult(async (i) => {
      const cfg = readProjectConfig(cwd);
      if (i.isError) return;
      if (/bash|shell|pwsh|terminal|cmd/i.test(i.toolName)) {
        const command = extractCommand(i.input);
        if (command && isGitCommit(command)) await deps.onCommitted?.();
        return;
      }
      if (!cfg.guards.lintOnWrite || !WRITE_TOOL_RE.test(i.toolName)) return;
      for (const p of collectPaths(i.input)) await formatFile(cwd, p);
    }, scope),
  );

  return () => {
    for (const off of offs) off();
  };
}
