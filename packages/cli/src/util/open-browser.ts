import { spawn } from "node:child_process";

/** 用系统默认浏览器打开 URL；失败不抛错（用户可手动打开）。 */
export function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      // start 是 cmd 内建命令；空标题参数防止 URL 被当成窗口标题
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // 忽略
  }
}
