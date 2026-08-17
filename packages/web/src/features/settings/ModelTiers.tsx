/**
 * 能力档：轻量 / 标准 / 旗舰 各选一个提供方 + 模型（来自用户已添加的目录）。
 * 选中的模型记为该档首选，选档器按首选落实。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { KeelSettings, ModelInfo, ModelTier, TiersOverview } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Field, Select } from "../../design-system/components/primitives";
import { appStore, useAppState } from "../../store/app-store";
import { ModelSelect, modelKey, parseModelKey } from "../models/ModelSelect";
import { modelKeyOf as keyOf, TIER_LABEL, TIERS } from "../models/tiers";

function parsePreferred(key: string | undefined): { provider: string; id: string } | undefined {
  if (!key) return undefined;
  const i = key.indexOf("/");
  if (i <= 0) return undefined;
  return { provider: key.slice(0, i), id: key.slice(i + 1) };
}

const KIND_ROWS: { key: string; label: string }[] = [
  { key: "main", label: "主对话" },
  { key: "conversation", label: "普通对话" },
  { key: "subagent", label: "子 agent" },
  { key: "reviewer", label: "reviewer" },
  { key: "docPrune", label: "文档修剪" },
];

export function ModelTiersSection() {
  const providers = useAppState((s) => s.providers);
  const [catalog, setCatalog] = useState<ModelInfo[]>([]);
  const [settings, setSettings] = useState<KeelSettings | null>(null);
  const [overview, setOverview] = useState<TiersOverview | null>(null);
  const [showLocks, setShowLocks] = useState(false);

  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await api.modelTiers());
    } catch {
      setOverview(null);
    }
  }, []);

  useEffect(() => {
    api
      .settings()
      .then(setSettings)
      .catch(() => setSettings({}));
    api
      .models(false)
      .then(setCatalog)
      .catch(() => setCatalog([]));
    void refreshOverview();
  }, [refreshOverview]);

  const patch = async (p: Partial<KeelSettings>) => {
    try {
      setSettings(await api.patchSettings(p));
      void refreshOverview();
    } catch (e) {
      appStore.notify("error", `保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const byProvider = useMemo(() => {
    const added = new Set(providers.map((p) => p.id));
    const map = new Map<string, ModelInfo[]>();
    for (const m of catalog) {
      if (!added.has(m.provider)) continue;
      map.set(m.provider, [...(map.get(m.provider) ?? []), m]);
    }
    return map;
  }, [catalog, providers]);

  if (!settings) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold">能力档</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          每档指定一个模型。对话里只说档次，系统落到这里选的。
        </p>
      </div>

      {providers.length === 0 ? (
        <p className="text-xs text-ink-faint">先在「模型」里添加提供方。</p>
      ) : (
        <div className="space-y-3">
          {TIERS.map((tier) => (
            <TierRow
              key={tier}
              tier={tier}
              providers={providers}
              byProvider={byProvider}
              preferred={settings.preferred?.[tier]}
              onPick={(m) =>
                void patch({
                  preferred: { [tier]: keyOf(m) },
                  modelTiers: { [keyOf(m)]: tier },
                })
              }
            />
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KIND_ROWS.map((k) => (
          <Field key={k.key} label={`${k.label}默认档`}>
            <Select
              value={overview?.kindTiers[k.key] ?? settings.kindTiers?.[k.key] ?? "standard"}
              onChange={(e) => void patch({ kindTiers: { [k.key]: e.target.value as ModelTier } })}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={() => setShowLocks((v) => !v)}>
        {showLocks ? "收起锁定" : "锁定具体模型…"}
      </Button>
      {showLocks ? <ModelLocks settings={settings} models={catalog} onPatch={patch} /> : null}
    </section>
  );
}

function TierRow({
  tier,
  providers,
  byProvider,
  preferred,
  onPick,
}: {
  tier: ModelTier;
  providers: { id: string; name: string }[];
  byProvider: Map<string, ModelInfo[]>;
  preferred: string | undefined;
  onPick: (m: ModelInfo) => void;
}) {
  const parsed = parsePreferred(preferred);
  const providerId = parsed?.provider ?? providers[0]?.id ?? "";
  const models = byProvider.get(providerId) ?? [];
  const modelId = parsed?.provider === providerId ? (parsed.id ?? "") : "";

  return (
    <div className="grid items-end gap-2 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="pb-1.5 text-sm font-medium">{TIER_LABEL[tier]}</div>
      <Field label="供应商">
        <Select
          value={providerId}
          onChange={(e) => {
            const next = e.target.value;
            const first = byProvider.get(next)?.[0];
            if (first) onPick(first);
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="模型">
        <Select
          value={modelId}
          onChange={(e) => {
            const m = models.find((x) => x.id === e.target.value);
            if (m) onPick(m);
          }}
          disabled={models.length === 0}
        >
          {models.length === 0 ? <option value="">该提供方还没有模型</option> : null}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.id}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

const LOCK_KINDS: { key: string; label: string }[] = [
  { key: "main", label: "主对话" },
  { key: "conversation", label: "普通对话" },
  { key: "subagent", label: "子 agent" },
  { key: "reviewer", label: "reviewer" },
];

function ModelLocks({
  settings,
  models,
  onPatch,
}: {
  settings: KeelSettings;
  models: ModelInfo[];
  onPatch: (p: Partial<KeelSettings>) => Promise<void>;
}) {
  const locks = settings.modelLocks ?? {};
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {LOCK_KINDS.map((k) => (
        <Field key={k.key} label={k.label}>
          <ModelSelect
            value={locks[k.key] ? modelKey(locks[k.key] as { provider: string; id: string }) : ""}
            onChange={(v) =>
              void onPatch({ modelLocks: { [k.key]: parseModelKey(v) ?? null } as never })
            }
            models={models}
            allowEmpty
            emptyLabel="不锁定（按档次）"
          />
        </Field>
      ))}
    </div>
  );
}
