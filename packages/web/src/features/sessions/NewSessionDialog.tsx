import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { ModelTier, TiersOverview } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Dialog } from "../../design-system/components/dialog";
import { Field, Input, Textarea } from "../../design-system/components/primitives";
import { cn } from "../../lib/cn";
import { appStore, useAppState } from "../../store/app-store";
import { ModelSelect, parseModelKey } from "../models/ModelSelect";
import { priceOf, TIER_LABEL, TIERS } from "../models/tiers";

export function NewSessionDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  /** 不传 = 当前工作区 */
  workspaceId?: string;
}) {
  const models = useAppState((s) => s.models);
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [tier, setTier] = useState<ModelTier | null>(null);
  const [model, setModel] = useState("");
  const [pinModel, setPinModel] = useState(false);
  const [overview, setOverview] = useState<TiersOverview | null>(null);
  const [initial, setInitial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .modelTiers()
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [open]);

  const reset = () => {
    setTitle("");
    setRole("");
    setTier(null);
    setModel("");
    setPinModel(false);
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
      const ref = pinModel ? parseModelKey(model) : undefined;
      const input = {
        kind: "conversation" as const,
        title: title.trim(),
        ...(role.trim() ? { role: role.trim() } : {}),
        ...(ref ? { model: ref } : tier ? { tier } : {}),
        ...(initial.trim() ? { initialMessage: initial.trim() } : {}),
      };
      if (workspaceId) await appStore.createSessionIn(workspaceId, input);
      else await appStore.createSession(input);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const defaultTier = overview?.kindTiers.conversation ?? "standard";
  const activeTier = tier ?? defaultTier;

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
          <div className="space-y-2">
            <div className={cn("grid grid-cols-3 gap-2", pinModel && "opacity-50")}>
              {TIERS.map((t) => {
                const view = overview?.tiers.find((v) => v.tier === t);
                const on = !pinModel && activeTier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={pinModel}
                    onClick={() => setTier(t)}
                    className={cn(
                      "cursor-pointer rounded-md border px-2 py-1.5 text-left transition-colors",
                      on
                        ? "border-accent bg-accent-soft"
                        : "border-line hover:border-line-strong hover:bg-panel-2",
                    )}
                  >
                    <div className="flex items-center gap-1 text-xs font-medium">
                      {TIER_LABEL[t]}
                      {t === defaultTier ? (
                        <span className="text-[10px] font-normal text-ink-faint">默认</span>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-[11px] text-ink-muted">
                      {view?.resolved ? view.resolved.id : overview ? "无可用" : "…"}
                    </div>
                    {view?.resolved ? (
                      <div className="text-[10px] text-ink-faint">
                        {priceOf(view.resolved)}
                        {view.fallbackTo ? ` · 回退自${TIER_LABEL[view.fallbackTo]}档` : ""}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {pinModel ? (
              <div className="flex items-center gap-2">
                <ModelSelect value={model} onChange={setModel} models={models} allowEmpty />
                <Button variant="ghost" size="sm" onClick={() => setPinModel(false)}>
                  改按档次
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="cursor-pointer text-xs text-ink-muted hover:text-ink"
                onClick={() => setPinModel(true)}
              >
                指定具体模型…
              </button>
            )}
          </div>
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
