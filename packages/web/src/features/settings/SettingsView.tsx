import { useState } from "react";
import { api } from "../../api/client";
import type { ProviderInfo, ProviderProbe } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Badge, Card, Input, Spinner } from "../../design-system/components/primitives";
import { appStore, useAppState } from "../../store/app-store";

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

export function SettingsView() {
  const providers = useAppState((s) => s.providers);
  const models = useAppState((s) => s.models);
  const project = useAppState((s) => s.project);
  const [probing, setProbing] = useState(false);
  const [probes, setProbes] = useState<ProviderProbe[]>([]);
  const [showAll, setShowAll] = useState(false);

  const configured = providers.filter((p) => p.configured);
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
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <section className="space-y-2">
          <h1 className="text-base font-semibold">模型端点</h1>
          <p className="text-xs text-ink-muted">
            填入 API key 后即可用。也可以用环境变量（ANTHROPIC_API_KEY / OPENAI_API_KEY /
            DEEPSEEK_API_KEY…），或在
            <code className="mx-1 rounded-sm bg-panel-2 px-1 font-mono">~/.keel/models.json</code>
            里加自定义 OpenAI 兼容端点。当前可用模型 {models.length} 个，已配置 provider{" "}
            {configured.length} 个。
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={() => void runProbe()} disabled={probing}>
              {probing ? <Spinner /> : null}
              探测已配置端点
            </Button>
            <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "只看常用" : `显示全部 ${providers.length} 个`}
            </Button>
          </div>
        </section>

        <div className="space-y-2">
          {list.map((p) => (
            <ProviderRow key={p.id} provider={p} probe={probes.find((x) => x.provider === p.id)} />
          ))}
        </div>

        <section className="space-y-1 text-xs text-ink-faint">
          <div>项目：{project?.cwd}</div>
        </section>
      </div>
    </div>
  );
}

function ProviderRow({
  provider,
  probe,
}: {
  provider: ProviderInfo;
  probe: ProviderProbe | undefined;
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

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{provider.name}</span>
            <span className="font-mono text-[11px] text-ink-faint">{provider.id}</span>
            {provider.configured ? (
              <Badge tone="ok">已配置{provider.authSource ? `：${provider.authSource}` : ""}</Badge>
            ) : (
              <Badge>未配置</Badge>
            )}
            {probe ? (
              probe.reachable ? (
                <Badge tone="ok">可达 {probe.latencyMs}ms</Badge>
              ) : (
                <Badge tone="danger">不可达{probe.error ? `：${probe.error}` : ""}</Badge>
              )
            ) : null}
          </div>
          <div className="truncate text-[11px] text-ink-faint">
            {provider.baseUrl ?? ""}　目录模型 {provider.modelCount} 个
            {probe ? `，端点列出 ${probe.models.filter((m) => m.listedByEndpoint).length} 个` : ""}
          </div>
        </div>
        <Input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="粘贴 API key"
          className="w-56"
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
        {provider.configured &&
        provider.authSource !== undefined &&
        /auth|stored|runtime/i.test(provider.authSource) ? (
          <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
            移除
          </Button>
        ) : null}
        {probe && probe.models.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setOpenModels((v) => !v)}>
            {openModels ? "收起模型" : "看模型"}
          </Button>
        ) : null}
      </div>
      {openModels && probe ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-faint">
              <tr>
                <th className="py-1 pr-2 font-normal">模型</th>
                <th className="py-1 pr-2 font-normal">上下文</th>
                <th className="py-1 pr-2 font-normal">输入 / 输出（$ 每百万）</th>
                <th className="py-1 pr-2 font-normal">端点</th>
              </tr>
            </thead>
            <tbody>
              {probe.models.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-1 pr-2 font-mono">{m.id}</td>
                  <td className="py-1 pr-2">
                    {m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k` : "?"}
                  </td>
                  <td className="py-1 pr-2">
                    {m.catalogKnown ? `${m.cost.input} / ${m.cost.output}` : "未知"}
                  </td>
                  <td className="py-1 pr-2">{m.listedByEndpoint ? "有" : "无"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
