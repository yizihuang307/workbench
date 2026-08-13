import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.platform;

if (platform === "darwin") {
  spawn("bash", [path.join(root, "scripts/run-mac-widget.sh")], { stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 1));
} else if (platform === "win32") {
  spawn("powershell", ["-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts/run-win-widget.ps1")], { stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 1));
} else {
  console.error("桌面便签目前仅支持 macOS 和 Windows。");
  process.exit(1);
}
