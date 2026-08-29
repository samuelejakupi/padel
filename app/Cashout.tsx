"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { type Profile, supabase } from "@/lib/supabase";

type CashoutMember = { group_id: string; profile_id: string; joined_at: string };
type CashoutPayer = { expense_id: string; profile_id: string; amount: number };
type CashoutShare = {
  expense_id: string;
  profile_id: string;
  amount: number;
  settled_at: string | null;
  settled_by: string | null;
};
type CashoutExpense = {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  created_by: string;
  created_at: string;
  closed_at: string | null;
  payers: CashoutPayer[];
  shares: CashoutShare[];
};
type CashoutGroup = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  members: CashoutMember[];
  expenses: CashoutExpense[];
};

async function fetchCashoutGroups() {
  if (!supabase) return { groups: [] as CashoutGroup[], schemaReady: false };
  const { data, error } = await supabase
    .from("cashout_groups")
    .select("id, name, created_by, created_at, members:cashout_group_members(group_id, profile_id, joined_at), expenses:cashout_expenses(id, group_id, description, amount, created_by, created_at, closed_at, payers:cashout_expense_payers(expense_id, profile_id, amount), shares:cashout_expense_shares(expense_id, profile_id, amount, settled_at, settled_by))")
    .order("created_at", { ascending: false });
  if (error) return { groups: [] as CashoutGroup[], schemaReady: false };
  const groups = ((data ?? []) as unknown as CashoutGroup[]).map((group) => ({
    ...group,
    expenses: [...(group.expenses ?? [])]
      .map((expense) => ({
        ...expense,
        amount: Number(expense.amount),
        payers: (expense.payers ?? []).map((payer) => ({ ...payer, amount: Number(payer.amount) })),
        shares: (expense.shares ?? []).map((share) => ({ ...share, amount: Number(share.amount) })),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
  return { groups, schemaReady: true };
}

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const formatMoney = (value: number) => euro.format(Math.abs(value));
const numericAmount = (value: string) => Math.round(Number(value.replace(",", ".")) * 100) / 100;
const paidBy = (expense: CashoutExpense, profileId: string) => (
  expense.payers.find((payer) => payer.profile_id === profileId)?.amount ?? 0
);
const shareOf = (expense: CashoutExpense, profileId: string) => (
  expense.shares.find((share) => share.profile_id === profileId)?.amount ?? 0
);
const debtOf = (expense: CashoutExpense, profileId: string) => (
  Math.max(0, shareOf(expense, profileId) - paidBy(expense, profileId))
);

function CashoutAvatar({ profile }: { profile?: Profile }) {
  const initials = (profile?.display_name ?? "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cashout-avatar" src={profile.avatar_url} alt="" />
  ) : <span className="cashout-avatar cashout-avatar-fallback">{initials}</span>;
}

function CashoutMemberPicker({
  profiles,
  selected,
  lockedId,
  onToggle,
  legend,
}: {
  profiles: Profile[];
  selected: string[];
  lockedId?: string;
  onToggle: (profileId: string) => void;
  legend: string;
}) {
  return (
    <fieldset className="cashout-member-picker">
      <legend>{legend}</legend>
      <div>
        {profiles.map((profile) => {
          const checked = selected.includes(profile.id);
          return (
            <label className={checked ? "is-selected" : ""} key={profile.id}>
              <input
                type="checkbox"
                checked={checked}
                disabled={profile.id === lockedId}
                onChange={() => onToggle(profile.id)}
              />
              <CashoutAvatar profile={profile} />
              <span>{profile.display_name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function CashoutGroupModal({
  profiles,
  viewerId,
  onClose,
  onCreated,
}: {
  profiles: Profile[];
  viewerId: string;
  onClose: () => void;
  onCreated: (groupId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState([viewerId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(profileId: string) {
    setMembers((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : [...current, profileId]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (name.trim().length < 2) return setError("Dai un nome al gruppo.");
    if (members.length < 2) return setError("Scegli almeno due partecipanti.");
    setBusy(true);
    setError("");
    const { data, error: saveError } = await supabase.rpc("create_cashout_group", {
      p_name: name.trim(),
      p_member_ids: members,
    });
    setBusy(false);
    if (saveError) return setError(saveError.message);
    await onCreated(data as string);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal cashout-modal" role="dialog" aria-modal="true" aria-labelledby="cashout-group-title">
        <div className="modal-head">
          <div><p className="eyebrow dark">NUOVO GRUPPO</p><h2 id="cashout-group-title">Per cosa spendiamo?</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          <label>Nome<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Vacanza Mykonos" autoFocus /></label>
          <CashoutMemberPicker profiles={profiles} selected={members} lockedId={viewerId} onToggle={toggle} legend="Partecipanti" />
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button className="button button-ghost" type="button" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Creazione…" : "Crea gruppo"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CashoutExpenseModal({
  group,
  profiles,
  viewerId,
  onClose,
  onCreated,
}: {
  group: CashoutGroup;
  profiles: Profile[];
  viewerId: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const memberProfiles = profiles.filter((profile) => group.members.some((member) => member.profile_id === profile.id));
  const memberIds = memberProfiles.map((profile) => profile.id);
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [participants, setParticipants] = useState(memberIds);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({ [viewerId]: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const payerIds = Object.keys(payerAmounts);

  function changeTotal(value: string) {
    setTotal(value);
    if (payerIds.length === 1) setPayerAmounts({ [payerIds[0]]: value });
  }

  function toggleParticipant(profileId: string) {
    setParticipants((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : [...current, profileId]);
  }

  function togglePayer(profileId: string) {
    setPayerAmounts((current) => {
      if (profileId in current) {
        const next = Object.fromEntries(Object.entries(current).filter(([id]) => id !== profileId));
        const remaining = Object.keys(next);
        if (remaining.length === 1) next[remaining[0]] = total;
        return next;
      }
      return { ...current, [profileId]: "" };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const amount = numericAmount(total);
    const payers = Object.entries(payerAmounts).map(([profile_id, value]) => ({ profile_id, amount: numericAmount(value) }));
    const paidTotal = payers.reduce((sum, payer) => sum + Math.round(payer.amount * 100), 0) / 100;
    if (description.trim().length < 2) return setError("Inserisci una descrizione.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Inserisci un totale valido.");
    if (!participants.length) return setError("Scegli almeno una persona a cui addebitare la spesa.");
    if (!payers.length || payers.some((payer) => !Number.isFinite(payer.amount) || payer.amount <= 0)) return setError("Inserisci chi ha pagato e quanto.");
    if (Math.round(paidTotal * 100) !== Math.round(amount * 100)) return setError("Gli anticipi devono sommare esattamente al totale.");

    setBusy(true);
    setError("");
    const { error: saveError } = await supabase.rpc("create_cashout_expense", {
      p_group_id: group.id,
      p_description: description.trim(),
      p_total: amount,
      p_payers: payers,
      p_participant_ids: participants,
    });
    setBusy(false);
    if (saveError) return setError(saveError.message);
    await onCreated();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal cashout-modal cashout-expense-modal" role="dialog" aria-modal="true" aria-labelledby="cashout-expense-title">
        <div className="modal-head">
          <div><p className="eyebrow dark">{group.name}</p><h2 id="cashout-expense-title">Aggiungi una spesa</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="cashout-main-fields">
            <label>Descrizione<input value={description} maxLength={120} onChange={(event) => setDescription(event.target.value)} placeholder="Spesa supermercato" autoFocus /></label>
            <label>Totale (€)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={total} onChange={(event) => changeTotal(event.target.value)} placeholder="0,00" /></label>
          </div>

          <fieldset className="cashout-payer-picker">
            <legend>Chi ha anticipato?</legend>
            <div>
              {memberProfiles.map((profile) => {
                const selected = profile.id in payerAmounts;
                return (
                  <div className={selected ? "cashout-payer-row is-selected" : "cashout-payer-row"} key={profile.id}>
                    <label>
                      <input type="checkbox" checked={selected} onChange={() => togglePayer(profile.id)} />
                      <CashoutAvatar profile={profile} />
                      <span>{profile.display_name}</span>
                    </label>
                    {selected ? <input aria-label={`Anticipo di ${profile.display_name}`} type="number" min="0.01" step="0.01" inputMode="decimal" value={payerAmounts[profile.id]} onChange={(event) => setPayerAmounts((current) => ({ ...current, [profile.id]: event.target.value }))} placeholder="0,00" /> : null}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <CashoutMemberPicker profiles={memberProfiles} selected={participants} onToggle={toggleParticipant} legend="A chi va addebitata?" />
          {Number.isFinite(numericAmount(total)) && numericAmount(total) > 0 && participants.length ? (
            <p className="cashout-live-split">Quota media attuale <b>{formatMoney(numericAmount(total) / participants.length)}</b> a persona</p>
          ) : null}
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button className="button button-ghost" type="button" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Salvataggio…" : "Salva spesa"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CashoutGroupDetail({
  group,
  profiles,
  viewerId,
  busyShare,
  onBack,
  onNewExpense,
  onToggleSettled,
}: {
  group: CashoutGroup;
  profiles: Profile[];
  viewerId: string;
  busyShare: string | null;
  onBack: () => void;
  onNewExpense: () => void;
  onToggleSettled: (expenseId: string, profileId: string, settled: boolean) => Promise<void>;
}) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const memberProfiles = group.members.map((member) => profileMap.get(member.profile_id)).filter(Boolean) as Profile[];
  const total = group.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const openAmount = group.expenses.reduce((sum, expense) => sum + expense.shares.reduce((expenseSum, share) => (
    expenseSum + (!share.settled_at ? debtOf(expense, share.profile_id) : 0)
  ), 0), 0);
  const closedCount = group.expenses.filter((expense) => expense.closed_at).length;
  const balances = memberProfiles.map((profile) => {
    const paid = group.expenses.reduce((sum, expense) => sum + paidBy(expense, profile.id), 0);
    const share = group.expenses.reduce((sum, expense) => sum + shareOf(expense, profile.id), 0);
    return { profile, paid, share, balance: paid - share };
  });

  return (
    <section className="page-section cashout-page cashout-detail-page">
      <button className="cashout-back" type="button" onClick={onBack}>← Tutti i gruppi</button>
      <article className="section-hero cashout-hero cashout-detail-hero">
        <div>
          <p className="eyebrow">GRUPPO DI SPESA</p>
          <h1>{group.name}</h1>
          <div className="cashout-member-stack">{memberProfiles.map((profile) => <CashoutAvatar profile={profile} key={profile.id} />)}<span>{memberProfiles.length} partecipanti</span></div>
        </div>
        <button className="button button-primary cashout-new-expense" type="button" onClick={onNewExpense}>+ Nuova spesa</button>
      </article>

      <div className="cashout-summary-grid">
        <article><small>TOTALE SPESO</small><b>{formatMoney(total)}</b></article>
        <article><small>DA SALDARE</small><b>{formatMoney(openAmount)}</b></article>
        <article><small>SPESE CHIUSE</small><b>{closedCount}/{group.expenses.length}</b></article>
      </div>

      <section className="cashout-report">
        <div className="section-head"><div className="section-head-label"><p className="eyebrow dark">RESOCONTO</p><h2>Situazione del gruppo</h2></div></div>
        <div className="cashout-balance-list">
          {balances.map(({ profile, paid, share, balance }) => (
            <article key={profile.id}>
              <CashoutAvatar profile={profile} />
              <div><b>{profile.display_name}</b><span>Pagato {formatMoney(paid)} · Quota {formatMoney(share)}</span></div>
              <strong className={balance > 0.005 ? "is-credit" : balance < -0.005 ? "is-debt" : ""}>{balance > 0.005 ? "+" : balance < -0.005 ? "−" : ""}{formatMoney(balance)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="cashout-expenses">
        <div className="section-head"><div className="section-head-label"><p className="eyebrow dark">REGISTRO</p><h2>Spese</h2></div><span>{group.expenses.length}</span></div>
        {group.expenses.length ? (
          <div className="cashout-expense-list">
            {group.expenses.map((expense) => {
              const debtors = expense.shares.filter((share) => debtOf(expense, share.profile_id) > 0.005);
              const canSettle = expense.created_by === viewerId;
              return (
                <article className={`cashout-expense-card${expense.closed_at ? " is-closed" : ""}`} key={expense.id}>
                  <header>
                    <div><span className="cashout-expense-state">{expense.closed_at ? "SALDATA" : "APERTA"}</span><h3>{expense.description}</h3><small>{new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(expense.created_at))} · inserita da {profileMap.get(expense.created_by)?.display_name ?? "—"}</small></div>
                    <b>{formatMoney(expense.amount)}</b>
                  </header>
                  <div className="cashout-paid-by">
                    <small>PAGATO DA</small>
                    {expense.payers.map((payer) => <span key={payer.profile_id}><CashoutAvatar profile={profileMap.get(payer.profile_id)} />{profileMap.get(payer.profile_id)?.display_name} <b>{formatMoney(payer.amount)}</b></span>)}
                  </div>
                  {debtors.length ? (
                    <div className="cashout-debtors">
                      <small>CHI DEVE SALDARE</small>
                      {debtors.map((share) => {
                        const settled = Boolean(share.settled_at);
                        const key = `${expense.id}:${share.profile_id}`;
                        return (
                          <button
                            className={settled ? "is-settled" : ""}
                            type="button"
                            disabled={!canSettle || busyShare === key}
                            onClick={() => onToggleSettled(expense.id, share.profile_id, !settled)}
                            title={canSettle ? "Aggiorna il saldo" : "Può aggiornarlo chi ha creato la spesa"}
                            key={share.profile_id}
                          >
                            <i aria-hidden="true">{settled ? "✓" : ""}</i>
                            <span>{profileMap.get(share.profile_id)?.display_name}<small>{formatMoney(debtOf(expense, share.profile_id))}</small></span>
                          </button>
                        );
                      })}
                    </div>
                  ) : <p className="cashout-no-debt">Nessun debito su questa spesa.</p>}
                </article>
              );
            })}
          </div>
        ) : <div className="compact-empty"><span>00</span><p>Non ci sono ancora spese. Aggiungi la prima quando qualcuno anticipa.</p></div>}
      </section>
    </section>
  );
}

export default function CashoutPage({ profiles, viewerId }: { profiles: Profile[]; viewerId: string }) {
  const [groups, setGroups] = useState<CashoutGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [showExpenseCreate, setShowExpenseCreate] = useState(false);
  const [busyShare, setBusyShare] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const loadGroups = useCallback(async () => {
    const result = await fetchCashoutGroups();
    setLoading(false);
    setSchemaReady(result.schemaReady);
    setGroups(result.groups);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchCashoutGroups().then((result) => {
      if (!active) return;
      setLoading(false);
      setSchemaReady(result.schemaReady);
      setGroups(result.groups);
    });
    return () => { active = false; };
  }, []);
  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId]);

  async function toggleSettled(expenseId: string, profileId: string, settled: boolean) {
    if (!supabase) return;
    const key = `${expenseId}:${profileId}`;
    setBusyShare(key);
    const { error } = await supabase.rpc("set_cashout_share_settled", {
      p_expense_id: expenseId,
      p_profile_id: profileId,
      p_settled: settled,
    });
    setBusyShare(null);
    if (error) return setNotice(error.message);
    await loadGroups();
  }

  if (selectedGroup) return (
    <>
      {notice ? <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}
      <CashoutGroupDetail group={selectedGroup} profiles={profiles} viewerId={viewerId} busyShare={busyShare} onBack={() => setSelectedId(null)} onNewExpense={() => setShowExpenseCreate(true)} onToggleSettled={toggleSettled} />
      {showExpenseCreate ? <CashoutExpenseModal group={selectedGroup} profiles={profiles} viewerId={viewerId} onClose={() => setShowExpenseCreate(false)} onCreated={async () => { setShowExpenseCreate(false); await loadGroups(); }} /> : null}
    </>
  );

  return (
    <>
      <section className="page-section cashout-page">
        <article className="section-hero cashout-hero">
          <div><p className="eyebrow">THEBOYZ CASH OUT</p><h1>Spese condivise,<br />conti chiari.</h1><p>Vacanze, grigliate e serate: si registra chi ha anticipato e l’app divide il resto.</p></div>
          <button className="button button-primary cashout-new-group" type="button" disabled={!schemaReady} onClick={() => setShowGroupCreate(true)}>+ Nuovo gruppo</button>
        </article>

        {!schemaReady ? (
          <div className="compact-empty cashout-schema-empty"><span>!</span><div><h2>Cash Out va attivato</h2><p>Esegui <code>supabase/migration-cashout.sql</code> nel SQL Editor di Supabase.</p></div></div>
        ) : loading ? <div className="compact-empty"><span>…</span><p>Caricamento gruppi di spesa.</p></div> : groups.length ? (
          <section className="cashout-groups-section">
            <div className="section-head"><div className="section-head-label"><p className="eyebrow dark">I TUOI GRUPPI</p><h2>Dove sono finiti i soldi</h2></div><span>{groups.length}</span></div>
            <div className="cashout-group-grid">
              {groups.map((group) => {
                const total = group.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
                const open = group.expenses.filter((expense) => !expense.closed_at).length;
                return (
                  <button className="cashout-group-card" type="button" onClick={() => setSelectedId(group.id)} key={group.id}>
                    <span className="cashout-group-icon">€</span>
                    <div><small>{open ? `${open} ${open === 1 ? "SPESA APERTA" : "SPESE APERTE"}` : "TUTTO SALDATO"}</small><h2>{group.name}</h2><span>{group.members.length} partecipanti · {group.expenses.length} spese</span></div>
                    <b>{formatMoney(total)}</b>
                    <i aria-hidden="true">→</i>
                  </button>
                );
              })}
            </div>
          </section>
        ) : <div className="compact-empty cashout-first-empty"><span>00</span><div><h2>Nessun gruppo di spesa</h2><p>Crea “Grigliata” o “Vacanza Mykonos”, scegli chi partecipa e poi aggiungi le spese.</p></div></div>}
      </section>
      {showGroupCreate ? <CashoutGroupModal profiles={profiles} viewerId={viewerId} onClose={() => setShowGroupCreate(false)} onCreated={async (groupId) => { setShowGroupCreate(false); await loadGroups(); setSelectedId(groupId); }} /> : null}
    </>
  );
}
