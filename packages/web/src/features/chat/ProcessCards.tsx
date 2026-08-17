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
    <div className="mx-auto max-w-3xl px-4 py-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-xs">
        <Badge tone="accent">设计待确认</Badge>
        <FileText className="h-3.5 w-3.5 text-ink-faint" />
        <span className="font-mono">{data.path}</span>
        <span className="min-w-0 flex-1 text-ink-muted">{data.summary}</span>
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
    <div className="mx-auto max-w-3xl px-4 py-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
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
    </div>
  );
}

/** review 通过后的验收卡：用户自己验，只给「通过 / 打回」两个动作。 */
export function AcceptanceCard({ sessionId, batch }: { sessionId: string; batch: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-ok/40 bg-ok-soft/40 px-3 py-2 text-xs">
        <Badge tone="ok">待验收</Badge>
        <span className="min-w-0 flex-1">{batch}</span>
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
