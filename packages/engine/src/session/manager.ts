import { randomUUID } from "node:crypto";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  type ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { HookBus } from "../hooks/bus.js";
import { pickDefaultModel } from "../models/runtime.js";
import type {
  CreateSessionOptions,
  EngineSession,
  ForkSessionOptions,
  KeelPaths,
  SessionMeta,
  SessionRecord,
} from "../types.js";
import { type BridgeContext, createKeelExtension, toPiTool } from "./bridge.js";
import { KEEL_META_ENTRY, KEEL_SYSTEM_PROMPT_ENTRY, SessionIndex } from "./index-store.js";
import { KeelSession } from "./session.js";

export interface SessionServiceDeps {
  cwd: string;
  paths: KeelPaths;
  runtime: ModelRuntime;
  bus: HookBus;
}

const DEFAULT_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

/** 会话服务：创建 / 打开 / fork / 列表，维护进程内活会话表。 */
export class SessionService {
  private readonly index: SessionIndex;
  private readonly live = new Map<string, KeelSession>();

  constructor(private readonly deps: SessionServiceDeps) {
    this.index = new SessionIndex(deps.paths);
  }

  liveSession(id: string): EngineSession | undefined {
    return this.live.get(id);
  }

  liveAll(): EngineSession[] {
    return [...this.live.values()];
  }

  async list(): Promise<SessionRecord[]> {
    return this.index.list();
  }

  async create(options: CreateSessionOptions): Promise<EngineSession> {
    const id = randomUUID();
    const model = await this.resolveModel(options.model);
    const now = new Date().toISOString();
    const meta: SessionMeta = {
      id,
      kind: options.kind,
      title: options.title,
      model: { provider: model.provider, id: model.id },
      thinkingLevel: options.thinkingLevel ?? "medium",
      createdAt: now,
      updatedAt: now,
    };
    if (options.role) meta.role = options.role;
    if (options.parentId) meta.parentId = options.parentId;
    if (options.extra) meta.extra = options.extra;

    const sessionManager = SessionManager.create(
      this.deps.cwd,
      this.deps.paths.projectSessionsDir,
      {
        id,
      },
    );
    return this.boot(sessionManager, meta, model, options, true);
  }

  async open(id: string): Promise<EngineSession> {
    const existing = this.live.get(id);
    if (existing) return existing;
    const rec = this.index.get(id);
    if (!rec) throw new Error(`会话不存在：${id}`);
    const sessionManager = SessionManager.open(rec.file, this.deps.paths.projectSessionsDir);
    const model = await this.resolveModel(rec.meta.model, true);
    const stored = readStoredSystemPrompt(sessionManager);
    return this.boot(
      sessionManager,
      rec.meta,
      model,
      {
        kind: rec.meta.kind,
        title: rec.meta.title,
        ...(stored !== undefined ? { systemPrompt: stored } : {}),
      },
      false,
    );
  }

  async fork(sourceId: string, options: ForkSessionOptions): Promise<EngineSession> {
    const rec = this.index.get(sourceId);
    if (!rec) throw new Error(`会话不存在：${sourceId}`);
    const id = randomUUID();
    const model = await this.resolveModel(options.model ?? rec.meta.model);
    const now = new Date().toISOString();
    const meta: SessionMeta = {
      id,
      kind: options.kind ?? rec.meta.kind,
      title: options.title,
      model: { provider: model.provider, id: model.id },
      thinkingLevel: options.thinkingLevel ?? rec.meta.thinkingLevel,
      createdAt: now,
      updatedAt: now,
    };
    if (options.role) meta.role = options.role;
    if (options.parentId) meta.parentId = options.parentId;
    if (options.extra) meta.extra = options.extra;
    const sessionManager = SessionManager.forkFrom(
      rec.file,
      this.deps.cwd,
      this.deps.paths.projectSessionsDir,
      { id },
    );
    const inherited = readStoredSystemPrompt(sessionManager);
    const bootOptions = {
      kind: meta.kind,
      ...options,
      ...(options.systemPrompt === undefined && inherited !== undefined
        ? { systemPrompt: inherited }
        : {}),
    };
    return this.boot(sessionManager, meta, model, bootOptions, true);
  }

