"use client";

import { weaponCategories, type Weapon } from "@/lib/loadouts/types";
import { TierBadge, WeaponIcon } from "./parts";
import styles from "./Loadouts.module.css";

// L'arma nell'elenco: nome, categoria, quante build ha. E un tasto che apre
// e chiude le sue build sotto; statistiche e accessori stanno nelle build.
export default function WeaponCard({ weapon, buildCount, open, panelId, onToggle }: {
  weapon: Weapon; buildCount: number; open: boolean; panelId: string; onToggle: () => void;
}) {
  return <button type="button" className={styles.weaponCard} data-selected={open || undefined}
    aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
    <span className={styles.weaponCardText}>
      <span className={styles.kicker}>{weaponCategories[weapon.category].label}</span>
      <span className={styles.weaponCardName}>{weapon.name}</span>
      <span className={styles.weaponCardFoot}>{buildCount} build · {open ? "Chiudi" : "Vedi"}</span>
    </span>
    <WeaponIcon weapon={weapon} />
    <TierBadge tier={weapon.tier} />
  </button>;
}
