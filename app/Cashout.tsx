"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { type Profile, supabase } from "@/lib/supabase";

type CashoutMember = { group_id: string; profile_id: string; joined_at: string };
type CashoutPayer = { expense_id: string; profile_id: string; amount: number };
type CashoutShare = {
  expense_id: string;
  profile_id: string;
  amount: number;
};
export type CashoutSettlement = {
  id: string;
  group_id: string;
  from_profile_id: string;
  to_profile_id: string;
  amount: number;
  created_by: string;
  created_at: string;
};
export type CashoutExpense = {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  created_by: string;
  created_at: string;
  payers: CashoutPayer[];
  shares: CashoutShare[];
};

// Cashout vive nel contenitore mobile che scorre. I dialoghi devono invece
// stare sopra la navigazione, non ereditare il suo ritaglio/stacking context.
function CashoutDialogPortal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

export type CashoutGroup = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  members: CashoutMember[];
  expenses: CashoutExpense[];
  settlements: CashoutSettlement[];
};

export async function fetchCashoutGroups() {
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
export const formatMoney = (value: number) => euro.format(Math.abs(value));
const numericAmount = (value: string) => Math.round(Number(value.trim().replace(",", ".")) * 100) / 100;
// PayPal.Me documenta l'importo nel percorso, ma alcune versioni dell'app
// mobile aprono soltanto il profilo. Il tap copia quindi anche l'importo: il
// percorso resta utile sul web e il valore è pronto da incollare nell'app.
const paypalMeUrl = (username: string, amount: number) => (
  `https://www.paypal.me/${username}/${amount.toFixed(2)}`
);
const paypalClipboardAmount = (amount: number) => amount.toFixed(2).replace(".", ",");

function copyPayPalAmount(amount: number) {
  const value = paypalClipboardAmount(amount);

  // Il fallback sincrono parte nello stesso gesto del tap ed è ancora utile
  // nelle web app iOS dove Clipboard API può non essere disponibile.
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  document.execCommand("copy");
  textarea.remove();

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value).catch(() => undefined);
  }
}
export const paidBy = (expense: CashoutExpense, profileId: string) => (
  expense.payers.find((payer) => payer.profile_id === profileId)?.amount ?? 0
);
export const shareOf = (expense: CashoutExpense, profileId: string) => (
  expense.shares.find((share) => share.profile_id === profileId)?.amount ?? 0
);
export type CashoutBalance = { profile: Profile; balance: number };
export type CashoutTransfer = { fromId: string; toId: string; amount: number };

