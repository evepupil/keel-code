import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "../../design-system/components/button";
import { Dialog } from "../../design-system/components/dialog";
import { Field, Input } from "../../design-system/components/primitives";
import { appStore } from "../../store/app-store";

/** 添加工作区：粘路径，或弹系统目录选择框。 */
export function AddWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!path.trim()) return;
    setBusy(true);
    try {
      await appStore.addWorkspace(path.trim());
      setPath("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    setBusy(true);
    try {
      await appStore.pickWorkspace();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="添加工作区">
      <div className="space-y-3">
        <Field label="项目目录">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="D:\\myproject\\demo"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </Field>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" onClick={() => void pick()} disabled={busy}>
            <FolderOpen className="h-4 w-4" />
            选择文件夹…
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={busy || !path.trim()}>
              添加
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
