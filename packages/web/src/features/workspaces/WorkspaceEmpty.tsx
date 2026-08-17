import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../design-system/components/button";
import { appStore } from "../../store/app-store";
import { AddWorkspaceDialog } from "./AddWorkspaceDialog";

/** 还没有工作区时的主区域。 */
export function WorkspaceEmpty() {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-ink-muted">
        添加一个项目目录开始，或在项目目录里运行{" "}
        <code className="rounded-sm bg-panel-2 px-1 font-mono">keel web</code>。
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void appStore.pickWorkspace()}>
          <FolderOpen className="h-4 w-4" />
          选择文件夹…
        </Button>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          粘贴路径
        </Button>
      </div>
      <AddWorkspaceDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
