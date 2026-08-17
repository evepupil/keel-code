import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "@keel-code/testkit";
import { afterEach, describe, expect, it } from "vitest";
import { KEEL_META_ENTRY, readRecordFromFile, rebuildIndex } from "./index-store.js";

const dirs: { cleanup(): void }[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});

function line(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`;
}

describe("rebuildIndex", () => {
  it("从 jsonl 的 keel/meta 条目重建，统计消息数与最后活动时间", () => {
    const tmp = makeTempDir();
    dirs.push(tmp);
    const dir = join(tmp.path, "sessions");
    mkdirSync(dir);
    const meta = {
      id: "abc",
      kind: "main",
      title: "主对话",
      model: { provider: "mock", id: "mock-1" },
      thinkingLevel: "off",
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };
    writeFileSync(
      join(dir, "2026_abc.jsonl"),
      line({ type: "session", id: "abc", timestamp: "2026-08-17T00:00:00.000Z", cwd: "/p" }) +
        line({
          type: "custom",
          id: "e1",
          parentId: null,
          timestamp: "2026-08-17T00:00:01.000Z",
          customType: KEEL_META_ENTRY,
          data: meta,
        }) +
        line({
          type: "message",
          id: "e2",
          parentId: "e1",
          timestamp: "2026-08-17T00:00:02.000Z",
          message: { role: "user", content: "hi", timestamp: 1 },
        }) +
        line({
          type: "message",
          id: "e2b",
          parentId: "e2",
          timestamp: "2026-08-17T00:00:02.500Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "ok" }],
            usage: { input: 100, output: 40, cacheRead: 800, cost: { total: 0.01 } },
          },
        }) +
        line({
          type: "custom",
          id: "e3",
          parentId: "e2",
          timestamp: "2026-08-17T00:00:03.000Z",
          customType: KEEL_META_ENTRY,
          data: { ...meta, title: "改名了" },
        }),
    );
    writeFileSync(join(dir, "junk.jsonl"), "not json\n");
    const idx = rebuildIndex(dir);
    expect(Object.keys(idx.sessions)).toEqual(["abc"]);
    const rec = idx.sessions.abc;
    expect(rec?.meta.title).toBe("改名了");
    expect(rec?.messageCount).toBe(2);
    expect(rec?.lastActiveAt).toBe("2026-08-17T00:00:03.000Z");
    expect(rec?.usage).toEqual({ input: 100, output: 40, cacheRead: 800 });
    expect(rec?.costUsd).toBe(0.01);
  });

  it("没有 keel/meta 的文件被忽略", () => {
    const tmp = makeTempDir();
    dirs.push(tmp);
    const f = join(tmp.path, "x.jsonl");
    writeFileSync(f, line({ type: "session", id: "x", timestamp: "t", cwd: "/p" }));
    expect(readRecordFromFile(f)).toBeUndefined();
  });
});
