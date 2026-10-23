// Genera gli asset generici in public/gaming/loadouts:
// - per ogni categoria una sagoma (SVG, un solo tracciato) e il suo PNG
//   1024x1024, usati dalle armi aggiunte dai membri che non hanno un'icona;
// - le icone SVG 512x512 degli slot degli accessori.
// Le icone delle armi vere le fa scripts/weapon-icons.py.
// Uso: node --experimental-strip-types scripts/render-weapon-icons.mts
import fs from "node:fs";
import { createRequire } from "node:module";
import { weaponArt, type WeaponCategory } from "./placeholder-weapons.ts";

const root = new URL("../public/gaming/loadouts/", import.meta.url);
const weaponsDir = new URL("weapons/", root);
const placeholders: Record<string, WeaponCategory> = {
  "placeholder-assault": "assault", "placeholder-smg": "smg", "placeholder-shotgun": "shotgun",
  "placeholder-sniper": "sniper", "placeholder-lmg": "lmg", "placeholder-marksman": "marksman", "placeholder-pistol": "pistol",
};

for (const [id, category] of Object.entries(placeholders)) {
  const d = weaponArt(category, []).parts.map(part => part.d).join("");
  fs.writeFileSync(new URL(`${id}.svg`, weaponsDir),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 6 200 64"><path fill="#d3dbe1" d="${d}"/></svg>\n`);
}

// Icone degli slot: tratto chiaro su trasparente, stesso spessore per tutte.
const slotIcons: Record<string, string> = {
  muzzle: '<rect x="10" y="26" width="34" height="12" rx="3"/><path d="M44 29h10v6H44M18 26v12M26 26v12M34 26v12"/>',
  barrel: '<path d="M6 30h44v4H6z"/><rect x="48" y="26" width="10" height="12" rx="2"/><path d="M14 28v8M22 28v8"/>',
  laser: '<rect x="12" y="24" width="24" height="16" rx="3"/><circle cx="20" cy="32" r="3"/><path d="M36 32h22" stroke-dasharray="3 3"/>',
  optic: '<rect x="12" y="20" width="30" height="20" rx="4"/><circle cx="27" cy="30" r="5"/><path d="M27 30h.01M10 46h44M18 40v6M36 40v6"/>',
  stock: '<path d="M8 26h18l26-6v24H40l-6-8H8z"/><path d="M36 26v6"/>',
  underbarrel: '<path d="M10 16h44M26 16v8M38 16v8"/><path d="M26 24h12l-2 26h-8z"/><path d="M28 32h8M28 38h8"/>',
  magazine: '<path d="M22 10h18l-2 20 6 24H26l-6-24z"/><path d="M24 20h14M25 32h15"/>',
  rearGrip: '<path d="M18 14h24l-4 8 6 28H30l-6-26z"/><path d="M30 26l2 10"/>',
  ammo: '<path d="M14 50V26l5-10 5 10v24zM28 50V26l5-10 5 10v24zM42 50V26l5-10 5 10v24z"/><path d="M14 42h10M28 42h10M42 42h10"/>',
  comb: '<path d="M8 30h22l24-8v20H8z"/><path d="M20 22h16l-2 8H20z"/>',
  bolt: '<rect x="10" y="26" width="30" height="12" rx="3"/><path d="M40 32h8v12h6"/><circle cx="54" cy="44" r="3"/>',
  guard: '<path d="M8 24h48v16H8z"/><path d="M16 24v16M26 24v16M36 24v16M46 24v16"/>',
  apex: '<path d="M32 8l22 24-22 24-22-24z"/><path d="M32 20l10 12-10 12-10-12z"/>',
};
for (const [slot, body] of Object.entries(slotIcons)) {
  fs.writeFileSync(new URL(`attachments/${slot}.svg`, root),
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none" stroke="#d3dbe1" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`);
}

// PNG: la sagoma ripassata con un contorno ciano sottile e un glow leggero,
// su fondo trasparente. L'inclinazione la mette la pagina, non il file.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
for (const file of Object.keys(placeholders).map(id => `${id}.svg`)) {
  const svg = fs.readFileSync(new URL(file, weaponsDir), "utf8")
    .replace("<path ", '<path stroke="#18dfe4" stroke-width="0.6%" vector-effect="non-scaling-stroke" stroke-linejoin="round" ');
  await page.setContent(`<html><body style="margin:0;width:1024px;height:1024px;display:grid;place-items:center;background:transparent">
    <div style="width:900px;filter:drop-shadow(0 0 10px rgba(24,223,228,.45)) drop-shadow(0 0 2px rgba(24,223,228,.6))">${svg.replace("<svg ", '<svg style="width:100%;height:auto;display:block" ')}</div></body></html>`);
  await page.screenshot({ path: new URL(file.replace(".svg", ".png"), weaponsDir).pathname, omitBackground: true });
  console.log("png", file);
}
await browser.close();
