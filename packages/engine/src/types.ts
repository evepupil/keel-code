/**
 * Engine 对外类型。上层只依赖这里的类型，不接触 pi。
 */
import type { TSchema } from "typebox";

// ---------- 路径与项目 ----------

export interface KeelPaths {
  /** keel 用户目录，默认 ~/.keel */
  home: string;
  /** 凭据文件（pi 格式） */
  authFile: string;
  /** 自定义 provider / 模型（pi models.json 格式） */
  modelsFile: string;
  /** keel 自身设置 */
  settingsFile: string;
  /** 交给 pi 用的 agentDir（pi 的 settings.json 等放这里，与用户自己的 ~/.pi 隔离） */
  piAgentDir: string;
  /** 全部项目的会话根目录 */
  sessionsRoot: string;
  /** 当前项目的会话目录 */
  projectSessionsDir: string;
  /** 当前项目的会话索引文件 */
  projectIndexFile: string;
}

// ---------- 模型 ----------

export interface ModelRef {
  provider: string;
  id: string;
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelCost {
  /** 每百万输入 token 美元 */
  input: number;
  /** 每百万输出 token 美元 */
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelInfo extends ModelRef {
  name: string;
  api: string;
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: ModelCost;
  contextWindow: number;
  maxTokens: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  baseUrl?: string;
  /** 是否已配置凭据（环境变量 / auth.json / models.json） */
  configured: boolean;
  authSource?: string;
  modelCount: number;
}

export interface ProbeOptions {
  /** 只探测这些 provider；缺省探测所有已配置凭据的 provider */
  providers?: string[];
  timeoutMs?: number;
}

export interface ProbedModel extends ModelInfo {
  /** 端点 /models 列表里是否出现了这个模型 */
  listedByEndpoint: boolean;
  /** 目录里是否有这个模型（false = 只在端点列表里出现，成本 / 上下文未知） */
  catalogKnown: boolean;
}

export interface ProviderProbe {
  provider: string;
  name: string;
  baseUrl?: string;
  api?: string;
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
  error?: string;
  models: ProbedModel[];
}

// ---------- 会话 ----------

export type SessionKind = "main" | "conversation" | "subagent";

export interface SessionMeta {
  id: string;
  kind: SessionKind;
  title: string;
  /** 职责段（创建时注入到系统提示） */
  role?: string;
  model: ModelRef;
  thinkingLevel: ThinkingLevel;
  /** 子 agent 挂在哪条会话下 */
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  /** 上层自由使用的扩展字段（名册等） */
  extra?: Record<string, unknown>;
}

export interface SessionRecord {
  meta: SessionMeta;
  file: string;
  messageCount: number;
  lastActiveAt: string;
}

export interface CreateSessionOptions {
  kind: SessionKind;
  title: string;
  role?: string;
  model?: ModelRef;
  thinkingLevel?: ThinkingLevel;
  parentId?: string;
  /** 完整系统提示（方法论包组装好后传入）；缺省用 pi 默认提示 */
  systemPrompt?: string;
  /** 只启用这些内置工具名；缺省 read / bash / edit / write / grep / find / ls */
  tools?: string[];
  extra?: Record<string, unknown>;
}

export interface ForkSessionOptions extends Omit<CreateSessionOptions, "kind"> {
  kind?: SessionKind;
}

// ---------- 消息 ----------

export interface TextPart {
  type: "text";
  text: string;
}
export interface ThinkingPart {
  type: "thinking";
  thinking: string;
  redacted?: boolean;
}
export interface ToolCallPart {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface ImagePart {
  type: "image";
  mimeType: string;
  data: string;
}

export interface UsageInfo {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costTotal: number;
}

export type StopReason =
  | "pending"
  | "stop"
  | "length"
  | "toolUse"
  | "error"
  | "aborted"
  | "deferred";

export interface UserMessage {
  role: "user";
  content: string | (TextPart | ImagePart)[];
  timestamp: number;
}
export interface AssistantMessage {
  role: "assistant";
  content: (TextPart | ThinkingPart | ToolCallPart)[];
  provider: string;
  model: string;
  usage: UsageInfo;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}
export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextPart | ImagePart)[];
  isError: boolean;
  details?: unknown;
  timestamp: number;
}
export interface CustomMessage {
  role: "custom";
  customType: string;
  content: string;
  display: boolean;
  details?: unknown;
  timestamp: number;
}
export type EngineMessage = UserMessage | AssistantMessage | ToolResultMessage | CustomMessage;

// ---------- 事件 ----------

export type MessageDelta =
  | { kind: "text"; text: string; contentIndex: number }
  | { kind: "thinking"; text: string; contentIndex: number }
  | { kind: "toolcall"; contentIndex: number }
  | { kind: "other" };

export type EngineEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: EngineMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: EngineMessage }
  | { type: "message_start"; message: EngineMessage }
  | { type: "message_update"; message: EngineMessage; delta: MessageDelta }
  | { type: "message_end"; message: EngineMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: "entry_appended"; entryType: string; customType?: string; data?: unknown }
  | { type: "compaction_start"; reason: string }
  | { type: "compaction_end"; reason: string; aborted: boolean; errorMessage?: string }
  | { type: "retry"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "model_changed"; model: ModelRef }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "meta_updated"; meta: SessionMeta }
  | { type: "idle" };

