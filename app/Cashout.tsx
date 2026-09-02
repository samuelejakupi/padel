"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { type Profile, supabase } from "@/lib/supabase";

type CashoutMember = { group_id: string; profile_id: string; joined_at: string };
type CashoutPayer = { expense_id: string; profile_id: string; amount: number };
type CashoutShare = {
  expense_id: string;
  profile_id: string;
  amount: number;
};
type CashoutSettlement = {
  id: string;
  group_id: string;
  from_profile_id: string;
  to_profile_id: string;
  amount: number;
  created_by: string;
  created_at: string;
};
type CashoutExpense = {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  created_by: string;
  created_at: string;
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
  settlements: CashoutSettlement[];
};

async function fetchCashoutGroups() {
  if (!supabase) return { groups: [] as CashoutGroup[], schemaReady: false };
  const { data, error } = await supabase
    .from("cashout_groups")
    .select("id, name, created_by, created_at, members:cashout_group_members(group_id, profile_id, joined_at), expenses:cashout_expenses(id, group_id, description, amount, created_by, created_at, payers:cashout_expense_payers(expense_id, profile_id, amount), shares:cashout_expense_shares(expense_id, profile_id, amount)), settlements:cashout_settlements(id, group_id, from_profile_id, to_profile_id, amount, created_by, created_at)")
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
    settlements: [...(group.settlements ?? [])]
      .map((settlement) => ({ ...settlement, amount: Number(settlement.amount) }))
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
type CashoutBalance = { profile: Profile; balance: number };
type CashoutTransfer = { fromId: string; toId: string; amount: number };

function buildCashoutTransfers(balances: CashoutBalance[]): CashoutTransfer[] {
  const debtors = balances
    .map(({ profile, balance }) => ({ id: profile.id, cents: Math.max(0, -Math.round(balance * 100)) }))
    .filter((item) => item.cents > 0);
  const creditors = balances
    .map(({ profile, balance }) => ({ id: profile.id, cents: Math.max(0, Math.round(balance * 100)) }))
    .filter((item) => item.cents > 0);
  const transfers: CashoutTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const cents = Math.min(debtor.cents, creditor.cents);
    if (cents > 0) transfers.push({ fromId: debtor.id, toId: creditor.id, amount: cents / 100 });
    debtor.cents -= cents;
    creditor.cents -= cents;
    if (debtor.cents === 0) debtorIndex += 1;
    if (creditor.cents === 0) creditorIndex += 1;
  }
  return transfers;
}

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

