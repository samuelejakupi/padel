import type { Attachment, AttachmentSlot, Build, Weapon } from "./types";

// Dati iniziali, scritti a mano. Stessa forma che avranno le righe del
// database: quando si collega Supabase questo file resta come riserva.
//
// Fonti, consultate il 23 ottobre 2026:
// - codmunity.gg: dati tecnici (colpi al minuto, caricatore, velocita, mira,
//   TTK), build "pro" e alcuni effetti degli accessori;
// - wzstats.gg: tier e build "Versatile";
// - gli screenshot CDL del gruppo.
// Le barre delle statistiche, la rarita e gli effetti senza fonte sono stime
// indicative. Cadenza e Mobilita seguono i dati veri: cadenza = colpi al
// minuto / 10, mobilita = 100 - (ms di mira - 200) / 5.

const asset = (id: string) => ({
  icon: `/gaming/loadouts/weapons/${id}.png`,
  silhouette: `/gaming/loadouts/weapons/${id}.svg`,
});

export const weapons: Weapon[] = [
  { id: "m4", name: "M4", category: "assault", tier: "S", ...asset("m4"),
    specs: { rpm: 811, magazine: 30, velocity: 590, adsMs: 240, ttkMs: 296 },
    stats: { damage: 62, fireRate: 81, range: 64, control: 72, mobility: 92, accuracy: 70, reload: 62 } },
  { id: "han-86", name: "HAN 86", category: "assault", tier: "A", ...asset("han-86"),
    specs: { rpm: 741, magazine: 30, velocity: 615, adsMs: 250, ttkMs: 243 },
    stats: { damage: 70, fireRate: 74, range: 72, control: 64, mobility: 90, accuracy: 72, reload: 58 } },
  { id: "vel-46", name: "VEL 46", category: "smg", tier: "A", ...asset("vel-46"),
    specs: { rpm: 952, magazine: 40, velocity: 565, adsMs: 230, ttkMs: 258 },
    stats: { damage: 52, fireRate: 95, range: 38, control: 62, mobility: 94, accuracy: 58, reload: 70 } },
  { id: "rezi-12", name: "REZI 12", category: "shotgun", tier: "A", ...asset("rezi-12"),
    specs: { rpm: 150, magazine: 6, velocity: 340 },
    stats: { damage: 90, fireRate: 15, range: 18, control: 50, mobility: 70, accuracy: 40, reload: 42 } },
  { id: "kg-7-vulcan", name: "KG-7 Vulcan", category: "sniper", tier: "A", ...asset("kg-7-vulcan"),
    specs: { rpm: 41, magazine: 10, velocity: 740, adsMs: 550 },
    stats: { damage: 96, fireRate: 4, range: 95, control: 45, mobility: 30, accuracy: 88, reload: 38 } },
  { id: "finn-lmg", name: "FINN LMG", category: "lmg", tier: "A", ...asset("finn-lmg"),
    specs: { rpm: 588, magazine: 100, velocity: 710, adsMs: 400, ttkMs: 306 },
    stats: { damage: 66, fireRate: 59, range: 78, control: 58, mobility: 60, accuracy: 64, reload: 24 } },
];

// Effetto e modificatori tipici di ogni slot: valgono per gli accessori di
// cui non sappiamo di piu.
const slotDefaults: Record<AttachmentSlot, Pick<Attachment, "effect" | "modifiers">> = {
  muzzle: { effect: "Riduce il rinculo", modifiers: { control: 6, mobility: -2 } },
  barrel: { effect: "Aumenta la portata", modifiers: { range: 8, mobility: -3 } },
  laser: { effect: "Mira più rapida", modifiers: { mobility: 5, accuracy: 3 } },
  optic: { effect: "Mira più pulita", modifiers: { accuracy: 6, mobility: -2 } },
  stock: { effect: "Stabilità in mira", modifiers: { control: 5, mobility: -2 } },
  underbarrel: { effect: "Riduce il rinculo verticale", modifiers: { control: 7, mobility: -3 } },
  magazine: { effect: "Più colpi nel caricatore", modifiers: { reload: -6, mobility: -2 } },
  rearGrip: { effect: "Mira più rapida", modifiers: { mobility: 4, control: 2 } },
  ammo: { effect: "Più danno a distanza", modifiers: { damage: 4, range: 3 } },
  comb: { effect: "Mira più stabile", modifiers: { accuracy: 4, mobility: -1 } },
  bolt: { effect: "Riarmo più rapido", modifiers: { fireRate: 4, control: -2 } },
  guard: { effect: "Pompa più rapida", modifiers: { fireRate: 3, mobility: 2 } },
  apex: { effect: "Trasforma l'arma", modifiers: { control: 6, mobility: 4 } },
};

