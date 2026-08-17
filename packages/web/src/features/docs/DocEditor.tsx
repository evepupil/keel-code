import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { ArrowLeft, MessageSquarePlus, Save, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { DocRead } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Dialog } from "../../design-system/components/dialog";
import { Badge, Textarea } from "../../design-system/components/primitives";
import { appStore, useAppState } from "../../store/app-store";

/**
 * 设计文档编辑器：直接改文档、划选后写批注（插入 `> [!批注]` 块）、保存、让 AI 读改动。
 * 文件为准：所有动作都落到 docs/ 下的 markdown。
 */
export function DocEditor() {
  const doc = useAppState((s) => s.doc);
  const [meta, setMeta] = useState<DocRead | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annotating, setAnnotating] = useState<{ line: number; anchor: string } | null>(null);
  const [note, setNote] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const load = useCallback(async (path: string) => {
    const d = await api.readDoc(path);
    setMeta(d);
    const view = viewRef.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: d.content } });
    }
    // 上面的 dispatch 会触发 updateListener 把 dirty 置真，这里再清掉
    setDirty(false);
  }, []);

  // 建立编辑器
  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setDirty(true);
          }),
          EditorView.theme({
            "&": { fontSize: "13px", height: "100%" },
            ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
            ".cm-content": { padding: "12px 0" },
            ".cm-gutters": {
              background: "var(--color-panel)",
              color: "var(--color-ink-faint)",
              borderRight: "1px solid var(--color-line)",
            },
            "&.cm-focused": { outline: "none" },
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (doc?.path) void load(doc.path);
  }, [doc?.path, load]);

  if (!doc) return null;

  const save = async () => {
    const view = viewRef.current;
    if (!view) return;
    setSaving(true);
    try {
      await api.writeDoc(doc.path, view.state.doc.toString());
      await load(doc.path);
      appStore.notify("info", "已保存");
    } catch (e) {
      appStore.notify("error", `保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const startAnnotate = () => {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.to;
    const line = view.state.doc.lineAt(pos);
    setAnnotating({ line: line.number - 1, anchor: line.text.trim().slice(0, 80) });
    setNote("");
  };

  const submitAnnotate = async () => {
    if (!annotating || !note.trim()) return;
    try {
      // 先保存当前编辑，再由服务端插入批注块，避免覆盖
      const view = viewRef.current;
      if (view && dirty) await api.writeDoc(doc.path, view.state.doc.toString());
      await api.annotateDoc(doc.path, annotating.line, note.trim());
      await load(doc.path);
      setAnnotating(null);
    } catch (e) {
      appStore.notify("error", `批注失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const askAiToRead = async () => {
    if (dirty) await save();
    const target = doc.sessionId ?? appStore.getState().currentId;
    if (!target) return;
    await appStore.sendPrompt(
      target,
      `我在 ${doc.path} 里做了批注 / 修改。请用 keel_doc_changes 读改动，逐条回显「你改的是 X，我理解为要变成 Y，对吗？」，等我确认后再修订文档并 keel_design_freeze。`,
    );
    appStore.selectSession(target);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => appStore.setView("chat")}>
          <ArrowLeft className="h-4 w-4" />
          返回对话
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{doc.path}</span>
        {meta?.freeze ? (
          <Badge tone="ok">已冻结 {meta.freeze.commit}</Badge>
        ) : (
          <Badge tone="warn">未冻结</Badge>
        )}
        {meta && meta.annotations.length > 0 ? (
          <Badge tone="accent">{meta.annotations.length} 条批注</Badge>
        ) : null}
        {dirty ? <Badge>未保存</Badge> : null}
        <Button size="sm" onClick={startAnnotate} title="在光标所在段落后插入批注块">
          <MessageSquarePlus className="h-4 w-4" />
          批注
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
          <Save className="h-4 w-4" />
          保存
        </Button>
        <Button variant="primary" size="sm" onClick={() => void askAiToRead()}>
          <Send className="h-4 w-4" />让 AI 读改动
        </Button>
      </header>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-auto bg-panel" />
      <Dialog
        open={annotating !== null}
        onClose={() => setAnnotating(null)}
        title={annotating ? `批注：${annotating.anchor || "（空行）"}` : "批注"}
      >
        <div className="space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="写下你想改成什么、为什么"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAnnotating(null)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void submitAnnotate()} disabled={!note.trim()}>
              插入批注
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
