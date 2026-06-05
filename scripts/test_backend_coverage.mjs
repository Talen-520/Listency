import { backendDir, ensureDevEnvironment, runCommand, venvPython } from "./dev_setup.mjs";

try {
  ensureDevEnvironment({ backend: true, desktop: false });
  runCommand(venvPython, ["-m", "pip", "install", "-r", "requirements-dev.txt"], {
    cwd: backendDir,
    env: { PIP_DISABLE_PIP_VERSION_CHECK: "1" },
  });
  runCommand(venvPython, ["-m", "coverage", "run", "-m", "unittest", "discover", "-s", "tests"], {
    cwd: backendDir,
  });
  runCommand(venvPython, ["-m", "coverage", "report"], { cwd: backendDir });
  runCommand(venvPython, ["-m", "coverage", "xml"], { cwd: backendDir });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
