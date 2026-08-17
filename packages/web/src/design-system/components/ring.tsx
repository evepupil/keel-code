import { cn } from "../../lib/cn";

/**
 * 进度环：上下文用量等「占比」。value 0–100。
 * 只画一圈底轨 + 一段进度，颜色随占比升高从 accent → warn → danger（>85%）。
 */
export function Ring({
  value,
  size = 18,
  stroke = 2.5,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = v > 85 ? "text-danger" : v > 70 ? "text-warn" : "text-accent";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("-rotate-90", tone, className)}
      role="img"
      aria-label={`${v}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${((v / 100) * c).toFixed(2)} ${c.toFixed(2)}`}
      />
    </svg>
  );
}