// Un accessorio scritto da un membro e non ancora nel catalogo: prende
// effetto e modificatori tipici del suo slot.
export const customAttachment = (name: string, slot: AttachmentSlot): Attachment =>
  ({ id: `custom:${slot}:${name}`, name, slot, rarity: "base", ...slotDefaults[slot] });

const make = (id: string, name: string, slot: AttachmentSlot, rarity: Attachment["rarity"] = "base", effect?: string): Attachment =>
  ({ id, name, slot, rarity, ...slotDefaults[slot], ...(effect ? { effect } : {}) });

export const attachments: Attachment[] = [
  // M4
  make("fss-is300", "FSS IS300", "muzzle", "rare", "Rinculo -6%, portata +16%, velocità +16%"),
  make("xrk-mil-tac", "XRK Mil-Tac Suppressor", "muzzle", "rare", "Silenziato, più portata"),
  make("le-crosswind-18", "18\" LE Crosswind", "barrel", "epic", "Portata +24%, velocità +19%"),
  make("zlr-type-c-optic", "ZLR Type C", "optic"),
  make("demo-dozer", "Demo Dozer Stock", "stock"),
  make("fss-fireline-grip", "FSS Fireline Grip", "underbarrel"),
  make("zlr-phase-grip", "ZLR Phase Grip", "rearGrip"),
  make("zlr-asp50-stock", "ZLR ASP50 Stock", "stock"),
  make("sa-laz-500", "SA Laz-500", "laser"),
  // HAN 86
  make("sa-h86-465", "SA H86 465mm", "barrel", "rare"),
  make("sz-prima-4-dot", "SZ Prima-4 Dot", "optic"),
  make("han-86-silenced-413", "HAN 86 Silenced 413mm", "barrel", "epic", "Canna lunga silenziata"),
  make("fss-tac90-grip", "FSS Tac90 Grip", "underbarrel"),
  make("meiko-l9p-fold", "Meiko L9P-Fold", "stock"),
  make("schlager-visiv-5", "Schlager VISIV-5", "laser"),
  make("xrk-clutch-ls", "XRK Clutch-LS", "laser"),
  make("xrk-justice-ii-grip", "XRK Justice II Grip", "rearGrip"),
  // VEL 46
  make("xrk-herder-40", "XRK Herder 40", "muzzle"),
  make("fss-crackdown", "FSS Crackdown", "muzzle"),
  make("vb-46-series-11", "VB-46 Series 11", "barrel", "rare"),
  make("v46-r-skel-grip", "V46 R-Skel Grip", "rearGrip"),
  make("lm-combat-grip", "LM Combat Grip", "rearGrip"),
  make("vel-46-extended", "VEL 46 Extended", "stock"),
  // REZI 12
  make("ftac-lts-707", "FTAC LTS-707", "muzzle"),
  make("zlr-rogue-90", "ZLR Rogue 90 25\"", "barrel", "rare"),
  make("xrk-bygone-39", "XRK Bygone-39", "rearGrip"),
  make("zlr-tac12-pro", "ZLR Tac12 Pro", "stock"),
  // KG-7 Vulcan
  make("ivanov-qr600", "Ivanov QR600", "muzzle"),
  make("tt-baem-12", "TT Baem 12\"", "barrel"),
  make("schlager-7x", "Schlager 7x", "optic", "rare"),
  make("tt-type-40", "TT Type 40", "comb"),
  make("kt76-light-bolt", "KT76 Light Bolt", "bolt"),
  // FINN LMG
  make("ta-sustain-99", "TA Sustain-99 20\"", "barrel", "rare"),
  make("sz-gen6-peq", "SZ Gen.6 PEQ", "laser"),
  make("exp-bulldog-9", "EXP Bulldog-9", "stock"),
  make("xrk-singularity-13", "XRK Singularity-13", "rearGrip"),
  // Dagli screenshot CDL del gruppo. Gli slot sono quelli del catalogo di
  // codmunity: lo screenshot ne indicava alcuni solo come "Accessorio".
  make("corvus-lvl-40", "Corvus LVL-40", "muzzle"),
  make("haebang-orc70", "Haebang ORC70", "muzzle"),
  make("mag-30", "Caricatore da 30 colpi", "magazine"),
  make("exp-u-turn", "EXP U-Turn", "stock"),
];

