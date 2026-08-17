/**
 * 解析 docs/roadmap.md 的里程碑表格（全局规范约定的六列：里程碑 | 目标 | 状态 | 依赖 | 模块文档 | 退出标准）。
 * 容错：列名不完全一致时按顺序取；链接 `[文本](路径)` 保留文本与路径。
 */
export interface RoadmapLink {
  text: string;
  href: string;
}

export interface Milestone {
  id: string;
  goal: string;
  status: string;
  deps: string;
  docs: RoadmapLink[];
  exit: string;
}

export interface Roadmap {
  title: string;
  goal: string;
  milestones: Milestone[];
}

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

export function extractLinks(cell: string): RoadmapLink[] {
  const out: RoadmapLink[] = [];
  for (const m of cell.matchAll(LINK_RE)) out.push({ text: m[1] ?? "", href: m[2] ?? "" });
  return out;
}

function stripLinks(cell: string): string {
  return cell.replace(LINK_RE, "$1").trim();
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

export function parseRoadmap(markdown: string): Roadmap {
  const lines = markdown.split("\n");
  const title = (lines.find((l) => /^#\s/.test(l)) ?? "# Roadmap").replace(/^#\s+/, "").trim();
  // 目标：「## 目标」下的第一段
  let goal = "";
  const gi = lines.findIndex((l) => /^##\s+目标/.test(l));
  if (gi >= 0) {
    for (let i = gi + 1; i < lines.length; i++) {
      const l = (lines[i] ?? "").trim();
      if (/^##\s/.test(l)) break;
      if (l && !l.startsWith(">")) {
        goal = l;
        break;
      }
    }
  }
  const milestones: Milestone[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (!/^\|/.test(l)) continue;
    const header = splitRow(l);
    if (!header.some((h) => /里程碑/.test(h))) continue;
    // 下一行是分隔线，之后是数据行
    let j = i + 2;
    while (j < lines.length && /^\|/.test(lines[j] ?? "")) {
      const cells = splitRow(lines[j] ?? "");
      if (cells.length >= 3) {
        milestones.push({
          id: stripLinks(cells[0] ?? ""),
          goal: stripLinks(cells[1] ?? ""),
          status: stripLinks(cells[2] ?? ""),
          deps: stripLinks(cells[3] ?? ""),
          docs: extractLinks(cells[4] ?? ""),
          exit: stripLinks(cells[5] ?? ""),
        });
      }
      j++;
    }
    break;
  }
  return { title, goal, milestones };
}
