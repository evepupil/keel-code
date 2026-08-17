import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ReviewPass {
  tree: string;
  at: string;
  batch: string;
  sessionId: string;
}

export interface ReviewState {
  /** 自上次通过以来的失败轮次 */
  roundsSincePass: number;
  lastPass: ReviewPass | null;
}

const EMPTY: ReviewState = { roundsSincePass: 0, lastPass: null };

/** review 状态放在 keel 用户目录的项目会话目录下（不进仓库，避免工作副本漂移）。 */
export function reviewStatePath(projectSessionsDir: string): string {
  return join(projectSessionsDir, "review-state.json");
}

export function readReviewState(file: string): ReviewState {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<ReviewState>;
    return {
      roundsSincePass: Number(raw.roundsSincePass ?? 0),
      lastPass: raw.lastPass ?? null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeReviewState(file: string, state: ReviewState): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, file);
}
