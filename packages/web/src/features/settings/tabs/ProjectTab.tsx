/**
 * 设置 › 项目：当前工作区的 .keel/config.json（审批档位、验收节奏、闭环 / 门禁 / 守卫开关）。
 */
import { useAppState } from "../../../store/app-store";
import { ProjectConfigSection } from "../ProjectConfig";

export function ProjectTab() {
  const workspaceId = useAppState((s) => s.workspaceId);
  const project = useAppState((s) => s.project);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold">项目</h2>
        <p className="mt-0.5 text-xs text-ink-muted" title={project?.cwd}>
          {project ? `${project.name} · ${project.cwd}` : "先打开一个项目"}
        </p>
      </div>
      {workspaceId && project ? <ProjectConfigSection key={workspaceId} /> : null}
    </div>
  );
}
