/**
 * 界面偏好（侧栏折叠、抽屉开关等）：只存本机 localStorage，不进服务端。
 */
const PREFIX = "keel.pref.";

export function readPref<T extends boolean | string | number>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const v = JSON.parse(raw) as unknown;
    return typeof v === typeof fallback ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: boolean | string | number): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 隐私模式等写不进去就算了
  }
}
