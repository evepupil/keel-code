import { ShieldAlert } from "lucide-react";
import type { ApprovalRequest } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Badge } from "../../design-system/components/primitives";
import { appStore } from "../../store/app-store";

/** 审批卡：某次工具调用等你点头。 */
export function ApprovalCard({
  request,
  fromSubagent,
}: {
  request: ApprovalRequest;
  fromSubagent: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-2">
      <div className="rounded-md border border-warn/50 bg-warn-soft/40 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warn" />
          <Badge tone="warn">等待审批</Badge>
          {fromSubagent ? <Badge>来自子 agent</Badge> : null}
          <span className="font-mono font-medium">{request.toolName}</span>
        </div>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono">
          {request.summary}
        </pre>
        <div className="mt-2 flex flex-wrap gap-2">
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
            onClick={() => void appStore.resolveApproval(request.id, "deny")}
          >
            拒绝
          </Button>
        </div>
      </div>
    </div>
  );
}
