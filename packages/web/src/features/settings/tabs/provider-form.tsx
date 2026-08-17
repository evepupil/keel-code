/**
 * 添加 / 编辑提供方的灰底卡片。三种模式共用：
 * 添加内置（下拉选 pi 目录）/ 添加自定义（手填 ID + 协议）/ 编辑（预填，ID 锁住）。
 */
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { api } from "../../../api/client";
import type { BuiltinProviderOption, CatalogModel } from "../../../api/types";
import { Button } from "../../../design-system/components/button";
import { Badge, Field, Input, Select } from "../../../design-system/components/primitives";
import { cn } from "../../../lib/cn";
import { appStore } from "../../../store/app-store";
import { syncRemoteModels } from "./model-catalog";

export type FormMode = "add-builtin" | "add-custom" | "edit";

export interface FormValues {
  id: string;
  kind: "builtin" | "custom";
  name: string;
  baseUrl: string;
  api: string;
  apiKey: string;
  models: CatalogModel[];
}

const APIS: { id: string; label: string }[] = [
  { id: "openai-completions", label: "openai-completions" },
  { id: "openai-responses", label: "openai-responses" },
  { id: "anthropic-messages", label: "anthropic-messages" },
  { id: "google-generative-ai", label: "google-generative-ai" },
];

