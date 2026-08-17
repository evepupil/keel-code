/**
 * WebSocket 扇出（多工作区）：一条连接复用，客户端按「工作区 + 会话」订阅，
 * 服务端把各工作区的引擎事件 / 名册变化 / 审批推过去，都带 workspaceId。
 *
 * 协议（JSON 文本帧）：
 *   客户端 → 服务端：{type:"subscribe", workspaceId, sessionId} | {type:"unsubscribe", workspaceId, sessionId} | {type:"ping"}
 *   服务端 → 客户端：{type:"hello"} | {type:"event", workspaceId, sessionId, event}
 *                  | {type:"sessions_changed", workspaceId} | {type:"workspaces_changed"}
 *                  | {type:"approval", workspaceId, request} | {type:"approval_resolved", workspaceId, id, decision}
 *                  | {type:"pong"} | {type:"error", message}
 */
import type { WSContext } from "hono/ws";
import type { KeelRuntime } from "../runtime.js";
import type { WorkspaceManager } from "../workspaces/manager.js";

interface ClientState {
  /** `${workspaceId}/${sessionId}` */
  subscriptions: Set<string>;
}

interface ClientMessage {
  type?: string;
  workspaceId?: string;
  sessionId?: string;
}

const subKey = (workspaceId: string, sessionId: string) => `${workspaceId}/${sessionId}`;

export class WsHub {
  private readonly clients = new Map<WSContext, ClientState>();
  private readonly detachers = new Map<string, () => void>();

  constructor(private readonly manager: WorkspaceManager) {
    for (const id of manager.loadedIds()) {
      const rt = manager.peek(id);
      if (rt) this.attach(id, rt);
    }
    manager.onLoaded((id, rt) => this.attach(id, rt));
    manager.onUnloaded((id) => {
      this.detachers.get(id)?.();
      this.detachers.delete(id);
    });
    manager.onChanged(() => this.broadcast(JSON.stringify({ type: "workspaces_changed" })));
  }

  private attach(workspaceId: string, rt: KeelRuntime): void {
    this.detachers.get(workspaceId)?.();
    const offs: (() => void)[] = [];
    offs.push(
      rt.hub.onEvent(({ sessionId, event }) => {
        const payload = JSON.stringify({ type: "event", workspaceId, sessionId, event });
        const key = subKey(workspaceId, sessionId);
        for (const [ws, state] of this.clients) {
          if (state.subscriptions.has(key)) safeSend(ws, payload);
        }
      }),
    );
    offs.push(
      rt.hub.onSessionsChanged(() =>
        this.broadcast(JSON.stringify({ type: "sessions_changed", workspaceId })),
      ),
    );
    offs.push(
      rt.approvals.onRequest((req) =>
        this.broadcast(JSON.stringify({ type: "approval", workspaceId, request: req })),
      ),
    );
    offs.push(
      rt.approvals.onResolved((id, decision) =>
        this.broadcast(JSON.stringify({ type: "approval_resolved", workspaceId, id, decision })),
      ),
    );
    this.detachers.set(workspaceId, () => {
      for (const off of offs) off();
    });
  }

  private broadcast(payload: string): void {
    for (const ws of this.clients.keys()) safeSend(ws, payload);
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
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      safeSend(ws, JSON.stringify({ type: "error", message: "bad json" }));
      return;
    }
    switch (msg.type) {
      case "ping":
        safeSend(ws, JSON.stringify({ type: "pong" }));
        return;
      case "subscribe": {
        if (!msg.workspaceId || !msg.sessionId) {
          safeSend(ws, JSON.stringify({ type: "error", message: "workspaceId 与 sessionId 必填" }));
          return;
        }
        state.subscriptions.add(subKey(msg.workspaceId, msg.sessionId));
        const { workspaceId, sessionId } = msg;
        // 确保工作区已加载、会话已打开并挂上监听（懒加载）
        void this.manager
          .get(workspaceId)
          .then((rt) => {
            if (!rt) throw new Error(`未知工作区 ${workspaceId}`);
            this.manager.touch(workspaceId);
            return rt.hub.get(sessionId);
          })
          .catch((e: unknown) => {
            safeSend(
              ws,
              JSON.stringify({
                type: "error",
                message: e instanceof Error ? e.message : String(e),
              }),
            );
          });
        return;
      }
      case "unsubscribe":
        if (msg.workspaceId && msg.sessionId) {
          state.subscriptions.delete(subKey(msg.workspaceId, msg.sessionId));
        }
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
