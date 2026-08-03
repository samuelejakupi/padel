// Scrive public/version.json prima di ogni build.
// Il file serve al controllo lato client per accorgersi che è uscita una
// versione nuova anche quando il browser ha ancora in cache il vecchio HTML:
// GitHub Pages non permette di impostare header Cache-Control, quindi la
// verifica va fatta dall'applicazione.
import { mkdir, writeFile } from "node:fs/promises";

const version = process.env.GITHUB_SHA ?? String(Date.now());

await mkdir("public", { recursive: true });
await writeFile("public/version.json", `${JSON.stringify({ version })}\n`, "utf8");

console.log(`version.json → ${version}`);
