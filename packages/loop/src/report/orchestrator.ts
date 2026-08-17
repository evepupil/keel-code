/**
 * 闭环编排器：keel_batch_report 是绑定入口。
 * 实现对话上报批次 → 起独立只读 reviewer（clean 子 agent + submit_result 结构化结论）→ 代码内分类路由：
 *   deterministic → 修复指令作为工具返回值回传（≤ maxRounds 轮）
 *   decision      → 追加 docs/review/待决策.md，批次挂起，要求转述用户
 *   pass          → 写 review-pass（树指纹），输出验收简述模板
 *   轮次到上限     → 升级为待决策
 * 每一步都以 keel/review 条目落在实现对话里（UI 渲染卡片）。
 */
import type { Engine, HookScope, ModelRef, Unsubscribe } from "@keel-code/engine";
import { Type } from "@keel-code/engine";
import type { ConversationGateway, ModelLocks, SubagentRunner } from "@keel-code/roster";
import { acceptanceBrief } from "../acceptance/brief.js";
import { extractCommand, isGitCommit, SHELL_TOOL_RE } from "../credit/commit-detect.js";
import { readReviewState, writeReviewState } from "../credit/state.js";
import { isGitRepo, treeHash } from "../credit/tree-hash.js";
import { appendDecisions, DECISIONS_REL } from "../decisions/file.js";
import { pickReviewerModel } from "../reviewer/model.js";
import { REVIEW_SCHEMA, reviewerPrompt } from "../reviewer/prompt.js";
import { classify, formatFindings, type ReviewVerdict } from "../route/classify.js";

export const REVIEW_ENTRY = "keel/review";
const READ_ONLY_TOOLS = ["read", "grep", "find", "ls", "bash"];

export interface LoopDeps {
  engine: Engine;
  gateway: ConversationGateway;
  runner: SubagentRunner;
  /** review 状态文件路径（keel 用户目录下） */
  reviewStateFile: string;
  options?: {
    maxRounds?: number;
    reviewerTimeoutMs?: number;
    getModelLocks?: () => ModelLocks;
    /** 逃生舱：整个闭环关掉（留痕由 .keel/config.json 承担） */
    enabled?: () => boolean;
  };
}

export interface ReviewEntryData {
  at: string;
  round: number;
  batch: string;
  action: "pass" | "fix" | "suspend" | "escalate" | "error";
  summary?: string;
  findings?: ReviewVerdict["findings"];
  treeHash?: string;
  reviewerSessionId?: string;
  reviewerModel?: ModelRef;
  costUsd?: number;
}

