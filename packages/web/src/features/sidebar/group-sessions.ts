import type { SessionListItem } from "../../api/types";

export const VISIBLE_LIMIT = 5;

export interface SessionBucket {
  main: SessionListItem | undefined;
  pinned: SessionListItem[];
  rest: SessionListItem[];
  hidden: number;
  archived: SessionListItem[];
}

export function isPinned(s: SessionListItem): boolean {
  return s.meta.extra?.pinned === true;
}

/** 侧栏只放能聊的会话：丢掉子 agent。主对话置顶 → 钉住的 → 最近活动；归档另放。 */
export function bucketSessions(sessions: SessionListItem[], showAll: boolean): SessionBucket {
  const talk = sessions.filter((s) => s.meta.kind !== "subagent");
  const live = talk.filter((s) => !s.meta.archived);
  const archived = talk.filter((s) => s.meta.archived);
  const main = live.find((s) => s.meta.kind === "main");
  const others = live
    .filter((s) => s.meta.kind !== "main")
    .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  const pinned = others.filter(isPinned);
  const unpinned = others.filter((s) => !isPinned(s));
  const rest = showAll ? unpinned : unpinned.slice(0, VISIBLE_LIMIT);
  return {
    main,
    pinned,
    rest,
    hidden: showAll ? 0 : Math.max(0, unpinned.length - VISIBLE_LIMIT),
    archived,
  };
}
