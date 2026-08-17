/**
 * 子 agent 运行器：对话内部的一次性委派。
 * - clean：新会话，只带精简方法论 + 任务；
 * - fork：复制父对话上下文前缀 + 任务。
 * 结果交回发起它的对话；轨迹持久化并挂在父对话下（kind = subagent, parentId = 父）。
 */
import { randomUUID } from "node:crypto";
import type {
  Engine,
  EngineSession,
  ModelRef,
  ModelTier,
  ThinkingLevel,
  TSchema,
} from "@keel-code/engine";
import { Type } from "@keel-code/engine";
import { assembleSystemPrompt } from "@keel-code/methodology";
import type { ModelSelector } from "../models/select.js";
import type { ConversationGateway } from "../types.js";

export interface RunSubagentInput {
  parent: EngineSession;
  mode: "clean" | "fork";
  task: string;
  title?: string;
  /** 显式模型；不给则按 tier 落实（再不给按子 agent 默认档） */
  model?: ModelRef;
  tier?: ModelTier;
  /** 落实时尽量避开的模型（reviewer 避开实现者） */
  avoid?: ModelRef;
  thinkingLevel?: ThinkingLevel;
  /** 给了 schema：子 agent 必须调用 submit_result 提交结构化结果 */
  outputSchema?: TSchema;
  /** 只启用这些内置工具（如只读集） */
  tools?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RunSubagentResult {
  sessionId: string;
  finished: "completed" | "timeout" | "aborted" | "error";
  /** 最后一条 assistant 文本 */
  text: string;
  /** submit_result 提交的结构化结果 */
  structured?: unknown;
  costUsd: number;
  error?: string;
  /** 模型落实说明（档次 → 模型 / 回退） */
  modelNote?: string;
}

export interface SubagentRunnerDeps {
  engine: Engine;
  gateway: ConversationGateway;
  /** 能力档选择器；不给则不按档落实（沿用父对话模型） */
  selector?: ModelSelector;
  maxConcurrent?: number;
  defaultTimeoutMs?: number;
}

const RUN_ID_KEY = "subagentRunId";

export class SubagentRunner {
  private running = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly deps: SubagentRunnerDeps) {}

  private async acquire(): Promise<() => void> {
    const max = this.deps.maxConcurrent ?? 4;
    if (this.running >= max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.running += 1;
    return () => {
      this.running -= 1;
      this.waiters.shift()?.();
    };
  }

  async run(input: RunSubagentInput): Promise<RunSubagentResult> {
    const release = await this.acquire();
    const runId = randomUUID();
    let structured: unknown;
    let unregister: (() => void) | undefined;
    try {
      if (input.outputSchema) {
        unregister = this.deps.engine.tools.register(
          {
            name: "submit_result",
            label: "提交结果",
            description: "任务完成后，用这个工具提交结构化结果（必须调用，且只调用一次）。",
            parameters: input.outputSchema,
            execute: async (params) => {
              structured = params;
              return "结果已收到。";
            },
          },
          { match: (meta) => meta.extra?.[RUN_ID_KEY] === runId },
        );
      }

      const title = input.title ?? `子 agent（${input.mode}）：${input.task.slice(0, 24)}`;
      const extra = {
        [RUN_ID_KEY]: runId,
        subagentMode: input.mode,
        task: input.task.slice(0, 200),
      };
      // 模型：显式 > 按档落实（selector）> 继承父对话
      let model = input.model;
      let modelNote: string | undefined;
      if (!model && this.deps.selector) {
        const settings = this.deps.engine.settings.get();
        const tier = input.tier ?? settings.kindTiers?.subagent ?? "standard";
        const r = await this.deps.selector.resolve({
          tier,
          ...(input.avoid ? { avoid: input.avoid } : {}),
        });
        if (r) {
          model = { provider: r.model.provider, id: r.model.id };
          modelNote = r.note;
        }
      }
      let session: EngineSession;
      if (input.mode === "fork") {
        session = await this.deps.engine.sessions.fork(input.parent.id, {
          kind: "subagent",
          title,
          parentId: input.parent.id,
          extra,
          ...(model ? { model } : {}),
          ...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
          ...(input.tools ? { tools: input.tools } : {}),
        });
      } else {
        session = await this.deps.gateway.create({
          kind: "subagent",
          title,
          parentId: input.parent.id,
          extra,
          systemPrompt: assembleSystemPrompt({
            kind: "subagent",
            role: input.outputSchema
              ? "你是一次性子 agent。完成任务后必须调用 submit_result 提交结构化结果，然后停止。"
              : "你是一次性子 agent。完成任务后直接给出结论文本，然后停止。",
          }),
          ...(model ? { model } : {}),
          ...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
          ...(input.tools ? { tools: input.tools } : {}),
        });
      }

      const timeoutMs = input.timeoutMs ?? this.deps.defaultTimeoutMs ?? 10 * 60 * 1000;
      let finished: RunSubagentResult["finished"] = "completed";
      const timer = setTimeout(() => {
        finished = "timeout";
        void session.abort();
      }, timeoutMs);
      const onAbort = () => {
        finished = "aborted";
        void session.abort();
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
      let error: string | undefined;
      try {
        await session.prompt(input.task);
        await session.waitForIdle();
      } catch (e) {
        finished = "error";
        error = e instanceof Error ? e.message : String(e);
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", onAbort);
      }

      const messages = session.getMessages();
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const text =
        lastAssistant?.role === "assistant"
          ? lastAssistant.content
              .filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("\n")
              .trim()
          : "";
      const costUsd = session.getState().usage.costTotal;
      session.updateMeta({ extra: { ...session.meta.extra, subagentFinished: finished } });
      const result: RunSubagentResult = { sessionId: session.id, finished, text, costUsd };
      if (structured !== undefined) result.structured = structured;
      if (error) result.error = error;
      if (modelNote) result.modelNote = modelNote;
      return result;
    } finally {
      unregister?.();
      release();
    }
  }
}

/** 给模型看的 keel_agent_run 参数 schema */
export const AGENT_RUN_PARAMS = Type.Object({
  mode: Type.Union([Type.Literal("clean"), Type.Literal("fork")], {
    description: "clean=干净上下文只带任务；fork=带上你当前的上下文",
  }),
  task: Type.String({ description: "任务描述：目标、边界、交付物、验收标准" }),
  title: Type.Optional(Type.String({ description: "子 agent 标题（默认取任务前 24 字）" })),
  tier: Type.Optional(
    Type.Union([Type.Literal("light"), Type.Literal("standard"), Type.Literal("flagship")], {
      description:
        "能力档：light 轻量 / standard 标准 / flagship 旗舰；不传按子 agent 默认档。你只说档次，不点名模型",
    }),
  ),
  model: Type.Optional(
    Type.Object(
      { provider: Type.String(), id: Type.String() },
      { description: "仅在用户明确指定了具体模型时使用；平时用 tier" },
    ),
  ),
  readOnly: Type.Optional(Type.Boolean({ description: "只给只读工具（read/grep/find/ls）" })),
});
