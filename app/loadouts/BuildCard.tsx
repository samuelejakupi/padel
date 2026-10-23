"use client";

import type { ReactNode } from "react";
import { buildStats, statOrder } from "@/lib/loadouts/resolve";
import { PENDING, statKeys, weaponCategories, type Attachment, type Build, type Weapon } from "@/lib/loadouts/types";
import AttachmentSlot from "./AttachmentSlot";
import { PlaystyleBadge, StatBar, TierBadge, WeaponIcon } from "./parts";
import styles from "./Loadouts.module.css";

export default function BuildCard({ build, weapon, attachments, author, actions }: {
  build: Build; weapon: Weapon; attachments: Attachment[]; author?: string; actions?: ReactNode;
}) {
  const stats = buildStats(weapon.stats, attachments);
  const missing = attachments.filter(item => item.name === PENDING).length;
  return <article className={styles.buildCard} aria-labelledby={`build-${build.id}`}>
    <div className={styles.buildMain}>
      <header className={styles.buildHead}>
        <TierBadge tier={weapon.tier} />
        <div>
          <p className={styles.kicker}>{weaponCategories[weapon.category].label} · {build.title}</p>
          <h3 id={`build-${build.id}`}>{weapon.name}</h3>
        </div>
      </header>
      <div className={styles.badges}>{build.playstyles.map(item => <PlaystyleBadge key={item} playstyle={item} />)}</div>
      <WeaponIcon weapon={weapon} size="lg" />
      <div className={styles.stats}>
        {statOrder.map(key => <StatBar key={key} label={statKeys[key]} value={stats[key]} base={weapon.stats[key]} />)}
      </div>
      <p className={styles.source}>{build.source}{author ? ` · di ${author}` : ""}</p>
    </div>
    <div className={styles.buildSide}>
      <p className={styles.kicker}>Accessori · {attachments.length - missing}/{attachments.length}</p>
      <ul className={styles.slots}>{attachments.map(item => <AttachmentSlot key={item.id} attachment={item} />)}</ul>
      {build.loadout?.length ? <ul className={styles.loadout} aria-label="Equipaggiamento e perk">
        {build.loadout.map(item => <li key={item.kind}><small>{item.kind}</small><strong>{item.name}</strong></li>)}
      </ul> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  </article>;
}
