"use client";

// I pezzi comuni dei profili. Le misure vengono da PlayPro, dove la gerarchia
// e gia stata provata: chi sei in alto (avatar, nome, dove stai), poi tre
// numeri, poi il resto. Colori, angoli e caratteri restano quelli di theBoyz.
import type { ReactNode } from "react";
import styles from "./Profile.module.css";

// Testata: il pannello scuro con la griglia della home, l'avatar centrato in
// un disco di vetro con la matita, il nome e una pillola con la posizione.
// Niente numeri giganti: il numero che conta sta nella pillola e nei tre
// numeri sotto, e il nome dice di chi e la pagina.
export function ProfileHeader({ eyebrow, name, avatar, pill, onEdit, editLabel = "Modifica i dati del profilo", children }: {
  eyebrow: string;
  name: string;
  avatar: ReactNode;
  pill?: ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  children?: ReactNode;
}) {
  return <header className={styles.header}>
    <p className={styles.eyebrow}>{eyebrow}</p>
    <div className={styles.avatarDisc}>
      {avatar}
      {onEdit ? <button type="button" className={styles.editBadge} onClick={onEdit} aria-label={editLabel} title={editLabel}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m14 6 4 4" /></svg>
      </button> : null}
    </div>
    <h1 className={styles.name}>{name}</h1>
    {pill ? <p className={styles.pill}>{pill}</p> : null}
    {children}
  </header>;
}

export type Stat = { label: string; value: ReactNode; unit?: string; tone?: "up" | "down" };

// Tre numeri in fila, divisi da un filo. Il numero in alto e grosso,
// l'etichetta sotto a 13px: e la misura minima per leggere senza strizzare
// gli occhi, la regola di PlayPro.
export function StatRow({ stats, dark = false }: { stats: Stat[]; dark?: boolean }) {
  return <dl className={styles.statRow} data-dark={dark || undefined}>
    {stats.map(stat => <div key={stat.label}>
      <dt>{stat.label}</dt>
      <dd data-tone={stat.tone}>{stat.value}{stat.unit ? <small>{stat.unit}</small> : null}</dd>
    </div>)}
  </dl>;
}

// Una sezione del profilo con titolo, eventuale azione a destra e contenuto.
export function ProfileSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className={styles.section}>
    <div className={styles.sectionHead}><h2>{title}</h2>{action}</div>
    {children}
  </section>;
}

// Il riassunto di una sezione nel profilo della home: nome, tre numeri e il
// tasto per il profilo completo della sezione.
export function SectionSummary({ title, icon, stats, empty, onOpen }: {
  title: string; icon: ReactNode; stats: Stat[] | null; empty: string; onOpen: () => void;
}) {
  return <article className={styles.summary}>
    <header>
      <span className={styles.summaryIcon} aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <button type="button" className="button button-ghost" onClick={onOpen}>Profilo {title} →</button>
    </header>
    {stats ? <StatRow stats={stats} /> : <p className={styles.empty}>{empty}</p>}
  </article>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
