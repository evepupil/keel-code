/**
 * 主题：system（跟随系统）/ light / dark。存 localStorage，写到 <html data-theme>。
 * tokens.css 里：没有 data-theme 时按系统偏好；有则以它为准。
 */
export type Theme = "system" | "light" | "dark";

const KEY = "keel.theme";

export function readTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme): void {
  if (theme === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, theme);
  applyTheme(theme);
}
