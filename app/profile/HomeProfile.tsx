"use client";

import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase";
import useCodGbs from "../useCodGbs";
import { formatMoney } from "../Cashout";
import { useCashoutSummary } from "./CashoutProfile";
import { oneDecimal, pizzaSummary } from "./PizzaProfile";
import { ProfileHeader, SectionSummary, type Stat } from "./parts";
import styles from "./Profile.module.css";

type Section = "padel" | "pizza" | "gaming" | "cashout";
type PizzaData = Parameters<typeof pizzaSummary>;

// Il profilo della home: chi sei e, sezione per sezione, i tre numeri che
// contano, con il tasto per il profilo completo. I dati del conto (nome,
// foto, password, uscita) stanno qui e solo qui.
export default function HomeProfile({ profile, profiles, avatar, icons, padel, pizzaSessions, pizzaVotes, onOpen, onEdit, onSignOut }: {
  profile: Profile;
  profiles: Profile[];
  avatar: ReactNode;
  icons: Record<Section, ReactNode>;
  padel: { rank: number; rating: string; winRate: number; played: number };
  pizzaSessions: PizzaData[1];
  pizzaVotes: PizzaData[2];
  onOpen: (section: Section) => void;
  onEdit: () => void;
  onSignOut?: () => void;
}) {
  const { gbs, loading: gbLoading } = useCodGbs();
  const cashout = useCashoutSummary(profile, profiles);
  const pizza = pizzaSummary(profile.id, pizzaSessions, pizzaVotes);

  const mw4Games = gbs.filter(gb => gb.status === "processed").flatMap(gb => gb.players.filter(p => p.profile_id === profile.id).map(player => ({ gb, player })));
  const mw4Wins = mw4Games.filter(({ gb, player }) => gb.team1_score !== null && gb.team2_score !== null
    && gb.team1_score !== gb.team2_score && (player.team === 1) === (gb.team1_score > gb.team2_score)).length;
  const kills = mw4Games.reduce((sum, { player }) => sum + player.kills, 0);
  const deaths = mw4Games.reduce((sum, { player }) => sum + player.deaths, 0);

  const padelStats: Stat[] | null = padel.played ? [
    { label: "Posizione", value: padel.rank ? `${padel.rank}°` : "NC" },
    { label: "Elo", value: padel.rating },
    { label: "Vittorie", value: padel.winRate, unit: "%" },
  ] : null;
  const mw4Stats: Stat[] | null = gbLoading ? [{ label: "GB", value: "—" }, { label: "Vittorie", value: "—" }, { label: "K/D", value: "—" }]
    : mw4Games.length ? [
      { label: "GB", value: mw4Games.length },
      { label: "Vittorie", value: mw4Wins },
      { label: "K/D", value: deaths ? (kills / deaths).toFixed(2) : kills ? "∞" : "—" },
    ] : null;
  const pizzaStats: Stat[] | null = pizza.votes ? [
    { label: "Serate", value: pizza.nights },
    { label: "Voti dati", value: pizza.votes },
    { label: "Voto medio", value: oneDecimal(pizza.average), unit: "/10" },
  ] : null;
  const cashoutStats: Stat[] | null = cashout.loading || cashout.groups.length ? [
    { label: "Saldo", value: cashout.loading ? "—" : `${cashout.net > 0.005 ? "+" : cashout.net < -0.005 ? "−" : ""}${formatMoney(cashout.net)}`, tone: cashout.net > 0.005 ? "up" : cashout.net < -0.005 ? "down" : undefined },
    { label: "Anticipato", value: cashout.loading ? "—" : formatMoney(cashout.advanced) },
    { label: "Gruppi", value: cashout.loading ? "—" : cashout.groups.length },
  ] : null;

  const since = profile.created_at ? new Date(profile.created_at).getFullYear() : null;
  return <section className={`page-section ${styles.page}`} aria-label={`Profilo di ${profile.display_name}`}>
    <ProfileHeader eyebrow="Il tuo profilo" name={profile.display_name} avatar={avatar} onEdit={onEdit} editLabel="Modifica nome, foto e dati"
      pill={since ? <>Nei theBoyz dal <b>{since}</b></> : undefined} />
    <SectionSummary title="Padel" icon={icons.padel} stats={padelStats} empty="Non hai ancora giocato una partita." onOpen={() => onOpen("padel")} />
    <SectionSummary title="MW4" icon={icons.gaming} stats={mw4Stats} empty="Nessuna GB registrata." onOpen={() => onOpen("gaming")} />
    <SectionSummary title="Pizza" icon={icons.pizza} stats={pizzaStats} empty="Non hai ancora votato una serata." onOpen={() => onOpen("pizza")} />
    <SectionSummary title="Cashout" icon={icons.cashout} stats={cashoutStats} empty="Non sei in nessun gruppo di spesa." onOpen={() => onOpen("cashout")} />
    <div className={styles.actions}>
      <button type="button" className="button button-ghost" onClick={onEdit}>Modifica nome, foto e dati</button>
      {onSignOut ? <button type="button" className="button button-ghost" onClick={onSignOut}>Esci</button> : null}
    </div>
  </section>;
}
