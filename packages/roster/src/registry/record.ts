import type { SessionMeta } from "@keel-code/engine";
import type { RosterRecord } from "../types.js";

export const ROSTER_EXTRA_KEY = "roster";

/** 从 SessionMeta.extra 里取名册记录（没有则空对象）。 */
export function recordOf(meta: SessionMeta): RosterRecord {
  const raw = meta.extra?.[ROSTER_EXTRA_KEY];
  return raw && typeof raw === "object" ? (raw as RosterRecord) : {};
}

/** 把记录写回 extra（返回新的 extra 对象，不改原对象）。 */
export function withRecord(
  extra: Record<string, unknown> | undefined,
  record: RosterRecord,
): Record<string, unknown> {
  return { ...(extra ?? {}), [ROSTER_EXTRA_KEY]: record };
}

/** 合并更新：只覆盖给了值的字段；数组字段整体替换。 */
export function mergeRecord(base: RosterRecord, patch: Partial<RosterRecord>): RosterRecord {
  const out: RosterRecord = { ...base };
  for (const [k, v] of Object.entries(patch) as [keyof RosterRecord, unknown][]) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** 名册投影文件名：标题清洗成 slug，附短 id 防撞。 */
export function rosterFileName(meta: SessionMeta): string {
  const slug =
    meta.title
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || meta.kind;
  return `${slug}-${meta.id.slice(0, 8)}.md`;
}
