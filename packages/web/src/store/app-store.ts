import { useSyncExternalStore } from "react";
import { ApiError, api, bootstrapToken, setApiWorkspace } from "../api/client";
import type {
  ApprovalRequest,
  CreateSessionInput,
  EngineEvent,
  ModelInfo,
  ProjectInfo,
  ProviderInfo,
  SessionListItem,
  WorkspaceInfo,
} from "../api/types";
import { WsClient } from "../api/ws";
import { formatRoute, parseRoute, type Route } from "../app/router";
import { readPref, writePref } from "../lib/prefs";
import { applyEngineEvent, type ChatState, emptyChat } from "./apply-event";

/** design = 设计系统预览页（仅开发构建可达） */
export type View = "chat" | "board" | "doc" | "design";
export type SettingsTab = "models" | "tiers" | "project" | "mcp" | "general";

export interface AppState {
  ready: boolean;
  tokenMissing: boolean;
  fatal?: string;
  /** 外壳：侧栏折叠 / 右侧上下文抽屉 / 设置弹窗 */
  navCollapsed: boolean;
  drawerOpen: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  workspaces: WorkspaceInfo[];
  /** 当前工作区；null = 还没选（没有工作区或在全局设置页） */
  workspaceId: string | null;
  project?: ProjectInfo;
  sessions: SessionListItem[];
  /** 各工作区会话列表（侧栏展开时懒加载） */
  sessionsByWorkspace: Record<string, SessionListItem[]>;
  expandedWorkspaces: string[];
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
  /** 当前工作区待用户审批的工具调用 */
  approvals: ApprovalRequest[];
  /** 其他工作区的待审批数（工作区切换器上标角标） */
  pendingByWorkspace: Record<string, number>;
}

type Listener = () => void;

const initialState: AppState = {
  ready: false,
  tokenMissing: false,
  navCollapsed: readPref("navCollapsed", false),
  drawerOpen: readPref("drawerOpen", window.innerWidth >= 1440),
  settingsOpen: false,
  settingsTab: "models",
  workspaces: [],
  workspaceId: null,
  sessions: [],
  sessionsByWorkspace: {},
  expandedWorkspaces: [],
  currentId: null,
  chats: {},
  view: "chat",
  wsConnected: false,
  models: [],
  providers: [],
  doc: null,
  composerDraft: null,
  approvals: [],
  pendingByWorkspace: {},
};

class AppStore {
  private state: AppState = initialState;
  private readonly listeners = new Set<Listener>();
  private ws: WsClient | null = null;
  private resyncTimers = new Map<string, number>();
  /** 我们自己写进地址栏的 hash，用来忽略回声 */
  private pushedHash: string | null = null;
  /** 工作区切换序号：异步加载回来时发现已经切走就丢弃 */
  private switchSeq = 0;
  private initPromise: Promise<void> | null = null;

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

