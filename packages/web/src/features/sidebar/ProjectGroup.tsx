import { Folder, FolderOpen, MoreHorizontal, Settings, SquarePen, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SessionListItem, WorkspaceInfo } from "../../api/types";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../design-system/components/hover-card";
import { IconButton } from "../../design-system/components/icon-button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "../../design-system/components/menu";
import { appStore, useAppState } from "../../store/app-store";
import { NewSessionDialog } from "../sessions/NewSessionDialog";
import { bucketSessions } from "./group-sessions";
import { SessionRow } from "./SessionRow";

export function ProjectGroup({ workspace }: { workspace: WorkspaceInfo }) {
  const workspaceId = useAppState((s) => s.workspaceId);
  const currentId = useAppState((s) => s.currentId);
  const view = useAppState((s) => s.view);
  const sessionsByWorkspace = useAppState((s) => s.sessionsByWorkspace);
  const currentSessions = useAppState((s) => s.sessions);
  const expanded = useAppState((s) => s.expandedWorkspaces.includes(workspace.id));
  const sessions: SessionListItem[] =
    sessionsByWorkspace[workspace.id] ?? (workspaceId === workspace.id ? currentSessions : []);
  const [showAll, setShowAll] = useState(false);
  const [showArch, setShowArch] = useState(false);
  const [creating, setCreating] = useState(false);
  const bucket = bucketSessions(sessions, showAll);
  const running = sessions.filter((s) => s.live?.isStreaming).length;
  const talkCount = sessions.filter((s) => s.meta.kind !== "subagent" && !s.meta.archived).length;

  const newSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCreating(true);
  };

  return (
    <div className="mb-0.5">
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="group flex w-full items-center gap-0.5 rounded-md pr-0.5 hover:bg-panel-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1.5 text-left text-sm font-medium"
              onClick={() => {
                if (workspace.id === workspaceId) appStore.toggleWorkspace(workspace.id);
                else void appStore.selectWorkspace(workspace.id);
              }}
            >
              {expanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              )}
              <span className="min-w-0 truncate">{workspace.name}</span>
            </button>
            <span className="inline-flex shrink-0">
              <Menu>
                <MenuTrigger asChild>
                  <IconButton size="xs" title="项目菜单">
                    <MoreHorizontal />
                  </IconButton>
                </MenuTrigger>
                <MenuContent align="start">
                  <MenuItem icon={<SquarePen />} onSelect={() => setCreating(true)}>
                    新建对话
                  </MenuItem>
                  <MenuItem
                    icon={<Settings />}
                    onSelect={() => {
                      void appStore.selectWorkspace(workspace.id);
                      appStore.openSettings("project");
                    }}
                  >
                    编辑项目
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    icon={<Trash2 />}
                    danger
                    onSelect={() => void appStore.removeWorkspace(workspace.id)}
                  >
                    移除项目
                  </MenuItem>
                </MenuContent>
              </Menu>
              <IconButton size="xs" title="在此项目新建对话" onClick={newSession}>
                <SquarePen />
              </IconButton>
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Folder className="h-4 w-4 text-ink-muted" />
            <span className="min-w-0 truncate text-sm font-semibold">{workspace.name}</span>
          </div>
          <div className="px-2 py-1 text-sm">
            {talkCount} 个对话{running ? ` · ${running} 运行中` : ""}
          </div>
          <div className="my-1 h-px bg-line" />
          <div className="break-all px-2 py-1.5 font-mono text-xs text-ink-muted">
            {workspace.path}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-2"
            onClick={() => {
              void appStore.selectWorkspace(workspace.id);
              appStore.openSettings("project");
            }}
          >
            <Settings className="h-4 w-4 text-ink-faint" /> 编辑项目
          </button>
        </HoverCardContent>
      </HoverCard>

      {expanded ? (
        <div className="pb-1.5">
          {bucket.main ? (
            <>
              <SessionRow
                item={bucket.main}
                workspaceId={workspace.id}
                active={
                  view === "chat" &&
                  workspaceId === workspace.id &&
                  currentId === bucket.main.meta.id
                }
              />
              {bucket.pinned.length + bucket.rest.length > 0 ? (
                <div className="mx-2 my-1 h-px bg-line" />
              ) : null}
            </>
          ) : null}
          {bucket.pinned.map((s) => (
            <SessionRow
              key={s.meta.id}
              item={s}
              workspaceId={workspace.id}
              active={view === "chat" && workspaceId === workspace.id && currentId === s.meta.id}
            />
          ))}
          {bucket.rest.map((s) => (
            <SessionRow
              key={s.meta.id}
              item={s}
              workspaceId={workspace.id}
              active={view === "chat" && workspaceId === workspace.id && currentId === s.meta.id}
            />
          ))}
          {bucket.hidden > 0 ? (
            <button
              type="button"
              className="w-full rounded-md py-1 pr-2 pl-[2.125rem] text-left text-xs text-ink-faint hover:bg-panel-2"
              onClick={() => setShowAll(true)}
            >
              展开其余 {bucket.hidden} 个对话
            </button>
          ) : null}
          {bucket.archived.length > 0 ? (
            <>
              <button
                type="button"
                className="flex w-full items-center rounded-md py-1 pr-2 pl-[2.125rem] text-left text-xs text-ink-faint hover:bg-panel-2"
                onClick={() => setShowArch((v) => !v)}
              >
                已归档 ({bucket.archived.length})
              </button>
              {showArch
                ? bucket.archived.map((s) => (
                    <SessionRow
                      key={s.meta.id}
                      item={s}
                      workspaceId={workspace.id}
                      active={
                        view === "chat" && workspaceId === workspace.id && currentId === s.meta.id
                      }
                    />
                  ))
                : null}
            </>
          ) : null}
        </div>
      ) : null}

      <NewSessionDialog
        open={creating}
        onClose={() => setCreating(false)}
        workspaceId={workspace.id}
      />
    </div>
  );
}
