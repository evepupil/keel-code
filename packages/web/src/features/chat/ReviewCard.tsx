import { useState } from "react";
import { Badge } from "../../design-system/components/primitives";
import { appStore } from "../../store/app-store";

/** 与 @keel-code/loop 的 ReviewEntryData 同构（仅类型层面复制，避免 web 依赖 loop 运行时） */
export interface ReviewEntryView {
  at: string;
  round: number;
  batch: string;
  action: "pass" | "fix" | "suspend" | "escalate" | "error";
  summary?: string;
  findings?: {
    issue: string;
    category: "deterministic" | "decision";
    file?: string;
    suggestion?: string;
  }[];
  treeHash?: string;
  reviewerSessionId?: string;
  reviewerModel?: { provider: string; id: string };
  costUsd?: number;
}

const ACTION: Record<
  ReviewEntryView["action"],
  { label: string; tone: "ok" | "warn" | "danger" | "accent" | "neutral" }
> = {
  pass: { label: "通过", tone: "ok" },
  fix: { label: "未通过 · 待修复", tone: "warn" },
  suspend: { label: "待决策 · 已挂起", tone: "accent" },
  escalate: { label: "升级 · 需用户介入", tone: "danger" },
  error: { label: "reviewer 异常", tone: "danger" },
};

export function ReviewCard({ data }: { data: ReviewEntryView }) {
  const [open, setOpen] = useState(data.action !== "pass");
  const a = ACTION[data.action] ?? ACTION.error;
  return (
    <div className="rounded-lg border border-line bg-panel text-xs">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-2 px-3.5 py-2.5 text-left hover:bg-panel-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">review · {data.batch}</span>
        <Badge tone={a.tone}>{a.label}</Badge>
        <span className="ml-auto font-normal text-ink-faint">
          {data.reviewerModel ? `${data.reviewerModel.id} · ` : ""}第 {data.round} 轮
          {data.treeHash ? ` · ${data.treeHash.slice(0, 7)}` : ""}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-line px-3.5 py-2.5">
          {data.summary ? <p>{data.summary}</p> : null}
          {data.findings && data.findings.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-4 text-ink-muted">
              {data.findings.map((f) => (
                <li key={`${f.category}-${f.file ?? ""}-${f.issue}`}>
                  <Badge tone={f.category === "decision" ? "accent" : "warn"} className="mr-1.5">
                    {f.category === "decision" ? "待决策" : "确定性"}
                  </Badge>
                  {f.file ? <span className="mr-1 font-mono text-ink-faint">{f.file}</span> : null}
                  {f.issue}
                  {f.suggestion ? <div>→ {f.suggestion}</div> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-ink-faint">
            {data.reviewerSessionId ? (
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => appStore.selectSession(data.reviewerSessionId ?? "")}
              >
                查看 reviewer 轨迹
              </button>
            ) : null}
            <span>{data.at.replace("T", " ").slice(0, 19)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
