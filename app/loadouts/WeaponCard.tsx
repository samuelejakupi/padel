"use client";

import { statOrder } from "@/lib/loadouts/resolve";
import { statKeys, weaponCategories, type Weapon } from "@/lib/loadouts/types";
import { StatBar, TierBadge, WeaponIcon } from "./parts";
import styles from "./Loadouts.module.css";

export default function WeaponCard({ weapon, buildCount, selected, onSelect }: { weapon: Weapon; buildCount: number; selected?: boolean; onSelect?: () => void }) {
  return <article className={styles.weaponCard} data-selected={selected || undefined}>
    <button type="button" className={styles.weaponCardHit} onClick={onSelect} aria-pressed={selected}
      aria-label={`${weapon.name}: mostra solo le sue build`} />
    <header className={styles.weaponCardHead}>
      <div>
        <p className={styles.kicker}>{weaponCategories[weapon.category].label}</p>
        <h3>{weapon.name}</h3>
      </div>
      <TierBadge tier={weapon.tier} />
    </header>
    <WeaponIcon weapon={weapon} />
    {weapon.specs ? <p className={styles.specs}>
      <span><b>{weapon.specs.rpm}</b> colpi/min</span>
      <span><b>{weapon.specs.magazine}</b> colpi</span>
      <span><b>{weapon.specs.velocity}</b> m/s</span>
      {weapon.specs.adsMs ? <span>mira <b>{weapon.specs.adsMs}</b> ms</span> : null}
    </p> : null}
    <div className={styles.stats}>
      {statOrder.map(key => <StatBar key={key} label={statKeys[key]} value={weapon.stats[key]} />)}
    </div>
    <p className={styles.weaponCardFoot}>{buildCount} build{weapon.placeholderIcon ? " · icona provvisoria" : ""}</p>
  </article>;
}
