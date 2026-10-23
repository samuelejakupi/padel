// Schema delle build. Gli stessi tipi descrivono i dati scritti in data.ts e
// quelli che arrivano da Supabase (cod_meta_builds), cosi la pagina non sa da
// dove viene una build.

export const weaponCategories = {
  assault: { label: "Fucile d'assalto", short: "AR" },
  smg: { label: "Mitraglietta", short: "SMG" },
  shotgun: { label: "Fucile a pompa", short: "SG" },
  sniper: { label: "Fucile di precisione", short: "SNIPER" },
  lmg: { label: "Mitragliatrice leggera", short: "LMG" },
  marksman: { label: "Fucile tattico", short: "DMR" },
  pistol: { label: "Pistola", short: "PISTOLA" },
} as const;
export type WeaponCategory = keyof typeof weaponCategories;

// Gli slot dell'armaiolo, nell'ordine in cui il gioco li elenca.
export const attachmentSlots = {
  muzzle: "Volata",
  barrel: "Canna",
  laser: "Laser",
  optic: "Ottica",
  stock: "Calcio",
  underbarrel: "Sottocanna",
  magazine: "Caricatore",
  rearGrip: "Impugnatura",
  ammo: "Munizioni",
  // Solo su alcune armi: fucili a pompa e di precisione.
  comb: "Poggiaguancia",
  bolt: "Otturatore",
  guard: "Guardia",
  apex: "Apex",
} as const;
export type AttachmentSlot = keyof typeof attachmentSlots;

export const rarities = {
  base: "Base",
  rare: "Raro",
  epic: "Epico",
  legendary: "Leggendario",
} as const;
export type Rarity = keyof typeof rarities;

export const tiers = ["S", "A", "B", "C"] as const;
export type Tier = (typeof tiers)[number];

export const playstyles = {
  meta: "Meta",
  longRange: "Long Range",
  closeRange: "Close Range",
  mobile: "Mobile",
  aggressive: "Aggressive",
} as const;
export type Playstyle = keyof typeof playstyles;

// Valori da 0 a 100.
export const statKeys = {
  damage: "Danno",
  fireRate: "Cadenza",
  range: "Portata",
  control: "Controllo",
  mobility: "Mobilità",
  accuracy: "Precisione",
  reload: "Ricarica",
} as const;
export type StatKey = keyof typeof statKeys;
export type WeaponStats = Record<StatKey, number>;

export type Weapon = {
  id: string;
  name: string;
  category: WeaponCategory;
  tier: Tier;
  stats: WeaponStats;
  // Percorsi degli asset in public/: PNG 1024x1024 con contorno e glow, e la
  // sagoma SVG a un solo tracciato pieno usata se il PNG manca.
  icon: string;
  silhouette: string;
  // true finche l'icona e quella generica della categoria.
  placeholderIcon?: boolean;
  // Dati tecnici veri, da codmunity.gg: le barre sono stime, questi no.
  specs?: { rpm: number; magazine: number; velocity: number; adsMs?: number; ttkMs?: number };
};

export type Attachment = {
  id: string;
  name: string;
  slot: AttachmentSlot;
  rarity: Rarity;
  // Una riga: cosa cambia montandolo.
  effect: string;
  modifiers: Partial<WeaponStats>;
  // public/gaming/loadouts/attachments/<id>.svg; se manca vale l'icona dello slot.
  icon?: string;
};

export type Build = {
  id: string;
  weaponId: string;
  title: string;
  playstyles: Playstyle[];
  attachmentIds: string[];
  loadout?: { kind: string; name: string }[];
  // Da dove arriva la build: mostrato sulla card, cosi si sa quanto fidarsi.
  source: string;
  createdBy?: string;
  hasScreenshot?: boolean;
};

export const PENDING = "Da confermare";

export const loadoutKinds = ["Letale", "Tattica", "Perk 1", "Perk 2", "Perk 3"] as const;