  // ---------- 启动 ----------

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const token = bootstrapToken();
    if (!token) {
      this.set({ tokenMissing: true, ready: true });
      return;
    }
    try {
      const [providers, models, workspaces] = await Promise.all([
        api.providers(),
        api.models(true),
        api.workspaces(),
      ]);
      this.set({ providers, models, workspaces });
      this.ws = new WsClient({
        onEvent: (wid, sessionId, event) => {
          if (wid === this.state.workspaceId) this.applyEvent(sessionId, event);
        },
        onSessionsChanged: (wid) => {
          if (wid === this.state.workspaceId) void this.refreshSessions(false);
          else if (this.state.expandedWorkspaces.includes(wid))
            void this.loadWorkspaceSessions(wid);
        },
        onWorkspacesChanged: () => void this.refreshWorkspaces(),
        onStatus: (connected) => {
          this.set({ wsConnected: connected });
          if (connected && this.state.workspaceId) void this.refreshApprovals();
        },
        onApproval: (wid, request) => {
          if (wid === this.state.workspaceId) {
            this.set((s) => ({
              approvals: s.approvals.some((a) => a.id === request.id)
                ? s.approvals
                : [...s.approvals, { ...request, workspaceId: wid }],
            }));
          } else {
            this.set((s) => ({
              pendingByWorkspace: {
                ...s.pendingByWorkspace,
                [wid]: (s.pendingByWorkspace[wid] ?? 0) + 1,
              },
            }));
          }
        },
        onApprovalResolved: (wid, id) => {
          if (wid === this.state.workspaceId) {
            this.set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) }));
          } else {
            this.set((s) => ({
              pendingByWorkspace: {
                ...s.pendingByWorkspace,
                [wid]: Math.max(0, (s.pendingByWorkspace[wid] ?? 0) - 1),
              },
            }));
          }
        },
      });
      this.ws.connect();
      window.addEventListener("hashchange", () => {
        if (window.location.hash === this.pushedHash) return;
        void this.applyRoute(parseRoute(window.location.hash));
      });
      await this.applyRoute(parseRoute(window.location.hash));
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

  // ---------- 路由 ----------

  /** 按地址栏进入：工作区不存在就回到首个工作区 */
  private async applyRoute(route: Route): Promise<void> {
    if (route.kind === "settings") {
      // 深链：打开设置弹窗，底下照常进工作区，地址栏随后回写为工作区路由
      this.set({ settingsOpen: true });
      await this.applyRoute({ kind: "home" });
      return;
    }
    if (route.kind === "design") {
      if (import.meta.env.DEV) {
        this.set({ view: "design" });
        this.syncHash();
        return;
      }
      await this.applyRoute({ kind: "home" });
      return;
    }
    if (route.kind === "home") {
      const first = this.state.workspaces[0];
      if (first) await this.selectWorkspace(first.id);
      else this.set({ workspaceId: null, view: "chat" });
      this.syncHash();
      return;
    }
    const known = this.state.workspaces.some((w) => w.id === route.workspaceId);
    if (!known) {
      await this.refreshWorkspaces();
      if (!this.state.workspaces.some((w) => w.id === route.workspaceId)) {
        this.notify("error", "工作区不存在或已移除");
        await this.applyRoute({ kind: "home" });
        return;
      }
    }
    await this.selectWorkspace(route.workspaceId, {
      view: route.kind === "board" ? "board" : route.kind === "doc" ? "doc" : "chat",
      ...(route.kind === "doc" ? { docPath: route.path } : {}),
      ...(route.kind === "chat" ? { sessionId: route.sessionId } : {}),
    });
  }

  private syncHash(): void {
    const s = this.state;
    let route: Route;
    if (s.view === "design") route = { kind: "design" };
    else if (!s.workspaceId) route = { kind: "home" };
    else if (s.view === "board") route = { kind: "board", workspaceId: s.workspaceId };
    else if (s.view === "doc" && s.doc)
      route = { kind: "doc", workspaceId: s.workspaceId, path: s.doc.path };
    else if (s.currentId)
      route = { kind: "chat", workspaceId: s.workspaceId, sessionId: s.currentId };
    else route = { kind: "workspace", workspaceId: s.workspaceId };
    const hash = formatRoute(route);
    if (window.location.hash === hash) return;
    this.pushedHash = hash;
    window.history.replaceState(null, "", hash);
  }

  // ---------- 工作区 ----------

  async refreshWorkspaces(): Promise<void> {
    try {
      this.set({ workspaces: await api.workspaces() });
    } catch (e) {
      this.notify("error", `加载工作区失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 切换工作区：清空会话态，重新拉项目 / 会话 / 审批。
   * 目标 view / sessionId / docPath 由路由给；不给就进主对话。
   */
  async selectWorkspace(
    id: string,
    target: { view?: View; sessionId?: string; docPath?: string } = {},
  ): Promise<void> {
    const same = this.state.workspaceId === id;
    if (!same) {
      const seq = ++this.switchSeq;
      this.ws?.unsubscribeAll();
      setApiWorkspace(id);
      this.set({
        workspaceId: id,
        project: undefined,
        sessions: [],
        currentId: null,
        chats: {},
        approvals: [],
        doc: null,
        view: target.view ?? "chat",
        expandedWorkspaces: [...new Set([...this.state.expandedWorkspaces, id])],
        pendingByWorkspace: { ...this.state.pendingByWorkspace, [id]: 0 },
      });
      try {
        const project = await api.project();
        if (seq !== this.switchSeq) return;
        this.set({ project });
      } catch (e) {
        if (seq !== this.switchSeq) return;
        this.notify("error", `打开工作区失败：${e instanceof Error ? e.message : String(e)}`);
        this.set({ workspaceId: null });
        this.syncHash();
        return;
      }
      await this.refreshSessions(true);
      if (seq !== this.switchSeq) return;
      void this.refreshApprovals();
      void this.refreshWorkspaces();
    } else {
      if (!this.state.expandedWorkspaces.includes(id)) {
        this.set({ expandedWorkspaces: [...this.state.expandedWorkspaces, id] });
      }
      if (this.state.sessions.length === 0) await this.refreshSessions(true);
    }
    if (target.view === "doc" && target.docPath) {
      this.set({ view: "doc", doc: { path: target.docPath, sessionId: null } });
    } else if (target.view === "board") {
      this.set({ view: "board" });
    } else {
      const wanted = target.sessionId
        ? this.state.sessions.find((s) => s.meta.id === target.sessionId)
        : undefined;
      const first =
        wanted ??
        this.state.sessions.find((s) => s.meta.kind === "main" && !s.meta.archived) ??
        this.state.sessions[0];
      if (first) this.selectSession(first.meta.id);
      else this.set({ view: "chat", currentId: null });
    }
    this.syncHash();
  }

  async addWorkspace(path: string): Promise<void> {
    try {
      const w = await api.addWorkspace(path);
      await this.refreshWorkspaces();
      await this.selectWorkspace(w.id);
    } catch (e) {
      this.notify("error", `添加工作区失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 弹系统目录选择框，选中即添加 */
  async pickWorkspace(): Promise<void> {
    try {
      const r = await api.pickFolder();
      if (r.status === "picked") await this.addWorkspace(r.path);
      else if (r.status === "unsupported") this.notify("error", r.reason);
    } catch (e) {
      this.notify("error", `选择目录失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async removeWorkspace(id: string): Promise<void> {
    try {
      await api.removeWorkspace(id);
      await this.refreshWorkspaces();
      if (this.state.workspaceId === id) {
        const next = this.state.workspaces[0];
        if (next) await this.selectWorkspace(next.id);
        else {
          setApiWorkspace(null);
          this.set({
            workspaceId: null,
            project: undefined,
            sessions: [],
            currentId: null,
            chats: {},
            approvals: [],
            doc: null,
            view: "chat",
          });
          this.syncHash();
        }
      }
    } catch (e) {
      this.notify("error", `移除工作区失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---------- 会话 ----------

  async refreshSessions(ensureMain: boolean): Promise<void> {
    if (!this.state.workspaceId) return;
    const seq = this.switchSeq;
    try {
      const sessions = await api.sessions(ensureMain);
      if (seq !== this.switchSeq) return;
      const wid = this.state.workspaceId;
      this.set((s) => ({
        sessions,
        sessionsByWorkspace: wid
          ? { ...s.sessionsByWorkspace, [wid]: sessions }
          : s.sessionsByWorkspace,
      }));
    } catch (e) {
      if (seq !== this.switchSeq) return;
      this.notify("error", `加载对话列表失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async loadWorkspaceSessions(wid: string, ensureMain = false): Promise<void> {
    try {
      const sessions = await api.sessionsIn(wid, ensureMain);
      this.set((s) => ({
        sessionsByWorkspace: { ...s.sessionsByWorkspace, [wid]: sessions },
        ...(s.workspaceId === wid ? { sessions } : {}),
      }));
    } catch (e) {
      this.notify("error", `加载对话列表失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  toggleWorkspace(wid: string): void {
    const open = this.state.expandedWorkspaces.includes(wid);
    const expandedWorkspaces = open
      ? this.state.expandedWorkspaces.filter((id) => id !== wid)
      : [...this.state.expandedWorkspaces, wid];
    this.set({ expandedWorkspaces });
    if (!open && this.state.sessionsByWorkspace[wid] === undefined) {
      void this.loadWorkspaceSessions(wid, true);
    }
  }

  async createSessionIn(wid: string, input: CreateSessionInput): Promise<string> {
    if (wid !== this.state.workspaceId) await this.selectWorkspace(wid);
    return this.createSession(input);
  }

  async refreshModels(): Promise<void> {
    const [providers, models] = await Promise.all([api.providers(), api.models(true)]);
    this.set({ providers, models });
  }

  async refreshApprovals(): Promise<void> {
    if (!this.state.workspaceId) return;
    const wid = this.state.workspaceId;
    try {
      const list = await api.approvals();
      if (wid !== this.state.workspaceId) return;
      this.set({ approvals: list.map((a) => ({ ...a, workspaceId: wid })) });
    } catch {
      // 忽略
    }
  }

  async resolveApproval(id: string, decision: "allow" | "deny" | "allow-session"): Promise<void> {
    try {
      await api.resolveApproval(id, decision);
      this.set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) }));
    } catch (e) {
      this.notify("error", `审批失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  setView(view: View): void {
    this.set({ view });
    this.syncHash();
  }

  // ---------- 外壳 ----------

  toggleNav(): void {
    const navCollapsed = !this.state.navCollapsed;
    writePref("navCollapsed", navCollapsed);
    this.set({ navCollapsed });
  }

  setDrawer(open: boolean): void {
    writePref("drawerOpen", open);
    this.set({ drawerOpen: open });
  }

  openSettings(tab?: SettingsTab): void {
    this.set((s) => ({ settingsOpen: true, settingsTab: tab ?? s.settingsTab }));
  }

  setSettingsTab(tab: SettingsTab): void {
    this.set({ settingsTab: tab });
  }

  closeSettings(): void {
    this.set({ settingsOpen: false });
  }

  openDoc(path: string, sessionId: string | null = this.state.currentId): void {
    this.set({ view: "doc", doc: { path, sessionId } });
    this.syncHash();
  }

  setComposerDraft(text: string | null): void {
    this.set({ composerDraft: text });
  }

  selectSession(id: string): void {
    this.set({ currentId: id, view: "chat" });
    if (this.state.workspaceId) this.ws?.subscribe(this.state.workspaceId, id);
    if (!this.state.chats[id]?.loaded) void this.loadSession(id);
    this.syncHash();
  }

  async loadSession(id: string): Promise<void> {
    const seq = this.switchSeq;
    try {
      const detail = await api.session(id);
      if (seq !== this.switchSeq) return;
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
      if (seq !== this.switchSeq) return;
      this.notify("error", `加载对话失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  applyEvent(sessionId: string, event: EngineEvent): void {
    if (event.type === "meta_updated") {
      const patch = (list: SessionListItem[]) =>
        list.map((x) => (x.meta.id === sessionId ? { ...x, meta: event.meta } : x));
      this.set((s) => ({
        sessions: patch(s.sessions),
        sessionsByWorkspace: Object.fromEntries(
          Object.entries(s.sessionsByWorkspace).map(([k, list]) => [k, patch(list)]),
        ),
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
      pinned?: boolean;
    },
    workspaceId: string | null = this.state.workspaceId,
  ): Promise<void> {
    if (!workspaceId) return;
    try {
      const { meta } =
        workspaceId === this.state.workspaceId
          ? await api.patchSession(id, patch)
          : await api.patchSessionIn(workspaceId, id, patch);
      const apply = (list: SessionListItem[]) =>
        list.map((x) => (x.meta.id === id ? { ...x, meta } : x));
      this.set((s) => ({
        sessions: apply(s.sessions),
        sessionsByWorkspace: {
          ...s.sessionsByWorkspace,
          [workspaceId]: apply(s.sessionsByWorkspace[workspaceId] ?? s.sessions),
        },
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
