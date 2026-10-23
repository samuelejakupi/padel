"use client";

// I pezzi piccoli delle card: icona dell'arma, barra delle statistiche,
// badge di rarita, tier e stile di gioco.
import { useState } from "react";
import Image from "next/image";
import { playstyles, rarities, type Playstyle, type Rarity, type Tier, type Weapon } from "@/lib/loadouts/types";
import styles from "./Loadouts.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// PNG con contorno e glow; se manca, la sagoma SVG; se manca anche quella,
// la sagoma generica della categoria. L'inclinazione verso l'alto a destra la
// da il CSS, cosi lo stesso file serve anche dritto.
export function WeaponIcon({ weapon, size = "md" }: { weapon: Weapon; size?: "sm" | "md" | "lg" }) {
  const sources = [weapon.icon, weapon.silhouette, `/gaming/loadouts/weapons/placeholder-${weapon.category}.svg`];
  const [attempt, setAttempt] = useState(0);
  return <span className={styles.weaponIcon} data-size={size}>
    <Image src={`${basePath}${sources[Math.min(attempt, sources.length - 1)]}`} alt={weapon.name} width={1024} height={1024}
      onError={() => setAttempt(current => current + 1)} />
  </span>;
}

export function StatBar({ label, value, base }: { label: string; value: number; base?: number }) {
  const delta = base === undefined ? 0 : Math.round(value - base);
  const start = Math.min(value, base ?? value);
  return <div className={styles.statBar}>
    <span className={styles.statLabel}>{label}</span>
    <span className={styles.statTrack} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
      <span className={styles.statFill} style={{ width: `${start}%` }} />
      {delta ? <span className={styles.statDelta} data-sign={delta > 0 ? "up" : "down"} style={{ left: `${start}%`, width: `${Math.abs(delta)}%` }} /> : null}
    </span>
    <span className={styles.statValue}>
      {Math.round(value)}
      {delta ? <small data-sign={delta > 0 ? "up" : "down"}>{delta > 0 ? `+${delta}` : delta}</small> : null}
    </span>
  </div>;
}

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return <span className={styles.rarity} data-rarity={rarity}>{rarities[rarity]}</span>;
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={styles.tier} data-tier={tier} aria-label={`Tier ${tier}`}>{tier}</span>;
}

export function PlaystyleBadge({ playstyle }: { playstyle: Playstyle }) {
  return <span className={styles.playstyle} data-playstyle={playstyle}>{playstyles[playstyle]}</span>;
}
