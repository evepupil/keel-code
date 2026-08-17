/** 与服务端共享的类型：直接复用引擎包的类型声明（仅类型，不进 bundle）。 */

export type {
  EngineEvent,
  EngineMessage,
  KeelSettings,
  ModelInfo,
  ModelRef,
  ProviderInfo,
  ProviderProbe,
  SessionKind,
  SessionMeta,
  SessionRecord,
  SessionState,
  ThinkingLevel,
  UsageInfo,
} from "@keel-code/engine";
export type { Freshness, RosterEntry, RosterRecord } from "@keel-code/roster";

export interface SessionListItem {
  meta: import("@keel-code/engine").SessionMeta;
  file: string;
  messageCount: number;
  lastActiveAt: string;
  live: { isStreaming: boolean } | null;
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
  cwd: string;
  name: string;
}

export interface CreateSessionInput {
  kind: import("@keel-code/engine").SessionKind;
  title: string;
  role?: string;
  model?: import("@keel-code/engine").ModelRef;
  thinkingLevel?: import("@keel-code/engine").ThinkingLevel;
  initialMessage?: string;
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
