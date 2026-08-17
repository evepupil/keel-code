import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type {
  CustomEntryRecord,
  EngineEvent,
  EngineEventListener,
  EngineMessage,
  EngineSession,
  ModelRef,
  SessionMeta,
  SessionState,
  ThinkingLevel,
  Unsubscribe,
  UsageInfo,
} from "../types.js";
import { convertEvent, convertMessages } from "./convert.js";
import { KEEL_META_ENTRY, type SessionIndex } from "./index-store.js";

export interface KeelSessionDeps {
  agentSession: AgentSession;
  meta: SessionMeta;
  runtime: ModelRuntime;
  index: SessionIndex;
  onDispose?: (id: string) => void;
}

/** 一条会话 = 一个 pi AgentSession 的封装。 */
export class KeelSession implements EngineSession {
  private _meta: SessionMeta;
  private readonly listeners = new Set<EngineEventListener>();
  private readonly unsubscribePi: Unsubscribe;
  private disposed = false;

  constructor(private readonly deps: KeelSessionDeps) {
    this._meta = deps.meta;
    this.unsubscribePi = deps.agentSession.subscribe((ev) => {
      const converted = convertEvent(ev);
      if (converted) this.emit(converted);
      if (ev.type === "message_end") {
        this.deps.index.touch(this.id, {
          messageCount: this.deps.agentSession.messages.length,
          lastActiveAt: new Date().toISOString(),
        });
      }
    });
  }

  get id(): string {
    return this._meta.id;
  }

  get meta(): SessionMeta {
    return this._meta;
  }

  get file(): string | undefined {
    return this.deps.agentSession.sessionFile;
  }

  /** 内部：给桥接层读取当前 meta 用 */
  getMeta = (): SessionMeta => this._meta;

  private emit(event: EngineEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (e) {
        console.error("[keel-engine] 事件监听器抛错：", e);
      }
    }
  }

  async prompt(text: string, options: { deliverAs?: "steer" | "followUp" } = {}): Promise<void> {
    this.assertLive();
    const s = this.deps.agentSession;
    if (s.isStreaming) {
      await s.prompt(text, { streamingBehavior: options.deliverAs ?? "followUp" });
    } else {
      await s.prompt(text);
    }
    this.deps.index.touch(this.id, { lastActiveAt: new Date().toISOString() });
  }

  subscribe(listener: EngineEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  abort(): Promise<void> {
    return this.deps.agentSession.abort();
  }

  waitForIdle(): Promise<void> {
    return this.deps.agentSession.waitForIdle();
  }

  getMessages(): EngineMessage[] {
    return convertMessages(this.deps.agentSession.messages);
  }

  getState(): SessionState {
    const s = this.deps.agentSession;
    const model = s.model;
    const state: SessionState = {
      isStreaming: s.isStreaming,
      isIdle: s.isIdle,
      model: model ? { provider: model.provider, id: model.id } : undefined,
      thinkingLevel: s.thinkingLevel,
      usage: sumUsage(this.getMessages()),
    };
    if (model) state.contextWindow = model.contextWindow;
    return state;
  }

  async setModel(ref: ModelRef): Promise<void> {
    const model = this.deps.runtime.getModel(ref.provider, ref.id);
    if (!model) throw new Error(`未知模型：${ref.provider}/${ref.id}`);
    await this.deps.agentSession.setModel(model);
    this.updateMeta({ model: ref });
    this.emit({ type: "model_changed", model: ref });
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.deps.agentSession.setThinkingLevel(level);
    this.updateMeta({ thinkingLevel: level });
  }

  appendEntry(customType: string, data?: unknown): void {
    this.deps.agentSession.sessionManager.appendCustomEntry(customType, data);
  }

  getEntries(customType?: string): CustomEntryRecord[] {
    const out: CustomEntryRecord[] = [];
    for (const entry of this.deps.agentSession.sessionManager.getEntries()) {
      const e = entry as unknown as Record<string, unknown>;
      if (e.type !== "custom") continue;
      const type = String(e.customType ?? "");
      if (customType && type !== customType) continue;
      out.push({
        id: String(e.id ?? ""),
        customType: type,
        data: e.data,
        timestamp: Date.parse(String(e.timestamp ?? "")) || 0,
      });
    }
    return out;
  }

  updateMeta(patch: Partial<Omit<SessionMeta, "id" | "createdAt">>): void {
    this._meta = { ...this._meta, ...patch, updatedAt: new Date().toISOString() };
    this.appendEntry(KEEL_META_ENTRY, this._meta);
    this.deps.index.updateMeta(this.id, this._meta);
    this.emit({ type: "meta_updated", meta: this._meta });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribePi();
    this.listeners.clear();
    this.deps.agentSession.dispose();
    this.deps.onDispose?.(this.id);
  }

  private assertLive(): void {
    if (this.disposed) throw new Error(`会话已释放：${this.id}`);
  }
}

export function sumUsage(messages: EngineMessage[]): UsageInfo {
  const total: UsageInfo = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    costTotal: 0,
  };
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    total.input += m.usage.input;
    total.output += m.usage.output;
    total.cacheRead += m.usage.cacheRead;
    total.cacheWrite += m.usage.cacheWrite;
    total.totalTokens += m.usage.totalTokens;
    total.costTotal += m.usage.costTotal;
  }
  return total;
}
