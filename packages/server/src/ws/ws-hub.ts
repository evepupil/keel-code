/**
 * WebSocket 扇出：客户端按会话订阅，服务端把引擎事件与名册变化推过去。
 *
 * 协议（JSON 文本帧）：
 *   客户端 → 服务端：{type:"subscribe", sessionId} | {type:"unsubscribe", sessionId} | {type:"ping"}
 *   服务端 → 客户端：{type:"hello"} | {type:"event", sessionId, event} | {type:"sessions_changed"} | {type:"pong"} | {type:"error", message}
 */
import type { WSContext } from "hono/ws";
import type { SessionHub } from "../hub.js";

interface ClientState {
  subscriptions: Set<string>;
}

export class WsHub {
  private readonly clients = new Map<WSContext, ClientState>();

  constructor(private readonly hub: SessionHub) {
    hub.onEvent(({ sessionId, event }) => {
      const payload = JSON.stringify({ type: "event", sessionId, event });
      for (const [ws, state] of this.clients) {
        if (state.subscriptions.has(sessionId)) safeSend(ws, payload);
      }
    });
    hub.onSessionsChanged(() => {
      const payload = JSON.stringify({ type: "sessions_changed" });
      for (const ws of this.clients.keys()) safeSend(ws, payload);
    });
  }

  connect(ws: WSContext): void {
    this.clients.set(ws, { subscriptions: new Set() });
    safeSend(ws, JSON.stringify({ type: "hello" }));
  }

  disconnect(ws: WSContext): void {
    this.clients.delete(ws);
  }

  message(ws: WSContext, raw: string): void {
    const state = this.clients.get(ws);
    if (!state) return;
    let msg: { type?: string; sessionId?: string };
    try {
      msg = JSON.parse(raw) as { type?: string; sessionId?: string };
    } catch {
      safeSend(ws, JSON.stringify({ type: "error", message: "bad json" }));
      return;
    }
    switch (msg.type) {
      case "ping":
        safeSend(ws, JSON.stringify({ type: "pong" }));
        return;
      case "subscribe":
        if (msg.sessionId) {
          state.subscriptions.add(msg.sessionId);
          // 确保会话已加载并挂上监听（懒加载）
          void this.hub.get(msg.sessionId).catch((e: unknown) => {
            safeSend(
              ws,
              JSON.stringify({
                type: "error",
                message: e instanceof Error ? e.message : String(e),
              }),
            );
          });
        }
        return;
      case "unsubscribe":
        if (msg.sessionId) state.subscriptions.delete(msg.sessionId);
        return;
      default:
        safeSend(ws, JSON.stringify({ type: "error", message: `unknown type ${msg.type}` }));
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

function safeSend(ws: WSContext, payload: string): void {
  try {
    ws.send(payload);
  } catch {
    // 连接已断，交给 close 处理
  }
}
