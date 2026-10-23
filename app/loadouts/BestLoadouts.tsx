"use client";

import { useState, type ReactNode } from "react";
import { playstyles, tiers, weaponCategories, type Attachment, type Build, type Playstyle, type Tier, type Weapon, type WeaponCategory } from "@/lib/loadouts/types";
import BuildCard from "./BuildCard";
import WeaponCard from "./WeaponCard";
import styles from "./Loadouts.module.css";

export type LoadoutEntry = { build: Build; weapon: Weapon; attachments: Attachment[]; author?: string; actions?: ReactNode };

// Un filtro a pastiglie: "Tutti" piu una voce per valore. Mostra solo i
// valori che hanno almeno una build, cosi non si sceglie mai il vuoto.
function Filter<T extends string>({ label, value, options, onChange }: {
  label: string; value: T | null; options: { key: T; label: string }[]; onChange: (next: T | null) => void;
}) {
  return <div className={styles.filter} role="group" aria-label={label}>
    <span className={styles.filterLabel}>{label}</span>
    <button type="button" className="button button-ghost" aria-pressed={value === null} onClick={() => onChange(null)}>Tutti</button>
    {options.map(option => <button key={option.key} type="button" className="button button-ghost" aria-pressed={value === option.key} onClick={() => onChange(value === option.key ? null : option.key)}>{option.label}</button>)}
  </div>;
}

export default function BestLoadouts({ entries, weapons, headerAction }: { entries: LoadoutEntry[]; weapons: Weapon[]; headerAction?: ReactNode }) {
  const [category, setCategory] = useState<WeaponCategory | null>(null);
  const [playstyle, setPlaystyle] = useState<Playstyle | null>(null);
  const [tier, setTier] = useState<Tier | null>(null);
  const [weaponId, setWeaponId] = useState<string | null>(null);
  const visible = entries.filter(entry => (!category || entry.weapon.category === category)
    && (!playstyle || entry.build.playstyles.includes(playstyle))
    && (!tier || entry.weapon.tier === tier)
    && (!weaponId || entry.weapon.id === weaponId));
  const shownWeapons = weapons.filter(weapon => (!category || weapon.category === category) && (!tier || weapon.tier === tier));
  const used = <T extends string>(pick: (entry: LoadoutEntry) => T[]) => new Set(entries.flatMap(pick));
  const usedCategories = used(entry => [entry.weapon.category]);
  const usedPlaystyles = used(entry => entry.build.playstyles);
  const usedTiers = used(entry => [entry.weapon.tier]);
  return <section className={`page-section ${styles.page}`} aria-labelledby="loadouts-title">
    <header className={styles.pageHead}>
      <div>
        <p className="eyebrow dark">CALL OF DUTY · MW4</p>
        <h1 id="loadouts-title">Best Loadouts</h1>
        <p>Le build consigliate per arma. Statistiche, rarità ed effetti sono stime indicative.</p>
      </div>
      {headerAction}
    </header>
    <div className={styles.filters}>
      <Filter label="Categoria" value={category} onChange={next => { setCategory(next); setWeaponId(null); }}
        options={(Object.keys(weaponCategories) as WeaponCategory[]).filter(key => usedCategories.has(key)).map(key => ({ key, label: weaponCategories[key].label }))} />
      <Filter label="Stile" value={playstyle} onChange={setPlaystyle}
        options={(Object.keys(playstyles) as Playstyle[]).filter(key => usedPlaystyles.has(key)).map(key => ({ key, label: playstyles[key] }))} />
      <Filter label="Tier" value={tier} onChange={next => { setTier(next); setWeaponId(null); }}
        options={tiers.filter(key => usedTiers.has(key)).map(key => ({ key, label: key }))} />
    </div>
    <h2 className={styles.sectionTitle}>Armi</h2>
    <div className={styles.weaponGrid}>
      {shownWeapons.map(weapon => <WeaponCard key={weapon.id} weapon={weapon} selected={weaponId === weapon.id}
        buildCount={entries.filter(entry => entry.weapon.id === weapon.id).length}
        onSelect={() => setWeaponId(current => current === weapon.id ? null : weapon.id)} />)}
    </div>
    <h2 className={styles.sectionTitle}>Build · {visible.length}</h2>
    {visible.length ? <div className={styles.buildList}>
      {visible.map(entry => <BuildCard key={entry.build.id} {...entry} />)}
    </div> : <p className={styles.empty}>Nessuna build con questi filtri.</p>}
  </section>;
}
