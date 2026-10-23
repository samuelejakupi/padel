// Sagome piatte delle armi, una per categoria, disegnate qui invece che
// caricate come immagini: nessun file per arma da tenere su Supabase o nel
// sito. Il corpo e sempre lo stesso; gli accessori montati diventano pezzi
// separati, che la pagina colora. Le misure sono nel riquadro 200x80.

export const weaponCategories = {
  assault: { label: "Fucile d'assalto", role: "AR" },
  smg: { label: "Mitraglietta", role: "SMG" },
  marksman: { label: "Fucile tattico", role: "DMR" },
  sniper: { label: "Fucile di precisione", role: "SNIPER" },
  lmg: { label: "Mitragliatrice leggera", role: "LMG" },
  shotgun: { label: "Fucile a pompa", role: "SG" },
  pistol: { label: "Pistola", role: "PISTOLA" },
} as const;
export type WeaponCategory = keyof typeof weaponCategories;

// Gli slot dell'armaiolo, nell'ordine in cui il gioco li elenca.
export const weaponSlots = ["Volata", "Canna", "Laser", "Ottica", "Calcio", "Sottocanna", "Caricatore", "Impugnatura", "Munizioni"] as const;
export type WeaponSlot = (typeof weaponSlots)[number];

export type WeaponPart = { key: string; slot: WeaponSlot | null; d: string };
export type WeaponArt = { parts: WeaponPart[]; details: string[]; anchors: Record<WeaponSlot, { x: number; y: number }> };

type Spec = {
  muzzle: [number, number];
  barrel: [number, number];
  guard: [number, number] | null;
  receiver: [number, number];
  optic: [number, number];
  scope?: boolean;
  mag: { x: number; w: number; len: number; slant: number } | null;
  grip: { x: number; len: number };
  stock: [number, number] | null;
};

const CY = 34;

const specs: Record<WeaponCategory, Spec> = {
  assault: { muzzle: [8, 18], barrel: [18, 48], guard: [48, 96], receiver: [96, 138], optic: [106, 126], mag: { x: 108, w: 10, len: 24, slant: 7 }, grip: { x: 128, len: 19 }, stock: [138, 190] },
  smg: { muzzle: [34, 42], barrel: [42, 58], guard: [58, 88], receiver: [88, 134], optic: [98, 116], mag: { x: 100, w: 9, len: 27, slant: 2 }, grip: { x: 122, len: 19 }, stock: [134, 176] },
  marksman: { muzzle: [4, 14], barrel: [14, 56], guard: [56, 100], receiver: [100, 142], optic: [108, 130], mag: { x: 112, w: 10, len: 18, slant: 3 }, grip: { x: 132, len: 19 }, stock: [142, 192] },
  sniper: { muzzle: [2, 12], barrel: [12, 72], guard: [72, 106], receiver: [106, 146], optic: [102, 146], scope: true, mag: { x: 118, w: 10, len: 12, slant: 1 }, grip: { x: 138, len: 19 }, stock: [146, 196] },
  lmg: { muzzle: [4, 14], barrel: [14, 52], guard: [52, 98], receiver: [98, 148], optic: [112, 132], mag: { x: 104, w: 22, len: 22, slant: 0 }, grip: { x: 138, len: 19 }, stock: [148, 194] },
  shotgun: { muzzle: [10, 18], barrel: [18, 64], guard: [64, 96], receiver: [96, 136], optic: [104, 120], mag: null, grip: { x: 128, len: 19 }, stock: [136, 192] },
  pistol: { muzzle: [58, 66], barrel: [66, 72], guard: null, receiver: [72, 134], optic: [98, 112], mag: null, grip: { x: 116, len: 28 }, stock: null },
};

const n = (value: number) => Math.round(value * 10) / 10;
const rect = (x: number, y: number, w: number, h: number, r = 1.5) =>
  `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 -${r} ${r}h-${n(w - 2 * r)}a${r} ${r} 0 0 1 -${r} -${r}v-${n(h - 2 * r)}a${r} ${r} 0 0 1 ${r} -${r}Z`;
