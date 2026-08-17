import { ShieldAlert } from "lucide-react";
import type { ApprovalRequest } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Badge } from "../../design-system/components/primitives";
import { appStore } from "../../store/app-store";

/** 审批卡：某次工具调用等你点头。显示在消息流末尾。 */
export function ApprovalCard({
  request,
  fromSubagent,
}: {
  request: ApprovalRequest;
  fromSubagent: boolean;
}) {
  return (
    <div className="rounded-lg border border-warn/50 bg-panel p-3.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-warn" />
        <span className="font-medium">
          审批 · <span className="font-mono">{request.toolName}</span>
        </span>
        <Badge tone="warn">等待</Badge>
        {fromSubagent ? <Badge>来自子 agent</Badge> : null}
        <span className="ml-auto font-normal text-ink-faint">
          {new Date(request.createdAt).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <code className="mt-2 block overflow-x-auto rounded-md bg-panel-2 px-2.5 py-1.5 font-mono whitespace-pre-wrap">
        {request.summary}
      </code>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => void appStore.resolveApproval(request.id, "allow")}
        >
          允许
        </Button>
        <Button
          size="sm"
          onClick={() => void appStore.resolveApproval(request.id, "allow-session")}
        >
          本对话总是允许
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger"
          onClick={() => void appStore.resolveApproval(request.id, "deny")}
        >
          拒绝
        </Button>
      </div>
    </div>
  );
}