export function ProviderForm({
  mode,
  values,
  onChange,
  builtins,
  busy,
  onCancel,
  onSubmit,
}: {
  mode: FormMode;
  values: FormValues;
  onChange: (v: FormValues) => void;
  builtins: BuiltinProviderOption[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const [advanced, setAdvanced] = useState(mode !== "add-builtin");
  const custom = values.kind === "custom";
  const title =
    mode === "add-custom" ? "自定义提供方" : mode === "add-builtin" ? "添加提供方" : "编辑提供方";
  const submitLabel =
    mode === "edit" ? "保存" : mode === "add-custom" ? "创建提供方" : "添加提供方";
  const canSubmit =
    values.id.trim().length > 0 &&
    (mode !== "add-custom" || (values.baseUrl.trim().length > 0 && values.api.length > 0));

  const pickBuiltin = (id: string) => {
    const b = builtins.find((x) => x.id === id);
    onChange({
      ...values,
      id,
      kind: "builtin",
      name: b?.name ?? id,
      baseUrl: b?.baseUrl ?? values.baseUrl,
    });
  };

  return (
    <div className="space-y-4 rounded-lg bg-side px-4 py-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      {mode === "add-builtin" ? (
        <Field label="提供方">
          <Select value={values.id} onChange={(e) => pickBuiltin(e.target.value)}>
            <option value="">选择提供方</option>
            {builtins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : mode === "add-custom" ? (
        <>
          <Field
            label="Provider ID"
            hint="以小写字母开头，请求里唯一标识该提供方，并用于派生凭据名。"
          >
            <Input
              value={values.id}
              onChange={(e) => onChange({ ...values, id: e.target.value.trim().toLowerCase() })}
              placeholder="acme-gateway"
              autoComplete="off"
            />
          </Field>
          <Field label="显示名称">
            <Input
              value={values.name}
              onChange={(e) => onChange({ ...values, name: e.target.value })}
              placeholder="显示名称"
            />
          </Field>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{values.name || values.id}</span>
          <Badge>{custom ? "自定义" : "内置"}</Badge>
          <span className="font-mono text-xs text-ink-faint">{values.id}</span>
        </div>
      )}

      {mode === "add-custom" || (mode === "edit" && custom) ? (
        <>
          <Field label="API 地址">
            <Input
              value={values.baseUrl}
              onChange={(e) => onChange({ ...values, baseUrl: e.target.value })}
              placeholder="https://gateway.example/v1"
            />
          </Field>
          <Field label="API 协议">
            <Select
              value={values.api}
              onChange={(e) => onChange({ ...values, api: e.target.value })}
            >
              {APIS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}

      <Field label="API 密钥">
        <Input
          type="password"
          value={values.apiKey}
          onChange={(e) => onChange({ ...values, apiKey: e.target.value })}
          placeholder={mode === "edit" ? "留空则不改" : ""}
          autoComplete="off"
        />
      </Field>

      {mode === "add-builtin" || (mode === "edit" && !custom) ? (
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
          onClick={() => setAdvanced((v) => !v)}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", advanced && "rotate-180")}
          />
          自定义设置
        </button>
      ) : null}

      {advanced || custom ? (
        <CatalogEditor
          values={values}
          onChange={onChange}
          showAddress={mode === "add-builtin" || (mode === "edit" && !custom)}
        />
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel} disabled={busy}>
          取消
        </Button>
        <Button variant="primary" onClick={onSubmit} disabled={busy || !canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function CatalogEditor({
  values,
  onChange,
  showAddress,
}: {
  values: FormValues;
  onChange: (v: FormValues) => void;
  showAddress: boolean;
}) {
  const [fetching, setFetching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");

  const fetchList = async () => {
    if (!values.id && !values.baseUrl.trim()) {
      appStore.notify("error", "先选提供方或填 API 地址");
      return;
    }
    setFetching(true);
    try {
      const remote = await api.fetchRemoteModels({
        kind: values.kind,
        ...(values.id ? { providerId: values.id } : {}),
        ...(values.baseUrl.trim() ? { baseUrl: values.baseUrl.trim() } : {}),
        ...(values.api ? { api: values.api } : {}),
        ...(values.apiKey.trim() ? { apiKey: values.apiKey.trim() } : {}),
      });
      const synced = syncRemoteModels(values.models, remote.models);
      onChange({ ...values, models: synced.models });
      const changes = [
        synced.added ? `拉到 ${synced.added} 个` : "",
        synced.removed ? `清理 ${synced.removed} 个过期模型` : "",
      ].filter(Boolean);
      appStore.notify(
        "info",
        changes.length ? `${changes.join("，")}（${remote.url}）` : "没有变化",
      );
    } catch (e) {
      appStore.notify("error", e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  };

  const addOne = () => {
    const id = newId.trim();
    if (!id) return;
    if (values.models.some((m) => m.id === id)) {
      appStore.notify("error", "这个模型已经在目录里");
      return;
    }
    onChange({ ...values, models: [...values.models, { id, name: id, enabled: true }] });
    setNewId("");
    setAdding(false);
  };

  const toggle = (id: string) => {
    onChange({
      ...values,
      models: values.models.map((m) => (m.id === id ? { ...m, enabled: m.enabled === false } : m)),
    });
  };

  return (
    <div className="space-y-3">
      {showAddress ? (
        <Field label="API 地址">
          <Input
            value={values.baseUrl}
            onChange={(e) => onChange({ ...values, baseUrl: e.target.value })}
            placeholder="留空则用提供方默认地址"
          />
        </Field>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">模型目录</span>
          <span className="flex-1" />
          <button
            type="button"
            className="text-xs text-ink-faint hover:text-ink"
            onClick={() => void fetchList()}
            disabled={fetching}
          >
            {fetching ? "获取中…" : "获取模型列表"}
          </button>
        </div>
        {values.models.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-xs text-ink-faint">
            模型选择器只显示勾上的。拉下来的默认不勾，手加的默认勾上。
          </div>
        ) : (
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {values.models.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={m.enabled !== false}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="min-w-0 truncate font-mono">{m.id}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="模型 ID"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") addOne();
              }}
            />
            <Button size="sm" variant="primary" onClick={addOne} disabled={!newId.trim()}>
              加入
            </Button>
            <Button size="sm" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        ) : (
          <Button size="sm" className="mt-2" onClick={() => setAdding(true)}>
            添加模型
          </Button>
        )}
      </div>
    </div>
  );
}