// Gli slot ancora da scoprire: "pending:<slot>" in una build diventa una
// card "Da confermare" con l'icona dello slot.
export const pending = (slot: AttachmentSlot) => `pending:${slot}`;

const WZ = "wzstats.gg · Versatile · multiplayer";
const CM = "codmunity.gg · pro build · multiplayer";
const CDL = "Screenshot del gruppo · CDL";

export const builds: Build[] = [
  { id: "m4-versatile", weaponId: "m4", title: "Versatile", playstyles: ["meta", "aggressive"], source: WZ,
    attachmentIds: ["fss-is300", "fss-fireline-grip", "zlr-phase-grip", "zlr-asp50-stock", "sa-laz-500"] },
  { id: "m4-pro", weaponId: "m4", title: "Pro", playstyles: ["meta", "longRange"], source: CM,
    attachmentIds: ["xrk-mil-tac", "le-crosswind-18", "zlr-type-c-optic", "demo-dozer", "sa-laz-500"] },
  { id: "han-86-cdl", weaponId: "han-86", title: "CDL ranked", playstyles: ["meta", "longRange"], source: CDL,
    attachmentIds: ["zlr-type-c-optic", "corvus-lvl-40", "fss-tac90-grip", "xrk-justice-ii-grip", pending("stock")] },
  { id: "han-86-pro", weaponId: "han-86", title: "Pro", playstyles: ["longRange"], source: CM,
    attachmentIds: ["xrk-mil-tac", "sa-h86-465", "zlr-type-c-optic", "xrk-justice-ii-grip", "xrk-clutch-ls"] },
  { id: "han-86-long", weaponId: "han-86", title: "Versatile", playstyles: ["longRange"], source: WZ,
    attachmentIds: ["sz-prima-4-dot", "han-86-silenced-413", "fss-tac90-grip", "meiko-l9p-fold", "schlager-visiv-5"] },
  { id: "vel-46-cdl", weaponId: "vel-46", title: "CDL ranked", playstyles: ["meta", "closeRange"], source: CDL,
    attachmentIds: ["haebang-orc70", "vb-46-series-11", "lm-combat-grip", "mag-30", "exp-u-turn"] },
  { id: "vel-46-pro", weaponId: "vel-46", title: "Pro", playstyles: ["meta", "closeRange", "aggressive"], source: CM,
    attachmentIds: ["xrk-herder-40", "vb-46-series-11", "fss-fireline-grip", "v46-r-skel-grip", "xrk-clutch-ls"] },
  { id: "vel-46-run", weaponId: "vel-46", title: "Versatile", playstyles: ["closeRange", "mobile"], source: WZ,
    attachmentIds: ["fss-crackdown", "vb-46-series-11", "lm-combat-grip", "vel-46-extended", "schlager-visiv-5"] },
  { id: "rezi-12-pro", weaponId: "rezi-12", title: "Pro", playstyles: ["closeRange", "aggressive"], source: CM,
    attachmentIds: ["ftac-lts-707", "zlr-rogue-90", "xrk-bygone-39", "zlr-tac12-pro", "schlager-visiv-5"] },
  { id: "kg-7-pro", weaponId: "kg-7-vulcan", title: "Pro", playstyles: ["longRange"], source: CM,
    attachmentIds: ["ivanov-qr600", "tt-baem-12", "schlager-7x", "tt-type-40", "kt76-light-bolt"] },
  { id: "finn-pro", weaponId: "finn-lmg", title: "Pro", playstyles: ["longRange"], source: CM,
    attachmentIds: ["xrk-mil-tac", "ta-sustain-99", "sz-gen6-peq", "exp-bulldog-9", "xrk-singularity-13"] },
];
