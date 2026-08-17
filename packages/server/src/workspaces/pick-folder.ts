/**
 * 原生「选择文件夹」对话框：服务跑在本机，直接弹系统对话框比让用户手敲路径省事。
 * Windows：PowerShell + WinForms；macOS：osascript；Linux：zenity / kdialog（没有就返回 unsupported）。
 */
import { execFile } from "node:child_process";

export type PickResult =
  | { status: "picked"; path: string }
  | { status: "cancelled" }
  | { status: "unsupported"; reason: string };

interface RunResult {
  out: string;
  code: number;
  /** 命令不存在 */
  missing: boolean;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        const e = err as (NodeJS.ErrnoException & { code?: unknown }) | null;
        const missing = e?.code === "ENOENT";
        const code = !e ? 0 : typeof e.code === "number" ? e.code : 1;
        resolve({ out: String(stdout ?? "").trim(), code, missing });
      },
    );
  });
}

export async function pickFolder(
  options: { title?: string; timeoutMs?: number } = {},
): Promise<PickResult> {
  const title = options.title ?? "选择项目目录";
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
      `$d.Description = '${title.replace(/'/g, "''")}'`,
      "$d.ShowNewFolderButton = $true",
      "$top = New-Object System.Windows.Forms.Form",
      "$top.TopMost = $true",
      "if ($d.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }",
    ].join("; ");
    const { out } = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
      timeoutMs,
    );
    return out ? { status: "picked", path: out } : { status: "cancelled" };
  }
  if (process.platform === "darwin") {
    const { out, code } = await run(
      "osascript",
      ["-e", `POSIX path of (choose folder with prompt "${title.replace(/"/g, '\\"')}")`],
      timeoutMs,
    );
    if (code !== 0 || !out) return { status: "cancelled" };
    return { status: "picked", path: out.replace(/\/$/, "") };
  }
  for (const [cmd, args] of [
    ["zenity", ["--file-selection", "--directory", `--title=${title}`]],
    ["kdialog", ["--getexistingdirectory", "."]],
  ] as const) {
    const { out, code, missing } = await run(cmd, [...args], timeoutMs);
    if (missing) continue;
    if (code === 0 && out) return { status: "picked", path: out };
    return { status: "cancelled" };
  }
  return { status: "unsupported", reason: "没有可用的系统文件夹对话框（需要 zenity 或 kdialog）" };
}
