import { backendDir, ensureDevEnvironment, runCommand, venvPython } from "./dev_setup.mjs";

try {
  ensureDevEnvironment({ backend: true, desktop: false });
  runCommand(venvPython, ["-m", "unittest", "discover", "-s", "tests"], { cwd: backendDir });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
