"use client";

import type { ReactNode } from "react";
import { buildStats, statOrder } from "@/lib/loadouts/resolve";
import { PENDING, statKeys, type Attachment, type Build, type Weapon } from "@/lib/loadouts/types";
import AttachmentSlot from "./AttachmentSlot";
import { PlaystyleBadge, StatBar } from "./parts";
import styles from "./Loadouts.module.css";

export default function BuildCard({ build, weapon, attachments, author, actions }: {
  build: Build; weapon: Weapon; attachments: Attachment[]; author?: string; actions?: ReactNode;
}) {
  const stats = buildStats(weapon.stats, attachments);
  const missing = attachments.filter(item => item.name === PENDING).length;
  return <article className={styles.buildCard} aria-labelledby={`build-${build.id}`}>
    <div className={styles.buildMain}>
      {/* Sta sotto la sua arma: il nome dell'arma non si ripete, il titolo e
          quello della build. */}
      <header className={styles.buildHead}>
        <div>
          <p className={styles.kicker}>Build · {weapon.name}</p>
          <h2 id={`build-${build.id}`}>{build.title}</h2>
        </div>
      </header>
      {build.playstyles.length ? <div className={styles.badges}>{build.playstyles.map(item => <PlaystyleBadge key={item} playstyle={item} />)}</div> : null}
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
