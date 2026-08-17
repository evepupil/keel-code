/**
 * 声明式 workflow：一组子 agent 步骤 + 依赖关系，控制流由代码决定（拓扑并行，带并发上限）。
 * 每步是一次 clean / fork 子 agent；依赖步骤的结论会拼进本步任务。结果汇总交回发起对话。
 */
import type { EngineSession, ModelRef } from "@keel-code/engine";
import { Type } from "@keel-code/engine";
import type { RunSubagentResult, SubagentRunner } from "../subagents/run.js";

export interface WorkflowStep {
  id: string;
  task: string;
  mode?: "clean" | "fork";
  model?: ModelRef;
  readOnly?: boolean;
  dependsOn?: string[];
}

export interface WorkflowStepResult {
  id: string;
  finished: RunSubagentResult["finished"] | "skipped";
  text: string;
  sessionId?: string;
  costUsd: number;
  error?: string;
}

export interface WorkflowResult {
  steps: WorkflowStepResult[];
  costUsd: number;
  ok: boolean;
}

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

/** 校验步骤定义：id 唯一、依赖存在、无环。返回错误信息或 undefined。 */
export function validateSteps(steps: WorkflowStep[]): string | undefined {
  if (steps.length === 0) return "steps 不能为空";
  const ids = new Set<string>();
  for (const s of steps) {
    if (!s.id?.trim()) return "每个步骤都要有 id";
    if (ids.has(s.id)) return `步骤 id 重复：${s.id}`;
    ids.add(s.id);
  }
  for (const s of steps) {
    for (const d of s.dependsOn ?? []) if (!ids.has(d)) return `步骤 ${s.id} 依赖了不存在的 ${d}`;
  }
  // 环检测（Kahn）
  const indeg = new Map(steps.map((s) => [s.id, (s.dependsOn ?? []).length]));
  const queue = steps.filter((s) => indeg.get(s.id) === 0).map((s) => s.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift() as string;
    seen++;
    for (const s of steps) {
      if ((s.dependsOn ?? []).includes(id)) {
        indeg.set(s.id, (indeg.get(s.id) ?? 0) - 1);
        if (indeg.get(s.id) === 0) queue.push(s.id);
      }
    }
  }
  return seen === steps.length ? undefined : "步骤依赖成环";
}

export async function runWorkflow(input: {
  runner: SubagentRunner;
  parent: EngineSession;
  steps: WorkflowStep[];
  maxParallel?: number;
  signal?: AbortSignal;
}): Promise<WorkflowResult> {
  const err = validateSteps(input.steps);
  if (err) throw new Error(err);
  const maxParallel = Math.max(1, input.maxParallel ?? 3);
  const results = new Map<string, WorkflowStepResult>();
  const pending = new Set(input.steps.map((s) => s.id));
  const running = new Map<string, Promise<void>>();

  const ready = () =>
    input.steps.filter(
      (s) =>
        pending.has(s.id) && !running.has(s.id) && (s.dependsOn ?? []).every((d) => results.has(d)),
    );

  const launch = (s: WorkflowStep) => {
    const deps = (s.dependsOn ?? []).map((d) => results.get(d));
    if (deps.some((d) => d && d.finished !== "completed")) {
      results.set(s.id, {
        id: s.id,
        finished: "skipped",
        text: "前置步骤未完成，跳过",
        costUsd: 0,
      });
      pending.delete(s.id);
      return;
    }
    const context = deps.length
      ? `\n\n前置步骤结论：\n${deps.map((d) => `- [${d?.id}] ${d?.text || "（无）"}`).join("\n")}`
      : "";
    const p = input.runner
      .run({
        parent: input.parent,
        mode: s.mode ?? "clean",
        title: `workflow 步骤 ${s.id}`,
        task: `${s.task}${context}`,
        ...(s.model ? { model: s.model } : {}),
        ...(s.readOnly ? { tools: READ_ONLY_TOOLS } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      })
      .then((r) => {
        const out: WorkflowStepResult = {
          id: s.id,
          finished: r.finished,
          text: r.text,
          sessionId: r.sessionId,
          costUsd: r.costUsd,
        };
        if (r.error) out.error = r.error;
        results.set(s.id, out);
      })
      .catch((e: unknown) => {
        results.set(s.id, {
          id: s.id,
          finished: "error",
          text: "",
          costUsd: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      })
      .finally(() => {
        running.delete(s.id);
        pending.delete(s.id);
      });
    running.set(s.id, p);
  };

  while (pending.size > 0) {
    for (const s of ready()) {
      if (running.size >= maxParallel) break;
      launch(s);
    }
    if (running.size === 0) {
      // 没有可跑也没有在跑：剩下的都被前置失败拦住了，逐个标记 skipped
      for (const s of ready()) launch(s);
      if (running.size === 0) {
        for (const id of [...pending]) {
          results.set(id, { id, finished: "skipped", text: "前置步骤未完成，跳过", costUsd: 0 });
          pending.delete(id);
        }
        break;
      }
    }
    await Promise.race(running.values());
  }

  const steps = input.steps.map((s) => results.get(s.id) as WorkflowStepResult);
  return {
    steps,
    costUsd: steps.reduce((a, b) => a + b.costUsd, 0),
    ok: steps.every((s) => s.finished === "completed"),
  };
}

export function renderWorkflowResult(r: WorkflowResult): string {
  const lines = [`workflow ${r.ok ? "全部完成" : "部分未完成"}，费用 $${r.costUsd.toFixed(4)}。`];
  for (const s of r.steps) {
    lines.push(
      `## [${s.id}] ${s.finished}${s.sessionId ? ` · 会话 ${s.sessionId}` : ""}${s.error ? ` · ${s.error}` : ""}`,
    );
    lines.push(s.text ? s.text.slice(0, 2000) : "（无文本结论）");
  }
  return lines.join("\n");
}

/** keel_workflow_run 参数 schema */
export const WORKFLOW_PARAMS = Type.Object({
  steps: Type.Array(
    Type.Object({
      id: Type.String({ description: "步骤 id（唯一）" }),
      task: Type.String({ description: "任务描述" }),
      mode: Type.Optional(Type.Union([Type.Literal("clean"), Type.Literal("fork")])),
      model: Type.Optional(Type.Object({ provider: Type.String(), id: Type.String() })),
      readOnly: Type.Optional(Type.Boolean({ description: "只给只读工具" })),
      dependsOn: Type.Optional(
        Type.Array(Type.String(), { description: "依赖的步骤 id；其结论会拼进本步任务" }),
      ),
    }),
    { description: "步骤列表；无依赖的步骤并行跑" },
  ),
  maxParallel: Type.Optional(Type.Number({ description: "并发上限，默认 3" })),
});
