/**
 * 批注块规范（文件为准，不建数据库）：
 *
 * > [!批注] 2026-08-17 12:00
 * > 这里改成分批加载
 *
 * 用户在 Web 编辑器里划选一段后写批注，编辑器把块插到该段之后；AI 读文档 diff 时把每个块连同它前面的段落一起提取。
 */

export const ANNOTATION_TAG = "[!批注]";

export interface AnnotationBlock {
  /** 批注块起始行（0 基） */
  line: number;
  /** 批注时间戳（可为空） */
  stamp: string;
  /** 批注正文（多行合并） */
  text: string;
  /** 批注块前面最近的一段正文（给 AI 定位用） */
  anchor: string;
}

const HEAD_RE = /^>\s*\[!批注\]\s*(.*)$/;

/** 生成一个批注块（末尾带换行）。 */
export function renderAnnotation(text: string, at = new Date()): string {
  const stamp = at.toISOString().replace("T", " ").slice(0, 16);
  const body = text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `> ${ANNOTATION_TAG} ${stamp}\n${body}\n`;
}

/** 从 markdown 中提取全部批注块。 */
export function parseAnnotations(markdown: string): AnnotationBlock[] {
  const lines = markdown.split("\n");
  const out: AnnotationBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEAD_RE.exec(lines[i] ?? "");
    if (!m) continue;
    const bodyLines: string[] = [];
    let j = i + 1;
    while (j < lines.length && /^>\s?/.test(lines[j] ?? "") && !HEAD_RE.test(lines[j] ?? "")) {
      bodyLines.push((lines[j] ?? "").replace(/^>\s?/, ""));
      j++;
    }
    out.push({
      line: i,
      stamp: (m[1] ?? "").trim(),
      text: bodyLines.join("\n").trim(),
      anchor: findAnchor(lines, i),
    });
    i = j - 1;
  }
  return out;
}

/** 往上找最近的非空、非批注行作为锚点（最多取 200 字）。 */
function findAnchor(lines: string[], from: number): string {
  for (let k = from - 1; k >= 0; k--) {
    const l = (lines[k] ?? "").trim();
    if (!l || l.startsWith(">")) continue;
    return l.length > 200 ? `${l.slice(0, 200)}…` : l;
  }
  return "（文档开头）";
}

/** 在指定行之后插入批注块（行号 0 基；-1 = 文末）。返回新文本。 */
export function insertAnnotationAfterLine(
  markdown: string,
  line: number,
  text: string,
  at = new Date(),
): string {
  const lines = markdown.split("\n");
  const block = renderAnnotation(text, at).replace(/\n$/, "");
  if (line < 0 || line >= lines.length) {
    return `${markdown.replace(/\n?$/, "\n")}\n${block}\n`;
  }
  lines.splice(line + 1, 0, "", block);
  return lines.join("\n");
}

/** 删除全部批注块（冻结时清理），返回新文本与删除数。 */
export function stripAnnotations(markdown: string): { text: string; removed: number } {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let removed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (HEAD_RE.test(lines[i] ?? "")) {
      removed++;
      let j = i + 1;
      while (j < lines.length && /^>\s?/.test(lines[j] ?? "") && !HEAD_RE.test(lines[j] ?? "")) j++;
      // 吃掉批注块前面为它加的空行
      if (out.length > 0 && out[out.length - 1] === "" && (lines[j] ?? "") === "") out.pop();
      i = j - 1;
      continue;
    }
    out.push(lines[i] ?? "");
  }
  return { text: out.join("\n"), removed };
}
