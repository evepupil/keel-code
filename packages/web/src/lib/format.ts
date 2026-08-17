/** token 数量：800 → 800，1 100 → 1.1K，19 800 000 → 19.8M */
export function formatTokens(n: number): string {
  const v = Math.max(0, Number(n) || 0);
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) {
    const k = v / 1000;
    const s = k >= 100 ? k.toFixed(0) : k.toFixed(1);
    return `${s.replace(/\.0$/, "")}K`;
  }
  const m = v / 1_000_000;
  const s = m >= 10 ? m.toFixed(1) : m.toFixed(1);
  return `${s.replace(/\.0$/, "")}M`;
}

/** 相对时间：刚刚 / N分钟 / N小时 / N天 / N个月 */
export function formatRelative(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, (now - t) / 1000);
  if (sec < 60) return "刚刚";
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}小时`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}天`;
  return `${Math.floor(sec / (86400 * 30))}个月`;
}
