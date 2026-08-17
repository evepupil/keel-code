/**
 * 设置 › 模型：只列用户加过的提供方。底部两个按钮切成灰底卡片：
 * 添加内置 / 添加自定义 / 编辑，共用同一张表单。
 */
import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { BuiltinProviderOption, ProviderInfo } from "../../../api/types";
import { Button } from "../../../design-system/components/button";
import { StatusDot } from "../../../design-system/components/dot";
import { Badge, Card, EmptyState } from "../../../design-system/components/primitives";
import { appStore, useAppState } from "../../../store/app-store";
import { type FormMode, type FormValues, ProviderForm } from "./provider-form";

export function ModelsTab() {
  const providers = useAppState((s) => s.providers);
  const [mode, setMode] = useState<FormMode | null>(null);
  const [draft, setDraft] = useState<FormValues | null>(null);
  const [builtins, setBuiltins] = useState<BuiltinProviderOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .unusedBuiltins()
      .then(setBuiltins)
      .catch(() => setBuiltins([]));
  }, []);

  const startAdd = (kind: "builtin" | "custom") => {
    setMode(kind === "builtin" ? "add-builtin" : "add-custom");
    setDraft({
      id: "",
      kind,
      name: "",
      baseUrl: "",
      api: "openai-completions",
      apiKey: "",
      models: [],
    });
  };

  const startEdit = async (p: ProviderInfo) => {
    setMode("edit");
    setDraft({
      id: p.id,
      kind: p.kind,
      name: p.name,
      baseUrl: p.baseUrl ?? "",
      api: p.api ?? "openai-completions",
      apiKey: "",
      models: [],
    });
    try {
      const cat = await api.catalog(p.id);
      setDraft((cur) =>
        cur
          ? {
              ...cur,
              name: cat.name ?? p.name,
              baseUrl: cat.baseUrl ?? p.baseUrl ?? "",
              api: cat.api ?? p.api ?? "openai-completions",
              models: cat.models ?? [],
            }
          : cur,
      );
    } catch {
      // 目录读不到就用列表上的信息
    }
  };

  const cancel = () => {
    setMode(null);
    setDraft(null);
  };

  const submit = async (values: FormValues) => {
    if (!mode) return;
    const resolvedKind = values.kind;
    setBusy(true);
    try {
      await api.upsertProvider(values.id, {
        kind: resolvedKind,
        ...(values.name.trim() ? { name: values.name.trim() } : {}),
        ...(values.baseUrl.trim() ? { baseUrl: values.baseUrl.trim() } : {}),
        ...(values.api ? { api: values.api } : {}),
        ...(values.apiKey.trim() ? { apiKey: values.apiKey.trim() } : {}),
        ...(resolvedKind === "custom" || values.models.length > 0 ? { models: values.models } : {}),
      });
      await appStore.refreshModels();
      setBuiltins(await api.unusedBuiltins().catch(() => []));
      appStore.notify("info", mode === "edit" ? "已保存" : "已添加");
      cancel();
    } catch (e) {
      appStore.notify("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: ProviderInfo) => {
    setBusy(true);
    try {
      await api.removeProvider(p.id);
      await appStore.refreshModels();
      setBuiltins(await api.unusedBuiltins().catch(() => []));
      if (draft?.id === p.id) cancel();
    } catch (e) {
      appStore.notify("error", `删除失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold">模型</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          添加要用的提供方。密钥保存在本机，不进 models.json。
        </p>
      </div>

      {providers.length === 0 && !mode ? (
        <EmptyState title="还没有提供方" />
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <Card key={p.id} className="flex items-center gap-2 px-3.5 py-2.5">
              <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
              <Badge>{p.kind === "custom" ? "自定义" : "内置"}</Badge>
              <StatusDot state={p.configured ? "ok" : "idle"} />
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <Button size="sm" onClick={() => void startEdit(p)} disabled={busy}>
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => void remove(p)}
                  disabled={busy}
                >
                  删除
                </Button>
              </span>
            </Card>
          ))}
        </div>
      )}

      {mode && draft ? (
        <ProviderForm
          mode={mode}
          values={draft}
          onChange={setDraft}
          builtins={builtins}
          busy={busy}
          onCancel={cancel}
          onSubmit={() => void submit(draft)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => startAdd("builtin")} disabled={builtins.length === 0}>
            添加提供方
          </Button>
          <Button onClick={() => startAdd("custom")}>添加自定义提供方</Button>
        </div>
      )}
    </div>
  );
}
