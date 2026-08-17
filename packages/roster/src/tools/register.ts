/**
 * 把对话 / 名册 / 子 agent 能力包装成引擎工具，按会话 kind 下发：
 * - 主对话独有：keel_providers_probe / keel_conversation_create / send / read / handoff / archive
 * - 主对话 + 普通对话：keel_conversation_list / keel_roster_update / keel_agent_run
 * - 普通对话独有：keel_report_to_main
 */
import type { Engine, HookScope, ModelRef, ThinkingLevel, Unsubscribe } from "@keel-code/engine";
import { Type } from "@keel-code/engine";
import { applyLock, renderProbeDigest } from "../models/tiers.js";
import { renderRosterDigest } from "../registry/digest.js";
import type { RosterStore } from "../registry/store.js";
import { AGENT_RUN_PARAMS, type SubagentRunner } from "../subagents/run.js";
import type { ConversationGateway, RosterOptions } from "../types.js";
import {
  renderWorkflowResult,
  runWorkflow,
  WORKFLOW_PARAMS,
  type WorkflowStep,
} from "../workflow/run.js";

export interface RegisterRosterToolsDeps {
  engine: Engine;
  gateway: ConversationGateway;
  store: RosterStore;
  runner: SubagentRunner;
  options?: RosterOptions;
}

const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

const ModelRefSchema = Type.Object({ provider: Type.String(), id: Type.String() });

function asModelRef(v: unknown): ModelRef | undefined {
  const m = v as { provider?: unknown; id?: unknown } | undefined;
  return m && typeof m.provider === "string" && typeof m.id === "string"
    ? { provider: m.provider, id: m.id }
    : undefined;
}

