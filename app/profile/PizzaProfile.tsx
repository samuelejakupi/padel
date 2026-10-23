"use client";

import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase";
import { EmptyNote, ProfileHeader, ProfileSection, StatRow } from "./parts";
import styles from "./Profile.module.css";

// Solo i campi che servono al profilo: i tipi completi stanno in page.tsx.
type Session = { id: string; restaurant_id: string; opened_at: string; completed_at: string | null; participants: { voter_id: string }[] };
type Vote = { session_id: string; voter_id: string; location: number; pizza: number; dessert: number; price: number };
type Restaurant = { id: string; name: string };

// Gli stessi pesi della classifica (location 7, pizza 10, dolce 4, prezzo 10):
// il voto di una serata va da 0 a 10 come quelli dei criteri.
const WEIGHTS = { location: 7, pizza: 10, dessert: 4, price: 10 } as const;
const CRITERIA = [
  { key: "pizza", label: "Pizza" },
  { key: "location", label: "Location" },
  { key: "dessert", label: "Dolce" },
  { key: "price", label: "Prezzo" },
] as const;
const score = (vote: Vote) => (vote.location * WEIGHTS.location + vote.pizza * WEIGHTS.pizza + vote.dessert * WEIGHTS.dessert + vote.price * WEIGHTS.price) / 31;
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const one = (value: number | null) => value === null ? "—" : value.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

// I tre numeri della testata, usati anche dal riassunto nel profilo della home.
export function pizzaSummary(profileId: string, sessions: Session[], votes: Vote[]) {
  const mine = votes.filter(vote => vote.voter_id === profileId);
  return {
    nights: sessions.filter(session => session.participants.some(p => p.voter_id === profileId)).length,
    votes: mine.length,
    average: mean(mine.map(score)),
  };
}
export const oneDecimal = one;

export default function PizzaProfile({ profile, avatar, sessions, votes, restaurants, onEdit }: {
  profile: Profile; avatar: ReactNode; sessions: Session[]; votes: Vote[]; restaurants: Restaurant[]; onEdit?: () => void;
}) {
  const mine = votes.filter(vote => vote.voter_id === profile.id);
  const attended = sessions.filter(session => session.participants.some(p => p.voter_id === profile.id));
  const nameOf = (sessionId: string) => {
    const session = sessions.find(item => item.id === sessionId);
    return restaurants.find(item => item.id === session?.restaurant_id)?.name ?? "Pizzeria";
  };
  const myAverage = mean(mine.map(score));

  // Le preferite: il voto piu alto che hai dato a ogni pizzeria.
  const best = new Map<string, number>();
  for (const vote of mine) {
    const name = nameOf(vote.session_id);
    best.set(name, Math.max(best.get(name) ?? 0, score(vote)));
  }
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);

  // Confronto col gruppo: nelle serate in cui hai votato, il tuo voto contro
  // la media degli altri presenti. Negativo = sei piu severo.
  const gaps = mine.flatMap(vote => {
    const others = votes.filter(other => other.session_id === vote.session_id && other.voter_id !== profile.id);
    const othersMean = mean(others.map(score));
    return othersMean === null ? [] : [score(vote) - othersMean];
  });
  const gap = mean(gaps);
  const groupVotes = votes.filter(vote => vote.voter_id !== profile.id && mine.some(m => m.session_id === vote.session_id));

  return <section className={`page-section ${styles.page}`} aria-label={`Profilo Pizza di ${profile.display_name}`}>
    <ProfileHeader eyebrow="Pizza · profilo" name={profile.display_name} avatar={avatar} onEdit={onEdit}
      pill={attended.length ? <><b>{attended.length}</b> {attended.length === 1 ? "serata" : "serate"} con il gruppo</> : "Nessuna serata ancora"}>
      <StatRow dark stats={[
        { label: "Serate", value: attended.length },
        { label: "Voti dati", value: mine.length },
        { label: "Voto medio", value: one(myAverage), unit: "/10" },
      ]} />
    </ProfileHeader>

    {!mine.length ? <EmptyNote>Quando voti la tua prima serata, qui trovi le tue pizzerie preferite e quanto sei severo rispetto al gruppo.</EmptyNote> : <>
      <ProfileSection title="Come voti">
        <div className={styles.bars}>
          {CRITERIA.map(({ key, label }) => {
            const me = mean(mine.map(vote => vote[key])) ?? 0;
            const group = mean(groupVotes.map(vote => vote[key]));
            return <div className={styles.bar} key={key}>
              <span>{label}</span>
              <span className={styles.track} role="img" aria-label={`${label}: tu ${one(me)}, gruppo ${one(group)}`}>
                <span className={styles.fill} style={{ width: `${me * 10}%` }} />
                {group !== null ? <span className={styles.marker} style={{ left: `${group * 10}%` }} /> : null}
              </span>
              <b>{one(me)}</b>
            </div>;
          })}
          <p className={styles.legend}><span><i data-kind="me" />Il tuo voto medio</span><span><i data-kind="group" />La media degli altri, nelle stesse serate</span></p>
        </div>
      </ProfileSection>

      {gap !== null ? <ProfileSection title="Confronto col gruppo">
        <ul className={styles.list}><li>
          <div><strong>{Math.abs(gap) < 0.25 ? "Voti come il gruppo" : gap < 0 ? "Sei più severo del gruppo" : "Sei più generoso del gruppo"}</strong>
            <small>Differenza media fra il tuo voto e quello degli altri presenti</small></div>
          <b data-tone={gap < -0.25 ? "down" : gap > 0.25 ? "up" : undefined}>{gap > 0 ? "+" : gap < 0 ? "−" : ""}{one(Math.abs(gap))}</b>
        </li></ul>
      </ProfileSection> : null}

      <ProfileSection title="Le tue preferite">
        <ul className={styles.list}>
          {ranked.slice(0, 3).map(([name, value], index) => <li key={name}>
            <div><strong>{index + 1}. {name}</strong><small>Il tuo voto più alto</small></div><b>{one(value)}</b>
          </li>)}
          {ranked.length > 3 ? <li>
            <div><strong>{ranked[ranked.length - 1][0]}</strong><small>La più bocciata da te</small></div><b data-tone="down">{one(ranked[ranked.length - 1][1])}</b>
          </li> : null}
        </ul>
      </ProfileSection>
    </>}
  </section>;
}
