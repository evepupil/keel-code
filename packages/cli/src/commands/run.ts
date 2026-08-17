/**
 * keel run：无头跑一个任务（CI / 回归用）。
 * 用主对话（或指定对话）发一条消息，把过程流到 stdout：文本增量直接打印，工具调用打一行摘要；
 * 空闲即退出。审批自动放行（无人可问）。
 */
import type { EngineEvent, EngineSession, ModelRef } from "@keel-code/engine";
import { createKeelRuntime } from "@keel-code/server";

export interface RunOptions {
  cwd: string;
  homeDir?: string;
  task: string;
  /** 目标对话：标题或 id；缺省主对话 */
  conversation?: string;
  /** 新建对话（标题），与 conversation 互斥 */
  newConversation?: string;
  role?: string;
  model?: string;
  json?: boolean;
  timeoutMs?: number;
  out?: (text: string) => void;
  err?: (text: string) => void;
}

export interface RunResult {
  sessionId: string;
  finished: "idle" | "timeout" | "error";
  text: string;
  costUsd: number;
  toolCalls: number;
  error?: string;
}

function parseModel(s: string | undefined): ModelRef | undefined {
  if (!s) return undefined;
  const i = s.indexOf("/");
  if (i <= 0) return undefined;
  return { provider: s.slice(0, i), id: s.slice(i + 1) };
}

export async function runHeadless(options: RunOptions): Promise<RunResult> {
  const out = options.out ?? ((t: string) => process.stdout.write(t));
  const err = options.err ?? ((t: string) => process.stderr.write(t));
  const runtime = await createKeelRuntime({
    cwd: options.cwd,
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    headless: true,
  });
  try {
    let session: EngineSession;
    const model = parseModel(options.model);
    if (options.newConversation) {
      session = await runtime.hub.create({
        kind: "conversation",
        title: options.newConversation,
        ...(options.role ? { role: options.role } : {}),
        ...(model ? { model } : {}),
      });
    } else if (options.conversation) {
      const list = await runtime.hub.list();
      const hit = list.find(
        (r) => r.meta.id === options.conversation || r.meta.title === options.conversation,
      );
      if (!hit) throw new Error(`找不到对话：${options.conversation}`);
      session = await runtime.hub.get(hit.meta.id);
    } else {
      const main = await runtime.hub.ensureMain();
      if (!main) throw new Error("没有可用模型，无法创建主对话：先配置 API key。");
      session = await runtime.hub.get(main.meta.id);
      if (model) await session.setModel(model);
    }

    let text = "";
    let toolCalls = 0;
    let lastPrinted = 0;
    const events: EngineEvent[] = [];
    const unsub = session.subscribe((e) => {
      events.push(e);
      if (options.json) {
        out(`${JSON.stringify({ sessionId: session.id, event: e })}\n`);
        return;
      }
      if (e.type === "message_update" && e.delta.kind === "text") {
        out(e.delta.text);
        lastPrinted += e.delta.text.length;
      } else if (e.type === "tool_execution_start") {
        toolCalls += 1;
        err(`\n[工具] ${e.toolName} ${summarizeArgs(e.args)}\n`);
      } else if (e.type === "tool_execution_end") {
        err(`[工具] ${e.toolName} ${e.isError ? "失败" : "完成"}\n`);
      } else if (e.type === "message_end" && e.message.role === "assistant") {
        const t = e.message.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        if (t) text = t;
        if (lastPrinted > 0) out("\n");
        lastPrinted = 0;
      }
    });

    let finished: RunResult["finished"] = "idle";
    let error: string | undefined;
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
    const timer = setTimeout(() => {
      finished = "timeout";
      void session.abort();
    }, timeoutMs);
    try {
      await session.prompt(options.task);
      await session.waitForIdle();
    } catch (e) {
      finished = "error";
      error = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
      unsub();
    }
    // 主对话空闲后，等后台子 agent（如提交后的文档修剪）跑完再退出，封顶 3 分钟
    await waitForBackgroundSubagents(runtime.engine, 3 * 60 * 1000, err);
    const costUsd = session.getState().usage.costTotal;
    const result: RunResult = { sessionId: session.id, finished, text, costUsd, toolCalls };
    if (error) result.error = error;
    if (!options.json) {
      err(
        `\n—— 完成（${finished}）：${toolCalls} 次工具调用，费用 $${costUsd.toFixed(4)}，会话 ${session.id}\n`,
      );
    } else {
      out(`${JSON.stringify({ result })}\n`);
    }
    return result;
  } finally {
    await runtime.dispose();
  }
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  for (const k of ["command", "path", "pattern", "batch", "title"]) {
    const v = a[k];
    if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  const s = JSON.stringify(a);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

async function waitForBackgroundSubagents(
  engine: import("@keel-code/engine").Engine,
  capMs: number,
  err: (text: string) => void,
): Promise<void> {
  const deadline = Date.now() + capMs;
  let announced = false;
  while (Date.now() < deadline) {
    const busy = engine.sessions
      .liveAll()
      .filter((s) => s.meta.kind === "subagent" && s.getState().isStreaming);
    if (busy.length === 0) return;
    if (!announced) {
      const names = busy.map((s) => s.meta.title).join("、");
      err(`\n[等待] ${busy.length} 个后台子 agent 还在跑（${names}）\n`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  err("\n[等待] 后台子 agent 超时未完成，先退出\n");
}
