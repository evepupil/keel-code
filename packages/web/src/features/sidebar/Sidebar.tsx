import { FolderPlus, Search, Settings } from "lucide-react";
import { useState } from "react";
import { Button } from "../../design-system/components/button";
import { IconButton } from "../../design-system/components/icon-button";
import { Tip } from "../../design-system/components/tooltip";
import { appStore, useAppState } from "../../store/app-store";
import { AddWorkspaceDialog } from "../workspaces/AddWorkspaceDialog";
import { ProjectGroup } from "./ProjectGroup";

export function Sidebar() {
  const workspaces = useAppState((s) => s.workspaces);
  const [adding, setAdding] = useState(false);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-side">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="text-base font-semibold tracking-tight">keel</span>
      </div>

      <div className="flex items-center gap-0.5 px-2.5 pt-2 pb-1 text-xs text-ink-faint">
        <span className="flex-1">项目</span>
        <Tip label="搜索会话">
          <IconButton size="xs" title="搜索会话" disabled>
            <Search />
          </IconButton>
        </Tip>
        <Tip label="添加项目">
          <IconButton size="xs" title="添加项目" onClick={() => setAdding(true)}>
            <FolderPlus />
          </IconButton>
        </Tip>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {workspaces.length === 0 ? (
          <p className="px-2 py-4 text-xs text-ink-faint">还没有项目</p>
        ) : (
          workspaces.map((w) => <ProjectGroup key={w.id} workspace={w} />)
        )}
      </nav>

      <div className="border-t border-line p-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => appStore.openSettings()}
        >
          <Settings className="h-4 w-4" />
          设置
        </Button>
      </div>

      <AddWorkspaceDialog open={adding} onClose={() => setAdding(false)} />
    </aside>
  );
}
