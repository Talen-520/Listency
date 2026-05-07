import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const foregroundPath = resolve("app/desktop/src/assets/app-icon.svg");
const sourceIconPath = resolve("app/desktop/src-tauri/icons/app-icon-source.svg");
const faviconPath = resolve("app/desktop/public/favicon.svg");
const desktopPath = resolve("app/desktop");

const foreground = readFileSync(foregroundPath, "utf8");
const paths = Array.from(foreground.matchAll(/<path[\s\S]*?\/>/g), (match) =>
  match[0]
    .replaceAll('fill="#000000"', 'fill="#0A0A0A"')
    .replaceAll('opacity="1.000000"', 'opacity="1"'),
).join("\n");

const sourceIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="64" y="64" width="896" height="896" rx="220" fill="#F8FAFC"/>
  <rect x="64" y="64" width="896" height="896" rx="220" fill="none" stroke="#E5E7EB" stroke-width="18"/>
  <g transform="translate(92 92) scale(0.82)">
${paths}
  </g>
</svg>
`.replace(/[ \t]+$/gm, "");

mkdirSync(dirname(sourceIconPath), { recursive: true });
writeFileSync(sourceIconPath, sourceIcon);
mkdirSync(dirname(faviconPath), { recursive: true });
writeFileSync(faviconPath, sourceIcon);

execFileSync("pnpm", ["tauri", "icon", "src-tauri/icons/app-icon-source.svg"], {
  cwd: desktopPath,
  stdio: "inherit",
});
