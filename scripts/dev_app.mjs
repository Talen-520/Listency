import { desktopDir, ensureDevEnvironment, runCommand } from "./dev_setup.mjs";

try {
  ensureDevEnvironment();
  runCommand("pnpm", ["run", "tauri:dev"], { cwd: desktopDir });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
