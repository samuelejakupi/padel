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

// Icone degli slot: disegno a due toni su griglia 64, tratto chiaro e
// riempimento appena accennato, tutte con lo stesso spessore e la stessa
// luce. Il pezzo e sempre visto di lato, come l'arma.
const fill = 'fill="#d3dbe1" fill-opacity=".14"';
const slotIcons: Record<string, string> = {
  // Silenziatore: corpo cilindrico, anelli e innesto filettato.
  muzzle: `<rect x="14" y="24" width="34" height="16" rx="4" ${fill}/><path d="M22 24v16M30 24v16M38 24v16"/><path d="M48 28h6v8h-6M8 30h6v4H8z"/>`,
  // Canna: tubo lungo con blocco del gas e volata.
  barrel: `<path d="M6 30h46v4H6z" ${fill}/><rect x="30" y="26" width="8" height="12" rx="1.5" ${fill}/><path d="M52 27h6v10h-6z"/><path d="M14 34v3M20 34v3"/>`,
  // Laser: scatola con lente, attacco a slitta e raggio.
  laser: `<rect x="10" y="22" width="26" height="16" rx="3" ${fill}/><circle cx="31" cy="30" r="3"/><path d="M14 38v4h18v-4M16 26h8"/><path d="M38 30h20" stroke-dasharray="2 3"/>`,
  // Ottica red dot: cappuccio, vetro e punto, sopra la slitta.
  optic: `<path d="M14 40V26a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v14z" ${fill}/><path d="M22 26v10M38 26v10"/><circle cx="30" cy="31" r="1.6" fill="#d3dbe1"/><path d="M10 40h44v5H10z"/>`,
  // Calcio telescopico: tubo, corpo e calciolo.
  stock: `<path d="M6 28h16v6H6z"/><path d="M22 24h20l14-4v26l-8 2H40l-6-6H22z" ${fill}/><path d="M48 22v26M30 30h8"/>`,
  // Impugnatura verticale agganciata alla slitta.
  underbarrel: `<path d="M8 14h48v6H8z"/><path d="M24 20h16l-2 30a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z" ${fill}/><path d="M27 30h10M27 36h10M27 42h10"/>`,
  // Caricatore curvo con fondello.
  magazine: `<path d="M22 8h18l-1 18q1 14 7 26H26q-6-12-5-26z" ${fill}/><path d="M24 50h24v6H24zM25 18h14M25 30h15"/>`,
  // Impugnatura a pistola inclinata, con zigrinatura.
  rearGrip: `<path d="M16 12h26l-3 8 7 30a3 3 0 0 1-3 4H32a3 3 0 0 1-3-2l-7-28z" ${fill}/><path d="M33 26l3 14M38 25l3 14"/>`,
  // Tre cartucce: bossolo e ogiva.
  ammo: `<g ${fill}><path d="M12 54V28l5-12 5 12v26zM27 54V28l5-12 5 12v26zM42 54V28l5-12 5 12v26z"/></g><path d="M12 28h10M27 28h10M42 28h10M12 48h10M27 48h10M42 48h10"/>`,
  // Poggiaguancia: il rialzo sopra il calcio.
  comb: `<path d="M6 32h22l26-6v20H6z" ${fill}/><path d="M22 22h20v8H22zM26 30v2M38 30v-2"/>`,
  // Otturatore: corpo, leva e pomello.
  bolt: `<rect x="8" y="24" width="34" height="12" rx="3" ${fill}/><path d="M42 30h6l4 10"/><circle cx="53" cy="44" r="4" ${fill}/><path d="M16 24v12"/>`,
  // Guardia / pompa: manicotto con scanalature.
  guard: `<rect x="8" y="22" width="48" height="20" rx="4" ${fill}/><path d="M16 26v12M24 26v12M32 26v12M40 26v12M48 26v12"/>`,
  // Apex: il simbolo a rombo dell'arma trasformata.
  apex: `<path d="M32 6l24 26-24 26L8 32z" ${fill}/><path d="M32 18l12 14-12 14-12-14z"/><circle cx="32" cy="32" r="2" fill="#d3dbe1"/>`,
};
for (const [slot, body] of Object.entries(slotIcons)) {
  fs.writeFileSync(new URL(`attachments/${slot}.svg`, root),
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none" stroke="#d3dbe1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`);
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
