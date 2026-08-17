/**
 * 冻结标记：设计确认后在文档头部写一行「设计已确认 · 冻结版本 <commit> · <时间>」。
 * 幂等：已有标记则替换。放在第一个一级标题之后（没有标题就放文首）。
 */
export const FREEZE_RE = /^> 设计已确认 · 冻结版本 .*$/m;

export interface FreezeInfo {
  commit: string;
  at: string;
  note?: string;
}

export function renderFreezeLine(info: FreezeInfo): string {
  const time = info.at.replace("T", " ").slice(0, 16);
  return `> 设计已确认 · 冻结版本 ${info.commit} · ${time}${info.note ? ` · ${info.note}` : ""}`;
}

export function applyFreeze(markdown: string, info: FreezeInfo): string {
  const line = renderFreezeLine(info);
  if (FREEZE_RE.test(markdown)) return markdown.replace(FREEZE_RE, line);
  const lines = markdown.split("\n");
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  if (h1 === -1) return `${line}\n\n${markdown}`;
  lines.splice(h1 + 1, 0, "", line);
  return lines.join("\n");
}

export function readFreeze(markdown: string): FreezeInfo | undefined {
  const m = FREEZE_RE.exec(markdown);
  if (!m) return undefined;
  const parts = m[0].replace(/^> 设计已确认 · 冻结版本 /, "").split(" · ");
  const info: FreezeInfo = { commit: parts[0] ?? "", at: parts[1] ?? "" };
  if (parts[2]) info.note = parts[2];
  return info;
}
