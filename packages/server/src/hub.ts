/**
 * 会话中枢：对引擎会话做懒加载、事件扇出、创建时组装方法论提示。
 * 只做装配与转发，不含业务判断。
 */
import type {
  CreateSessionOptions,
  Engine,
  EngineEvent,
  EngineSession,
  SessionKind,
  SessionRecord,
} from "@keel-code/engine";
import { assembleSystemPrompt } from "@keel-code/methodology";

export interface HubEvent {
  sessionId: string;
  event: EngineEvent;
}
export type HubListener = (e: HubEvent) => void;
export type SessionsChangedListener = () => void;

export interface CreateConversationInput {
  kind: SessionKind;
  title: string;
  role?: string;
  model?: { provider: string; id: string };
  thinkingLevel?: CreateSessionOptions["thinkingLevel"];
  parentId?: string;
  initialMessage?: string;
  extra?: Record<string, unknown>;
}

export class SessionHub {
  private readonly listeners = new Set<HubListener>();
  private readonly changedListeners = new Set<SessionsChangedListener>();
  private readonly attached = new Set<string>();

  constructor(private readonly engine: Engine) {}

  onEvent(listener: HubListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onSessionsChanged(listener: SessionsChangedListener): () => void {
    this.changedListeners.add(listener);
    return () => {
      this.changedListeners.delete(listener);
    };
  }

  private emitChanged(): void {
    for (const l of this.changedListeners) l();
  }

  private attach(session: EngineSession): void {
    if (this.attached.has(session.id)) return;
    this.attached.add(session.id);
    session.subscribe((event) => {
      for (const l of this.listeners) l({ sessionId: session.id, event });
      if (event.type === "meta_updated" || event.type === "idle" || event.type === "agent_start") {
        this.emitChanged();
      }
    });
  }

  async list(): Promise<SessionRecord[]> {
    return this.engine.sessions.list();
  }

  /** 拿到活会话；不在内存里就从磁盘打开。 */
  async get(id: string): Promise<EngineSession> {
    const live = this.engine.sessions.live(id);
    if (live) {
      this.attach(live);
      return live;
    }
    const opened = await this.engine.sessions.open(id);
    this.attach(opened);
    return opened;
  }

  async create(input: CreateConversationInput): Promise<EngineSession> {
    const options: CreateSessionOptions = {
      kind: input.kind,
      title: input.title,
      systemPrompt: assembleSystemPrompt(
        input.role ? { kind: input.kind, role: input.role } : { kind: input.kind },
      ),
    };
    if (input.role) options.role = input.role;
    if (input.model) options.model = input.model;
    if (input.thinkingLevel) options.thinkingLevel = input.thinkingLevel;
    if (input.parentId) options.parentId = input.parentId;
    if (input.extra) options.extra = input.extra;
    const session = await this.engine.sessions.create(options);
    this.attach(session);
    this.emitChanged();
    if (input.initialMessage) {
      void session.prompt(input.initialMessage).catch((e: unknown) => {
        console.error(`[keel-server] 初始消息发送失败（${session.id}）：`, e);
      });
    }
    return session;
  }

  /** 项目还没有主对话且有可用模型时，创建一条。返回主对话记录或 undefined。 */
  async ensureMain(): Promise<SessionRecord | undefined> {
    const list = await this.engine.sessions.list();
    const main = list.find((r) => r.meta.kind === "main" && !r.meta.archived);
    if (main) return main;
    const available = await this.engine.models.available();
    if (available.length === 0) return undefined;
    const session = await this.create({ kind: "main", title: "主对话" });
    return (await this.engine.sessions.list()).find((r) => r.meta.id === session.id);
  }

  liveState(id: string): { isStreaming: boolean } | undefined {
    const live = this.engine.sessions.live(id);
    if (!live) return undefined;
    return { isStreaming: live.getState().isStreaming };
  }
}
