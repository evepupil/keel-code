import { describe, expect, it } from "vitest";
import type { SessionListItem } from "../../api/types";
import { bucketSessions, VISIBLE_LIMIT } from "./group-sessions";

function item(
  id: string,
  kind: "main" | "conversation" | "subagent",
  lastActiveAt: string,
  extra?: { archived?: boolean; pinned?: boolean },
): SessionListItem {
  return {
    meta: {
      id,
      kind,
      title: id,
      model: { provider: "mock", id: "m" },
      thinkingLevel: "off",
      createdAt: lastActiveAt,
      updatedAt: lastActiveAt,
      ...(extra?.archived ? { archived: true } : {}),
      ...(extra?.pinned ? { extra: { pinned: true } } : {}),
    },
    file: "",
    messageCount: 0,
    lastActiveAt,
    live: null,
    costUsd: 0,
    usage: { input: 0, output: 0, cacheRead: 0 },
  };
}

describe("bucketSessions", () => {
  it("丢掉子 agent，主对话置顶，钉住的排在普通对话前面", () => {
    const list = [
      item("c-old", "conversation", "2026-01-01T00:00:00Z"),
      item("sub", "subagent", "2026-08-01T00:00:00Z"),
      item("pin", "conversation", "2026-02-01T00:00:00Z", { pinned: true }),
      item("main", "main", "2026-03-01T00:00:00Z"),
      item("c-new", "conversation", "2026-04-01T00:00:00Z"),
      item("arch", "conversation", "2026-05-01T00:00:00Z", { archived: true }),
    ];
    const b = bucketSessions(list, false);
    expect(b.main?.meta.id).toBe("main");
    expect(b.pinned.map((s) => s.meta.id)).toEqual(["pin"]);
    expect(b.rest.map((s) => s.meta.id)).toEqual(["c-new", "c-old"]);
    expect(b.archived.map((s) => s.meta.id)).toEqual(["arch"]);
    expect(b.hidden).toBe(0);
  });

  it("超出可见条数时计入 hidden", () => {
    const list = Array.from({ length: VISIBLE_LIMIT + 3 }, (_, i) =>
      item(`c${i}`, "conversation", `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    );
    const folded = bucketSessions(list, false);
    expect(folded.rest).toHaveLength(VISIBLE_LIMIT);
    expect(folded.hidden).toBe(3);
    const open = bucketSessions(list, true);
    expect(open.rest).toHaveLength(VISIBLE_LIMIT + 3);
    expect(open.hidden).toBe(0);
  });
});