export type EngineEventListener = (event: EngineEvent) => void;
export type Unsubscribe = () => void;

// ---------- 会话对象 ----------

export interface SessionState {
  isStreaming: boolean;
  isIdle: boolean;
  model: ModelRef | undefined;
  thinkingLevel: ThinkingLevel;
  usage: UsageInfo;
  contextTokens?: number;
  contextWindow?: number;
}

export interface CustomEntryRecord {
  id: string;
  customType: string;
  data: unknown;
  timestamp: number;
}

export interface EngineSession {
  readonly id: string;
  readonly meta: SessionMeta;
  readonly file: string | undefined;
  prompt(text: string, options?: { deliverAs?: "steer" | "followUp" }): Promise<void>;
  subscribe(listener: EngineEventListener): Unsubscribe;
  abort(): Promise<void>;
  waitForIdle(): Promise<void>;
  getMessages(): EngineMessage[];
  getState(): SessionState;
  setModel(model: ModelRef): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  appendEntry(customType: string, data?: unknown): void;
  getEntries(customType?: string): CustomEntryRecord[];
  updateMeta(patch: Partial<Omit<SessionMeta, "id" | "createdAt">>): void;
  dispose(): void;
}

// ---------- 工具与钩子 ----------

export interface ToolExecuteContext {
  sessionId: string;
  meta: SessionMeta;
  cwd: string;
  signal: AbortSignal | undefined;
}

export interface ToolResultContent {
  content: (TextPart | ImagePart)[];
  details?: unknown;
  isError?: boolean;
}

export interface KeelToolDefinition<TParams extends TSchema = TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: TParams;
  /** 系统提示「可用工具」一栏的一行简介；不给则不进该栏 */
  promptSnippet?: string;
  execute(params: unknown, ctx: ToolExecuteContext): Promise<ToolResultContent | string>;
}

/** 作用域：不给 = 全部会话 */
export interface HookScope {
  kinds?: SessionKind[];
  /** 自定义谓词，返回 false 则不生效 */
  match?: (meta: SessionMeta) => boolean;
}

export interface ToolCallGuardInput {
  sessionId: string;
  meta: SessionMeta;
  cwd: string;
  toolCallId: string;
  toolName: string;
  /** 可原地修改以改写参数 */
  input: Record<string, unknown>;
}
export interface ToolCallGuardResult {
  block?: boolean;
  reason?: string;
}
export type ToolCallGuard = (
  input: ToolCallGuardInput,
) => ToolCallGuardResult | undefined | Promise<ToolCallGuardResult | undefined>;

export interface ToolResultHookInput {
  sessionId: string;
  meta: SessionMeta;
  cwd: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: (TextPart | ImagePart)[];
  isError: boolean;
}
export type ToolResultHook = (input: ToolResultHookInput) => void | Promise<void>;

export interface BeforeAgentStartInput {
  sessionId: string;
  meta: SessionMeta;
  cwd: string;
  prompt: string;
  systemPrompt: string;
}
export interface BeforeAgentStartResult {
  /** 替换本轮系统提示 */
  systemPrompt?: string;
}
export type BeforeAgentStartHook = (
  input: BeforeAgentStartInput,
) => BeforeAgentStartResult | undefined | Promise<BeforeAgentStartResult | undefined>;

// ---------- Engine ----------

export interface EngineOptions {
  cwd: string;
  /** 默认 ~/.keel */
  homeDir?: string;
  /** 允许创建时联网刷新模型目录，默认 false */
  allowModelNetwork?: boolean;
}

export interface Engine {
  readonly cwd: string;
  readonly paths: KeelPaths;
  readonly models: {
    providers(): ProviderInfo[];
    list(providerId?: string): ModelInfo[];
    get(ref: ModelRef): ModelInfo | undefined;
    available(): Promise<ModelInfo[]>;
    setApiKey(providerId: string, apiKey: string): Promise<void>;
    removeApiKey(providerId: string): Promise<void>;
    probe(options?: ProbeOptions): Promise<ProviderProbe[]>;
  };
  readonly sessions: {
    create(options: CreateSessionOptions): Promise<EngineSession>;
    open(id: string): Promise<EngineSession>;
    fork(sourceId: string, options: ForkSessionOptions): Promise<EngineSession>;
    list(): Promise<SessionRecord[]>;
    /** 进程内已加载的会话 */
    live(id: string): EngineSession | undefined;
    liveAll(): EngineSession[];
  };
  readonly hooks: {
    onToolCall(guard: ToolCallGuard, scope?: HookScope): Unsubscribe;
    onToolResult(hook: ToolResultHook, scope?: HookScope): Unsubscribe;
    onBeforeAgentStart(hook: BeforeAgentStartHook, scope?: HookScope): Unsubscribe;
  };
  readonly tools: {
    register(def: KeelToolDefinition, scope?: HookScope): Unsubscribe;
  };
  dispose(): Promise<void>;
}
