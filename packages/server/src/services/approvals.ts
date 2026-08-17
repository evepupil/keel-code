/**
 * 审批：按 .keel/config.json 的 permissions 决定哪些工具调用要问用户。
 * - yolo：全放
 * - edits（默认）：文件读写自动放行；shell 命令要问（安全前缀白名单除外）
 * - ask：文件写入与 shell 都问
 * 问法：tool_call 守卫挂起 → 广播审批请求（WS）→ 用户在工作台点允许 / 拒绝 / 本会话总是允许 → 放行或拒绝。
 * 无头模式（keel run）全部自动放行。
 */
import { randomUUID } from "node:crypto";
import type { Engine, SessionMeta, Unsubscribe } from "@keel-code/engine";
import { readProjectConfig } from "@keel-code/guards";
import { extractCommand, SHELL_TOOL_RE } from "@keel-code/loop";

export type ApprovalDecision = "allow" | "deny" | "allow-session";

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  parentId?: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
  createdAt: string;
}

export interface ApprovalServices {
  onRequest(listener: (req: ApprovalRequest) => void): Unsubscribe;
  onResolved(listener: (id: string, decision: ApprovalDecision) => void): Unsubscribe;
  resolve(id: string, decision: ApprovalDecision): boolean;
  pending(): ApprovalRequest[];
  dispose(): void;
}

const WRITE_RE = /^(write|edit|str[-_]?replace|create[-_]?file|apply[-_]?patch)$/i;
/** 默认安全前缀：只读的 git / 文件查看 / 版本查询 / 项目自身门禁 */
const SAFE_PREFIXES = [
  "git status",
  "git diff",
  "git log",
  "git show",
  "git branch",
  "git rev-parse",
  "git ls-files",
  "ls",
  "dir",
  "cat ",
  "head ",
  "tail ",
  "pwd",
  "echo ",
  "node -v",
  "node --version",
  "pnpm -v",
  "npm -v",
  "pnpm test",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm gate",
  "pnpm build",
  "npm test",
  "npm run ",
  "pnpm run ",
  "cargo test",
  "cargo clippy",
  "cargo check",
];

export function isSafeCommand(command: string, extraAllow: string[] = []): boolean {
  const cmd = command.trim();
  // 链式 / 重定向 / 命令替换一律不算安全
  if (/&&|\|\||;|>|`|\$\(/.test(cmd)) return false;
  // 管道只允许出现在只读查看类命令后面（git status | head 之类）
  if (cmd.includes("|") && !/^(git (status|diff|log|show)|cat |head |tail |ls\b|dir\b)/.test(cmd)) {
    return false;
  }
  return [...SAFE_PREFIXES, ...extraAllow].some((p) => cmd === p.trim() || cmd.startsWith(p));
}

export function needsApproval(
  mode: "ask" | "edits" | "yolo",
  toolName: string,
  input: Record<string, unknown>,
  extraAllow: string[],
): boolean {
  if (mode === "yolo") return false;
  if (SHELL_TOOL_RE.test(toolName)) {
    const cmd = extractCommand(input) ?? "";
    return !isSafeCommand(cmd, extraAllow);
  }
  if (mode === "ask" && WRITE_RE.test(toolName)) return true;
  return false;
}

export function summarize(toolName: string, input: Record<string, unknown>): string {
  const cmd = SHELL_TOOL_RE.test(toolName) ? extractCommand(input) : undefined;
  if (cmd) return cmd.length > 200 ? `${cmd.slice(0, 200)}…` : cmd;
  const p = input.path ?? input.file_path ?? input.filePath;
  if (typeof p === "string") return p;
  const s = JSON.stringify(input);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

export function setupApprovals(
  engine: Engine,
  options: { headless: boolean; timeoutMs?: number },
): ApprovalServices {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const requestListeners = new Set<(req: ApprovalRequest) => void>();
  const resolvedListeners = new Set<(id: string, decision: ApprovalDecision) => void>();
  const pending = new Map<
    string,
    { req: ApprovalRequest; resolve: (d: ApprovalDecision) => void; timer: NodeJS.Timeout }
  >();
  const sessionAllow = new Map<string, Set<string>>();

  const key = (toolName: string) => (SHELL_TOOL_RE.test(toolName) ? "shell" : toolName);

  const off = engine.hooks.onToolCall(async (i) => {
    if (options.headless) return undefined;
    const cfg = readProjectConfig(engine.cwd);
    const mode = cfg.permissions?.mode ?? "edits";
    const extraAllow = cfg.permissions?.allow ?? [];
    if (!needsApproval(mode, i.toolName, i.input, extraAllow)) return undefined;
    if (sessionAllow.get(i.sessionId)?.has(key(i.toolName))) return undefined;

    const req: ApprovalRequest = {
      id: randomUUID(),
      sessionId: i.sessionId,
      toolName: i.toolName,
      summary: summarize(i.toolName, i.input),
      args: i.input,
      createdAt: new Date().toISOString(),
    };
    const parent = (i.meta as SessionMeta).parentId;
    if (parent) req.parentId = parent;

    const decision = await new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(req.id);
        resolve("deny");
      }, timeoutMs);
      pending.set(req.id, { req, resolve, timer });
      for (const l of requestListeners) l(req);
    });
    if (decision === "allow-session") {
      const set = sessionAllow.get(i.sessionId) ?? new Set<string>();
      set.add(key(i.toolName));
      sessionAllow.set(i.sessionId, set);
    }
    if (decision === "deny") {
      return {
        block: true,
        reason: `用户拒绝了这次 ${i.toolName} 调用：${req.summary}。换个做法或询问用户。`,
      };
    }
    return undefined;
  });

  return {
    onRequest: (l) => {
      requestListeners.add(l);
      return () => requestListeners.delete(l);
    },
    onResolved: (l) => {
      resolvedListeners.add(l);
      return () => resolvedListeners.delete(l);
    },
    resolve: (id, decision) => {
      const p = pending.get(id);
      if (!p) return false;
      clearTimeout(p.timer);
      pending.delete(id);
      p.resolve(decision);
      for (const l of resolvedListeners) l(id, decision);
      return true;
    },
    pending: () => [...pending.values()].map((p) => p.req),
    dispose: () => {
      off();
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.resolve("deny");
      }
      pending.clear();
    },
  };
}
