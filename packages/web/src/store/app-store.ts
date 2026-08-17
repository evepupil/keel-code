import { useSyncExternalStore } from "react";
import { ApiError, api, bootstrapToken } from "../api/client";
import type {
  CreateSessionInput,
  EngineEvent,
  ModelInfo,
  ProjectInfo,
  ProviderInfo,
  SessionListItem,
} from "../api/types";
import { WsClient } from "../api/ws";
import { applyEngineEvent, type ChatState, emptyChat } from "./apply-event";

export type View = "chat" | "settings" | "board" | "doc";

export interface AppState {
  ready: boolean;
  tokenMissing: boolean;
  fatal?: string;
  project?: ProjectInfo;
  sessions: SessionListItem[];
  currentId: string | null;
  chats: Record<string, ChatState>;
  view: View;
  wsConnected: boolean;
  models: ModelInfo[];
  providers: ProviderInfo[];
  notice?: { kind: "error" | "info"; text: string } | undefined;
  /** 当前打开的设计文档及其来源对话（AI 请求确认时带上） */
  doc: { path: string; sessionId: string | null } | null;
  /** 预填到输入框的草稿（验收打回等） */
  composerDraft: string | null;
}

type Listener = () => void;

class AppStore {
  private state: AppState = {
    ready: false,
    tokenMissing: false,
    sessions: [],
    currentId: null,
    chats: {},
    view: "chat",
    wsConnected: false,
    models: [],
    providers: [],
    doc: null,
    composerDraft: null,
  };
  private readonly listeners = new Set<Listener>();
  private ws: WsClient | null = null;
  private resyncTimers = new Map<string, number>();

  getState = (): AppState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }

  private setChat(id: string, update: (c: ChatState) => ChatState): void {
    this.set((s) => ({ chats: { ...s.chats, [id]: update(s.chats[id] ?? emptyChat()) } }));
  }

  notify(kind: "error" | "info", text: string): void {
    this.set({ notice: { kind, text } });
    window.setTimeout(() => {
      if (this.state.notice?.text === text) this.set({ notice: undefined });
    }, 4000);
  }

  async init(): Promise<void> {
    const token = bootstrapToken();
    if (!token) {
      this.set({ tokenMissing: true, ready: true });
      return;
    }
    try {
      const [project, providers, models] = await Promise.all([
        api.project(),
        api.providers(),
        api.models(true),
      ]);
      this.set({ project, providers, models });
      await this.refreshSessions(true);
      this.ws = new WsClient({
        onEvent: (sessionId, event) => this.applyEvent(sessionId, event),
        onSessionsChanged: () => void this.refreshSessions(false),
        onStatus: (connected) => this.set({ wsConnected: connected }),
      });
      this.ws.connect();
      const first =
        this.state.sessions.find((s) => s.meta.kind === "main" && !s.meta.archived) ??
        this.state.sessions[0];
      if (first) this.selectSession(first.meta.id);
      this.set({ ready: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        sessionStorage.removeItem("keel.token");
        this.set({ tokenMissing: true, ready: true });
        return;
      }
      this.set({ fatal: e instanceof Error ? e.message : String(e), ready: true });
    }
  }

  async refreshSessions(ensureMain: boolean): Promise<void> {
    try {
      const sessions = await api.sessions(ensureMain);
      this.set({ sessions });
    } catch (e) {
      this.notify("error", `加载对话列表失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async refreshModels(): Promise<void> {
    const [providers, models] = await Promise.all([api.providers(), api.models(true)]);
    this.set({ providers, models });
  }

  setView(view: View): void {
    this.set({ view });
  }

  openDoc(path: string, sessionId: string | null = this.state.currentId): void {
    this.set({ view: "doc", doc: { path, sessionId } });
  }

  setComposerDraft(text: string | null): void {
    this.set({ composerDraft: text });
  }

  selectSession(id: string): void {
    this.set({ currentId: id, view: "chat" });
    this.ws?.subscribe(id);
    if (!this.state.chats[id]?.loaded) void this.loadSession(id);
  }

  async loadSession(id: string): Promise<void> {
    try {
      const detail = await api.session(id);
      this.setChat(id, (c) => ({
        ...c,
        messages: detail.messages,
        entries: detail.entries ?? [],
        loaded: true,
        streaming: detail.state.isStreaming,
        streamingIndex: null,
        needsResync: false,
      }));
      this.set((s) => ({
        sessions: s.sessions.map((x) => (x.meta.id === id ? { ...x, meta: detail.meta } : x)),
      }));
    } catch (e) {
      this.notify("error", `加载对话失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  applyEvent(sessionId: string, event: EngineEvent): void {
    if (event.type === "meta_updated") {
      this.set((s) => ({
        sessions: s.sessions.map((x) => (x.meta.id === sessionId ? { ...x, meta: event.meta } : x)),
      }));
      return;
    }
    this.setChat(sessionId, (c) => applyEngineEvent(c, event));
    if (event.type === "idle") {
      // idle 后校准一次，避免流式期间漏掉的消息
      const prev = this.resyncTimers.get(sessionId);
      if (prev) window.clearTimeout(prev);
      this.resyncTimers.set(
        sessionId,
        window.setTimeout(() => void this.loadSession(sessionId), 150),
      );
    }
  }

  async createSession(input: CreateSessionInput): Promise<string> {
    const { meta } = await api.createSession(input);
    await this.refreshSessions(false);
    this.selectSession(meta.id);
    return meta.id;
  }

  async sendPrompt(id: string, text: string): Promise<void> {
    const chat = this.state.chats[id];
    const streaming = chat?.streaming ?? false;
    // 本地先放一条用户消息，等服务端事件校准
    this.setChat(id, (c) => ({
      ...c,
      messages: [...c.messages, { role: "user", content: text, timestamp: Date.now() }],
      streaming: true,
    }));
    try {
      await api.prompt(id, text, streaming ? "followUp" : undefined);
    } catch (e) {
      this.notify("error", `发送失败：${e instanceof Error ? e.message : String(e)}`);
      await this.loadSession(id);
    }
  }

  async abort(id: string): Promise<void> {
    try {
      await api.abort(id);
    } catch (e) {
      this.notify("error", `中止失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async patchSession(
    id: string,
    patch: {
      title?: string;
      model?: { provider: string; id: string };
      thinkingLevel?: string;
      archived?: boolean;
    },
  ): Promise<void> {
    try {
      const { meta } = await api.patchSession(id, patch);
      this.set((s) => ({
        sessions: s.sessions.map((x) => (x.meta.id === id ? { ...x, meta } : x)),
      }));
    } catch (e) {
      this.notify("error", `更新失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export const appStore = new AppStore();

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    appStore.subscribe,
    () => selector(appStore.getState()),
    () => selector(appStore.getState()),
  );
}
