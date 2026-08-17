/**
 * 设置 › 通用：主题。之后的通用偏好（侧栏、快捷键）也放这里。
 */
import { useState } from "react";
import { Segmented } from "../../../design-system/components/segmented";
import { readTheme, setTheme, type Theme } from "../../../lib/theme";

export function GeneralTab() {
  const [theme, setThemeState] = useState<Theme>(() => readTheme());
  const change = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };
  return (
    <div className="space-y-5">
      <h2 className="text-[15px] font-semibold">通用</h2>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-ink-muted">主题</h3>
        <Segmented<Theme>
          value={theme}
          onChange={change}
          className="max-w-xs"
          options={[
            { value: "system", label: "跟随系统" },
            { value: "light", label: "亮" },
            { value: "dark", label: "暗" },
          ]}
        />
      </section>
    </div>
  );
}
