/** 具体模型下拉（按 provider 分组）与 provider::id 取值格式。 */
import { useMemo } from "react";
import type { ModelInfo } from "../../api/types";
import { Select } from "../../design-system/components/primitives";

/** 模型下拉的取值格式：provider::id */
export function modelKey(m: { provider: string; id: string }): string {
  return `${m.provider}::${m.id}`;
}
export function parseModelKey(key: string): { provider: string; id: string } | undefined {
  const i = key.indexOf("::");
  if (i <= 0) return undefined;
  return { provider: key.slice(0, i), id: key.slice(i + 2) };
}

export function ModelSelect({
  value,
  onChange,
  models,
  allowEmpty,
  emptyLabel = "默认（第一个可用模型）",
}: {
  value: string;
  onChange: (v: string) => void;
  models: ModelInfo[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return [...map.entries()];
  }, [models]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {grouped.map(([provider, list]) => (
        <optgroup key={provider} label={provider}>
          {list.map((m) => (
            <option key={modelKey(m)} value={modelKey(m)}>
              {m.name}
              {m.cost.input || m.cost.output ? `　$${m.cost.input}/${m.cost.output} 每百万` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
