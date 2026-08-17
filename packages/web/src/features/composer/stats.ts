import type { EngineMessage } from "../../api/types";

export interface RunStats {
  rounds: number;
  steps: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheHit: number | null;
}

export function runStatsOf(messages: EngineMessage[]): RunStats {
  let rounds = 0;
  let steps = 0;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  for (const m of messages) {
    if (m.role === "user") rounds += 1;
    if (m.role === "toolResult") steps += 1;
    if (m.role === "assistant") {
      input += m.usage.input;
      output += m.usage.output;
      cacheRead += m.usage.cacheRead;
    }
  }
  const denom = input + cacheRead;
  return {
    rounds,
    steps,
    input,
    output,
    cacheRead,
    cacheHit: denom > 0 ? Math.round((cacheRead / denom) * 100) : null,
  };
}

export function formatTok(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${(k >= 100 ? k.toFixed(0) : k.toFixed(1)).replace(/\.0$/, "")}K`;
  }
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