export function registerRosterTools(deps: RegisterRosterToolsDeps): Unsubscribe {
  const { engine, gateway, store, runner } = deps;
  const offs: Unsubscribe[] = [];
  const mainOnly: HookScope = { kinds: ["main"] };
  const talkers: HookScope = { kinds: ["main", "conversation"] };
  const convOnly: HookScope = { kinds: ["conversation"] };

  // ---------- 主对话独有 ----------
  offs.push(
    engine.tools.register(
      {
        name: "keel_providers_probe",
        label: "探测模型端点",
        description:
          "探测本机已配置凭据的 API 端点：连通性、时延、可用模型、单价 / 上下文 / 档位。创建对话或子 agent 前先调它挑模型。",
        parameters: Type.Object({
          providers: Type.Optional(
            Type.Array(Type.String(), { description: "只探测这些 provider id；缺省全部已配置的" }),
          ),
        }),
        execute: async (params) => {
          const p = params as { providers?: string[] };
          const probes = await engine.models.probe(p.providers ? { providers: p.providers } : {});
          return renderProbeDigest(probes);
        },
      },
      mainOnly,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_conversation_create",
        label: "创建对话",
        description:
          "创建一条新的长期对话（用户可随时进入）。三步：先 keel_providers_probe 看模型 → 按任务性质挑 → 创建。职责段会注入这条对话的系统提示。",
        parameters: Type.Object({
          title: Type.String({ description: "标题，如「前端开发」「需求讨论」「杂活」" }),
          role: Type.String({
            description: "职责段：一句话职责 + 上下文领域 + 代码范围 + 当前要做的事",
          }),
          model: Type.Optional(ModelRefSchema),
          thinkingLevel: Type.Optional(
            Type.Union(THINKING.map((t) => Type.Literal(t)) as never, { description: "推理档" }),
          ),
          contextScope: Type.Optional(Type.String({ description: "上下文领域（名册字段）" })),
          codeRange: Type.Optional(
            Type.Array(Type.String(), { description: "负责的代码范围 glob" }),
          ),
          initialMessage: Type.Optional(
            Type.String({ description: "创建后立刻发给它的第一条消息" }),
          ),
        }),
        execute: async (params) => {
          const p = params as {
            title: string;
            role: string;
            model?: unknown;
            thinkingLevel?: ThinkingLevel;
            contextScope?: string;
            codeRange?: string[];
            initialMessage?: string;
          };
          const lock = applyLock(
            "conversation",
            asModelRef(p.model),
            deps.options?.getModelLocks?.(),
          );
          const session = await gateway.create({
            kind: "conversation",
            title: p.title,
            role: p.role,
            ...(lock.model ? { model: lock.model } : {}),
            ...(p.thinkingLevel ? { thinkingLevel: p.thinkingLevel } : {}),
            ...(p.initialMessage ? { initialMessage: p.initialMessage } : {}),
          });
          await store.update(session.id, {
            role: p.role,
            ...(p.contextScope ? { contextScope: p.contextScope } : {}),
            ...(p.codeRange ? { codeRange: p.codeRange } : {}),
          });
          const m = session.meta.model;
          return [
            `已创建对话「${p.title}」 id=${session.id}，模型 ${m.provider}/${m.id}。`,
            lock.note ?? "",
            p.initialMessage
              ? "第一条消息已发出，它会自行开始。"
              : "用 keel_conversation_send 给它派活。",
            "用户可以在左侧列表直接进入这条对话。",
          ]
            .filter(Boolean)
            .join("\n");
        },
      },
      mainOnly,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_conversation_send",
        label: "给对话发消息",
        description: "给某条对话追加一轮消息（它在运行中则排在本轮之后）。",
        parameters: Type.Object({
          conversationId: Type.String(),
          message: Type.String(),
        }),
        execute: async (params) => {
          const p = params as { conversationId: string; message: string };
          const target = await gateway.get(p.conversationId);
          const streaming = target.getState().isStreaming;
          await target.prompt(p.message, streaming ? { deliverAs: "followUp" } : {});
          return streaming
            ? `已排队：对话「${target.meta.title}」正在运行，消息会在本轮之后处理。`
            : `已发送给对话「${target.meta.title}」。`;
        },
      },
      mainOnly,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_conversation_read",
        label: "读对话摘要",
        description: "读某条对话的名册记录和最近几条结论（导航用，不是全文）。",
        parameters: Type.Object({
          conversationId: Type.String(),
          lastMessages: Type.Optional(
            Type.Number({ description: "最近几条 assistant 消息，默认 3" }),
          ),
        }),
        execute: async (params) => {
          const p = params as { conversationId: string; lastMessages?: number };
          const entry = await store.entry(p.conversationId);
          if (!entry) return `找不到对话 ${p.conversationId}。`;
          const session = await gateway.get(p.conversationId);
          const n = Math.max(1, Math.min(10, p.lastMessages ?? 3));
          const recent = session
            .getMessages()
            .filter((m) => m.role === "assistant")
            .slice(-n)
            .map((m) =>
              m.role === "assistant"
                ? m.content
                    .filter((c): c is { type: "text"; text: string } => c.type === "text")
                    .map((c) => c.text)
                    .join("\n")
                    .slice(0, 800)
                : "",
            )
            .filter(Boolean);
          return [
            renderRosterDigest([entry], { includeArchived: true, includeSubagents: true }),
            "",
            `最近 ${recent.length} 条结论：`,
            ...recent.map((t, i) => `${i + 1}. ${t}`),
          ].join("\n");
        },
      },
      mainOnly,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_conversation_handoff",
        label: "交接给对话",
        description: "把用户当前意图连同必要上下文交接给另一条对话（推荐流程用）。",
        parameters: Type.Object({
          conversationId: Type.String(),
          intent: Type.String({ description: "用户想做什么（一句话）" }),
          context: Type.Optional(
            Type.String({ description: "必要背景：已定决定、相关文档路径、约束" }),
          ),
        }),
        execute: async (params) => {
          const p = params as { conversationId: string; intent: string; context?: string };
          const target = await gateway.get(p.conversationId);
          const text = [
            "【来自主对话的交接】",
            `意图：${p.intent}`,
            p.context ? `背景：${p.context}` : "",
            "请接手；有新决定同步名册（keel_roster_update），完成后 keel_report_to_main 汇报。",
          ]
            .filter(Boolean)
            .join("\n");
          const streaming = target.getState().isStreaming;
          await target.prompt(text, streaming ? { deliverAs: "followUp" } : {});
          return `已交接给对话「${target.meta.title}」。`;
        },
      },
      mainOnly,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_conversation_archive",
        label: "归档对话",
        description: "归档一条对话（用户仍可在「已归档」里查看）。",
        parameters: Type.Object({ conversationId: Type.String() }),
        execute: async (params) => {
          const p = params as { conversationId: string };
          const target = await gateway.get(p.conversationId);
          if (target.meta.kind === "main") return "主对话不能归档。";
          target.updateMeta({ archived: true });
          await store.project();
          return `已归档对话「${target.meta.title}」。`;
        },
      },
      mainOnly,
    ),
  );

  // ---------- 主对话 + 普通对话 ----------
  offs.push(
    engine.tools.register(
      {
        name: "keel_conversation_list",
        label: "名册",
        description: "列出项目里的对话（导航信息 + 新鲜度），不加载任何对话内容。",
        parameters: Type.Object({
          includeArchived: Type.Optional(Type.Boolean()),
          includeSubagents: Type.Optional(Type.Boolean()),
        }),
        execute: async (params) => {
          const p = params as { includeArchived?: boolean; includeSubagents?: boolean };
          const entries = await store.entries();
          return renderRosterDigest(entries, {
            ...(p.includeArchived !== undefined ? { includeArchived: p.includeArchived } : {}),
            ...(p.includeSubagents !== undefined ? { includeSubagents: p.includeSubagents } : {}),
          });
        },
      },
      talkers,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_roster_update",
        label: "更新名册",
        description:
          "更新你自己在名册里的导航信息（当前认知 / 最近工作 / 未解决 / 关键产物 / 适合接什么）。用户改了需求或你完成一批工作后调用。会自动记录当前 commit 与代码范围指纹。",
        parameters: Type.Object({
          role: Type.Optional(Type.String()),
          contextScope: Type.Optional(Type.String()),
          codeRange: Type.Optional(Type.Array(Type.String())),
          currentUnderstanding: Type.Optional(Type.String()),
          keyArtifacts: Type.Optional(Type.Array(Type.String())),
          recentWork: Type.Optional(Type.String()),
          unresolved: Type.Optional(Type.Array(Type.String())),
          suitableFor: Type.Optional(Type.Array(Type.String())),
          notSuitableFor: Type.Optional(Type.Array(Type.String())),
        }),
        execute: async (params, ctx) => {
          const merged = await store.update(ctx.sessionId, params as Record<string, never>);
          return `名册已更新（base-commit ${merged.baseCommit?.slice(0, 7) ?? "无"}，code-hash ${merged.codeHash ?? "无"}）。`;
        },
      },
      talkers,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_agent_run",
        label: "运行子 agent",
        description:
          "派一个一次性子 agent：clean（干净上下文，只带任务）或 fork（复制你当前上下文）。适合并行探索、跑回归、按摘要重建认知。结果直接返回给你；子 agent 不长期存在。",
        parameters: AGENT_RUN_PARAMS,
        execute: async (params, ctx) => {
          const p = params as {
            mode: "clean" | "fork";
            task: string;
            title?: string;
            model?: unknown;
            readOnly?: boolean;
          };
          const parent = await gateway.get(ctx.sessionId);
          const lock = applyLock("subagent", asModelRef(p.model), deps.options?.getModelLocks?.());
          const r = await runner.run({
            parent,
            mode: p.mode,
            task: p.task,
            ...(p.title ? { title: p.title } : {}),
            ...(lock.model ? { model: lock.model } : {}),
            ...(p.readOnly ? { tools: READ_ONLY_TOOLS } : {}),
            ...(ctx.signal ? { signal: ctx.signal } : {}),
          });
          const head = `子 agent ${r.finished === "completed" ? "完成" : `结束（${r.finished}${r.error ? `：${r.error}` : ""}）`}，会话 id=${r.sessionId}，费用 $${r.costUsd.toFixed(4)}。`;
          return `${head}\n${lock.note ?? ""}\n结果：\n${r.text || "（无文本结论）"}`.replace(
            /\n\n+/g,
            "\n",
          );
        },
      },
      talkers,
    ),
  );

  offs.push(
    engine.tools.register(
      {
        name: "keel_workflow_run",
        label: "运行 workflow",
        description:
          "声明式编排一组子 agent 步骤：无依赖的并行跑，有 dependsOn 的等前置完成后再跑（前置结论会拼进任务）。适合多维度 review、批量迁移、多方案评审。结果汇总返回。",
        parameters: WORKFLOW_PARAMS,
        execute: async (params, ctx) => {
          const p = params as { steps: WorkflowStep[]; maxParallel?: number };
          const parent = await gateway.get(ctx.sessionId);
          const locks = deps.options?.getModelLocks?.();
          const steps = p.steps.map((s) => ({
            ...s,
            ...(applyLock("subagent", s.model, locks).model
              ? { model: applyLock("subagent", s.model, locks).model }
              : {}),
          })) as WorkflowStep[];
          const r = await runWorkflow({
            runner,
            parent,
            steps,
            ...(p.maxParallel ? { maxParallel: p.maxParallel } : {}),
            ...(ctx.signal ? { signal: ctx.signal } : {}),
          });
          return renderWorkflowResult(r);
        },
      },
      talkers,
    ),
  );

  // ---------- 普通对话独有 ----------
  offs.push(
    engine.tools.register(
      {
        name: "keel_report_to_main",
        label: "向主对话汇报",
        description: "向主对话汇报进展 / 新决定 / 需要它创建新对话的请求。",
        parameters: Type.Object({ message: Type.String() }),
        execute: async (params, ctx) => {
          const p = params as { message: string };
          const main = (await gateway.list()).find(
            (r) => r.meta.kind === "main" && !r.meta.archived,
          );
          if (!main) return "没有主对话可汇报。";
          const self = await gateway.get(ctx.sessionId);
          const target = await gateway.get(main.meta.id);
          const streaming = target.getState().isStreaming;
          await target.prompt(
            `【来自对话「${self.meta.title}」(id=${self.id}) 的汇报】\n${p.message}`,
            streaming ? { deliverAs: "followUp" } : {},
          );
          return "已汇报给主对话。";
        },
      },
      convOnly,
    ),
  );

  return () => {
    for (const off of offs) off();
  };
}
