"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Profile } from "@/lib/supabase";
import { buildCashoutTransfers, fetchCashoutGroups, formatMoney, groupBalances, paidBy, shareOf, type CashoutGroup } from "../Cashout";
import { EmptyNote, ProfileHeader, ProfileSection, StatRow } from "./parts";
import styles from "./Profile.module.css";

const day = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

// Il riepilogo di Cashout per una persona: quanto deve o le devono, verso chi,
// quanto ha anticipato, e cosa e successo di recente. Da qui si apre il
// gruppo giusto per saldare.
export function useCashoutSummary(profile: Profile, profiles: Profile[]) {
  const [groups, setGroups] = useState<CashoutGroup[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetchCashoutGroups().then(result => { if (live) setGroups(result.schemaReady ? result.groups : []); });
    return () => { live = false; };
  }, []);
  const mine = (groups ?? []).filter(group => group.members.some(member => member.profile_id === profile.id));
  const debts = mine.flatMap(group => buildCashoutTransfers(groupBalances(group, profiles))
    .filter(transfer => transfer.fromId === profile.id || transfer.toId === profile.id)
    .map(transfer => ({ group, ...transfer })));
  const owed = debts.filter(debt => debt.toId === profile.id).reduce((sum, debt) => sum + debt.amount, 0);
  const owe = debts.filter(debt => debt.fromId === profile.id).reduce((sum, debt) => sum + debt.amount, 0);
  const advanced = mine.reduce((sum, group) => sum + group.expenses.reduce((total, expense) => total + paidBy(expense, profile.id), 0), 0);
  return { loading: groups === null, groups: mine, debts, net: owed - owe, owed, owe, advanced };
}

export default function CashoutProfile({ profile, profiles, avatar, onOpenGroup, onEdit }: {
  profile: Profile; profiles: Profile[]; avatar: ReactNode; onOpenGroup: (groupId: string) => void; onEdit?: () => void;
}) {
  const summary = useCashoutSummary(profile, profiles);
  const nameOf = (id: string) => profiles.find(item => item.id === id)?.display_name ?? "Qualcuno";
  const history = summary.groups.flatMap(group => [
    ...group.expenses.filter(expense => paidBy(expense, profile.id) || shareOf(expense, profile.id)).map(expense => ({
      id: expense.id, at: expense.created_at, group,
      title: expense.description,
      detail: paidBy(expense, profile.id) ? `Hai anticipato ${formatMoney(paidBy(expense, profile.id))}` : `La tua quota`,
      amount: paidBy(expense, profile.id) - shareOf(expense, profile.id),
    })),
    ...group.settlements.filter(item => item.from_profile_id === profile.id || item.to_profile_id === profile.id).map(item => ({
      id: item.id, at: item.created_at, group,
      title: item.from_profile_id === profile.id ? `Hai saldato ${nameOf(item.to_profile_id)}` : `${nameOf(item.from_profile_id)} ti ha saldato`,
      detail: "Saldo registrato",
      amount: item.from_profile_id === profile.id ? item.amount : -item.amount,
    })),
  ]).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const net = summary.net;
  const settled = Math.abs(net) < 0.005 && !summary.debts.length;

  return <section className={`page-section ${styles.page}`} aria-label={`Profilo Cashout di ${profile.display_name}`}>
    <ProfileHeader eyebrow="Cashout · profilo" name={profile.display_name} avatar={avatar} onEdit={onEdit}
      pill={summary.loading ? "Caricamento…" : settled ? "Sei in pari con tutti" : net > 0 ? <>Ti devono <b>{formatMoney(net)}</b></> : <>Devi <b>{formatMoney(net)}</b></>}>
      <StatRow dark stats={[
        { label: "Saldo", value: summary.loading ? "—" : `${net > 0.005 ? "+" : net < -0.005 ? "−" : ""}${formatMoney(net)}`, tone: net > 0.005 ? "up" : net < -0.005 ? "down" : undefined },
        { label: "Anticipato", value: summary.loading ? "—" : formatMoney(summary.advanced) },
        { label: "Gruppi", value: summary.loading ? "—" : summary.groups.length },
      ]} />
    </ProfileHeader>

    <ProfileSection title="Da saldare">
      {summary.debts.length ? <ul className={styles.list}>
        {summary.debts.map(debt => {
          const iPay = debt.fromId === profile.id;
          return <li key={`${debt.group.id}:${debt.fromId}:${debt.toId}`}>
            <div><strong>{iPay ? `Devi a ${nameOf(debt.toId)}` : `${nameOf(debt.fromId)} ti deve`}</strong><small>{debt.group.name}</small></div>
            <b data-tone={iPay ? "down" : "up"}>{formatMoney(debt.amount)}</b>
            <button type="button" className="button button-ghost" onClick={() => onOpenGroup(debt.group.id)}>{iPay ? "Salda" : "Apri"}</button>
          </li>;
        })}
      </ul> : <EmptyNote>{summary.loading ? "Caricamento dei conti…" : "Nessun conto aperto: sei in pari in tutti i gruppi."}</EmptyNote>}
    </ProfileSection>

    <ProfileSection title="Storico">
      {history.length ? <ul className={styles.list}>
        {history.map(item => <li key={item.id}>
          <div><strong>{item.title}</strong><small>{item.group.name} · {day.format(new Date(item.at))} · {item.detail}</small></div>
          <b data-tone={item.amount > 0.005 ? "up" : item.amount < -0.005 ? "down" : undefined}>{item.amount > 0.005 ? "+" : item.amount < -0.005 ? "−" : ""}{formatMoney(item.amount)}</b>
        </li>)}
      </ul> : <EmptyNote>{summary.loading ? "Caricamento…" : "Non hai ancora spese o saldi registrati."}</EmptyNote>}
    </ProfileSection>
  </section>;
}
