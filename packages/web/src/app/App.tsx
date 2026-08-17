import { useEffect } from "react";
import { BoardView } from "../features/board/BoardView";
import { ChatView } from "../features/chat/ChatView";
import { DocEditor } from "../features/docs/DocEditor";
import { Sidebar } from "../features/sessions/Sidebar";
import { SettingsView } from "../features/settings/SettingsView";
import { cn } from "../lib/cn";
import { appStore, useAppState } from "../store/app-store";

export function App() {
  const ready = useAppState((s) => s.ready);
  const tokenMissing = useAppState((s) => s.tokenMissing);
  const fatal = useAppState((s) => s.fatal);
  const view = useAppState((s) => s.view);
  const notice = useAppState((s) => s.notice);

  useEffect(() => {
    void appStore.init();
  }, []);

  if (!ready) return null;
  if (tokenMissing) {
    return (
      <Center>
        <p className="text-sm">缺少访问令牌。请从终端里 keel serve 打印的地址打开工作台。</p>
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
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {view === "settings" ? (
          <SettingsView />
        ) : view === "board" ? (
          <BoardView />
        ) : view === "doc" ? (
          <DocEditor />
        ) : (
          <ChatView />
        )}
      </main>
      {notice ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 rounded-md border px-3 py-2 text-xs shadow-md",
            notice.kind === "error"
              ? "border-danger/40 bg-danger-soft text-danger"
              : "border-line bg-panel",
          )}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-8 text-center">{children}</div>;
}
