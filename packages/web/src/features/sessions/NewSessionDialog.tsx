import { useMemo, useState } from "react";
import type { ModelInfo } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Dialog } from "../../design-system/components/dialog";
import { Field, Input, Select, Textarea } from "../../design-system/components/primitives";
import { appStore, useAppState } from "../../store/app-store";

/** 模型下拉的取值格式：provider::id */
export function modelKey(m: { provider: string; id: string }): string {
  return `${m.provider}::${m.id}`;
}
export function parseModelKey(key: string): { provider: string; id: string } | undefined {
  const i = key.indexOf("::");
  if (i <= 0) return undefined;
  return { provider: key.slice(0, i), id: key.slice(i + 2) };
}

export function ModelSelect({
  value,
  onChange,
  models,
  allowEmpty,
  emptyLabel = "默认（第一个可用模型）",
}: {
  value: string;
  onChange: (v: string) => void;
  models: ModelInfo[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return [...map.entries()];
  }, [models]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {grouped.map(([provider, list]) => (
        <optgroup key={provider} label={provider}>
          {list.map((m) => (
            <option key={modelKey(m)} value={modelKey(m)}>
              {m.name}
              {m.cost.input || m.cost.output ? `　$${m.cost.input}/${m.cost.output} 每百万` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function NewSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const models = useAppState((s) => s.models);
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [model, setModel] = useState("");
  const [initial, setInitial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setRole("");
    setModel("");
    setInitial("");
    setError(null);
  };

  const submit = async () => {
    if (!title.trim()) {
      setError("标题必填");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ref = parseModelKey(model);
      await appStore.createSession({
        kind: "conversation",
        title: title.trim(),
        ...(role.trim() ? { role: role.trim() } : {}),
        ...(ref ? { model: ref } : {}),
        ...(initial.trim() ? { initialMessage: initial.trim() } : {}),
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="新建对话">
      <div className="space-y-3">
        <Field label="标题">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：前端开发 / 需求讨论 / 杂活"
            autoFocus
          />
        </Field>
        <Field label="职责" hint="一句话职责 + 上下文领域 + 代码范围。会注入这条对话的系统提示。">
          <Textarea
            value={role}
            onChange={(e) => setRole(e.target.value)}
            rows={3}
            placeholder="例如：负责整个前端（src/web/**），维护设计系统与页面"
          />
        </Field>
        <Field label="模型">
          <ModelSelect value={model} onChange={setModel} models={models} allowEmpty />
        </Field>
        <Field label="第一条消息（可选）">
          <Textarea value={initial} onChange={(e) => setInitial(e.target.value)} rows={2} />
        </Field>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            创建
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
