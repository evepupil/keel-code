import { describe, expect, it } from "vitest";
import { formatRoute, parseRoute, type Route } from "./router";

describe("hash 路由", () => {
  it("解析与格式化互逆", () => {
    const routes: Route[] = [
      { kind: "home" },
      { kind: "settings" },
      { kind: "design" },
      { kind: "workspace", workspaceId: "keel-code-abc123" },
      { kind: "chat", workspaceId: "w1", sessionId: "s1" },
      { kind: "board", workspaceId: "w1" },
      { kind: "doc", workspaceId: "w1", path: "docs/设计/01-总览.md" },
    ];
    for (const r of routes) expect(parseRoute(formatRoute(r))).toEqual(r);
  });

  it("容错：空 / 未知 / 残缺", () => {
    expect(parseRoute("")).toEqual({ kind: "home" });
    expect(parseRoute("#/nope/x")).toEqual({ kind: "home" });
    expect(parseRoute("#/w/w1/c")).toEqual({ kind: "workspace", workspaceId: "w1" });
    expect(parseRoute("#/w/w1/doc")).toEqual({ kind: "workspace", workspaceId: "w1" });
  });
});
