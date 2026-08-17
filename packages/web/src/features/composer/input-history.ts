/**
 * 输入框历史导航（像 shell）：ArrowUp 往回翻已发送的输入，ArrowDown 往回。
 * 正在浏览历史时先存草稿，退到底恢复草稿。
 */

export interface InputHistory {
  /** 已发送输入，新的在后 */
  items: string[];
  /** 当前浏览到哪条；-1 = 没在浏览 */
  index: number;
  /** 进入浏览前正在输入的草稿 */
  draft: string;
}

export const MAX_HISTORY = 100;

export function newInputHistory(items: string[] = []): InputHistory {
  return { items, index: -1, draft: "" };
}

/** 发送后追加（与最近一条相同不重复），并退出浏览态。 */
export function pushHistory(h: InputHistory, text: string): InputHistory {
  const t = text.trim();
  if (!t) return h;
  const items = h.items.at(-1) === t ? h.items : [...h.items, t].slice(-MAX_HISTORY);
  return { items, index: -1, draft: "" };
}

/**
 * 按上/下键移动。返回 null 表示不接管（正常移动光标）。
 * 只有输入为空、或已在浏览态时 ArrowUp 才接管，避免多行编辑时抢键。
 */
export function stepHistory(
  h: InputHistory,
  key: "ArrowUp" | "ArrowDown",
  currentText: string,
): { history: InputHistory; text: string } | null {
  if (key === "ArrowUp") {
    const browsing = h.index >= 0;
    if (!browsing && currentText !== "") return null;
    if (h.items.length === 0) return null;
    const nextIndex = browsing ? Math.max(0, h.index - 1) : h.items.length - 1;
    if (browsing && h.index === 0) return { history: h, text: h.items[0] ?? "" };
    return {
      history: { ...h, index: nextIndex, draft: browsing ? h.draft : currentText },
      text: h.items[nextIndex] ?? "",
    };
  }
  if (h.index < 0) return null;
  if (h.index >= h.items.length - 1) {
    return { history: { ...h, index: -1 }, text: h.draft };
  }
  const nextIndex = h.index + 1;
  return { history: { ...h, index: nextIndex }, text: h.items[nextIndex] ?? "" };
}
