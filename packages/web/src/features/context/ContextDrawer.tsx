import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { RosterEntry } from "../../api/types";
import { IconButton } from "../../design-system/components/icon-button";
import { Badge } from "../../design-system/components/primitives";
import { formatTokens } from "../../lib/format";
import { appStore, useAppState } from "../../store/app-store";

const LEVEL: Record<
  RosterEntry["freshness"]["level"],
  { label: string; tone: "ok" | "warn" | "danger" }
> = {
  fresh: { label: "新鲜", tone: "ok" },
  "cache-expired": { label: "缓存过期", tone: "warn" },
  "code-changed": { label: "代码已变", tone: "warn" },
  stale: { label: "过期", tone: "danger" },
};

export function ContextDrawer({
  sessionId,
  refreshKey,
}: {
  sessionId: string;
  refreshKey: number;
}) {
  const open = useAppState((s) => s.drawerOpen);
  const title = useAppState((s) => s.sessions.find((x) => x.meta.id === sessionId)?.meta.title);
  const usage = useAppState((s) => s.sessions.find((x) => x.meta.id === sessionId)?.usage);
  const [entry, setEntry] = useState<RosterEntry | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey 是外部刷新信号
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

  if (!open) return null;
  const r = entry?.record;
  const level = entry ? LEVEL[entry.freshness.level] : null;
  const tok = usage ? usage.cacheRead + usage.input + usage.output : 0;

  return (
    <aside className="hidden w-[296px] shrink-0 overflow-y-auto border-l border-line bg-side p-3.5 text-[12.5px] xl:block">
      <div className="mb-2.5 flex items-center justify-between text-[13px] font-semibold">
        <span className="min-w-0 truncate">上下文{title ? ` · ${title}` : ""}</span>
        <IconButton size="sm" onClick={() => appStore.setDrawer(false)} aria-label="关闭">
          <X />
        </IconButton>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-ink-faint">
        {level ? <Badge tone={level.tone}>{level.label}</Badge> : null}
        {entry ? <Badge>{entry.status}</Badge> : null}
        <span>{formatTokens(tok)} tok</span>
        {entry ? <span>{entry.messageCount} 条</span> : null}
      </div>
      {entry?.freshness.reasons.length ? (
        <ul className="mb-3 space-y-0.5 text-ink-muted">
          {entry.freshness.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      <dl className="grid gap-2.5">
        <Row label="模型" value={entry ? `${entry.model.provider}/${entry.model.id}` : undefined} />
        <Row label="职责" value={r?.role} />
        <Row label="上下文领域" value={r?.contextScope} />
        <Row label="代码范围" value={r?.codeRange?.join(", ")} mono />
        <Row label="基准 commit" value={r?.baseCommit?.slice(0, 7)} mono />
        <Row label="当前认知" value={r?.currentUnderstanding} />
        <Row label="最近工作" value={r?.recentWork} />
        <List label="关键产物" items={r?.keyArtifacts} mono />
        <List label="未解决" items={r?.unresolved} />
        <List label="适合接" items={r?.suitableFor} />
        <List label="不适合接" items={r?.notSuitableFor} />
        <Row label="摘要更新" value={r?.summaryVersion?.replace("T", " ").slice(0, 16)} />
      </dl>
    </aside>
  );
}

function Row({ label, value, mono }: { label: string; value: string | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11.5px] text-ink-faint">{label}</dt>
      <dd className={mono ? "break-all font-mono text-xs" : "whitespace-pre-wrap"}>{value}</dd>
    </div>
  );
}

function List({
  label,
  items,
  mono,
}: {
  label: string;
  items: string[] | undefined;
  mono?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <dt className="text-[11.5px] text-ink-faint">{label}</dt>
      <dd>
        <ul className={mono ? "font-mono text-xs" : ""}>
          {items.map((x) => (
            <li key={x} className="break-all">
              {x}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
