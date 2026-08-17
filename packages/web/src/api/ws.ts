import { getToken } from "./client";
import type { ApprovalRequest, EngineEvent } from "./types";

type ServerMessage =
  | { type: "hello" }
  | { type: "event"; sessionId: string; event: EngineEvent }
  | { type: "sessions_changed" }
  | { type: "approval"; request: ApprovalRequest }
  | { type: "approval_resolved"; id: string; decision: string }
  | { type: "pong" }
  | { type: "error"; message: string };

export interface WsHandlers {
  onEvent(sessionId: string, event: EngineEvent): void;
  onSessionsChanged(): void;
  onStatus(connected: boolean): void;
  onApproval?(request: ApprovalRequest): void;
  onApprovalResolved?(id: string): void;
}

/** WebSocket 客户端：自动重连、断线后重放订阅。 */
export class WsClient {
  private ws: WebSocket | null = null;
  private readonly subs = new Set<string>();
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
      for (const id of this.subs) ws.send(JSON.stringify({ type: "subscribe", sessionId: id }));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "event") this.handlers.onEvent(msg.sessionId, msg.event);
      else if (msg.type === "sessions_changed") this.handlers.onSessionsChanged();
      else if (msg.type === "approval") this.handlers.onApproval?.(msg.request);
      else if (msg.type === "approval_resolved") this.handlers.onApprovalResolved?.(msg.id);
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

  subscribe(sessionId: string): void {
    this.subs.add(sessionId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", sessionId }));
    }
  }

  unsubscribe(sessionId: string): void {
    this.subs.delete(sessionId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", sessionId }));
    }
  }

  close(): void {
    this.closed = true;
    if (this.timer) window.clearTimeout(this.timer);
    this.ws?.close();
  }
}
