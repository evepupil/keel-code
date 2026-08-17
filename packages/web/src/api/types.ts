/** 与服务端共享的类型：直接复用引擎包的类型声明（仅类型，不进 bundle）。 */
export type {
  EngineEvent,
  EngineMessage,
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

export interface SessionListItem {
  meta: import("@keel-code/engine").SessionMeta;
  file: string;
  messageCount: number;
  lastActiveAt: string;
  live: { isStreaming: boolean } | null;
}

export interface SessionDetail {
  meta: import("@keel-code/engine").SessionMeta;
  messages: import("@keel-code/engine").EngineMessage[];
  state: import("@keel-code/engine").SessionState;
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
