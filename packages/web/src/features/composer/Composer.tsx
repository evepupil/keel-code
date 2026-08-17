import { ArrowUp, Box, Paperclip, ShieldCheck, Square } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { ModelInfo, SessionListItem, ThinkingLevel } from "../../api/types";
import { Chip } from "../../design-system/components/chip";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../../design-system/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../design-system/components/popover";
import { Ring } from "../../design-system/components/ring";
import { Segmented } from "../../design-system/components/segmented";
import { appStore, useAppState } from "../../store/app-store";
import { emptyChat } from "../../store/apply-event";
import { modelKey, parseModelKey } from "../models/ModelSelect";
import { PullBar } from "./PullBar";
import { formatTok, runStatsOf } from "./stats";

const PERM: { value: "ask" | "edits" | "yolo"; label: string; sub: string }[] = [
  { value: "ask", label: "询问", sub: "每次工具调用都确认" },
  { value: "edits", label: "允许编辑", sub: "读写编辑放行，bash 等确认" },
  { value: "yolo", label: "全放行", sub: "不再询问（逃生舱）" },
];
const THINK: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "关" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "max", label: "最高" },
];
const CONFIG = ".keel/config.json";

export function Composer({
  session,
  empty,
}: {
  session: SessionListItem;
  /** 空对话：居中大卡片，无统计行 */
  empty?: boolean;
}) {
  const chat = useAppState((s) => s.chats[session.meta.id]);
  const streaming = chat?.streaming ?? false;
  const messages = chat?.messages ?? emptyChat().messages;
  const models = useAppState((s) => s.models);
  const [text, setText] = useState("");
  const [perm, setPerm] = useState<"ask" | "edits" | "yolo">("edits");
  const ref = useRef<HTMLTextAreaElement>(null);
  const draft = useAppState((s) => s.composerDraft);
  const stats = runStatsOf(messages);
  const model = models.find((m) => modelKey(m) === modelKey(session.meta.model));
  const windowSize = model?.contextWindow ?? 0;
  const used = stats.input + stats.output + stats.cacheRead;
  const pct = windowSize > 0 ? Math.round((used / windowSize) * 100) : 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在切会话时清空
  useEffect(() => {
    setText("");
  }, [session.meta.id]);

  useEffect(() => {
    if (draft !== null) {
      setText(draft);
      appStore.setComposerDraft(null);
      ref.current?.focus();
    }
  }, [draft]);

  useEffect(() => {
    api
      .readDoc(CONFIG)
      .then((d) => {
        const raw = JSON.parse(d.content) as { permissions?: { mode?: string } };
        const m = raw.permissions?.mode;
        if (m === "ask" || m === "edits" || m === "yolo") setPerm(m);
      })
      .catch(() => undefined);
  }, []);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    void appStore.sendPrompt(session.meta.id, t);
    setText("");
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const setPermission = async (mode: "ask" | "edits" | "yolo") => {
    setPerm(mode);
    try {
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse((await api.readDoc(CONFIG)).content) as Record<string, unknown>;
      } catch {
        raw = { version: 1 };
      }
      const permissions = {
        ...((raw.permissions as object) ?? {}),
        mode,
      };
      await api.writeDoc(CONFIG, `${JSON.stringify({ ...raw, permissions }, null, 2)}\n`);
    } catch (e) {
      appStore.notify("error", `保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return map;
  }, [models]);

  return (
    <div className={empty ? "w-full" : "px-5 pb-3"}>
      <div className="mx-auto max-w-[760px]">
        <PullBar sessionId={session.meta.id} />
        <div
          className={
            empty
              ? "rounded-xl border border-line bg-panel px-3 pt-2.5 pb-2 shadow-lg"
              : "rounded-xl border border-line bg-panel px-3 pt-2.5 pb-2 shadow-sm"
          }
        >
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={Math.min(8, Math.max(2, text.split("\n").length))}
            placeholder={streaming ? "运行中——现在发送会排在本轮之后" : "描述你要做的事"}
            className="w-full resize-none bg-transparent px-1 py-0.5 text-sm leading-6 outline-none placeholder:text-ink-faint"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-sm text-ink-muted hover:bg-panel-2"
              title="附件"
              disabled
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <Menu>
              <MenuTrigger asChild>
                <Chip icon={<ShieldCheck />} caret="down">
                  {PERM.find((p) => p.value === perm)?.label}
                </Chip>
              </MenuTrigger>
              <MenuContent align="start" className="min-w-[16rem]" side="top">
                <MenuRadioGroup
                  value={perm}
                  onValueChange={(v) => void setPermission(v as typeof perm)}
                >
                  {PERM.map((p) => (
                    <MenuRadioItem key={p.value} value={p.value} sub={p.sub}>
                      {p.label}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
            <span className="flex-1" />
            <Menu>
              <MenuTrigger asChild>
                <Chip icon={<Box />} caret="down">
                  {session.meta.model.id} · 思考{" "}
                  {THINK.find((t) => t.value === session.meta.thinkingLevel)?.label ?? "中"}
                </Chip>
              </MenuTrigger>
              <MenuContent align="end" className="min-w-[16rem]" side="top">
                {[...grouped.entries()].map(([provider, list]) => (
                  <div key={provider}>
                    <MenuLabel>{provider}</MenuLabel>
                    <MenuRadioGroup
                      value={modelKey(session.meta.model)}
                      onValueChange={(v) => {
                        const ref = parseModelKey(v);
                        if (ref) void appStore.patchSession(session.meta.id, { model: ref });
                      }}
                    >
                      {list.map((m) => (
                        <MenuRadioItem
                          key={modelKey(m)}
                          value={modelKey(m)}
                          hint={
                            m.contextWindow ? `${Math.round(m.contextWindow / 1000)}K` : undefined
                          }
                        >
                          {m.name}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioGroup>
                  </div>
                ))}
                <MenuSeparator />
                <div className="px-2 py-1.5">
                  <div className="mb-1 text-[11.5px] text-ink-faint">思考</div>
                  <Segmented
                    size="sm"
                    value={session.meta.thinkingLevel}
                    onChange={(v) =>
                      void appStore.patchSession(session.meta.id, { thinkingLevel: v })
                    }
                    options={THINK}
                  />
                </div>
              </MenuContent>
            </Menu>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-sm hover:bg-panel-2"
                  title="上下文用量"
                >
                  <Ring value={pct} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-64 p-3 text-[12.5px]">
                <div className="mb-2 flex justify-between font-medium">
                  <span>上下文已用 {pct}%</span>
                  <span>
                    ~{formatTok(used)} / {windowSize ? formatTok(windowSize) : "?"}
                  </span>
                </div>
                <div className="text-ink-muted">累计输入 {formatTok(stats.input)}</div>
                <div className="text-ink-muted">累计输出 {formatTok(stats.output)}</div>
                <div className="text-ink-muted">缓存命中 {formatTok(stats.cacheRead)}</div>
              </PopoverContent>
            </Popover>
            {streaming ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink text-canvas"
                title="停止"
                onClick={() => void appStore.abort(session.meta.id)}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40"
                title="发送"
                disabled={!text.trim()}
                onClick={send}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {!empty && stats.rounds > 0 ? (
          <div className="mt-1.5 truncate text-center text-[11.5px] text-ink-faint">
            {stats.rounds} 轮 · {stats.steps} 步<span className="mx-1.5 text-line-strong">｜</span>
            {stats.cacheHit !== null ? `缓存命中 ${stats.cacheHit}%` : "缓存 —"}
            <span className="mx-1.5 text-line-strong">｜</span>
            输入 {formatTok(stats.input)} · 输出 {formatTok(stats.output)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