  private async resolveModel(
    ref: { provider: string; id: string } | undefined,
    lenient = false,
  ): Promise<Model<Api>> {
    if (ref) {
      const m = this.deps.runtime.getModel(ref.provider, ref.id);
      if (m) return m;
      if (!lenient) throw new Error(`未知模型：${ref.provider}/${ref.id}`);
    }
    const fallback = await pickDefaultModel(this.deps.runtime, this.deps.paths.modelsFile);
    if (!fallback) {
      throw new Error("没有可用模型：请先在设置里配置至少一个 provider 的 API key。");
    }
    return fallback;
  }

  private async boot(
    sessionManager: SessionManager,
    meta: SessionMeta,
    model: Model<Api>,
    options: Pick<
      CreateSessionOptions,
      "kind" | "title" | "systemPrompt" | "tools" | "thinkingLevel"
    >,
    isNew: boolean,
  ): Promise<EngineSession> {
    let session: KeelSession | undefined;
    const bridge: BridgeContext = {
      cwd: this.deps.cwd,
      sessionId: meta.id,
      getMeta: () => session?.meta ?? meta,
    };
    const loader = new DefaultResourceLoader({
      cwd: this.deps.cwd,
      agentDir: this.deps.paths.piAgentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
      extensionFactories: [createKeelExtension(this.deps.bus, bridge)],
    });
    await loader.reload();

    const customTools = this.deps.bus.toolsFor(meta).map((def) => toPiTool(def, bridge));
    const { session: agentSession } = await createAgentSession({
      cwd: this.deps.cwd,
      agentDir: this.deps.paths.piAgentDir,
      modelRuntime: this.deps.runtime,
      model,
      thinkingLevel: options.thinkingLevel ?? meta.thinkingLevel,
      // 显式白名单会同时约束自定义工具，所以要把 keel 工具名一起列进去
      tools: [...(options.tools ?? DEFAULT_TOOLS), ...customTools.map((t) => t.name)],
      customTools,
      resourceLoader: loader,
      sessionManager,
    });
    await agentSession.bindExtensions({
      mode: "print",
      onError: (err) => {
        console.error(`[keel-engine] 扩展错误（${err.extensionPath}）：${String(err.error)}`);
      },
    });

    session = new KeelSession({
      agentSession,
      meta,
      runtime: this.deps.runtime,
      index: this.index,
      onDispose: (id) => {
        this.live.delete(id);
      },
    });

    if (isNew) {
      agentSession.sessionManager.appendCustomEntry(KEEL_META_ENTRY, meta);
      if (options.systemPrompt !== undefined) {
        agentSession.sessionManager.appendCustomEntry(KEEL_SYSTEM_PROMPT_ENTRY, {
          text: options.systemPrompt,
        });
      }
      this.index.upsert({
        meta,
        file: agentSession.sessionFile ?? "",
        messageCount: 0,
        lastActiveAt: meta.updatedAt,
        costUsd: 0,
        usage: { input: 0, output: 0, cacheRead: 0 },
      });
    }
    this.live.set(meta.id, session);
    return session;
  }

  async disposeAll(): Promise<void> {
    for (const s of this.live.values()) s.dispose();
    this.live.clear();
  }
}

/** 从会话条目里找回创建时持久化的系统提示（最后一条为准）。 */
function readStoredSystemPrompt(sessionManager: SessionManager): string | undefined {
  let found: string | undefined;
  for (const entry of sessionManager.getEntries()) {
    const e = entry as unknown as Record<string, unknown>;
    if (e.type === "custom" && e.customType === KEEL_SYSTEM_PROMPT_ENTRY) {
      const data = e.data as { text?: unknown } | undefined;
      if (typeof data?.text === "string") found = data.text;
    }
  }
  return found;
}
