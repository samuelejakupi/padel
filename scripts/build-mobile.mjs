// L'app nativa include l'export locale, sempre alla radice della WebView.
// Non eredita il basePath usato dall'eventuale deploy GitHub Pages.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env, NEXT_PUBLIC_BASE_PATH: "" };

for (const script of ["scripts/write-version.mjs", "node_modules/next/dist/bin/next"]) {
  const args = script.endsWith("/next") ? [script, "build"] : [script];
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
