/**
 * 设置弹窗：左侧 tab（模型 / 能力档 / 项目 / MCP / 通用），右侧内容区各自滚动。
 * 全局挂载在 App 里，任何地方 appStore.openSettings(tab) 打开；#/settings 深链也走这里。
 */
import { Box, Folder, Gauge, Plug, Settings, X } from "lucide-react";
import { Dialog, DialogClose } from "../../design-system/components/dialog";
import { IconButton } from "../../design-system/components/icon-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../design-system/components/tabs";
import { appStore, type SettingsTab, useAppState } from "../../store/app-store";
import { ModelTiersSection } from "./ModelTiers";
import { GeneralTab } from "./tabs/GeneralTab";
import { McpTab } from "./tabs/McpTab";
import { ModelsTab } from "./tabs/ModelsTab";
import { ProjectTab } from "./tabs/ProjectTab";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "models", label: "模型", icon: <Box /> },
  { id: "tiers", label: "能力档", icon: <Gauge /> },
  { id: "project", label: "项目", icon: <Folder /> },
  { id: "mcp", label: "MCP", icon: <Plug /> },
  { id: "general", label: "通用", icon: <Settings /> },
];

export function SettingsDialog() {
  const open = useAppState((s) => s.settingsOpen);
  const tab = useAppState((s) => s.settingsTab);
  return (
    <Dialog
      open={open}
      onClose={() => appStore.closeSettings()}
      title="设置"
      size="lg"
      bodyClassName="flex p-0 overflow-hidden"
      header={
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line pr-2.5 pl-5">
          <span className="text-sm font-semibold">设置</span>
          <span className="flex-1" />
          <span className="font-mono text-xs text-ink-faint">~/.keel/settings.json</span>
          <DialogClose asChild>
            <IconButton aria-label="关闭">
              <X />
            </IconButton>
          </DialogClose>
        </div>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => appStore.setSettingsTab(v as SettingsTab)}
        orientation="vertical"
        className="flex min-h-0 flex-1"
      >
        <TabsList vertical className="w-44 shrink-0 border-r border-line bg-side p-2">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} vertical icon={t.icon}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <TabsContent value="models">
            <ModelsTab />
          </TabsContent>
          <TabsContent value="tiers">
            <ModelTiersSection />
          </TabsContent>
          <TabsContent value="project">
            <ProjectTab />
          </TabsContent>
          <TabsContent value="mcp">
            <McpTab />
          </TabsContent>
          <TabsContent value="general">
            <GeneralTab />
          </TabsContent>
        </div>
      </Tabs>
    </Dialog>
  );
}