export function registerBatchReportTool(deps: LoopDeps): Unsubscribe {
  const { engine, gateway, runner } = deps;
  const maxRounds = deps.options?.maxRounds ?? 3;
  const scope: HookScope = { kinds: ["main", "conversation"] };

  // 提交成功后刷新 review credit：review 过的树随提交入库，新基线继续有效
  const offRefresh = engine.hooks.onToolResult(async (i) => {
    if (i.isError || !SHELL_TOOL_RE.test(i.toolName)) return;
    const command = extractCommand(i.input);
    if (!command || !isGitCommit(command)) return;
    const state = readReviewState(deps.reviewStateFile);
    if (!state.lastPass) return;
    state.lastPass.tree = (await isGitRepo(engine.cwd)) ? await treeHash(engine.cwd) : "no-git";
    writeReviewState(deps.reviewStateFile, state);
  });

  const offTool = engine.tools.register(
    {
      name: "keel_batch_report",
      label: "批次上报",
      description:
        "批次完成上报——keel 绑定闭环的唯一入口。实现批次完成后必须调用：系统自动起独立只读 reviewer 复核，确定性问题的修复指令会出现在返回结果里，修完再次调用直到通过；通过后写入 review-pass 记录，git commit 门禁凭该记录放行。产品 / 需求类问题会记入 docs/review/待决策.md 并要求转述用户。",
      parameters: Type.Object({
        batch: Type.String({ description: "本批完成了什么（业务结果，非代码细节）" }),
        scope: Type.Optional(
          Type.String({ description: "本批涉及的文件 / 目录，如 src/views/hello-page/" }),
        ),
        designDoc: Type.Optional(Type.String({ description: "对应的设计文档路径（如有）" })),
      }),
      execute: async (params, ctx) => {
        if (deps.options?.enabled && !deps.options.enabled()) {
          return "闭环已被 .keel/config.json 关闭（逃生舱）。请直接向用户输出验收简述。";
        }
        const p = params as { batch: string; scope?: string; designDoc?: string };
        const parent = await gateway.get(ctx.sessionId);
        const state = readReviewState(deps.reviewStateFile);
        const round = state.roundsSincePass + 1;
        const emit = (data: Omit<ReviewEntryData, "at" | "round" | "batch">) => {
          try {
            parent.appendEntry(REVIEW_ENTRY, {
              at: new Date().toISOString(),
              round,
              batch: p.batch,
              ...data,
            } satisfies ReviewEntryData);
          } catch {
            // UI 不背锅
          }
        };

        // 1. reviewer：干净上下文 + 结构化结论
        const chosen = await pickReviewerModel(
          engine,
          parent.meta.model,
          deps.options?.getModelLocks?.(),
        );
        const previous = state.roundsSincePass > 0 ? lastFixFindings(parent) : undefined;
        const run = await runner.run({
          parent,
          mode: "clean",
          title: `reviewer 第 ${round} 轮：${p.batch.slice(0, 20)}`,
          task: reviewerPrompt({
            cwd: engine.cwd,
            batch: p.batch,
            round,
            ...(p.scope ? { scope: p.scope } : {}),
            ...(p.designDoc ? { designDoc: p.designDoc } : {}),
            ...(previous ? { previousFindings: previous } : {}),
          }),
          model: chosen.model,
          tools: READ_ONLY_TOOLS,
          outputSchema: REVIEW_SCHEMA,
          timeoutMs: deps.options?.reviewerTimeoutMs ?? 10 * 60 * 1000,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
        if (run.finished !== "completed" || !isVerdict(run.structured)) {
          emit({
            action: "error",
            reviewerSessionId: run.sessionId,
            reviewerModel: chosen.model,
            costUsd: run.costUsd,
          });
          return `⛔ reviewer 未给出结构化结论（${run.finished}${run.error ? `：${run.error}` : ""}）。稍后重试 keel_batch_report，或请用户人工复核。`;
        }
        const verdict = run.structured;
        const route = classify(verdict, round, maxRounds);
        const common = {
          reviewerSessionId: run.sessionId,
          reviewerModel: chosen.model,
          costUsd: run.costUsd,
          ...(verdict.summary ? { summary: verdict.summary } : {}),
        };

        // 2. 路由
        if (route.decisions.length > 0) appendDecisions(engine.cwd, route.decisions, p.batch);

        if (route.action === "suspend") {
          emit({ action: "suspend", findings: route.decisions, ...common });
          return [
            `⏸ review 发现 ${route.decisions.length} 条需要用户拍板的问题，已记录到 ${DECISIONS_REL}。本批挂起（未写 review-pass）。`,
            "请向用户逐条转述并等待决定，不要自行取舍：",
            formatFindings(route.decisions),
          ].join("\n");
        }

        if (route.action === "pass") {
          const tree = (await isGitRepo(engine.cwd)) ? await treeHash(engine.cwd) : "no-git";
          writeReviewState(deps.reviewStateFile, {
            roundsSincePass: 0,
            lastPass: { tree, at: new Date().toISOString(), batch: p.batch, sessionId: parent.id },
          });
          emit({ action: "pass", treeHash: tree, ...common });
          return [
            `✅ review 通过（第 ${round} 轮，reviewer ${chosen.model.provider}/${chosen.model.id}，${chosen.note}）。${verdict.summary ?? ""}`,
            route.notes.length
              ? `（reviewer 备注：${route.notes.map((n) => n.issue).join("；")}）`
              : "",
            `review-pass 已记录（tree=${tree}），git commit 门禁将凭此放行。`,
            route.decisions.length
              ? `另有 ${route.decisions.length} 条待决策已记录（${DECISIONS_REL}），验收时一并转述。`
              : "",
            "",
            acceptanceBrief(),
          ]
            .filter(Boolean)
            .join("\n");
        }

        if (route.action === "escalate") {
          appendDecisions(
            engine.cwd,
            [
              {
                issue: `review 连续 ${round} 轮未通过，升级处理：需用户介入判断卡点`,
                category: "decision",
              },
            ],
            p.batch,
          );
          writeReviewState(deps.reviewStateFile, { ...state, roundsSincePass: round });
          emit({ action: "escalate", findings: route.deterministic, ...common });
          return [
            `⛔ review 连续 ${round} 轮未通过（上限 ${maxRounds}）。已升级为待决策。`,
            "最后未通过的原因：",
            formatFindings(route.deterministic),
            "请停下，向用户说明卡点与已尝试的修复。",
          ].join("\n");
        }

        writeReviewState(deps.reviewStateFile, { ...state, roundsSincePass: round });
        emit({ action: "fix", findings: [...route.deterministic, ...route.decisions], ...common });
        return [
          `❌ review 未通过（第 ${round}/${maxRounds} 轮，reviewer ${chosen.model.provider}/${chosen.model.id}）。修复以下确定性问题后，重新调用 keel_batch_report：`,
          formatFindings(route.deterministic),
          route.decisions.length
            ? `另有 ${route.decisions.length} 条待决策已记录（${DECISIONS_REL}），向用户转述：\n${formatFindings(route.decisions)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      },
    },
    scope,
  );
  return () => {
    offTool();
    offRefresh();
  };
}

function isVerdict(v: unknown): v is ReviewVerdict {
  const o = v as { verdict?: unknown; findings?: unknown } | undefined;
  return !!o && (o.verdict === "pass" || o.verdict === "fail") && Array.isArray(o.findings);
}

/** 上一轮 fix 的 findings（从实现对话的 keel/review 条目里取最后一条 fix）。 */
function lastFixFindings(parent: {
  getEntries(type?: string): { data: unknown }[];
}): string | undefined {
  const entries = parent.getEntries(REVIEW_ENTRY);
  for (let i = entries.length - 1; i >= 0; i--) {
    const d = entries[i]?.data as ReviewEntryData | undefined;
    if (d?.action === "fix" && d.findings?.length) return formatFindings(d.findings);
  }
  return undefined;
}
