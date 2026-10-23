import { attachments, weapons } from "./data";
import { attachmentSlots, PENDING, statKeys, type Attachment, type AttachmentSlot, type StatKey, type Weapon, type WeaponStats } from "./types";

export const attachmentIcon = (item: Attachment) =>
  item.icon ?? `/gaming/loadouts/attachments/${item.slot}.svg`;

export function findWeapon(id: string): Weapon | undefined {
  return weapons.find(weapon => weapon.id === id);
}

// "pending:<slot>" e gli id che non conosciamo diventano una card da
// confermare, invece di sparire: la build resta da cinque slot.
export function resolveAttachment(id: string): Attachment {
  const known = attachments.find(item => item.id === id);
  if (known) return known;
  const slot = (id.startsWith("pending:") ? id.slice(8) : "muzzle") as AttachmentSlot;
  return { id, name: PENDING, slot: slot in attachmentSlots ? slot : "muzzle", rarity: "base", effect: "Accessorio non ancora scelto", modifiers: {} };
}

// Statistiche dell'arma con gli accessori montati, sempre fra 0 e 100.
export function buildStats(base: WeaponStats, items: Attachment[]): WeaponStats {
  const result = { ...base };
  for (const item of items) {
    for (const [key, delta] of Object.entries(item.modifiers) as [StatKey, number][]) {
      result[key] = Math.max(0, Math.min(100, result[key] + delta));
    }
  }
  return result;
}

export const statOrder = Object.keys(statKeys) as StatKey[];
