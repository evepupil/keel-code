import { ArrowLeft, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { BoardData } from "../../api/types";
import { Button } from "../../design-system/components/button";
import { Badge, Card, EmptyState, Spinner } from "../../design-system/components/primitives";
import { formatTokens } from "../../lib/format";
import { appStore, useAppState } from "../../store/app-store";

const STATUS_TONE: Record<string, "ok" | "accent" | "warn" | "danger" | "neutral"> = {
  已完成: "ok",
  进行中: "accent",
  阻塞: "danger",
  未开始: "neutral",
};

/** 看板：roadmap 投影 + review credit + 待决策 + 名册。数据留仓库，这里只渲染。 */
export function BoardView() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessions = useAppState((s) => s.sessions);
  const usageOf = (id: string) =>
    sessions.find((s) => s.meta.id === id)?.usage ?? { input: 0, output: 0, cacheRead: 0 };

  const load = useCallback(async () => {
    try {
      setData(await api.board());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <EmptyState title={`看板加载失败：${error}`} />;
  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const resolve = async (line: number) => {
    try {
      await api.resolveDecision(line);
      await load();
    } catch (e) {
      appStore.notify("error", `操作失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const cur = appStore.getState().currentId;
              if (cur) appStore.selectSession(cur);
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </Button>
          <h1 className="text-base font-semibold">看板</h1>
          <span className="text-xs text-ink-faint">{data.roadmap?.title}</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RotateCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
        {data.roadmap?.goal ? (
          <p className="-mt-3 text-xs text-ink-muted">{data.roadmap.goal}</p>
        ) : null}
        {data.roadmap && data.roadmap.milestones.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-faint">
                <tr>
                  <th className="px-3 py-2 font-normal">里程碑</th>
                  <th className="px-3 py-2 font-normal">目标</th>
                  <th className="px-3 py-2 font-normal">状态</th>
                  <th className="px-3 py-2 font-normal">依赖</th>
                  <th className="px-3 py-2 font-normal">模块文档</th>
                  <th className="px-3 py-2 font-normal">退出标准</th>
                </tr>
              </thead>
              <tbody>
                {data.roadmap.milestones.map((m) => (
                  <tr key={m.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-medium">{m.id}</td>
                    <td className="px-3 py-2">{m.goal}</td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{m.status || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2">{m.deps}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {m.docs.map((d) => (
                          <button
                            key={d.href}
                            type="button"
                            className="text-accent hover:underline"
                            onClick={() => appStore.openDoc(resolveDocHref(d.href), null)}
                          >
                            {d.text}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{m.exit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">项目里还没有 docs/roadmap.md，或表格为空。</p>
        )}

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
          <Card className="p-3.5">
            <h2 className="mb-2 text-sm font-semibold">review</h2>
            {data.review.lastPass ? (
              <dl className="space-y-1 text-xs">
                <div>
                  <dt className="text-ink-faint">最近通过</dt>
                  <dd>{data.review.lastPass.at.replace("T", " ").slice(0, 19)}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">批次</dt>
                  <dd>{data.review.lastPass.batch}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">工作树指纹</dt>
                  <dd className="font-mono">{data.review.lastPass.tree}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-ink-faint">还没有 review 通过记录。</p>
            )}
            {data.review.roundsSincePass > 0 ? (
              <p className="mt-2 text-xs text-warn">
                当前批次已失败 {data.review.roundsSincePass} 轮
              </p>
            ) : null}
          </Card>

          <Card className="p-3.5">
            <h2 className="mb-2 text-sm font-semibold">
              待决策{" "}
              {data.decisions.length > 0 ? (
                <Badge tone="warn">{data.decisions.length}</Badge>
              ) : null}
            </h2>
            {data.decisions.length === 0 ? (
              <p className="text-xs text-ink-faint">没有等你拍板的问题。</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {data.decisions.map((d) => (
                  <li key={d.line} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div>{d.text}</div>
                      <div className="text-ink-faint">{d.section}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => void resolve(d.line)}>
                      已解决
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="px-3.5 pt-3 pb-2 text-sm font-semibold">名册</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-ink-faint">
                  <tr>
                    <th className="px-3.5 py-1.5 font-normal">对话</th>
                    <th className="px-2 py-1.5 font-normal">新鲜度</th>
                    <th className="px-2 py-1.5 font-normal">状态</th>
                    <th className="px-3.5 py-1.5 font-normal text-right">token</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roster.map((e) => {
                    const u = usageOf(e.id);
                    return (
                      <tr key={e.id} className="border-t border-line align-top">
                        <td className="px-3.5 py-1.5">
                          <button
                            type="button"
                            className="text-accent hover:underline"
                            onClick={() => appStore.selectSession(e.id)}
                          >
                            {e.title}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-ink-muted">{e.freshness.level}</td>
                        <td className="px-2 py-1.5">{e.status}</td>
                        <td className="px-3.5 py-1.5 text-right font-mono">
                          {formatTokens(u.cacheRead + u.input + u.output)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** roadmap 里的链接是相对 docs/ 的（如 模块设计/引擎.md），转成项目相对路径。 */
export function resolveDocHref(href: string): string {
  const clean = href.split("#")[0] ?? href;
  if (clean.startsWith("docs/")) return clean;
  return `docs/${clean}`;
}
