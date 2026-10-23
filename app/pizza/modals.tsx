"use client";

import { FormEvent, useState } from "react";
import { type Profile, supabase } from "@/lib/supabase";
import { PizzaRestaurantRecord, PizzaSession, PizzaSessionVote, finalPizzaScore, sessionIsOpen, sessionPizzaAverage, weightedPizzaAverage } from "../core";
import { Avatar } from "../ui";

export function PizzaSessionCreateModal({
  profiles,
  viewerId,
  onClose,
  onSaved,
}: {
  profiles: Profile[];
  viewerId: string;
  onClose: () => void;
  onSaved: (kind: "group" | "solo") => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [kind, setKind] = useState<"group" | "solo">("group");
  const [participantIds, setParticipantIds] = useState<string[]>([viewerId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleParticipant(profileId: string) {
    if (profileId === viewerId) return;
    setParticipantIds((current) => (
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId]
    ));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim()) return;
    if (kind === "group" && participantIds.length < 2) {
      setError("Seleziona almeno un altro partecipante per la votazione di gruppo.");
      return;
    }
    setBusy(true);
    setError("");
    const selectedParticipants = kind === "solo" ? [viewerId] : participantIds;
    const { error: rpcError } = await supabase.rpc("open_pizza_session", {
      p_name: name.trim(),
      p_place: place.trim() || null,
      p_participant_ids: selectedParticipants,
      p_is_solo: kind === "solo",
    });
    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }
    await onSaved(kind);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal pizza-vote-modal" role="dialog" aria-modal="true" aria-labelledby="pizza-create-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow dark">PIZZA NIGHT</p>
            <h2 id="pizza-create-title">Nuova votazione</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          <label>Nome pizzeria<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. La Nuova Pala" maxLength={80} required /></label>
          <label>Località <span className="optional-label">facoltativa</span><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Es. Sanremo" maxLength={80} /></label>
          <div className="pizza-session-kind" role="group" aria-label="Tipo di votazione">
            <button
              type="button"
              className={kind === "group" ? "active" : ""}
              aria-pressed={kind === "group"}
              onClick={() => { setKind("group"); setError(""); }}
            >
              <b>Con il gruppo</b>
              <span>Scegli i partecipanti</span>
            </button>
            <button
              type="button"
              className={kind === "solo" ? "active" : ""}
              aria-pressed={kind === "solo"}
              onClick={() => { setKind("solo"); setError(""); }}
            >
              <b>In solitaria</b>
              <span>Solo nella tua classifica</span>
            </button>
          </div>
          {kind === "group" ? (
            <>
              <fieldset className="pizza-participant-picker">
                <legend>Partecipanti alla votazione</legend>
                <div>
                  {profiles.map((profile) => {
                    const selected = participantIds.includes(profile.id);
                    return (
                      <label className={selected ? "is-selected" : ""} key={profile.id}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={profile.id === viewerId}
                          onChange={() => toggleParticipant(profile.id)}
                        />
                        <Avatar profile={profile} size="sm" />
                        <span>{profile.display_name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <p className="field-hint pizza-participant-note">
                La votazione si chiude automaticamente quando tutti i partecipanti hanno votato.
              </p>
            </>
          ) : (
            <p className="field-hint pizza-participant-note">
              Il voto sarà visibile soltanto nella tua classifica Personale.
            </p>
          )}
          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Apertura…" : "Apri votazione"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Tutti i criteri ordinari usano la stessa scala 0-10; accanto resta il peso
// relativo, così non viene più confuso con il valore inseribile.
export function PizzaScoreField({
  label,
  caption,
  min = 0,
  max = 10,
  value,
  onChange,
}: {
  label: string;
  caption: string;
  min?: number;
  max?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="pizza-score-field">
      <div className="pizza-score-head">
        <b>{label}</b>
        <span>{caption}</span>
      </div>
      <div className="pizza-score-input">
        <input
          type="range"
          min={min}
          max={max}
          step="1"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
        <em>{value}</em>
      </div>
    </div>
  );
}

export function PizzaVoteModal({
  restaurant,
  session: voteSession,
  votes,
  voters,
  viewerId,
  onClose,
  onSaved,
  onDeleted,
}: {
  restaurant: PizzaRestaurantRecord;
  session: PizzaSession;
  votes: PizzaSessionVote[];
  voters: Profile[];
  viewerId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const previous = votes.find((vote) => vote.voter_id === viewerId);
  const [scores, setScores] = useState({
    location: previous?.location ?? 6,
    pizza: previous?.pizza ?? 6,
    dessert: previous?.dessert ?? 6,
    price: previous?.price ?? 6,
    bonus_fabio: previous?.bonus_fabio ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const open = sessionIsOpen(voteSession);
  const hasVoted = Boolean(previous);
  const participant = voteSession.participants.some((item) => item.voter_id === viewerId);
  const canDelete = open && voteSession.opened_by === viewerId;
  const viewerIsFabio = voters.find((profile) => profile.id === viewerId)?.display_name.toLowerCase() === "fabio";
  const completedVotes = voteSession.participants.filter((item) => item.voted_at).length;
  const missingVotes = voteSession.participants.length - completedVotes;
  const canSeeResult = !open;

  const average = !open && (votes.length || typeof voteSession.final_score === "number")
    ? sessionPizzaAverage(voteSession, votes)
    : null;
  const currentAverage = weightedPizzaAverage(scores);

  function updateScore(key: keyof typeof scores, value: number) {
    setScores((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: saveError } = await supabase.rpc("save_pizza_session_vote", {
      p_session_id: voteSession.id,
      p_location: scores.location,
      p_pizza: scores.pizza,
      p_dessert: scores.dessert,
      p_price: scores.price,
      p_bonus_fabio: viewerIsFabio ? scores.bonus_fabio : 0,
    });
    if (saveError) {
      setError(saveError.message);
      setBusy(false);
      return;
    }
    await onSaved();
  }

  async function removeSession() {
    if (!supabase || !canDelete || !window.confirm("Eliminare questa votazione in corso? I voti già inseriti verranno cancellati.")) return;
    setDeleting(true);
    setError("");
    const { error: deleteError } = await supabase.rpc("delete_open_pizza_session", {
      p_session_id: voteSession.id,
    });
    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }
    await onDeleted();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal pizza-vote-modal" role="dialog" aria-modal="true" aria-labelledby="pizza-vote-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow dark">{open ? "VOTAZIONE APERTA" : "VOTAZIONE CHIUSA"}</p>
            <h2 id="pizza-vote-title">{restaurant.name}</h2>
            <p className="modal-subtitle">
              {new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(new Date(voteSession.opened_at))}
              {open ? ` · ${completedVotes}/${voteSession.participants.length} voti ricevuti` : " · risultato definitivo"}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>

        {open && participant ? (
          <form onSubmit={submit}>
            <div className="pizza-score-fields">
              <PizzaScoreField label="Location" caption="conta il 23%" value={scores.location} onChange={(value) => updateScore("location", value)} />
              <PizzaScoreField label="Pizza" caption="conta il 32%" value={scores.pizza} onChange={(value) => updateScore("pizza", value)} />
              <PizzaScoreField label="Dolce" caption="conta il 13%" value={scores.dessert} onChange={(value) => updateScore("dessert", value)} />
              <PizzaScoreField label="Prezzo" caption="conta il 32%" value={scores.price} onChange={(value) => updateScore("price", value)} />
              {viewerIsFabio ? (
                <PizzaScoreField label="Bonus Fabio" caption="da 0 a 7" max={7} value={scores.bonus_fabio} onChange={(value) => updateScore("bonus_fabio", value)} />
              ) : null}
            </div>
            <div className="pizza-current-average" aria-live="polite">
              <span>VOTO MEDIO ATTUALE</span>
              <b>{currentAverage.toFixed(1)}<small>/10</small></b>
            </div>
            {error ? <p className="form-message error">{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="button button-ghost" onClick={onClose}>Chiudi</button>
              <button className="button button-primary" disabled={busy || deleting}>
                {busy ? "Salvataggio…" : hasVoted ? "Aggiorna il voto" : "Vota"}
              </button>
            </div>
            {/* Eliminare sta in fondo e in piccolo: prima era un tasto rosso
                pieno sopra a "Vota", a un pollice dal toccarlo per sbaglio. */}
            {canDelete ? (
              <button type="button" className="text-link pizza-delete-session" onClick={() => void removeSession()} disabled={busy || deleting}>
                {deleting ? "Eliminazione…" : "Elimina questa votazione"}
              </button>
            ) : null}
          </form>
        ) : open ? (
          <p className="demo-profile-note">Non sei tra i partecipanti di questa votazione.</p>
        ) : null}

        {canSeeResult && average ? (
          <div className="pizza-live">
            <div className="pizza-live-head">
              <div>
                <p className="eyebrow dark">RISULTATO DEFINITIVO</p>
                <b>{finalPizzaScore(votes, voteSession, voters)}<small>/100</small></b>
              </div>
              <span>{votes.length} {votes.length === 1 ? "voto" : "voti"}</span>
            </div>
            <div className="pizza-live-rows">
              {([
                ["Location", average.location],
                ["Pizza", average.pizza],
                ["Dolce", average.dessert],
                ["Prezzo", average.price],
              ] as [string, number][]).map(([label, value]) => (
                <div className="pizza-live-row" key={label}>
                  <span>{label}</span>
                  <i><b style={{ width: `${value * 10}%` }} /></i>
                  <em>{value.toFixed(1)}</em>
                </div>
              ))}
            </div>
            <div className="pizza-live-voters">
              {voteSession.participants.map(({ voter_id }) => {
                const profile = voters.find((item) => item.id === voter_id);
                return profile ? <Avatar key={voter_id} profile={profile} size="sm" /> : null;
              })}
            </div>
          </div>
        ) : (
          <p className="demo-profile-note">
            Il risultato si vede quando hanno votato tutti: {missingVotes === 1 ? "manca 1 voto" : `mancano ${missingVotes} voti`} su {voteSession.participants.length}.
          </p>
        )}
      </section>
    </div>
  );
}
