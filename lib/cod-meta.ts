// Classi meta CDL di MW4. Le posizioni dei punti sono in percentuale
// sull'immagine dell'arma (x da sinistra, y dall'alto).
export type MetaAttachment = { slot: string; name: string; x: number; y: number };
export type MetaLoadoutItem = { kind: string; name: string };
export type MetaClass = {
  id: string;
  role: string;
  weapon: string;
  category: string;
  image: string;
  attachments: MetaAttachment[];
  loadout: MetaLoadoutItem[];
};

// Equipaggiamento e perk non sono negli screenshot delle build: vanno confermati.
const cdlLoadout: MetaLoadoutItem[] = [
  { kind: "Letale", name: "Da confermare" },
  { kind: "Tattica", name: "Da confermare" },
  { kind: "Perk 1", name: "Da confermare" },
  { kind: "Perk 2", name: "Da confermare" },
  { kind: "Perk 3", name: "Da confermare" },
];

export const metaClasses: MetaClass[] = [
  {
    id: "ar",
    role: "AR",
    weapon: "HAN 86",
    category: "Fucile d'assalto",
    image: "/gaming/meta/han-86.jpg",
    attachments: [
      { slot: "Volata", name: "ZLR Type C", x: 13, y: 40 },
      { slot: "Accessorio", name: "Corvus LVL-40", x: 30, y: 40 },
      { slot: "Impugnatura anteriore", name: "FSS Tac90 Grip", x: 37, y: 58 },
      { slot: "Impugnatura posteriore", name: "XRK Justice II Grip", x: 70, y: 60 },
      { slot: "Calcio", name: "Da confermare", x: 87, y: 48 },
    ],
    loadout: cdlLoadout,
  },
  {
    id: "smg",
    role: "SMG",
    weapon: "VEL 46",
    category: "Mitraglietta",
    image: "/gaming/meta/vel-46.jpg",
    attachments: [
      { slot: "Accessorio", name: "Haebang ORC70", x: 13, y: 41 },
      { slot: "Accessorio", name: "VB-46 Series 11", x: 27, y: 42 },
      { slot: "Impugnatura", name: "Impugnatura da combattimento", x: 50, y: 54 },
      { slot: "Caricatore", name: "Caricatore da 30 colpi", x: 49, y: 68 },
      { slot: "Calcio", name: "EXP U-Turn", x: 86, y: 58 },
    ],
    loadout: cdlLoadout,
  },
];
