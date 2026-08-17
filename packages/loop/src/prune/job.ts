/**
 * 文档修剪 job：每次 `git commit` 成功后，派一个 clean 子 agent 兜底检查文档是否同步。
 * 只整理（补漏 / 去重 / 删过期 / 一致性），不创造产品决定；冲突写进待决策。异步运行，不阻塞实现对话。
 */
import { execFile } from "node:child_process";
import type { Engine, HookScope, Unsubscribe } from "@keel-code/engine";
import type { ConversationGateway, SubagentRunner } from "@keel-code/roster";
import { extractCommand, isGitCommit, SHELL_TOOL_RE } from "../credit/commit-detect.js";

export const DOC_PRUNE_ENTRY = "keel/doc-prune";

export interface DocPruneDeps {
  engine: Engine;
  gateway: ConversationGateway;
  runner: SubagentRunner;
  enabled: () => boolean;
  /** 只对这些会话类型触发 */
  scope?: HookScope;
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["-c", "core.quotepath=off", ...args], { cwd, windowsHide: true }, (err, out) =>
      resolve(err ? "" : out),
    );
  });
}

export function prunePrompt(input: { commit: string; stat: string; message: string }): string {
  return [
    "你是 keel 的文档修剪 job（项目的文档管理员）。刚刚有一次提交，请兜底检查文档是否与代码同步。",
    "",
    `提交：${input.commit}`,
    `提交说明：${input.message.trim()}`,
    "改动文件：",
    input.stat.trim() || "（无法获取）",
    "",
    "要做的事：",
    "1. 找出这次改动涉及的模块（按目录 / 包名），检查 docs/模块设计/ 里对应的模块文档：「当前实现」「验证方式」「改动历史」有没有反映这次改动；缺就补，过期就改，重复就删。",
    "2. 只有里程碑状态 / 依赖 / 退出标准 / 整体进度变化时才改 docs/roadmap.md。",
    "3. 检查 roadmap 与模块文档的双向链接是否有效。",
    "4. 纯文档改动直接 git commit（提交说明以「docs: 文档修剪」开头）；纯文档提交不需要 review。",
    "",
    "边界：只整理、去重、同步、标记过期；不创造产品决定；不无痕删除历史决策；发现文档与代码冲突且拿不准的，写进 docs/review/待决策.md 而不是自己改。",
    "文档都同步、无需改动时，直接说明「无需修剪」并停止。最后用两三句话总结你改了什么。",
  ].join("\n");
}

/** 挂到 tool_result：提交成功后异步派修剪子 agent，结果写 keel/doc-prune 条目。 */
export function registerDocPruneJob(deps: DocPruneDeps): Unsubscribe {
  const { engine, gateway, runner } = deps;
  const scope: HookScope = deps.scope ?? { kinds: ["main", "conversation"] };
  return engine.hooks.onToolResult(async (i) => {
    if (i.isError || !SHELL_TOOL_RE.test(i.toolName)) return;
    const command = extractCommand(i.input);
    if (!command || !isGitCommit(command)) return;
    if (!deps.enabled()) return;
    const cwd = engine.cwd;
    const commit = (await git(cwd, ["rev-parse", "--short", "HEAD"])).trim();
    const message = await git(cwd, ["log", "-1", "--pretty=%B"]);
    if (/^docs: 文档修剪/.test(message.trim())) return; // 修剪自己的提交不再触发
    const stat = await git(cwd, ["show", "--stat", "--format=", "HEAD"]);
    const parent = await gateway.get(i.sessionId);
    void runner
      .run({
        parent,
        mode: "clean",
        title: `文档修剪：${commit}`,
        task: prunePrompt({ commit, stat, message }),
        tier: engine.settings.get().kindTiers?.docPrune ?? "light",
      })
      .then((r) => {
        parent.appendEntry(DOC_PRUNE_ENTRY, {
          at: new Date().toISOString(),
          commit,
          finished: r.finished,
          summary: r.text.slice(0, 1200),
          sessionId: r.sessionId,
          costUsd: r.costUsd,
        });
      })
      .catch((e: unknown) => {
        console.error("[keel-loop] 文档修剪 job 失败：", e);
      });
  }, scope);
}
