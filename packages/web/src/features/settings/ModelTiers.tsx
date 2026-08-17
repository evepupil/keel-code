/**
 * 模型档次：每个可用模型归到 轻量 / 标准 / 旗舰 一档，可停用、可设首选；
 * 下面实时显示三档各会落到哪个模型，以及各类对话的默认档；锁定具体模型收在最后。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { KeelSettings, ModelInfo, ModelTier, TiersOverview } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Badge, Field, Select } from "../../design-system/components/primitives";
import { cn } from "../../lib/cn";
import { appStore, useAppState } from "../../store/app-store";
import { ModelSelect, modelKey, parseModelKey } from "../models/ModelSelect";
import { modelKeyOf as keyOf, priceOf, TIER_LABEL, TIERS } from "../models/tiers";

const KIND_ROWS: { key: string; label: string }[] = [
  { key: "main", label: "主对话" },
  { key: "conversation", label: "普通对话" },
  { key: "subagent", label: "子 agent" },
  { key: "reviewer", label: "reviewer" },
  { key: "docPrune", label: "文档修剪" },
];

export function ModelTiersSection() {
  const models = useAppState((s) => s.models);
  const providers = useAppState((s) => s.providers);
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

  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) map.set(m.provider, [...(map.get(m.provider) ?? []), m]);
    return [...map.entries()];
  }, [models]);

  if (!settings) return null;
  const tiers = settings.modelTiers ?? {};
  const disabled = new Set(settings.modelDisabled ?? []);
  const preferred = settings.preferred ?? {};

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">模型档次</h2>
      {overview ? <TierSummary overview={overview} /> : null}

      {grouped.length === 0 ? (
        <p className="text-xs text-ink-faint">先在上面配置 provider。</p>
      ) : (
        grouped.map(([provider, list]) => {
          const probe = overview?.probes[provider];
          return (
            <div key={provider} className="rounded-lg border border-line">
              <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
                <span className="font-medium">
                  {providers.find((p) => p.id === provider)?.name ?? provider}
                </span>
                <span className="font-mono text-ink-faint">{provider}</span>
                {probe ? (
                  probe.reachable ? (
                    <Badge tone="ok">可达{probe.latencyMs ? ` ${probe.latencyMs}ms` : ""}</Badge>
                  ) : (
                    <Badge tone="danger">不可达</Badge>
                  )
                ) : null}
              </div>
              <table className="w-full text-left text-xs">
                <tbody>
                  {list.map((m) => {
                    const key = keyOf(m);
                    const tier = tiers[key] ?? "standard";
                    const off = disabled.has(key);
                    const star = preferred[tier] === key;
                    return (
                      <tr
                        key={key}
                        className={cn("border-t border-line first:border-t-0", off && "opacity-50")}
                      >
                        <td className="py-1.5 pl-3 pr-2">
                          <div className="font-mono">{m.id}</div>
                          <div className="text-[11px] text-ink-faint">
                            {Math.round(m.contextWindow / 1000)}k · {priceOf(m)}
                            {m.reasoning ? " · 推理" : ""}
                          </div>
                        </td>
                        <td className="py-1.5 pr-2">
                          <TierSegments
                            value={tier}
                            disabled={off}
                            onChange={(t) => void patch({ modelTiers: { [key]: t } })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <button
                            type="button"
                            title={star ? "取消首选" : `设为${TIER_LABEL[tier]}档首选`}
                            disabled={off}
                            onClick={() =>
                              void patch({ preferred: { [tier]: star ? null : key } as never })
                            }
                            className={cn(
                              "cursor-pointer rounded-sm px-1 text-base leading-none transition-colors",
                              star ? "text-accent" : "text-ink-faint hover:text-ink",
                            )}
                          >
                            {star ? "★" : "☆"}
                          </button>
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          <label className="inline-flex cursor-pointer items-center gap-1 text-ink-muted">
                            <input
                              type="checkbox"
                              checked={!off}
                              onChange={(e) => {
                                const next = new Set(disabled);
                                if (e.target.checked) next.delete(key);
                                else next.add(key);
                                void patch({ modelDisabled: [...next] });
                              }}
                            />
                            启用
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
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
      {showLocks ? <ModelLocks settings={settings} models={models} onPatch={patch} /> : null}
    </section>
  );
}

function TierSegments({
  value,
  disabled,
  onChange,
}: {
  value: ModelTier;
  disabled?: boolean;
  onChange: (t: ModelTier) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line">
      {TIERS.map((t) => (
        <button
          key={t}
          type="button"
          disabled={disabled}
          onClick={() => onChange(t)}
          className={cn(
            "cursor-pointer px-2 py-0.5 text-[11px] transition-colors",
            t === value ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-panel-2",
          )}
        >
          {TIER_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

/** 三档各会落到哪个模型 */
function TierSummary({ overview }: { overview: TiersOverview }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {overview.tiers.map((v) => (
        <div key={v.tier} className="rounded-md border border-line bg-panel-2 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium">{v.label}</span>
            <span className="text-ink-faint">候选 {v.candidates.length}</span>
          </div>
          {v.resolved ? (
            <div className="mt-0.5 truncate font-mono" title={keyOf(v.resolved)}>
              {keyOf(v.resolved)}
            </div>
          ) : (
            <div className="mt-0.5 text-danger">无可用模型</div>
          )}
          {v.resolved ? (
            <div className="text-[11px] text-ink-faint">
              {priceOf(v.resolved)} · {Math.round(v.resolved.contextWindow / 1000)}k
            </div>
          ) : null}
          {v.fallbackTo ? (
            <div className="text-[11px] text-warn">
              本档无可用，回退到{TIER_LABEL[v.fallbackTo]}档
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const LOCK_KINDS: { key: string; label: string }[] = [
  { key: "main", label: "主对话" },
  { key: "conversation", label: "普通对话" },
  { key: "subagent", label: "子 agent" },
  { key: "reviewer", label: "reviewer" },
];

/** 锁定具体模型：优先级高于档次。留空 = 按档次落实。 */
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
