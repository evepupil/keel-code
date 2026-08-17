/**
 * 设置 › MCP：当前工作区的 MCP 服务器连接状态。配置在 ~/.keel/mcp.json 与 <项目>/.keel/mcp.json（mcpServers 格式）。
 */
import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { StatusDot } from "../../../design-system/components/dot";
import { Badge } from "../../../design-system/components/primitives";
import { useAppState } from "../../../store/app-store";

interface McpServer {
  name: string;
  connected: boolean;
  tools: string[];
  error?: string;
}

export function McpTab() {
  const workspaceId = useAppState((s) => s.workspaceId);
  const project = useAppState((s) => s.project);
  const [servers, setServers] = useState<McpServer[] | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setServers([]);
      return;
    }
    let alive = true;
    api
      .mcp()
      .then((list) => {
        if (alive) setServers(list);
      })
      .catch(() => {
        if (alive) setServers([]);
      });
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold">MCP 服务器</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          配置在 <code className="rounded-sm bg-panel-2 px-1 font-mono">~/.keel/mcp.json</code>{" "}
          或项目的 <code className="rounded-sm bg-panel-2 px-1 font-mono">.keel/mcp.json</code>
          （mcpServers 格式，与 Claude Code 相同），改后重启 keel web 生效。
        </p>
      </div>
      {!workspaceId ? (
        <p className="text-xs text-ink-faint">先打开一个项目。</p>
      ) : servers === null ? null : servers.length === 0 ? (
        <p className="text-xs text-ink-faint">{project?.name}：没有配置 MCP 服务器。</p>
      ) : (
        <ul className="divide-y divide-line">
          {servers.map((s) => (
            <li key={s.name} className="flex items-center gap-2.5 py-2 text-sm">
              <StatusDot state={s.connected ? "ok" : "bad"} />
              <span className="font-medium">{s.name}</span>
              {s.connected ? (
                <Badge tone="ok">已连接 · {s.tools.length} 个工具</Badge>
              ) : (
                <Badge tone="danger">未连接{s.error ? `：${s.error}` : ""}</Badge>
              )}
              <span className="ml-auto text-xs text-ink-faint">{project?.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
