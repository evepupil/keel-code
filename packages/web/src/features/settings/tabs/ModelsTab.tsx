/**
 * 设置 › 模型：provider 卡片（状态 + 探测结果），点「编辑」展开表单（key / 探测模型表）。
 */
import { useState } from "react";
import { api } from "../../../api/client";
import type { ProviderInfo, ProviderProbe } from "../../../api/types";
import { Button } from "../../../design-system/components/button";
import { StatusDot } from "../../../design-system/components/dot";
import { Badge, Card, Input, Spinner } from "../../../design-system/components/primitives";
import { appStore, useAppState } from "../../../store/app-store";

/** 常见 provider 放前面，其余按已配置优先、再按名称。 */
const PREFERRED = [
  "anthropic",
  "openai",
  "deepseek",
  "opencode-go",
  "openrouter",
  "google",
  "moonshotai",
  "zai",
];

export function sortProviders(list: ProviderInfo[]): ProviderInfo[] {
  return [...list].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1;
    const ia = PREFERRED.indexOf(a.id);
    const ib = PREFERRED.indexOf(b.id);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.name.localeCompare(b.name);
  });
}

export function ModelsTab() {
  const providers = useAppState((s) => s.providers);
  const [probing, setProbing] = useState(false);
  const [probes, setProbes] = useState<ProviderProbe[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const list = sortProviders(
    showAll ? providers : providers.filter((p) => p.configured || PREFERRED.includes(p.id)),
  );

  const runProbe = async () => {
    setProbing(true);
    try {
      setProbes(await api.probe());
    } catch (e) {
      appStore.notify("error", `探测失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold">模型</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          填入 API key 即可使用该端点的模型；也可以用环境变量，或在{" "}
          <code className="rounded-sm bg-panel-2 px-1 font-mono">~/.keel/models.json</code>{" "}
          里加自定义 OpenAI 兼容端点。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => void runProbe()} disabled={probing}>
          {probing ? <Spinner /> : null}
          探测已配置端点
        </Button>
        <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "只看常用" : `显示全部 ${providers.length} 个`}
        </Button>
      </div>
      <div className="space-y-2">
        {list.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            probe={probes.find((x) => x.provider === p.id)}
            expanded={editing === p.id}
            onToggle={() => setEditing((cur) => (cur === p.id ? null : p.id))}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  probe,
  expanded,
  onToggle,
}: {
  provider: ProviderInfo;
  probe: ProviderProbe | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [openModels, setOpenModels] = useState(false);

  const save = async () => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await api.setKey(provider.id, key.trim());
      setKey("");
      await appStore.refreshModels();
      appStore.notify("info", `${provider.name} 的 key 已保存`);
    } catch (e) {
      appStore.notify("error", `保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.removeKey(provider.id);
      await appStore.refreshModels();
    } catch (e) {
      appStore.notify("error", `移除失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const canRemove =
    provider.configured &&
    provider.authSource !== undefined &&
    /auth|stored|runtime/i.test(provider.authSource);

  return (
    <Card className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot state={provider.configured ? "ok" : "idle"} />
        <span className="text-sm font-medium">{provider.name}</span>
        {provider.configured ? (
          <Badge tone="ok">{provider.authSource ?? "已配置"}</Badge>
        ) : (
          <Badge>未配置</Badge>
        )}
        {probe ? (
          probe.reachable && !probe.authFailed ? (
            <Badge tone="ok">可达 {probe.latencyMs}ms</Badge>
          ) : probe.reachable && probe.authFailed ? (
            <Badge tone="warn">认证失败：{probe.error ?? "被端点拒绝"}</Badge>
          ) : (
            <Badge tone="danger">不可达{probe.error ? `：${probe.error}` : ""}</Badge>
          )
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button size="sm" onClick={onToggle}>
            {expanded ? "收起" : "编辑"}
          </Button>
          {canRemove ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => void remove()}
              disabled={busy}
            >
              移除
            </Button>
          ) : null}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-ink-faint">
        {provider.baseUrl ?? ""}　目录模型 {provider.modelCount} 个
        {probe ? `，端点列出 ${probe.models.filter((m) => m.listedByEndpoint).length} 个` : ""}
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="粘贴 API key"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => void save()}
              disabled={busy || !key.trim()}
            >
              保存
            </Button>
          </div>
          {probe && probe.models.length > 0 ? (
            <div>
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => setOpenModels((v) => !v)}
              >
                {openModels ? "收起模型表" : `模型表（${probe.models.length}）`}
              </button>
              {openModels ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-ink-faint">
                      <tr>
                        <th className="py-1 pr-2 font-normal">模型</th>
                        <th className="py-1 pr-2 font-normal">上下文</th>
                        <th className="py-1 pr-2 font-normal">推理</th>
                        <th className="py-1 pr-2 font-normal">端点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {probe.models.map((m) => (
                        <tr key={m.id} className="border-t border-line">
                          <td className="py-1 pr-2 font-mono">{m.id}</td>
                          <td className="py-1 pr-2">
                            {m.contextWindow ? `${Math.round(m.contextWindow / 1000)}K` : "?"}
                          </td>
                          <td className="py-1 pr-2">
                            {m.catalogKnown ? (m.reasoning ? "是" : "否") : "?"}
                          </td>
                          <td className="py-1 pr-2">{m.listedByEndpoint ? "有" : "无"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
