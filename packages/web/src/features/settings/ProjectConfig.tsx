import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Field, Select } from "../../design-system/components/primitives";
import { appStore } from "../../store/app-store";

interface ProjectConfig {
  version: number;
  guards: { frontend: boolean; lintOnWrite: boolean; commitGate: boolean; projectGate: boolean };
  loop: boolean;
  acceptance: "immediate" | "milestone" | "final";
  permissions: { mode: "ask" | "edits" | "yolo"; allow: string[] };
  docPrune: boolean;
}

const DEFAULTS: ProjectConfig = {
  version: 1,
  guards: { frontend: true, lintOnWrite: true, commitGate: true, projectGate: true },
  loop: true,
  acceptance: "milestone",
  permissions: { mode: "edits", allow: [] },
  docPrune: true,
};

const CONFIG_PATH = ".keel/config.json";

/** 项目级配置（.keel/config.json）：审批档位、强制层开关、闭环、文档修剪。改动直接写回仓库文件（逃生舱留痕）。 */
export function ProjectConfigSection() {
  const [cfg, setCfg] = useState<ProjectConfig | null>(null);

  useEffect(() => {
    api
      .readDoc(CONFIG_PATH)
      .then((d) => {
        try {
          const raw = JSON.parse(d.content) as Partial<ProjectConfig>;
          setCfg({
            ...DEFAULTS,
            ...raw,
            guards: { ...DEFAULTS.guards, ...(raw.guards ?? {}) },
            permissions: { ...DEFAULTS.permissions, ...(raw.permissions ?? {}) },
          });
        } catch {
          setCfg(DEFAULTS);
        }
      })
      .catch(() => setCfg(DEFAULTS));
  }, []);

  if (!cfg) return null;

  const save = async (next: ProjectConfig) => {
    setCfg(next);
    try {
      await api.writeDoc(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`);
    } catch (e) {
      appStore.notify("error", `保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const toggle = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    hint?: string,
  ) => (
    <label className="flex items-start gap-2 text-xs">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-ink-faint">{hint}</span> : null}
      </span>
    </label>
  );

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">项目配置</h2>
      <p className="text-xs text-ink-muted">
        写在 {CONFIG_PATH}，随仓库提交；关闭任何强制项都会留在仓库里可见。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="审批"
          hint="edits：文件读写自动放行、shell 要问；ask：写入与 shell 都问；yolo：全放"
        >
          <Select
            value={cfg.permissions.mode}
            onChange={(e) =>
              void save({
                ...cfg,
                permissions: {
                  ...cfg.permissions,
                  mode: e.target.value as ProjectConfig["permissions"]["mode"],
                },
              })
            }
          >
            <option value="edits">edits（默认）</option>
            <option value="ask">ask</option>
            <option value="yolo">yolo</option>
          </Select>
        </Field>
        <Field label="验收节奏">
          <Select
            value={cfg.acceptance}
            onChange={(e) =>
              void save({ ...cfg, acceptance: e.target.value as ProjectConfig["acceptance"] })
            }
          >
            <option value="immediate">及时验收</option>
            <option value="milestone">里程碑验收</option>
            <option value="final">最终验收</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {toggle(
          "开发闭环",
          cfg.loop,
          (v) => void save({ ...cfg, loop: v }),
          "实现 → review → 修复 → 验收；关掉 = 退化成普通编程 agent",
        )}
        {toggle(
          "提交门禁",
          cfg.guards.commitGate,
          (v) => void save({ ...cfg, guards: { ...cfg.guards, commitGate: v } }),
          "无 review 通过记录不能提交",
        )}
        {toggle(
          "项目门禁",
          cfg.guards.projectGate,
          (v) => void save({ ...cfg, guards: { ...cfg.guards, projectGate: v } }),
          "提交前跑 typecheck / lint / test",
        )}
        {toggle(
          "前端守卫",
          cfg.guards.frontend,
          (v) => void save({ ...cfg, guards: { ...cfg.guards, frontend: v } }),
          "没有设计系统不许写业务页",
        )}
        {toggle(
          "写后格式化",
          cfg.guards.lintOnWrite,
          (v) => void save({ ...cfg, guards: { ...cfg.guards, lintOnWrite: v } }),
        )}
        {toggle(
          "提交后文档修剪",
          cfg.docPrune,
          (v) => void save({ ...cfg, docPrune: v }),
          "每次提交后派子 agent 兜底同步文档",
        )}
      </div>
    </section>
  );
}
