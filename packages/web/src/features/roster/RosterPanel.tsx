import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { RosterEntry } from "../../api/types";
import { Badge } from "../../design-system/components/primitives";

const LEVEL: Record<
  RosterEntry["freshness"]["level"],
  { label: string; tone: "ok" | "warn" | "danger" }
> = {
  fresh: { label: "新鲜", tone: "ok" },
  "cache-expired": { label: "缓存已过期", tone: "warn" },
  "code-changed": { label: "代码已变", tone: "warn" },
  stale: { label: "过期", tone: "danger" },
};

/** 右侧上下文面板：当前对话的名册记录 + 新鲜度 + 费用。数据来自 /api/roster/:id。 */
export function RosterPanel({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const [entry, setEntry] = useState<RosterEntry | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey 是外部触发的刷新信号
  useEffect(() => {
    let alive = true;
    api
      .rosterEntry(sessionId)
      .then((e) => {
        if (alive) setEntry(e);
      })
      .catch(() => {
        if (alive) setEntry(null);
      });
    return () => {
      alive = false;
    };
  }, [sessionId, refreshKey]);

  if (!entry) return null;
  const r = entry.record;
  const level = LEVEL[entry.freshness.level];

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-panel p-3 text-xs xl:block">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={level.tone}>{level.label}</Badge>
        <Badge>{entry.status}</Badge>
        <span className="text-ink-faint">${entry.costUsd.toFixed(4)}</span>
        <span className="text-ink-faint">{entry.messageCount} 条</span>
      </div>
      {entry.freshness.reasons.length > 0 ? (
        <ul className="mb-3 space-y-0.5 text-ink-muted">
          {entry.freshness.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      <dl className="space-y-2">
        <Row label="模型" value={`${entry.model.provider}/${entry.model.id}`} />
        <Row label="职责" value={r.role} />
        <Row label="上下文领域" value={r.contextScope} />
        <Row label="代码范围" value={r.codeRange?.join(", ")} mono />
        <Row label="基准 commit" value={r.baseCommit?.slice(0, 7)} mono />
        <Row label="当前认知" value={r.currentUnderstanding} />
        <Row label="最近工作" value={r.recentWork} />
        <ListRow label="关键产物" items={r.keyArtifacts} mono />
        <ListRow label="未解决" items={r.unresolved} />
        <ListRow label="适合接" items={r.suitableFor} />
        <ListRow label="不适合接" items={r.notSuitableFor} />
        <Row label="摘要更新" value={r.summaryVersion?.replace("T", " ").slice(0, 16)} />
      </dl>
    </aside>
  );
}

function Row({ label, value, mono }: { label: string; value: string | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className={mono ? "break-all font-mono" : "whitespace-pre-wrap"}>{value}</dd>
    </div>
  );
}

function ListRow({
  label,
  items,
  mono,
}: {
  label: string;
  items: string[] | undefined;
  mono?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd>
        <ul className={mono ? "font-mono" : ""}>
          {items.map((x) => (
            <li key={x} className="break-all">
              - {x}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
