import type {
  CreateSessionOptions,
  EngineSession,
  ModelRef,
  SessionMeta,
  SessionRecord,
  ThinkingLevel,
} from "@keel-code/engine";

/** 名册记录：一条对话的导航信息（不是事实）。存放于 SessionMeta.extra.roster，并投影到 .keel/agents/。 */
export interface RosterRecord {
  /** 一句话职责 */
  role?: string;
  /** 上下文领域 */
  contextScope?: string;
  /** 负责的代码范围（glob 列表） */
  codeRange?: string[];
  /** 上次确认的 commit */
  baseCommit?: string;
  /** codeRange 当时内容的指纹 */
  codeHash?: string;
  currentUnderstanding?: string;
  keyArtifacts?: string[];
  recentWork?: string;
  unresolved?: string[];
  suitableFor?: string[];
  notSuitableFor?: string[];
  /** 摘要更新时间 */
  summaryVersion?: string;
}

export type FreshnessLevel = "fresh" | "cache-expired" | "code-changed" | "stale";

export interface Freshness {
  level: FreshnessLevel;
  /** 距上次活动多少毫秒 */
  idleMs: number;
  cacheAlive: boolean;
  commitChanged: boolean;
  codeChanged: boolean;
  reasons: string[];
}

export type RosterStatus = "idle" | "busy" | "blocked" | "archived";

export interface RosterEntry {
  id: string;
  title: string;
  kind: SessionMeta["kind"];
  model: ModelRef;
  status: RosterStatus;
  lastActiveAt: string;
  messageCount: number;
  parentId?: string;
  record: RosterRecord;
  freshness: Freshness;
  /** 累计费用（美元），无则 0 */
  costUsd: number;
}

/** 名册 / 对话工具需要的会话网关：由服务端用 SessionHub 实现。 */
export interface ConversationGateway {
  list(): Promise<SessionRecord[]>;
  get(id: string): Promise<EngineSession>;
  create(input: {
    kind: SessionMeta["kind"];
    title: string;
    role?: string;
    model?: ModelRef;
    thinkingLevel?: ThinkingLevel;
    parentId?: string;
    initialMessage?: string;
    extra?: Record<string, unknown>;
    /** 子 agent：直接给完整系统提示 */
    systemPrompt?: string;
    tools?: CreateSessionOptions["tools"];
  }): Promise<EngineSession>;
  liveState(id: string): { isStreaming: boolean } | undefined;
}

export interface ModelLocks {
  main?: ModelRef;
  conversation?: ModelRef;
  subagent?: ModelRef;
  reviewer?: ModelRef;
}

export interface RosterOptions {
  /** 提示缓存 TTL（毫秒），按 provider 覆盖；缺省 5 分钟 */
  cacheTtlMs?: Record<string, number>;
  defaultCacheTtlMs?: number;
  /** 用户锁定的模型（优先于 AI 判断） */
  getModelLocks?: () => ModelLocks;
  /** 子 agent 并发上限 */
  maxConcurrentSubagents?: number;
  /** 子 agent 超时（毫秒） */
  subagentTimeoutMs?: number;
}
