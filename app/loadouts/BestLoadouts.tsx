"use client";

import { useState, type ReactNode } from "react";
import type { Attachment, Build, Weapon } from "@/lib/loadouts/types";
import BuildCard from "./BuildCard";
import WeaponCard from "./WeaponCard";
import styles from "./Loadouts.module.css";

export type LoadoutEntry = { build: Build; weapon: Weapon; attachments: Attachment[]; author?: string; actions?: ReactNode };

// Le build divise per arma: un elenco di armi, e toccandone una si aprono
// sotto le sue build. Compaiono solo le armi che hanno almeno una build.
export default function BestLoadouts({ entries, weapons, headerAction }: { entries: LoadoutEntry[]; weapons: Weapon[]; headerAction?: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const shownWeapons = weapons.filter(weapon => entries.some(entry => entry.weapon.id === weapon.id));
  return <section className={`page-section ${styles.page}`} aria-labelledby="loadouts-title">
    <header className={styles.pageHead}>
      <div>
        <p className="eyebrow dark">CALL OF DUTY · MW4</p>
        <h1 id="loadouts-title">Best Loadouts</h1>
        <p>Le build del gruppo, arma per arma. Tocca un&apos;arma per vedere le sue build.</p>
      </div>
      {headerAction}
    </header>
    {shownWeapons.length ? <ul className={styles.weaponList}>
      {shownWeapons.map(weapon => {
        const weaponEntries = entries.filter(entry => entry.weapon.id === weapon.id);
        const open = openId === weapon.id;
        return <li key={weapon.id}>
          <WeaponCard weapon={weapon} buildCount={weaponEntries.length} open={open} panelId={`builds-${weapon.id}`}
            onToggle={() => setOpenId(current => current === weapon.id ? null : weapon.id)} />
          {open ? <div className={styles.buildList} id={`builds-${weapon.id}`}>
            {weaponEntries.map(entry => <BuildCard key={entry.build.id} {...entry} />)}
          </div> : null}
        </li>;
      })}
    </ul> : <p className={styles.empty}>Ancora nessuna build: aggiungi la prima.</p>}
  </section>;
}