const poly = (points: [number, number][]) => `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;

export function weaponArt(category: WeaponCategory, equipped: readonly WeaponSlot[]): WeaponArt {
  const s = specs[category];
  const has = (slot: WeaponSlot) => equipped.includes(slot);
  const parts: WeaponPart[] = [];
  const details: string[] = [];
  const [rx0, rx1] = s.receiver;
  const guard = s.guard ?? [s.barrel[1], s.barrel[1]];
  const mid = (a: number, b: number) => (a + b) / 2;

  // Corpo: guardia, castello e binario sopra. Sempre del colore neutro.
  const body = [rect(rx0, CY - 8, rx1 - rx0, 15, 2)];
  if (s.guard) body.push(rect(guard[0], CY - 6, guard[1] - guard[0], 11, 2));
  body.push(rect(guard[0] + 2, CY - 9.5, rx1 - guard[0] - 6, 2.2, 0.8));
  const tg = s.grip.x - 13;
  body.push(`M${tg} ${CY + 6}v5a3 3 0 0 0 3 3h7v-2h-6a1.5 1.5 0 0 1 -1.5 -1.5v-4.5Z`);
  parts.push({ key: "body", slot: null, d: body.join("") });

  parts.push({ key: "barrel", slot: "Canna", d: rect(s.barrel[0], CY - 2.2, s.barrel[1] - s.barrel[0] + 2, 4.4, 1) });
  parts.push({ key: "muzzle", slot: "Volata", d: rect(s.muzzle[0], CY - 3.4, s.muzzle[1] - s.muzzle[0], 6.8, 1.2) });
  if (s.stock) {
    const [x0, x1] = s.stock;
    parts.push({ key: "stock", slot: "Calcio", d: poly([[x0, CY - 5], [x1 - 3, CY - 7], [x1, CY - 6], [x1, CY + 12], [x1 - 3, CY + 13], [x1 - 10, CY + 12], [x0 + (x1 - x0) * 0.4, CY + 3], [x0, CY + 3]]) });
  }
  const g = s.grip;
  parts.push({ key: "grip", slot: "Impugnatura", d: poly([[g.x, CY + 6], [g.x + 8, CY + 6], [g.x + 13, CY + 7 + g.len], [g.x + 5, CY + 7 + g.len]]) });
  if (s.mag) {
    const m = s.mag;
    parts.push({ key: "mag", slot: "Caricatore", d: poly([[m.x, CY + 6], [m.x + m.w, CY + 6], [m.x + m.w - m.slant, CY + 7 + m.len], [m.x - m.slant, CY + 7 + m.len]]) });
  }
  // Gli accessori che non hanno un pezzo di serie compaiono solo se montati.
  const [ox0, ox1] = s.optic;
  if (has("Ottica")) {
    parts.push({
      key: "optic", slot: "Ottica",
      d: s.scope
        ? rect(ox0, CY - 18, ox1 - ox0, 6.5, 3) + rect(ox0 + 8, CY - 12, 3, 3, 0.5) + rect(ox1 - 11, CY - 12, 3, 3, 0.5)
        : rect(ox0, CY - 17, ox1 - ox0, 7.5, 1.8) + rect(ox0 + 3, CY - 10, ox1 - ox0 - 6, 1.5, 0.4),
    });
  }
  const gx = mid(guard[0], guard[1]);
  if (has("Laser")) parts.push({ key: "laser", slot: "Laser", d: rect(gx - 7, CY - 2, 14, 5, 1) });
  const fx = guard[0] + (guard[1] - guard[0]) * 0.3;
  if (has("Sottocanna")) parts.push({ key: "underbarrel", slot: "Sottocanna", d: poly([[fx - 3, CY + 5], [fx + 3, CY + 5], [fx + 2.4, CY + 17], [fx - 2.4, CY + 17]]) });
  const ammoX = s.mag ? s.mag.x : g.x - 3;
  const ammoW = s.mag ? s.mag.w : 8;
  if (has("Munizioni")) parts.push({ key: "ammo", slot: "Munizioni", d: rect(ammoX, CY + 7, ammoW, 3.5, 0.6) });

  // Incisioni del rilievo: fessure sulla guardia e finestra di espulsione.
  if (s.guard) for (let x = guard[0] + 5; x < guard[1] - 6; x += 7) details.push(rect(x, CY - 3.2, 4, 2, 0.8));
  details.push(rect(rx0 + 6, CY - 4.5, Math.min(14, (rx1 - rx0) / 3), 3, 0.8));
  // Il foro del calcio scheletrato e il tubo sotto la canna del fucile a pompa.
  if (s.stock) {
    const [x0, x1] = s.stock;
    details.push(poly([[x0 + (x1 - x0) * 0.45, CY - 2], [x1 - 6, CY - 3], [x1 - 6, CY + 5], [x1 - 10, CY + 7], [x0 + (x1 - x0) * 0.55, CY + 1.5]]));
  }
  if (category === "shotgun") details.push(rect(s.barrel[0] + 6, CY + 2.6, guard[0] - s.barrel[0] - 4, 3, 1));

  const anchors = {
    Volata: { x: mid(...s.muzzle), y: CY },
    Canna: { x: mid(...s.barrel), y: CY },
    Laser: { x: gx, y: CY + 0.5 },
    Ottica: { x: mid(ox0, ox1), y: s.scope ? CY - 15 : CY - 13 },
    Calcio: s.stock ? { x: s.stock[0] + (s.stock[1] - s.stock[0]) * 0.65, y: CY + 2 } : { x: rx1 - 4, y: CY },
    Sottocanna: { x: fx, y: CY + 11 },
    Caricatore: s.mag ? { x: s.mag.x + s.mag.w / 2 - s.mag.slant / 2, y: CY + 7 + s.mag.len / 2 } : { x: g.x + 7, y: CY + 7 + g.len * 0.7 },
    Impugnatura: { x: g.x + 6.5, y: CY + 7 + g.len / 2 },
    Munizioni: { x: ammoX + ammoW / 2, y: CY + 9 },
  } satisfies Record<WeaponSlot, { x: number; y: number }>;
  return { parts, details, anchors };
}
