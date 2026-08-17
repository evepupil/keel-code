/**
 * 设计系统预览页（仅开发构建，#/dev/design）：把 token 与全部基础组件摆在一页，
 * 用来在写业务页面前先把「底子」看顺眼。纯展示，不写测试。
 */
import {
  Anchor,
  Archive,
  Bot,
  Copy,
  Folder,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Pin,
  Settings,
  ShieldCheck,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "../../design-system/components/button";
import { Chip } from "../../design-system/components/chip";
import { Dialog } from "../../design-system/components/dialog";
import { StatusDot } from "../../design-system/components/dot";
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
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../../design-system/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../design-system/components/popover";
import {
  Badge,
  Card,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from "../../design-system/components/primitives";
import { Ring } from "../../design-system/components/ring";
import { Segmented } from "../../design-system/components/segmented";
import { Switch } from "../../design-system/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../design-system/components/tabs";
import { Tip } from "../../design-system/components/tooltip";
import { readTheme, setTheme, type Theme } from "../../lib/theme";

const SWATCHES: { name: string; cls: string; ink?: boolean }[] = [
  { name: "canvas", cls: "bg-canvas" },
  { name: "side", cls: "bg-side" },
  { name: "side-2", cls: "bg-side-2" },
  { name: "panel", cls: "bg-panel" },
  { name: "panel-2", cls: "bg-panel-2" },
  { name: "line", cls: "bg-line" },
  { name: "line-strong", cls: "bg-line-strong" },
  { name: "ink", cls: "bg-ink", ink: true },
  { name: "ink-muted", cls: "bg-ink-muted", ink: true },
  { name: "ink-faint", cls: "bg-ink-faint", ink: true },
  { name: "accent", cls: "bg-accent", ink: true },
  { name: "accent-soft", cls: "bg-accent-soft" },
  { name: "violet", cls: "bg-violet", ink: true },
  { name: "ok", cls: "bg-ok", ink: true },
  { name: "ok-soft", cls: "bg-ok-soft" },
  { name: "warn", cls: "bg-warn", ink: true },
  { name: "warn-soft", cls: "bg-warn-soft" },
  { name: "danger", cls: "bg-danger", ink: true },
  { name: "danger-soft", cls: "bg-danger-soft" },
];

export function DesignPreview() {
  const [theme, setThemeState] = useState<Theme>(() => readTheme());
  const [switchOn, setSwitchOn] = useState(true);
  const [seg, setSeg] = useState("high");
  const [perm, setPerm] = useState("edits");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-10 px-8 py-8">
        <header className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">设计系统预览</h1>
          <span className="text-xs text-ink-faint">#/dev/design · 仅开发构建</span>
          <span className="flex-1" />
          <Segmented<Theme>
            value={theme}
            onChange={(t) => {
              setTheme(t);
              setThemeState(t);
            }}
            size="sm"
            className="w-56"
            options={[
              { value: "system", label: "系统" },
              { value: "light", label: "亮" },
              { value: "dark", label: "暗" },
            ]}
          />
        </header>

        <Section title="色板" hint="全部来自 tokens.css；侧栏 side 比正文 canvas 略灰一档">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-10">
            {SWATCHES.map((s) => (
              <div key={s.name} className="space-y-1">
                <div className={`h-12 rounded-md border border-line ${s.cls}`} />
                <div className="truncate text-[11px] text-ink-muted">{s.name}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="文字" hint="一套 sans（系统字体），层级靠字号 / 字重 / 灰度，不靠字体切换">
          <div className="space-y-2">
            <div className="text-lg font-semibold">18 / 600 · 页面标题</div>
            <div className="text-[15px] font-semibold">15 / 600 · 弹窗 tab 标题</div>
            <div className="text-sm font-semibold">14 / 600 · 会话标题</div>
            <div className="text-sm">14 / 400 · 正文、消息</div>
            <div className="text-[12.5px] text-ink-muted">
              12.5 / 400 · chip、卡片说明（ink-muted）
            </div>
            <div className="text-xs text-ink-faint">12 / 400 · 附注、时间（ink-faint）</div>
            <div className="text-[11px] font-medium text-ink-faint">11 / 500 · 徽标、分组标签</div>
            <div className="font-mono text-[12.5px]">mono 12.5 · packages/web/src/app/App.tsx</div>
          </div>
        </Section>

        <Section
          title="按钮"
          hint="primary 只给每屏一个主动作；secondary 是默认；ghost 用于低优先级"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">主要</Button>
            <Button>次要</Button>
            <Button variant="ghost">轻量</Button>
            <Button variant="danger">危险</Button>
            <Button size="sm">小号</Button>
            <Button disabled>禁用</Button>
            <Button variant="primary" disabled>
              <Spinner /> 处理中
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tip label="项目菜单">
              <IconButton size="xs" aria-label="更多">
                <MoreHorizontal />
              </IconButton>
            </Tip>
            <Tip label="新建对话">
              <IconButton size="xs" aria-label="新建对话">
                <SquarePen />
              </IconButton>
            </Tip>
            <IconButton size="xs" aria-label="置顶">
              <Pin />
            </IconButton>
            <IconButton size="xs" aria-label="归档">
              <Archive />
            </IconButton>
            <span className="mx-2 h-5 w-px bg-line" />
            <IconButton size="sm" aria-label="复制">
              <Copy />
            </IconButton>
            <IconButton size="sm" aria-label="有用">
              <ThumbsUp />
            </IconButton>
            <IconButton size="sm" aria-label="没用">
              <ThumbsDown />
            </IconButton>
            <span className="mx-2 h-5 w-px bg-line" />
            <IconButton aria-label="设置">
              <Settings />
            </IconButton>
            <IconButton active aria-label="上下文（打开中）">
              <LayoutGrid />
            </IconButton>
            <span className="text-xs text-ink-faint">xs 22 · sm 24 · md 30（active = 按下态）</span>
          </div>
        </Section>

        <Section
          title="Chip"
          hint="outline 放输入框里；soft 是输入框上方的上拉按钮；active = 面板打开"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip icon={<ShieldCheck />} caret="down">
              允许编辑
            </Chip>
            <Chip icon={<Bot />} caret="down">
              deepseek-v4 · 思考 高
            </Chip>
            <Chip icon={<Paperclip />} />
            <span className="mx-2 h-5 w-px bg-line" />
            <Chip variant="soft" icon={<LayoutGrid />} label="看板" status="M1 进行中" caret="up" />
            <Chip
              variant="soft"
              icon={<Bot />}
              label="子 agent"
              status="1 运行中 / 3"
              caret="up"
              active
            >
              <StatusDot state="run" />
            </Chip>
            <Chip
              variant="soft"
              icon={<ListChecks />}
              label="任务"
              status="3 已完成 · 1 进行中"
              caret="up"
            />
          </div>
        </Section>

        <Section
          title="徽标与状态点"
          hint="徽标只表达状态词；状态点：运行中呼吸、完成绿、待处理黄、失败红"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge>未开始</Badge>
            <Badge tone="accent">进行中</Badge>
            <Badge tone="ok">已完成</Badge>
            <Badge tone="warn">等待</Badge>
            <Badge tone="danger">失败</Badge>
            <span className="mx-2 h-5 w-px bg-line" />
            <StatusDot state="run" title="运行中" />
            <StatusDot state="ok" title="完成" />
            <StatusDot state="pending" title="待处理" />
            <StatusDot state="bad" title="失败" />
            <StatusDot state="idle" title="空闲" />
            <span className="mx-2 h-5 w-px bg-line" />
            <Ring value={12} />
            <Ring value={54} />
            <Ring value={78} />
            <Ring value={92} />
            <span className="text-xs text-ink-faint">进度环：&gt;70% 转黄，&gt;85% 转红</span>
          </div>
        </Section>

        <Section
          title="菜单 / 弹出层 / 悬浮卡"
          hint="全部传送门渲染，不受滚动容器裁切；Esc / 点外面关闭"
        >
          <div className="flex flex-wrap items-start gap-3">
            <Menu>
              <MenuTrigger asChild>
                <Button>项目菜单 ▾</Button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem icon={<Pin />}>置顶项目</MenuItem>
                <MenuItem icon={<Settings />}>编辑项目</MenuItem>
                <MenuItem icon={<SquarePen />}>新建对话</MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger>
                  移除项目
                </MenuItem>
              </MenuContent>
            </Menu>

            <Menu>
              <MenuTrigger asChild>
                <Chip icon={<ShieldCheck />} caret="down">
                  {perm === "ask" ? "询问" : perm === "edits" ? "允许编辑" : "全放行"}
                </Chip>
              </MenuTrigger>
              <MenuContent align="start" className="min-w-[16rem]">
                <MenuRadioGroup value={perm} onValueChange={setPerm}>
                  <MenuRadioItem value="ask" sub="每次工具调用都确认">
                    询问
                  </MenuRadioItem>
                  <MenuRadioItem value="edits" sub="读写编辑放行，bash 等确认">
                    允许编辑
                  </MenuRadioItem>
                  <MenuRadioItem value="yolo" sub="不再询问（逃生舱）">
                    全放行
                  </MenuRadioItem>
                </MenuRadioGroup>
              </MenuContent>
            </Menu>

            <Popover open={pullOpen} onOpenChange={setPullOpen}>
              <PopoverTrigger asChild>
                <Chip
                  variant="soft"
                  icon={<ListChecks />}
                  label="任务"
                  status="3 已完成 · 1 进行中"
                  caret="up"
                  active={pullOpen}
                />
              </PopoverTrigger>
              <PopoverContent side="top" className="w-[26rem]">
                <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5 font-medium">
                  <ListChecks className="h-4 w-4" /> 任务
                  <span className="font-normal text-ink-muted">3 已完成 · 1 进行中</span>
                </div>
                {[
                  ["done", "梳理设置页现有结构与数据流"],
                  ["done", "Dialog 增加 lg 尺寸变体"],
                  ["done", "拆出五个设置 tab 组件"],
                  ["doing", "跑门禁并修复类型错误"],
                  ["todo", "上报批次 3 并进入 review"],
                ].map(([st, t]) => (
                  <div
                    key={t}
                    className={`flex items-center gap-2 px-2.5 py-1.5 ${st === "todo" ? "text-ink-muted" : ""}`}
                  >
                    <StatusDot state={st === "done" ? "ok" : st === "doing" ? "run" : "idle"} />
                    {t}
                  </div>
                ))}
              </PopoverContent>
            </Popover>

            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="ghost">
                  <Folder className="h-4 w-4" /> 悬停看项目卡
                </Button>
              </HoverCardTrigger>
              <HoverCardContent>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Folder className="h-4 w-4 text-ink-muted" />
                  <span className="text-sm font-semibold">keel-code</span>
                  <span className="flex-1" />
                  <Pin className="h-4 w-4 text-ink-faint" />
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <Bot className="h-4 w-4 text-ink-faint" /> 7 个对话 · 1 运行中
                </div>
                <div className="my-1 h-px bg-line" />
                <div className="flex items-center gap-2 px-2 py-1.5 font-mono text-xs text-ink-muted">
                  <Folder className="h-4 w-4" /> D:\myproject\keel-code
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-2"
                >
                  <Settings className="h-4 w-4 text-ink-faint" /> 编辑项目
                </button>
              </HoverCardContent>
            </HoverCard>

            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="ghost">
                  <Anchor className="h-4 w-4" /> 悬停看会话卡
                </Button>
              </HoverCardTrigger>
              <HoverCardContent>
                <div className="flex items-baseline gap-2 px-2 py-1.5">
                  <span className="text-sm font-semibold">前端对话</span>
                  <span className="flex-1" />
                  <span className="text-xs text-ink-faint">刚刚</span>
                </div>
                <div className="px-2 pb-1.5 text-[12.5px] text-ink-muted">
                  负责整个前端（packages/web/**）
                </div>
                <div className="my-1 h-px bg-line" />
                <div className="px-2 pt-1 text-[11px] text-ink-faint">token 用量</div>
                <div className="grid grid-cols-3 gap-2 px-2 pt-1 pb-1.5">
                  {[
                    ["缓存命中", "19.8M"],
                    ["未命中", "1.1M"],
                    ["输出", "1.1M"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[11px] text-ink-faint">{k}</div>
                      <div className="text-sm font-medium">{v}</div>
                    </div>
                  ))}
                </div>
              </HoverCardContent>
            </HoverCard>

            <Button onClick={() => setDialogOpen(true)}>打开小弹窗</Button>
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="新建对话">
              <div className="space-y-3">
                <Field label="标题">
                  <Input placeholder="例如：前端开发 / 需求讨论 / 杂活" />
                </Field>
                <Field label="职责" hint="一句话职责 + 上下文领域 + 代码范围">
                  <Textarea rows={3} />
                </Field>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button variant="primary" onClick={() => setDialogOpen(false)}>
                    创建
                  </Button>
                </div>
              </div>
            </Dialog>
          </div>
        </Section>

        <Section title="表单控件" hint="Input / Select / Textarea / Switch / Segmented / Tabs">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="标题">
              <Input placeholder="占位文字" />
            </Field>
            <Field label="模型">
              <Select defaultValue="a">
                <option value="a">deepseek / deepseek-v4</option>
                <option value="b">anthropic / claude-sonnet-5</option>
              </Select>
            </Field>
            <Field label="职责" hint="辅助说明放在下面，灰字">
              <Textarea rows={2} placeholder="负责整个前端（src/web/**）" />
            </Field>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Switch id="sw-loop" checked={switchOn} onCheckedChange={setSwitchOn} />
                <label htmlFor="sw-loop">review 闭环</label>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Switch id="sw-off" checked={false} disabled />
                <label htmlFor="sw-off">禁用态</label>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-ink-muted">思考</div>
                <Segmented
                  value={seg}
                  onChange={setSeg}
                  size="sm"
                  options={[
                    { value: "off", label: "关" },
                    { value: "low", label: "低" },
                    { value: "medium", label: "中" },
                    { value: "high", label: "高" },
                    { value: "max", label: "最高" },
                  ]}
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium text-ink-muted">审批档位（带说明的分段）</div>
            <Segmented
              value={perm}
              onChange={setPerm}
              className="max-w-xl"
              options={[
                { value: "ask", label: "询问", sub: "每次工具调用都确认" },
                { value: "edits", label: "允许编辑", sub: "读写编辑放行，bash 等确认" },
                { value: "yolo", label: "全放行", sub: "不再询问（逃生舱）" },
              ]}
            />
          </div>
          <div className="mt-4">
            <Tabs defaultValue="a">
              <TabsList>
                <TabsTrigger value="a">横排 tab</TabsTrigger>
                <TabsTrigger value="b">第二个</TabsTrigger>
                <TabsTrigger value="c">第三个</TabsTrigger>
              </TabsList>
              <TabsContent value="a" className="py-2 text-sm text-ink-muted">
                横排 tab 内容
              </TabsContent>
              <TabsContent value="b" className="py-2 text-sm text-ink-muted">
                第二个
              </TabsContent>
              <TabsContent value="c" className="py-2 text-sm text-ink-muted">
                第三个
              </TabsContent>
            </Tabs>
          </div>
        </Section>

        <Section title="卡片" hint="消息流里的富节点：统一 12px 圆角、1px 线、无阴影">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-3.5">
              <div className="mb-1.5 flex items-center gap-2 font-medium">
                review · 批次 2 <Badge tone="ok">通过</Badge>
                <span className="ml-auto text-[11.5px] font-normal text-ink-faint">
                  reviewer：claude-sonnet-5 · 树指纹 3f9c1a2
                </span>
              </div>
              <p className="text-[13px]">0 阻塞 · 2 建议</p>
              <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink-muted">
                <li>Composer 的行数计算抽成纯函数并补单测</li>
                <li>tokens.css 暗色变量写了两遍，可合并</li>
              </ul>
              <div className="mt-2.5 flex gap-2">
                <Button variant="ghost" size="sm">
                  查看 reviewer 轨迹
                </Button>
              </div>
            </Card>
            <Card className="p-3.5">
              <div className="mb-1.5 flex items-center gap-2 font-medium">
                审批 · bash <Badge tone="warn">等待</Badge>
                <span className="ml-auto text-[11.5px] font-normal text-ink-faint">
                  当前档位：允许编辑
                </span>
              </div>
              <code className="block rounded-md bg-panel-2 px-2.5 py-1.5 font-mono text-[12.5px]">
                pnpm vitest run packages/engine
              </code>
              <div className="mt-2.5 flex gap-2">
                <Button variant="primary" size="sm">
                  允许
                </Button>
                <Button size="sm">本对话总是允许</Button>
                <Button variant="ghost" size="sm" className="text-danger">
                  拒绝
                </Button>
              </div>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}
