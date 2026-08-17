import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { KeelPaths, SessionMeta, SessionRecord } from "../types.js";

export const KEEL_META_ENTRY = "keel/meta";
export const KEEL_SYSTEM_PROMPT_ENTRY = "keel/system-prompt";

interface IndexFile {
  version: 1;
  sessions: Record<string, SessionRecord>;
}

/**
 * 项目会话索引：id → 元数据 / 文件 / 计数。
 * 索引只是加速缓存；丢了可以从会话文件里的 keel/meta 条目重建。
 */
export class SessionIndex {
  private data: IndexFile;

  constructor(private readonly paths: KeelPaths) {
    this.data = this.load();
  }

  private load(): IndexFile {
    try {
      const raw = JSON.parse(readFileSync(this.paths.projectIndexFile, "utf8")) as IndexFile;
      if (raw && raw.version === 1 && raw.sessions) {
        for (const rec of Object.values(raw.sessions)) rec.costUsd = Number(rec.costUsd ?? 0);
        return raw;
      }
    } catch {
      // 缺失或损坏 → 重建
    }
    const rebuilt = rebuildIndex(this.paths.projectSessionsDir);
    this.persist(rebuilt);
    return rebuilt;
  }

  private persist(data: IndexFile = this.data): void {
    mkdirSync(this.paths.projectSessionsDir, { recursive: true });
    const tmp = `${this.paths.projectIndexFile}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    renameSync(tmp, this.paths.projectIndexFile);
  }

  get(id: string): SessionRecord | undefined {
    return this.data.sessions[id];
  }

  list(): SessionRecord[] {
    return Object.values(this.data.sessions).sort((a, b) =>
      b.lastActiveAt.localeCompare(a.lastActiveAt),
    );
  }

  upsert(record: SessionRecord): void {
    this.data.sessions[record.meta.id] = record;
    this.persist();
  }

  updateMeta(id: string, meta: SessionMeta): void {
    const rec = this.data.sessions[id];
    if (!rec) return;
    rec.meta = meta;
    rec.lastActiveAt = meta.updatedAt;
    this.persist();
  }

  touch(
    id: string,
    patch: { messageCount?: number; lastActiveAt?: string; costUsd?: number },
  ): void {
    const rec = this.data.sessions[id];
    if (!rec) return;
    if (patch.messageCount !== undefined) rec.messageCount = patch.messageCount;
    if (patch.lastActiveAt !== undefined) rec.lastActiveAt = patch.lastActiveAt;
    if (patch.costUsd !== undefined) rec.costUsd = patch.costUsd;
    this.persist();
  }
}

/** 扫描会话目录，从每个 jsonl 的 keel/meta 条目重建索引。 */
export function rebuildIndex(dir: string): IndexFile {
  const out: IndexFile = { version: 1, sessions: {} };
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const file = join(dir, name);
    const rec = readRecordFromFile(file);
    if (rec) out.sessions[rec.meta.id] = rec;
  }
  return out;
}

export function readRecordFromFile(file: string): SessionRecord | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  let meta: SessionMeta | undefined;
  let messageCount = 0;
  let lastActiveAt = "";
  let costUsd = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof entry.timestamp === "string" && entry.timestamp > lastActiveAt) {
      lastActiveAt = entry.timestamp;
    }
    if (entry.type === "message") {
      messageCount += 1;
      const msg = entry.message as
        | { role?: string; usage?: { cost?: { total?: number } } }
        | undefined;
      if (msg?.role === "assistant") costUsd += Number(msg.usage?.cost?.total ?? 0);
    }
    if (entry.type === "custom" && entry.customType === KEEL_META_ENTRY) {
      const data = entry.data as SessionMeta | undefined;
      if (data && typeof data.id === "string") meta = data; // 后写的覆盖先写的
    }
  }
  if (!meta) return undefined;
  return { meta, file, messageCount, lastActiveAt: lastActiveAt || meta.updatedAt, costUsd };
}