export function buildCashoutTransfers(balances: CashoutBalance[]): CashoutTransfer[] {
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

// Il saldo di ognuno in un gruppo: pagato meno la sua quota, piu i saldi
// mandati, meno quelli ricevuti. Positivo = deve ricevere. Lo usano la pagina
// del gruppo, l'elenco dei gruppi e il profilo Cashout.
export function groupBalances(group: CashoutGroup, profiles: Profile[]): CashoutBalance[] {
  return group.members.map((member) => ({
    profile: profiles.find((profile) => profile.id === member.profile_id),
    balance: group.expenses.reduce((sum, expense) => sum + paidBy(expense, member.profile_id) - shareOf(expense, member.profile_id), 0)
      + group.settlements.reduce((sum, settlement) => sum + (settlement.from_profile_id === member.profile_id ? settlement.amount : 0) - (settlement.to_profile_id === member.profile_id ? settlement.amount : 0), 0),
  })).filter((item): item is CashoutBalance => Boolean(item.profile));
}

// Uno scontrino, per i riquadri vuoti: al posto del vecchio "00".
function ReceiptGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-1.2-.8-1.2.8-2.4-1.6L6 20.5Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  );
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
  groups,
  initialGroupId,
  profiles,
  viewerId,
  onClose,
  onCreated,
}: {
  groups: CashoutGroup[];
  initialGroupId: string;
  profiles: Profile[];
  viewerId: string;
  onClose: () => void;
  onCreated: (groupId: string) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(initialGroupId);
  const group = groups.find((item) => item.id === groupId) ?? groups[0];
  const memberProfiles = profiles.filter((profile) => group.members.some((member) => member.profile_id === profile.id));
  const memberIds = memberProfiles.map((profile) => profile.id);
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [participants, setParticipants] = useState(memberIds);
  // Quasi sempre paga una persona sola, e di solito chi inserisce la spesa:
  // e il caso di partenza. Piu pagatori si aprono da un link.
  const [payerId, setPayerId] = useState(memberIds.includes(viewerId) ? viewerId : memberIds[0]);
  const [splitPayers, setSplitPayers] = useState(false);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function chooseGroup(id: string) {
    const next = groups.find((item) => item.id === id);
    if (!next) return;
    const ids = next.members.map((member) => member.profile_id);
    setGroupId(id);
    setParticipants(ids);
    setPayerId(ids.includes(viewerId) ? viewerId : ids[0]);
    setPayerAmounts({});
  }

  function toggleParticipant(profileId: string) {
    setParticipants((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : [...current, profileId]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const amount = numericAmount(total);
    const payers = splitPayers
      ? Object.entries(payerAmounts).filter(([, value]) => value.trim()).map(([profile_id, value]) => ({ profile_id, amount: numericAmount(value) }))
      : [{ profile_id: payerId, amount }];
    const paidTotal = payers.reduce((sum, payer) => sum + Math.round(payer.amount * 100), 0) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return setError("Scrivi quanto avete speso.");
    if (description.trim().length < 2) return setError("Scrivi per cosa, es. «Cena».");
    if (!participants.length) return setError("Scegli almeno una persona fra cui dividere.");
    if (!payers.length || payers.some((payer) => !Number.isFinite(payer.amount) || payer.amount <= 0)) return setError("Scrivi chi ha pagato e quanto.");
    if (Math.round(paidTotal * 100) !== Math.round(amount * 100)) return setError(`Gli importi pagati fanno ${formatMoney(paidTotal)}: devono fare ${formatMoney(amount)}.`);

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
    await onCreated(group.id);
  }

  const amount = numericAmount(total);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal cashout-modal cashout-expense-modal" role="dialog" aria-modal="true" aria-labelledby="cashout-expense-title">
        <div className="modal-head">
          <div><p className="eyebrow dark">NUOVA SPESA</p><h2 id="cashout-expense-title">Quanto avete speso?</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          {/* Prima l'importo, grande: e la cosa che si ha in testa. Testo e
              non number: cosi la virgola funziona su ogni tastiera. */}
          <label className="cashout-amount-field">Importo
            <span><input value={total} inputMode="decimal" autoFocus placeholder="0,00" aria-describedby="cashout-split-note"
              onChange={(event) => setTotal(event.target.value.replace(/[^0-9.,]/g, ""))} /><b aria-hidden="true">€</b></span>
          </label>
          <label>Per cosa<input value={description} maxLength={120} onChange={(event) => setDescription(event.target.value)} placeholder="Cena, benzina, spesa…" /></label>
          {groups.length > 1 ? (
            <label>Gruppo<select value={group.id} onChange={(event) => chooseGroup(event.target.value)}>
              {groups.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select></label>
          ) : null}

          <fieldset className="cashout-chip-picker">
            <legend>Ha pagato</legend>
            {splitPayers ? (
              <div className="cashout-payer-split">
                {memberProfiles.map((profile) => (
                  <label key={profile.id}><CashoutAvatar profile={profile} /><span>{profile.display_name}</span>
                    <input aria-label={`Quanto ha pagato ${profile.display_name}`} inputMode="decimal" placeholder="0,00" value={payerAmounts[profile.id] ?? ""}
                      onChange={(event) => setPayerAmounts((current) => ({ ...current, [profile.id]: event.target.value.replace(/[^0-9.,]/g, "") }))} />
                  </label>
                ))}
              </div>
            ) : (
              <div>
                {memberProfiles.map((profile) => (
                  <label className={payerId === profile.id ? "is-selected" : ""} key={profile.id}>
                    <input type="radio" name="cashout-payer" checked={payerId === profile.id} onChange={() => setPayerId(profile.id)} />
                    <CashoutAvatar profile={profile} /><span>{profile.id === viewerId ? "Io" : profile.display_name}</span>
                  </label>
                ))}
              </div>
            )}
            <button type="button" className="text-link cashout-split-toggle" onClick={() => setSplitPayers((current) => !current)}>
              {splitPayers ? "Ha pagato una persona sola" : "Hanno pagato in più persone"}
            </button>
          </fieldset>

          <fieldset className="cashout-chip-picker">
            <legend>Diviso fra</legend>
            <div>
              {memberProfiles.map((profile) => (
                <label className={participants.includes(profile.id) ? "is-selected" : ""} key={profile.id}>
                  <input type="checkbox" checked={participants.includes(profile.id)} onChange={() => toggleParticipant(profile.id)} />
                  <CashoutAvatar profile={profile} /><span>{profile.id === viewerId ? "Io" : profile.display_name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="cashout-live-split" id="cashout-split-note">
            {Number.isFinite(amount) && amount > 0 && participants.length
              ? <>Sono <b>{formatMoney(amount / participants.length)}</b> a testa, per {participants.length} {participants.length === 1 ? "persona" : "persone"}.</>
              : "Scrivi l'importo: la quota a testa compare qui."}
          </p>
          {error ? <p className="form-message error" role="alert">{error}</p> : null}
          <div className="modal-actions">
            <button className="button button-ghost" type="button" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Salvataggio…" : "Aggiungi spesa"}</button>
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

// Se la migrazione per eliminare non e ancora stata eseguita, lo diciamo
// in parole invece di mostrare l'errore tecnico di Supabase.
function deleteErrorMessage(message: string) {
  return /delete_cashout|function|schema cache/i.test(message)
    ? "Per eliminare va prima eseguita supabase/migration-cashout-elimina.sql su Supabase."
    : message;
}

function CashoutGroupDetail({
  group,
  profiles,
  viewerId,
  onBack,
  onNewExpense,
  onCustomSettle,
  onChanged,
  onNotice,
}: {
  group: CashoutGroup;
  profiles: Profile[];
  viewerId: string;
  onBack: () => void;
  onNewExpense: () => void;
  onCustomSettle: (transfer: CashoutTransfer) => void;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const nameOf = (id: string) => profileMap.get(id)?.display_name ?? "Qualcuno";
  const memberProfiles = group.members.map((member) => profileMap.get(member.profile_id)).filter(Boolean) as Profile[];
  const total = group.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const balances = groupBalances(group, profiles);
  // Prima i debiti che riguardano te: sono quelli su cui puoi agire.
  const transfers = buildCashoutTransfers(balances).sort((a, b) =>
    Number(b.fromId === viewerId || b.toId === viewerId) - Number(a.fromId === viewerId || a.toId === viewerId));
  const openAmount = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  // Un tocco su "Segna saldato" chiede conferma sul posto; dopo PayPal la
  // stessa conferma compare da sola ("L'hai pagato?").
  const [confirming, setConfirming] = useState<{ key: string; afterPayPal: boolean } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });

  async function settle(transfer: CashoutTransfer) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("record_cashout_settlement", {
      p_group_id: group.id,
      p_from_profile_id: transfer.fromId,
      p_to_profile_id: transfer.toId,
      p_amount: transfer.amount,
    });
    setBusy(false);
    setConfirming(null);
    if (error) return onNotice(error.message);
    onNotice(`Segnato: ${nameOf(transfer.fromId)} ha dato ${formatMoney(transfer.amount)} a ${nameOf(transfer.toId)}.`);
    await onChanged();
  }

  async function remove(kind: "expense" | "settlement", id: string) {
    if (!supabase) return;
    setBusy(true);
    const { error } = kind === "expense"
      ? await supabase.rpc("delete_cashout_expense", { p_expense_id: id })
      : await supabase.rpc("delete_cashout_settlement", { p_settlement_id: id });
    setBusy(false);
    setDeleting(null);
    if (error) return onNotice(deleteErrorMessage(error.message));
    onNotice(kind === "expense" ? "Spesa eliminata: i conti sono ricalcolati." : "Saldo eliminato: i conti sono ricalcolati.");
    await onChanged();
  }

  function deleteButton(kind: "expense" | "settlement", id: string, label: string) {
    return deleting === id ? (
      <span className="cashout-delete-confirm">
        <button className="button button-danger" type="button" disabled={busy} onClick={() => void remove(kind, id)}>Sì, elimina</button>
        <button className="button button-ghost" type="button" onClick={() => setDeleting(null)}>No</button>
      </span>
    ) : <button className="text-link cashout-delete" type="button" onClick={() => setDeleting(id)} aria-label={`Elimina ${label}`}>Elimina</button>;
  }

  return (
    <section className="page-section cashout-page cashout-detail-page">
      <button className="cashout-back" type="button" onClick={onBack}>← Tutti i gruppi</button>
      <article className="section-hero cashout-hero cashout-detail-hero">
        <div>
          <p className="eyebrow">GRUPPO DI SPESA</p>
          <h1>{group.name}</h1>
          <div className="cashout-member-stack">{memberProfiles.map((profile) => <CashoutAvatar profile={profile} key={profile.id} />)}<span>{memberProfiles.length} partecipanti</span></div>
        </div>
        <button className="button button-primary cashout-new-expense" type="button" onClick={onNewExpense}>+ Spesa</button>
      </article>

      <section className="cashout-settlement-report">
        <div className="section-head cashout-head"><div className="section-head-label"><p className="eyebrow dark">DA SALDARE</p><h2>Chi deve pagare chi</h2></div></div>
        {transfers.length ? <div className="cashout-transfer-list">{transfers.map((transfer) => {
          const key = `${transfer.fromId}:${transfer.toId}`;
          const recipient = profileMap.get(transfer.toId);
          const iPay = transfer.fromId === viewerId;
          const paypalUsername = iPay ? recipient?.paypal_me_username : null;
          const confirm = confirming?.key === key ? confirming : null;
          return (
            <article key={key} data-mine={iPay || transfer.toId === viewerId ? "" : undefined}>
              <div className="cashout-transfer-people"><CashoutAvatar profile={profileMap.get(transfer.fromId)} /><b>{iPay ? "Tu" : nameOf(transfer.fromId)}</b><span>{iPay ? "devi a" : "deve a"}</span><CashoutAvatar profile={recipient} /><b>{transfer.toId === viewerId ? "te" : nameOf(transfer.toId)}</b></div>
              <strong>{formatMoney(transfer.amount)}</strong>
              {confirm ? (
                <div className="cashout-settle-confirm" role="group" aria-label="Conferma saldo">
                  <p>{confirm.afterPayPal ? `L'hai pagato? Segnalo come saldato.` : `Confermi che ${iPay ? "hai dato" : `${nameOf(transfer.fromId)} ha dato`} ${formatMoney(transfer.amount)} a ${transfer.toId === viewerId ? "te" : nameOf(transfer.toId)}?`}</p>
                  <div className="cashout-transfer-actions">
                    <button className="button button-primary" type="button" disabled={busy} onClick={() => void settle(transfer)}>{busy ? "Salvataggio…" : "Sì, saldato"}</button>
                    <button className="button button-ghost" type="button" onClick={() => setConfirming(null)}>Non ancora</button>
                    <button className="text-link" type="button" onClick={() => { setConfirming(null); onCustomSettle(transfer); }}>Importo diverso</button>
                  </div>
                </div>
              ) : (
                <div className="cashout-transfer-actions">
                  {paypalUsername ? (
                    <a
                      className="button cashout-paypal-button"
                      href={paypalMeUrl(paypalUsername, transfer.amount)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Paga ${formatMoney(transfer.amount)} a ${recipient?.display_name} con PayPal`}
                      onClick={() => { copyPayPalAmount(transfer.amount); setConfirming({ key, afterPayPal: true }); }}
                    >
                      <span className="cashout-paypal-mark" aria-hidden="true"><i>P</i><i>P</i></span>
                      Paga con PayPal
                    </a>
                  ) : null}
                  <button className="button button-primary" type="button" onClick={() => setConfirming({ key, afterPayPal: false })}>Segna saldato</button>
                </div>
              )}
              {paypalUsername && !confirm ? <small className="cashout-paypal-hint">Su mobile, se PayPal non inserisce l’importo, incolla <b>{paypalClipboardAmount(transfer.amount)} €</b>: viene copiato quando tocchi il pulsante.</small> : null}
            </article>
          );
        })}</div> : <p className="cashout-all-settled">Tutti i conti del gruppo sono in pari.</p>}
      </section>

      <div className="cashout-summary-grid">
        <article><small>Totale speso</small><b>{formatMoney(total)}</b></article>
        <article><small>Da saldare</small><b>{formatMoney(openAmount)}</b></article>
        <article><small>Spese</small><b>{group.expenses.length}</b></article>
      </div>

      <section className="cashout-report">
        <div className="section-head cashout-head"><div className="section-head-label"><p className="eyebrow dark">RESOCONTO</p><h2>Situazione del gruppo</h2></div></div>
        <div className="cashout-balance-list">
          {balances.map(({ profile, balance }) => (
            <article key={profile.id}>
              <CashoutAvatar profile={profile} />
              <div><b>{profile.id === viewerId ? `${profile.display_name} (tu)` : profile.display_name}</b><span>{balance > 0.005 ? "Deve ricevere" : balance < -0.005 ? "Deve pagare" : "In pari"}</span></div>
              <strong className={balance > 0.005 ? "is-credit" : balance < -0.005 ? "is-debt" : ""}>{balance > 0.005 ? "+" : balance < -0.005 ? "−" : ""}{formatMoney(balance)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="cashout-expenses">
        <div className="section-head cashout-head"><div className="section-head-label"><p className="eyebrow dark">REGISTRO</p><h2>Spese</h2></div><span>{group.expenses.length}</span></div>
        {group.expenses.length ? (
          <div className="cashout-expense-list">
            {group.expenses.map((expense) => (
              <article className="cashout-expense-card" key={expense.id}>
                <header>
                  <div><h3>{expense.description}</h3><small>{dateFormat.format(new Date(expense.created_at))} · inserita da {expense.created_by === viewerId ? "te" : nameOf(expense.created_by)}</small></div>
                  <b>{formatMoney(expense.amount)}</b>
                </header>
                <p className="cashout-expense-line">
                  Pagata da <b>{expense.payers.map((payer) => `${payer.profile_id === viewerId ? "te" : nameOf(payer.profile_id)}${expense.payers.length > 1 ? ` (${formatMoney(payer.amount)})` : ""}`).join(", ")}</b>
                  {" · "}divisa fra {expense.shares.length} {expense.shares.length === 1 ? "persona" : "persone"}
                  {shareOf(expense, viewerId) ? <> · la tua quota <b>{formatMoney(shareOf(expense, viewerId))}</b></> : null}
                </p>
                {expense.created_by === viewerId ? <footer>{deleteButton("expense", expense.id, `la spesa ${expense.description}`)}</footer> : null}
              </article>
            ))}
          </div>
        ) : <div className="compact-empty"><span className="compact-empty-icon"><ReceiptGlyph /></span><p>Non ci sono ancora spese. Aggiungi la prima quando qualcuno anticipa.</p></div>}
      </section>

      {group.settlements.length ? (
        <section className="cashout-expenses">
          <div className="section-head cashout-head"><div className="section-head-label"><p className="eyebrow dark">PAGAMENTI</p><h2>Saldi registrati</h2></div><span>{group.settlements.length}</span></div>
          <ul className="cashout-settlement-history">
            {group.settlements.map((settlement) => (
              <li key={settlement.id}>
                <p><b>{settlement.from_profile_id === viewerId ? "Tu" : nameOf(settlement.from_profile_id)}</b> {settlement.from_profile_id === viewerId ? "hai pagato" : "ha pagato"} <b>{settlement.to_profile_id === viewerId ? "te" : nameOf(settlement.to_profile_id)}</b><small>{dateFormat.format(new Date(settlement.created_at))}</small></p>
                <span>{formatMoney(settlement.amount)}</span>
                {settlement.created_by === viewerId ? deleteButton("settlement", settlement.id, `il saldo di ${formatMoney(settlement.amount)}`) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

export default function CashoutPage({ profiles, viewerId, initialGroupId = null }: { profiles: Profile[]; viewerId: string; initialGroupId?: string | null }) {
  const [groups, setGroups] = useState<CashoutGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  // Il profilo Cashout apre direttamente il gruppo di un debito.
  const [selectedId, setSelectedId] = useState<string | null>(initialGroupId);
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
  // Dalla lista, "+ Spesa" propone il gruppo usato per ultimo.
  const lastActivity = (group: CashoutGroup) => [group.created_at, ...group.expenses.map((expense) => expense.created_at)].sort().at(-1) ?? "";
  const recentGroup = [...groups].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)))[0];
  const myTransfers = groups.flatMap((group) => buildCashoutTransfers(groupBalances(group, profiles)));
  const owed = myTransfers.filter((transfer) => transfer.toId === viewerId).reduce((sum, transfer) => sum + transfer.amount, 0);
  const owe = myTransfers.filter((transfer) => transfer.fromId === viewerId).reduce((sum, transfer) => sum + transfer.amount, 0);
  const net = owed - owe;
  const noticeBar = notice ? <button className="notice" type="button" onClick={() => setNotice("")} role="status">{notice}<span aria-hidden="true">×</span></button> : null;
  const expenseModal = showExpenseCreate && groups.length ? (
    <CashoutDialogPortal><CashoutExpenseModal groups={groups} initialGroupId={(selectedGroup ?? recentGroup).id} profiles={profiles} viewerId={viewerId}
      onClose={() => setShowExpenseCreate(false)}
      onCreated={async (groupId) => { setShowExpenseCreate(false); await loadGroups(); setSelectedId(groupId); setNotice("Spesa aggiunta."); }} /></CashoutDialogPortal>
  ) : null;

  if (selectedGroup) return (
    <>
      {noticeBar}
      <CashoutGroupDetail group={selectedGroup} profiles={profiles} viewerId={viewerId} onBack={() => setSelectedId(null)} onNewExpense={() => setShowExpenseCreate(true)}
        onCustomSettle={setSettlementTransfer} onChanged={loadGroups} onNotice={setNotice} />
      {expenseModal}
      {settlementTransfer ? <CashoutDialogPortal><CashoutSettlementModal group={selectedGroup} profiles={profiles} transfer={settlementTransfer} onClose={() => setSettlementTransfer(null)} onCreated={async () => { setSettlementTransfer(null); await loadGroups(); }} /></CashoutDialogPortal> : null}
    </>
  );

  return (
    <>
      {noticeBar}
      <section className="page-section cashout-page">
        {/* La testata dice subito la cosa che conta: come sei messo. */}
        <article className="section-hero cashout-hero">
          <div>
            <p className="eyebrow">CASHOUT · IL TUO SALDO</p>
            <h1>{loading ? "…" : !groups.length ? "Nessun conto" : Math.abs(net) < 0.005 ? "Sei in pari" : net > 0 ? <>Ti devono<br />{formatMoney(net)}</> : <>Devi<br />{formatMoney(net)}</>}</h1>
            <p>{!groups.length ? "Crea un gruppo, scegli chi partecipa e aggiungi le spese: l’app divide il resto." : `In ${groups.length} ${groups.length === 1 ? "gruppo" : "gruppi"}${owed > 0.005 && owe > 0.005 ? ` · ti devono ${formatMoney(owed)}, devi ${formatMoney(owe)}` : ""}.`}</p>
          </div>
          <div className="cashout-hero-actions">
            {groups.length ? <button className="button button-primary cashout-new-expense" type="button" onClick={() => setShowExpenseCreate(true)}>+ Spesa</button> : null}
            <button className={`button ${groups.length ? "button-ghost-dark" : "button-primary"} cashout-new-group`} type="button" disabled={!schemaReady} onClick={() => setShowGroupCreate(true)}>+ Nuovo gruppo</button>
          </div>
        </article>

        {!schemaReady ? (
          <div className="compact-empty cashout-schema-empty"><span>!</span><div><h2>Cash Out va attivato</h2><p>Esegui <code>supabase/migration-cashout.sql</code> nel SQL Editor di Supabase.</p></div></div>
        ) : loading ? <div className="compact-empty"><span>…</span><p>Caricamento gruppi di spesa.</p></div> : groups.length ? (
          <section className="cashout-groups-section">
            <div className="section-head cashout-head"><div className="section-head-label"><p className="eyebrow dark">I TUOI GRUPPI</p><h2>Gruppi di spesa</h2></div><span>{groups.length}</span></div>
            <div className="cashout-group-grid">
              {groups.map((group) => {
                const total = group.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
                const mine = buildCashoutTransfers(groupBalances(group, profiles));
                const myBalance = mine.reduce((sum, transfer) => sum + (transfer.toId === viewerId ? transfer.amount : 0) - (transfer.fromId === viewerId ? transfer.amount : 0), 0);
                const state = myBalance > 0.005 ? `Ti devono ${formatMoney(myBalance)}` : myBalance < -0.005 ? `Devi ${formatMoney(myBalance)}` : mine.length ? "Tu sei in pari" : "Tutto saldato";
                return (
                  <button className="cashout-group-card" type="button" onClick={() => setSelectedId(group.id)} key={group.id}>
                    <span className="cashout-group-icon" aria-hidden="true">€</span>
                    <div><small data-tone={myBalance > 0.005 ? "up" : myBalance < -0.005 ? "down" : undefined}>{state}</small><h2>{group.name}</h2><span>{group.members.length} partecipanti · {group.expenses.length} {group.expenses.length === 1 ? "spesa" : "spese"} · {formatMoney(total)}</span></div>
                    <i aria-hidden="true">→</i>
                  </button>
                );
              })}
            </div>
          </section>
        ) : <div className="compact-empty cashout-first-empty"><span className="compact-empty-icon"><ReceiptGlyph /></span><div><h2>Nessun gruppo di spesa</h2><p>Crea “Grigliata” o “Vacanza Mykonos”, scegli chi partecipa e poi aggiungi le spese.</p></div></div>}
      </section>
      {expenseModal}
      {showGroupCreate ? <CashoutDialogPortal><CashoutGroupModal profiles={profiles} viewerId={viewerId} onClose={() => setShowGroupCreate(false)} onCreated={async (groupId) => { setShowGroupCreate(false); await loadGroups(); setSelectedId(groupId); }} /></CashoutDialogPortal> : null}
    </>
  );
}
