import { FileText, Lock } from "lucide-react";
import { Button } from "../../design-system/components/button";
import { Badge } from "../../design-system/components/primitives";
import { appStore } from "../../store/app-store";

/** keel/design-confirm：AI 请求用户批注设计文档 */
export function DesignConfirmCard({
  data,
  sessionId,
}: {
  data: { path: string; summary: string; at: string };
  sessionId: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-ink-faint" />
        <span className="font-medium">
          设计待确认 · <span className="font-mono">{data.path}</span>
        </span>
        <Badge tone="accent">等你批注</Badge>
      </div>
      <p className="mt-1.5 text-ink-muted">{data.summary}</p>
      <div className="mt-2.5">
        <Button size="sm" variant="primary" onClick={() => appStore.openDoc(data.path, sessionId)}>
          打开批注
        </Button>
      </div>
    </div>
  );
}

/** keel/design-freeze：设计已冻结 */
export function DesignFreezeCard({
  data,
}: {
  data: { path: string; commit: string; at: string; note?: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-xs text-ink-muted">
      <Lock className="h-3.5 w-3.5" />
      <span>设计已冻结</span>
      <button
        type="button"
        className="font-mono text-accent hover:underline"
        onClick={() => appStore.openDoc(data.path, null)}
      >
        {data.path}
      </button>
      <span className="font-mono">{data.commit}</span>
      {data.note ? <span>{data.note}</span> : null}
    </div>
  );
}

/** review 通过后的验收卡：用户自己验，只给「通过 / 打回」两个动作。 */
export function AcceptanceCard({ sessionId, batch }: { sessionId: string; batch: string }) {
  return (
    <div className="rounded-lg border border-ok/40 bg-ok-soft/40 p-3.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">验收 · {batch}</span>
        <Badge tone="ok">等你验收</Badge>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() =>
            void appStore.sendPrompt(
              sessionId,
              `验收通过：「${batch}」符合预期。请提交，并继续下一批。`,
            )
          }
        >
          通过
        </Button>
        <Button
          size="sm"
          onClick={() => appStore.setComposerDraft(`验收未通过：「${batch}」——问题是：`)}
        >
          打回
        </Button>
      </div>
    </div>
  );
}
