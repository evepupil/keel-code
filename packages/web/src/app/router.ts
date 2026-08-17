/**
 * hash 路由（纯函数）：
 *   #/w/<wid>            工作区（默认进主对话）
 *   #/w/<wid>/c/<sid>    对话
 *   #/w/<wid>/board      看板
 *   #/w/<wid>/doc/<path> 设计文档
 *   #/settings           全局设置
 */
export type Route =
  | { kind: "home" }
  | { kind: "settings" }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "chat"; workspaceId: string; sessionId: string }
  | { kind: "board"; workspaceId: string }
  | { kind: "doc"; workspaceId: string; path: string };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const parts = h.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { kind: "home" };
  if (parts[0] === "settings") return { kind: "settings" };
  if (parts[0] === "w" && parts[1]) {
    const workspaceId = parts[1];
    const sub = parts[2];
    if (!sub) return { kind: "workspace", workspaceId };
    if (sub === "c" && parts[3]) return { kind: "chat", workspaceId, sessionId: parts[3] };
    if (sub === "board") return { kind: "board", workspaceId };
    if (sub === "doc" && parts.length > 3) {
      return { kind: "doc", workspaceId, path: parts.slice(3).join("/") };
    }
    return { kind: "workspace", workspaceId };
  }
  return { kind: "home" };
}

export function formatRoute(route: Route): string {
  const enc = encodeURIComponent;
  switch (route.kind) {
    case "home":
      return "#/";
    case "settings":
      return "#/settings";
    case "workspace":
      return `#/w/${enc(route.workspaceId)}`;
    case "chat":
      return `#/w/${enc(route.workspaceId)}/c/${enc(route.sessionId)}`;
    case "board":
      return `#/w/${enc(route.workspaceId)}/board`;
    case "doc":
      return `#/w/${enc(route.workspaceId)}/doc/${route.path.split("/").map(enc).join("/")}`;
  }
}
