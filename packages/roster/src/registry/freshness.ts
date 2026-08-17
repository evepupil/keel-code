import type { Freshness, RosterRecord } from "../types.js";

export interface FreshnessInput {
  record: RosterRecord;
  lastActiveAt: string;
  now: number;
  cacheTtlMs: number;
  currentCommit: string | undefined;
  currentCodeHash: string | undefined;
}

/**
 * 新鲜度判定（纯函数）：
 * - fresh：缓存还在（上次活动在 TTL 内）且代码范围没被动过；
 * - cache-expired：缓存已过期但代码没变——复活成本高，按摘要新建通常更划算；
 * - code-changed：代码范围被别人动过（commit 或指纹变化）——必须先重建认知；
 * - stale：两者都发生。
 */
export function computeFreshness(input: FreshnessInput): Freshness {
  const last = Date.parse(input.lastActiveAt);
  const idleMs = Number.isFinite(last) ? Math.max(0, input.now - last) : Number.POSITIVE_INFINITY;
  const cacheAlive = idleMs <= input.cacheTtlMs;
  const commitChanged =
    !!input.record.baseCommit &&
    !!input.currentCommit &&
    input.record.baseCommit !== input.currentCommit;
  const codeChanged =
    !!input.record.codeHash &&
    !!input.currentCodeHash &&
    input.record.codeHash !== input.currentCodeHash;
  const changed = commitChanged || codeChanged;
  const reasons: string[] = [];
  if (!cacheAlive) reasons.push(`上次活动距今 ${formatIdle(idleMs)}，提示缓存大概率已失效`);
  if (commitChanged) {
    reasons.push(`基准 commit ${input.record.baseCommit?.slice(0, 7)} 已落后于当前 HEAD`);
  }
  if (codeChanged) reasons.push("负责的代码范围内容已变化");
  let level: Freshness["level"] = "fresh";
  if (!cacheAlive && changed) level = "stale";
  else if (changed) level = "code-changed";
  else if (!cacheAlive) level = "cache-expired";
  return { level, idleMs, cacheAlive, commitChanged, codeChanged, reasons };
}

export function formatIdle(ms: number): string {
  if (!Number.isFinite(ms)) return "未知";
  const m = Math.round(ms / 60000);
  if (m < 1) return "不到 1 分钟";
  if (m < 60) return `${m} 分钟`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} 小时`;
  return `${Math.round(h / 24)} 天`;
}