function CashoutSettlementModal({
  group,
  profiles,
  transfer,
  onClose,
  onCreated,
}: {
  group: CashoutGroup;
  profiles: Profile[];
  transfer: CashoutTransfer;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const memberProfiles = profiles.filter((profile) => group.members.some((member) => member.profile_id === profile.id));
  const [fromId, setFromId] = useState(transfer.fromId);
  const [toId, setToId] = useState(transfer.toId);
  const [amount, setAmount] = useState(transfer.amount.toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const numeric = numericAmount(amount);
    if (fromId === toId) return setError("Pagatore e destinatario devono essere persone diverse.");
    if (!Number.isFinite(numeric) || numeric <= 0) return setError("Inserisci un importo valido.");
    setBusy(true);
    setError("");
    const { error: saveError } = await supabase.rpc("record_cashout_settlement", {
      p_group_id: group.id,
      p_from_profile_id: fromId,
      p_to_profile_id: toId,
      p_amount: numeric,
    });
    setBusy(false);
    if (saveError) return setError(saveError.message);
    await onCreated();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal cashout-modal cashout-settlement-modal" role="dialog" aria-modal="true" aria-labelledby="cashout-settlement-title">
        <div className="modal-head">
          <div><p className="eyebrow dark">REGISTRA SALDO</p><h2 id="cashout-settlement-title">Chi ha pagato chi?</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="cashout-settlement-fields">
            <label>Chi ha saldato<select value={fromId} onChange={(event) => setFromId(event.target.value)}>{memberProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.display_name}</option>)}</select></label>
            <label>Verso chi<select value={toId} onChange={(event) => setToId(event.target.value)}>{memberProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.display_name}</option>)}</select></label>
            <label>Importo (€)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          </div>
          <p className="cashout-settlement-note">Il pagamento aggiorna il saldo complessivo del gruppo, non una singola spesa.</p>
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button className="button button-ghost" type="button" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Registrazione…" : "Conferma saldo"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CashoutGroupDetail({
  group,
  profiles,
  onBack,
  onNewExpense,
  onSettle,
}: {
  group: CashoutGroup;
  profiles: Profile[];
  onBack: () => void;
  onNewExpense: () => void;
  onSettle: (transfer: CashoutTransfer) => void;
}) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const memberProfiles = group.members.map((member) => profileMap.get(member.profile_id)).filter(Boolean) as Profile[];
  const total = group.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const balances = memberProfiles.map((profile) => {
    const paid = group.expenses.reduce((sum, expense) => sum + paidBy(expense, profile.id), 0);
    const share = group.expenses.reduce((sum, expense) => sum + shareOf(expense, profile.id), 0);
    const sent = group.settlements.reduce((sum, settlement) => sum + (settlement.from_profile_id === profile.id ? settlement.amount : 0), 0);
    const received = group.settlements.reduce((sum, settlement) => sum + (settlement.to_profile_id === profile.id ? settlement.amount : 0), 0);
    return { profile, balance: paid - share + sent - received };
  });
  const transfers = buildCashoutTransfers(balances);
  const openAmount = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);

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
        <article><small>SALDI REGISTRATI</small><b>{group.settlements.length}</b></article>
      </div>

      <section className="cashout-report">
        <div className="section-head"><div className="section-head-label"><p className="eyebrow dark">RESOCONTO</p><h2>Situazione del gruppo</h2></div></div>
        <div className="cashout-balance-list">
          {balances.map(({ profile, balance }) => (
            <article key={profile.id}>
              <CashoutAvatar profile={profile} />
              <div><b>{profile.display_name}</b><span>{balance > 0.005 ? `Deve ricevere ${formatMoney(balance)}` : balance < -0.005 ? `Deve pagare ${formatMoney(balance)}` : "In pari"}</span></div>
              <strong className={balance > 0.005 ? "is-credit" : balance < -0.005 ? "is-debt" : ""}>{balance > 0.005 ? "+" : balance < -0.005 ? "−" : ""}{formatMoney(balance)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="cashout-settlement-report">
        <div className="section-head"><div className="section-head-label"><p className="eyebrow dark">SALDI</p><h2>Chi deve pagare chi</h2></div><span>{transfers.length}</span></div>
        {transfers.length ? <div className="cashout-transfer-list">{transfers.map((transfer) => (
          <article key={`${transfer.fromId}:${transfer.toId}`}>
            <div className="cashout-transfer-people"><CashoutAvatar profile={profileMap.get(transfer.fromId)} /><b>{profileMap.get(transfer.fromId)?.display_name}</b><span>deve</span><CashoutAvatar profile={profileMap.get(transfer.toId)} /><b>{profileMap.get(transfer.toId)?.display_name}</b></div>
            <strong>{formatMoney(transfer.amount)}</strong>
            <button className="button button-primary" type="button" onClick={() => onSettle(transfer)}>Segna saldato</button>
          </article>
        ))}</div> : <p className="cashout-all-settled">Tutti i conti del gruppo sono in pari.</p>}
        {group.settlements.length ? <div className="cashout-settlement-history"><small>PAGAMENTI REGISTRATI</small>{group.settlements.map((settlement) => <p key={settlement.id}><b>{profileMap.get(settlement.from_profile_id)?.display_name}</b> ha pagato <b>{profileMap.get(settlement.to_profile_id)?.display_name}</b><span>{formatMoney(settlement.amount)}</span></p>)}</div> : null}
      </section>

      <section className="cashout-expenses">
        <div className="section-head"><div className="section-head-label"><p className="eyebrow dark">REGISTRO</p><h2>Spese</h2></div><span>{group.expenses.length}</span></div>
        {group.expenses.length ? (
          <div className="cashout-expense-list">
            {group.expenses.map((expense) => {
              return (
                <article className="cashout-expense-card" key={expense.id}>
                  <header>
                    <div><span className="cashout-expense-state">SPESA</span><h3>{expense.description}</h3><small>{new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(expense.created_at))} · inserita da {profileMap.get(expense.created_by)?.display_name ?? "—"}</small></div>
                    <b>{formatMoney(expense.amount)}</b>
                  </header>
                  <div className="cashout-paid-by">
                    <small>ANTICIPATO DA</small>
                    {expense.payers.map((payer) => <span key={payer.profile_id}><CashoutAvatar profile={profileMap.get(payer.profile_id)} />{profileMap.get(payer.profile_id)?.display_name} <b>{formatMoney(payer.amount)}</b></span>)}
                  </div>
                  <div className="cashout-paid-by cashout-charged-to">
                    <small>PER CONTO DI</small>
                    {expense.shares.map((share) => <span key={share.profile_id}><CashoutAvatar profile={profileMap.get(share.profile_id)} />{profileMap.get(share.profile_id)?.display_name} <b>{formatMoney(share.amount)}</b></span>)}
                  </div>
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
  const [settlementTransfer, setSettlementTransfer] = useState<CashoutTransfer | null>(null);
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

  if (selectedGroup) return (
    <>
      {notice ? <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}
      <CashoutGroupDetail group={selectedGroup} profiles={profiles} onBack={() => setSelectedId(null)} onNewExpense={() => setShowExpenseCreate(true)} onSettle={setSettlementTransfer} />
      {showExpenseCreate ? <CashoutExpenseModal group={selectedGroup} profiles={profiles} viewerId={viewerId} onClose={() => setShowExpenseCreate(false)} onCreated={async () => { setShowExpenseCreate(false); await loadGroups(); }} /> : null}
      {settlementTransfer ? <CashoutSettlementModal group={selectedGroup} profiles={profiles} transfer={settlementTransfer} onClose={() => setSettlementTransfer(null)} onCreated={async () => { setSettlementTransfer(null); await loadGroups(); }} /> : null}
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
                const rawBalances = group.members.map((member) => ({
                  profile: profiles.find((profile) => profile.id === member.profile_id),
                  balance: group.expenses.reduce((sum, expense) => sum + paidBy(expense, member.profile_id) - shareOf(expense, member.profile_id), 0)
                    + group.settlements.reduce((sum, settlement) => sum + (settlement.from_profile_id === member.profile_id ? settlement.amount : 0) - (settlement.to_profile_id === member.profile_id ? settlement.amount : 0), 0),
                })).filter((item): item is CashoutBalance => Boolean(item.profile));
                const open = buildCashoutTransfers(rawBalances).length;
                return (
                  <button className="cashout-group-card" type="button" onClick={() => setSelectedId(group.id)} key={group.id}>
                    <span className="cashout-group-icon">€</span>
                    <div><small>{open ? `${open} ${open === 1 ? "SALDO APERTO" : "SALDI APERTI"}` : "TUTTO SALDATO"}</small><h2>{group.name}</h2><span>{group.members.length} partecipanti · {group.expenses.length} spese</span></div>
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
