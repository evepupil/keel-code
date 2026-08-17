import type { SessionRecord } from "@keel-code/engine";
import type {
  ConversationGateway,
  RosterEntry,
  RosterOptions,
  RosterRecord,
  RosterStatus,
} from "../types.js";
import { computeFreshness } from "./freshness.js";
import { codeHash, currentCommit } from "./git.js";
import { writeProjection } from "./projection.js";
import { mergeRecord, recordOf, withRecord } from "./record.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface RosterStoreDeps {
  cwd: string;
  gateway: ConversationGateway;
  options?: RosterOptions;
}

/** 名册存储：从会话记录派生名册条目（含新鲜度），更新记录并投影到仓库。 */
export class RosterStore {
  constructor(private readonly deps: RosterStoreDeps) {}

  private ttlFor(provider: string): number {
    const o = this.deps.options;
    return o?.cacheTtlMs?.[provider] ?? o?.defaultCacheTtlMs ?? DEFAULT_TTL_MS;
  }

  /** 全部条目（含已归档，调用方自行过滤）。 */
  async entries(now = Date.now()): Promise<RosterEntry[]> {
    const records = await this.deps.gateway.list();
    const head = await currentCommit(this.deps.cwd);
    const out: RosterEntry[] = [];
    for (const rec of records) {
      out.push(await this.toEntry(rec, head, now));
    }
    return out;
  }

  async entry(id: string, now = Date.now()): Promise<RosterEntry | undefined> {
    const rec = (await this.deps.gateway.list()).find((r) => r.meta.id === id);
    if (!rec) return undefined;
    return this.toEntry(rec, await currentCommit(this.deps.cwd), now);
  }

  private async toEntry(
    rec: SessionRecord,
    head: string | undefined,
    now: number,
  ): Promise<RosterEntry> {
    // 记录里没写 role 时用会话 meta 的职责段兜底（UI 直接建的对话）
    const stored = recordOf(rec.meta);
    const record = rec.meta.role && !stored.role ? { ...stored, role: rec.meta.role } : stored;
    const currentHash = record.codeHash
      ? await codeHash(this.deps.cwd, record.codeRange ?? [])
      : undefined;
    const freshness = computeFreshness({
      record,
      lastActiveAt: rec.lastActiveAt,
      now,
      cacheTtlMs: this.ttlFor(rec.meta.model.provider),
      currentCommit: head,
      currentCodeHash: currentHash,
    });
    const live = this.deps.gateway.liveState(rec.meta.id);
    let status: RosterStatus = "idle";
    if (rec.meta.archived) status = "archived";
    else if (live?.isStreaming) status = "busy";
    const entry: RosterEntry = {
      id: rec.meta.id,
      title: rec.meta.title,
      kind: rec.meta.kind,
      model: rec.meta.model,
      status,
      lastActiveAt: rec.lastActiveAt,
      messageCount: rec.messageCount,
      record,
      freshness,
      costUsd: rec.costUsd ?? 0,
    };
    if (rec.meta.parentId) entry.parentId = rec.meta.parentId;
    return entry;
  }

  /**
   * 更新某条对话的名册记录：合并字段，刷新 base-commit / code-hash / summary-version，
   * 写回会话 meta（持久化 + 索引），并重写 .keel/agents/ 投影。
   */
  async update(sessionId: string, patch: Partial<RosterRecord>): Promise<RosterRecord> {
    const session = await this.deps.gateway.get(sessionId);
    const base = recordOf(session.meta);
    const merged = mergeRecord(base, patch);
    const range = merged.codeRange ?? [];
    const [head, hash] = await Promise.all([
      currentCommit(this.deps.cwd),
      codeHash(this.deps.cwd, range),
    ]);
    if (head) merged.baseCommit = head;
    if (hash) merged.codeHash = hash;
    merged.summaryVersion = new Date().toISOString();
    session.updateMeta({ extra: withRecord(session.meta.extra, merged) });
    await this.project();
    return merged;
  }

  /** 重写仓库投影（只写非子 agent、未归档的对话）。 */
  async project(): Promise<void> {
    const all = await this.entries();
    writeProjection(
      this.deps.cwd,
      all.filter((e) => e.kind !== "subagent" && e.status !== "archived"),
    );
  }
}
