/** 与服务端共享的类型：直接复用引擎包的类型声明（仅类型，不进 bundle）。 */

export type {
  EngineEvent,
  EngineMessage,
  KeelSettings,
  ModelInfo,
  ModelRef,
  ModelTier,
  ProviderInfo,
  ProviderProbe,
  SessionKind,
  SessionMeta,
  SessionRecord,
  SessionState,
  SessionUsage,
  ThinkingLevel,
  UsageInfo,
} from "@keel-code/engine";
export type { Freshness, RosterEntry, RosterRecord, TierView } from "@keel-code/roster";

export interface SessionListItem {
  meta: import("@keel-code/engine").SessionMeta;
  file: string;
  messageCount: number;
  lastActiveAt: string;
  live: { isStreaming: boolean } | null;
  costUsd: number;
  usage: import("@keel-code/engine").SessionUsage;
}

export interface SessionEntry {
  id: string;
  customType: string;
  data: unknown;
  timestamp: number;
}

export interface SessionDetail {
  meta: import("@keel-code/engine").SessionMeta;
  messages: import("@keel-code/engine").EngineMessage[];
  state: import("@keel-code/engine").SessionState;
  entries: SessionEntry[];
}

export interface ProjectInfo {
  id: string;
  cwd: string;
  name: string;
}

/** GET /api/workspaces */
export interface WorkspaceInfo {
  id: string;
  path: string;
  name: string;
  addedAt: string;
  lastOpenedAt: string;
  loaded: boolean;
  isProject: boolean;
  exists: boolean;
}

export type PickFolderResult =
  | { status: "picked"; path: string }
  | { status: "cancelled" }
  | { status: "unsupported"; reason: string };

export interface CreateSessionInput {
  kind: import("@keel-code/engine").SessionKind;
  title: string;
  role?: string;
  model?: import("@keel-code/engine").ModelRef;
  /** 没给 model 时按能力档落实 */
  tier?: import("@keel-code/engine").ModelTier;
  thinkingLevel?: import("@keel-code/engine").ThinkingLevel;
  initialMessage?: string;
}

/** GET /api/models/tiers */
export interface TiersOverview {
  tiers: import("@keel-code/roster").TierView[];
  kindTiers: Record<string, import("@keel-code/engine").ModelTier>;
  probes: Record<string, { reachable: boolean; at: number; latencyMs?: number; error?: string }>;
}

export interface DocListItem {
  path: string;
  size: number;
  mtime: string;
}

export interface DocAnnotation {
  line: number;
  stamp: string;
  text: string;
  anchor: string;
}

export interface DocRead {
  path: string;
  content: string;
  annotations: DocAnnotation[];
  freeze: { commit: string; at: string; note?: string } | null;
  diff?: string;
}

export interface BoardData {
  roadmap: {
    title: string;
    goal: string;
    milestones: {
      id: string;
      goal: string;
      status: string;
      deps: string;
      docs: { text: string; href: string }[];
      exit: string;
    }[];
  } | null;
  review: {
    roundsSincePass: number;
    lastPass: { tree: string; at: string; batch: string; sessionId: string } | null;
  };
  decisions: { line: number; section: string; text: string }[];
  roster: import("@keel-code/roster").RosterEntry[];
}

export interface ApprovalRequest {
  id: string;
  /** 客户端补上：来自哪个工作区 */
  workspaceId?: string;
  sessionId: string;
  parentId?: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
  createdAt: string;
}
