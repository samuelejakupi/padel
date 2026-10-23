"use client";

import { FormEvent, useRef, useState } from "react";
import { type PadelMatch, supabase } from "@/lib/supabase";
import { formatClock } from "../motion";
import { youtubeId } from "./emblems";

export function PlayCreateModal({
  profileId,
  matches,
  onClose,
  onSaved,
}: {
  profileId: string;
  matches: PadelMatch[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  // Le partite già registrate con un video sono la scorciatoia più comoda:
  // il link ce l'hai già, resta solo da dire il minuto.
  const withVideo = matches.filter((match) => youtubeId(match.video_url));
  const [matchId, setMatchId] = useState(withVideo[0]?.id ?? "");
  const [videoUrl, setVideoUrl] = useState(withVideo[0]?.video_url ?? "");
  // Minuti e secondi in due caselle invece che in una sola con i due punti:
  // il tastierino del telefono non ha il ":" e il minuto non si riusciva a
  // scrivere. Una casella vuota vale zero, cosi "0:45" e solo 45 nei secondi.
  const [startMinutes, setStartMinutes] = useState("");
  const [startSecs, setStartSecs] = useState("");
  const [duration, setDuration] = useState("20");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startSecsRef = useRef<HTMLInputElement | null>(null);

  function pickMatch(id: string) {
    setMatchId(id);
    const chosen = withVideo.find((match) => match.id === id);
    if (chosen?.video_url) setVideoUrl(chosen.video_url);
  }

  // Solo cifre: su desktop la tastiera vera lascerebbe scrivere lettere e
  // segni, che poi diventerebbero NaN al salvataggio.
  function onlyDigits(value: string, max: number) {
    return value.replace(/\D/g, "").slice(0, max);
  }

  const startSeconds = startMinutes === "" && startSecs === ""
    ? null
    : Number(startMinutes || 0) * 60 + Number(startSecs || 0);
  const previewId = youtubeId(videoUrl);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!previewId) {
      setError("Serve un indirizzo YouTube valido.");
      return;
    }
    if (startSeconds === null) {
      setError("Indica il minuto di partenza: minuti e secondi, per esempio 3 e 12.");
      return;
    }
    if (!supabase) return;

    setBusy(true);
    const { error: insertError } = await supabase.from("player_plays").insert({
      profile_id: profileId,
      match_id: matchId || null,
      title: title.trim() || null,
      video_url: videoUrl.trim(),
      start_seconds: startSeconds,
      duration_seconds: Number(duration),
      created_by: profileId,
    });
    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }
    await onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="play-create-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow dark">NUOVO SPEZZONE</p>
            <h2 id="play-create-title">Segna una play</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <form onSubmit={submit}>
          {withVideo.length ? (
            <label>
              Partita <span className="optional-label">facoltativa</span>
              <select value={matchId} onChange={(event) => pickMatch(event.target.value)}>
                <option value="">Video sciolto, non legato a una partita</option>
                {withVideo.map((match) => (
                  <option key={match.id} value={match.id}>
                    {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(match.played_at))}
                    {" · "}
                    {match.players.map((player) => player.profile.display_name).join(", ")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Video YouTube
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://youtu.be/..."
              inputMode="url"
              required
            />
          </label>
          <div className="play-time-row">
            <div className="play-clock">
              <span className="play-clock-label">Minuto di partenza</span>
              <div className="play-clock-fields">
                {/* Due cifre e il fuoco salta ai secondi da solo: e il gesto
                    che si fa gia con i codici di verifica, e risparmia un
                    tocco proprio dove prima ci si bloccava. */}
                <input
                  value={startMinutes}
                  onChange={(event) => {
                    const clean = onlyDigits(event.target.value, 2);
                    setStartMinutes(clean);
                    if (clean.length === 2) startSecsRef.current?.focus();
                  }}
                  placeholder="00"
                  inputMode="numeric"
                  aria-label="Minuti"
                />
                <b aria-hidden="true">:</b>
                <input
                  ref={startSecsRef}
                  value={startSecs}
                  onChange={(event) => setStartSecs(onlyDigits(event.target.value, 2))}
                  placeholder="00"
                  inputMode="numeric"
                  aria-label="Secondi"
                />
              </div>
            </div>
            <label>
              Durata
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="10">10 secondi</option>
                <option value="20">20 secondi</option>
                <option value="30">30 secondi</option>
              </select>
            </label>
          </div>
          <p className="field-hint">
            Il minuto è quello che leggi sul player di YouTube. Una casella lasciata vuota vale zero.
          </p>
          <label>
            Titolo <span className="optional-label">facoltativo</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Es. Smash da fondo campo"
              maxLength={80}
            />
          </label>

          {previewId && startSeconds !== null ? (
            <div className="play-preview">
              <div className="video-frame">
                <iframe
                  src={`https://www.youtube.com/embed/${previewId}?start=${startSeconds}&end=${startSeconds + Number(duration)}`}
                  title="Anteprima dello spezzone"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <small>Anteprima da {formatClock(startSeconds)} a {formatClock(startSeconds + Number(duration))}</small>
            </div>
          ) : null}

          {error ? <p className="form-message error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Annulla</button>
            <button className="button button-primary" disabled={busy}>{busy ? "Salvataggio…" : "Salva la play"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
