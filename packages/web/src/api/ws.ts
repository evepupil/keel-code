import { getToken } from "./client";
import type { ApprovalRequest, EngineEvent } from "./types";

type ServerMessage =
  | { type: "hello" }
  | { type: "event"; workspaceId: string; sessionId: string; event: EngineEvent }
  | { type: "sessions_changed"; workspaceId: string }
  | { type: "workspaces_changed" }
  | { type: "approval"; workspaceId: string; request: ApprovalRequest }
  | { type: "approval_resolved"; workspaceId: string; id: string; decision: string }
  | { type: "pong" }
  | { type: "error"; message: string };

export interface WsHandlers {
  onEvent(workspaceId: string, sessionId: string, event: EngineEvent): void;
  onSessionsChanged(workspaceId: string): void;
  onWorkspacesChanged?(): void;
  onStatus(connected: boolean): void;
  onApproval?(workspaceId: string, request: ApprovalRequest): void;
  onApprovalResolved?(workspaceId: string, id: string): void;
}

const subKey = (workspaceId: string, sessionId: string) => `${workspaceId}/${sessionId}`;

/** WebSocket 客户端：一条连接复用所有工作区；自动重连、断线后重放订阅。 */
export class WsClient {
  private ws: WebSocket | null = null;
  private readonly subs = new Map<string, { workspaceId: string; sessionId: string }>();
  private retry = 0;
  private closed = false;
  private timer: number | undefined;

  constructor(private readonly handlers: WsHandlers) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  private open(): void {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${getToken()}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.handlers.onStatus(true);
      for (const sub of this.subs.values()) ws.send(JSON.stringify({ type: "subscribe", ...sub }));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "event") this.handlers.onEvent(msg.workspaceId, msg.sessionId, msg.event);
      else if (msg.type === "sessions_changed") this.handlers.onSessionsChanged(msg.workspaceId);
      else if (msg.type === "workspaces_changed") this.handlers.onWorkspacesChanged?.();
      else if (msg.type === "approval") this.handlers.onApproval?.(msg.workspaceId, msg.request);
      else if (msg.type === "approval_resolved")
        this.handlers.onApprovalResolved?.(msg.workspaceId, msg.id);
    };
    ws.onclose = () => {
      this.handlers.onStatus(false);
      if (this.closed) return;
      const delay = Math.min(1000 * 2 ** this.retry, 10_000);
      this.retry += 1;
      this.timer = window.setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {
      // 交给 onclose 重连
    };
  }

  subscribe(workspaceId: string, sessionId: string): void {
    this.subs.set(subKey(workspaceId, sessionId), { workspaceId, sessionId });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", workspaceId, sessionId }));
    }
  }

  unsubscribe(workspaceId: string, sessionId: string): void {
    this.subs.delete(subKey(workspaceId, sessionId));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", workspaceId, sessionId }));
    }
  }

  /** 切换工作区时清掉旧订阅 */
  unsubscribeAll(): void {
    for (const sub of this.subs.values()) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "unsubscribe", ...sub }));
      }
    }
    this.subs.clear();
  }

  close(): void {
    this.closed = true;
    if (this.timer) window.clearTimeout(this.timer);
    this.ws?.close();
  }
}
