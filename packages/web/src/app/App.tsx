import { PanelLeft } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { IconButton } from "../design-system/components/icon-button";
import { TooltipProvider } from "../design-system/components/tooltip";
import { BoardView } from "../features/board/BoardView";
import { ChatView } from "../features/chat/ChatView";
import { DocEditor } from "../features/docs/DocEditor";
import { Sidebar } from "../features/sessions/Sidebar";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { WorkspaceEmpty } from "../features/workspaces/WorkspaceEmpty";
import { cn } from "../lib/cn";
import { appStore, useAppState } from "../store/app-store";

/** 设计系统预览页只进开发构建 */
const DesignPreview = import.meta.env.DEV
  ? lazy(() => import("../features/dev/DesignPreview").then((m) => ({ default: m.DesignPreview })))
  : null;

export function App() {
  const ready = useAppState((s) => s.ready);
  const tokenMissing = useAppState((s) => s.tokenMissing);
  const fatal = useAppState((s) => s.fatal);
  const view = useAppState((s) => s.view);
  const workspaceId = useAppState((s) => s.workspaceId);
  const navCollapsed = useAppState((s) => s.navCollapsed);
  const notice = useAppState((s) => s.notice);

  useEffect(() => {
    void appStore.init();
  }, []);

  // Ctrl/Cmd+B 折叠侧栏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        appStore.toggleNav();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return null;
  if (tokenMissing) {
    return (
      <Center>
        <p className="text-sm">缺少访问令牌。请从终端里 keel web 打印的地址打开工作台。</p>
      </Center>
    );
  }
  if (fatal) {
    return (
      <Center>
        <p className="text-sm text-danger">连接服务失败：{fatal}</p>
      </Center>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full bg-canvas">
        <div
          className={cn(
            "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
            navCollapsed ? "w-0" : "w-64",
          )}
        >
          <Sidebar />
        </div>
        <main className="relative flex min-w-0 flex-1 flex-col">
          {navCollapsed ? (
            <IconButton
              className="absolute top-2.5 left-2 z-10"
              title="展开侧栏（Ctrl+B）"
              onClick={() => appStore.toggleNav()}
            >
              <PanelLeft />
            </IconButton>
          ) : null}
          {view === "design" && DesignPreview ? (
            <Suspense fallback={null}>
              <DesignPreview />
            </Suspense>
          ) : !workspaceId ? (
            <WorkspaceEmpty />
          ) : view === "board" ? (
            <BoardView />
          ) : view === "doc" ? (
            <DocEditor />
          ) : (
            <ChatView />
          )}
        </main>
        <SettingsDialog />
        {notice ? (
          <div
            className={cn(
              "fixed right-4 bottom-4 z-[70] rounded-md border px-3 py-2 text-xs shadow-md",
              notice.kind === "error"
                ? "border-danger/40 bg-danger-soft text-danger"
                : "border-line bg-panel",
            )}
          >
            {notice.text}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-8 text-center">{children}</div>;
}
