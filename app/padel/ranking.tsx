"use client";

import { useId } from "react";
import { type PadelMatch, type Profile } from "@/lib/supabase";
import { eloDeltaLabel, eloLabel, initials, padelRanks, padelTraits, padelWinRate, sortPadelProfiles } from "../core";
import { chronologicalMatches } from "./emblems";
import { RankingAward } from "./tournaments";
import { Avatar } from "../ui";

// Il podio si legge dall'anello attorno alla foto: oro, argento, bronzo.
// Prima era il fondo della riga a cambiare colore, ma con le righe adiacenti
// tre fondi diversi spezzavano l'elenco invece di ordinarlo.
export function medalClass(rank: number) {
  if (rank === 1) return "medal-gold";
  if (rank === 2) return "medal-silver";
  if (rank === 3) return "medal-bronze";
  return "";
}

// Da quale riga far partire la finestra quando l'elenco è più lungo dello
// spazio. Centrata su chi guarda invece che sempre in cima: il primo vede
// comunque 1-2-3 perché sopra di lui non c'è niente, il quinto vede 4-5-6,
// l'ultimo vede gli ultimi tre. Senza qualcuno su cui centrarsi si resta in
// testa, che è il comportamento di prima.
export function rankingWindowStart(total: number, size: number, focusIndex: number) {
  if (focusIndex < 0 || total <= size) return 0;
  const start = focusIndex - Math.floor((size - 1) / 2);
  return Math.max(0, Math.min(start, total - size));
}

// Di quante posizioni si e mosso ognuno negli ultimi sette giorni: la
// classifica di una settimana fa si ricostruisce togliendo dal rating i
// punti presi nelle partite di questi giorni. Positivo = posizioni guadagnate.
// Chi una settimana fa non aveva ancora giocato non ha un prima: resta fuori.
export const RANK_MOVE_DAYS = 7;
export function rankMovements(sorted: Profile[], ranks: number[], matches: PadelMatch[]) {
  const since = Date.now() - RANK_MOVE_DAYS * 864e5;
  const recent = matches.filter((match) => new Date(match.played_at).getTime() >= since);
  const before = sorted.map((profile) => {
    const played = recent.filter((match) => match.players.some((player) => player.profile_id === profile.id));
    const delta = played.reduce((sum, match) => sum + (match.players.find((player) => player.profile_id === profile.id)?.rating_delta ?? 0), 0);
    return { ...profile, rating: profile.rating - delta, matches_played: profile.matches_played - played.length };
  });
  const beforeSorted = sortPadelProfiles(before).filter((profile) => profile.matches_played > 0);
  const beforeRanks = padelRanks(beforeSorted);
  const moves = new Map<string, number>();
  sorted.forEach((profile, index) => {
    const beforeIndex = beforeSorted.findIndex((item) => item.id === profile.id);
    if (beforeIndex >= 0) moves.set(profile.id, beforeRanks[beforeIndex] - ranks[index]);
  });
  return moves;
}

export function RankingList({
  profiles,
  expanded = false,
  onSelect,
  limit,
  focusId,
  showTrend = true,
  trendMatches,
  bare = false,
}: {
  profiles: Profile[];
  // Le partite da cui ricavare chi e salito e chi e sceso in settimana.
  // Senza (stagione archiviata) la colonna resta vuota.
  trendMatches?: PadelMatch[];
  expanded?: boolean;
  onSelect?: (profile: Profile) => void;
  // Le frecce dicono come sta andando adesso: in una stagione archiviata non
  // significano niente, perché quella classifica è ferma.
  showTrend?: boolean;
  // Numero massimo di righe da mostrare. Si conta per righe e non per
  // posizione: con dei parimerito una soglia sulla posizione mostrerebbe un
  // numero di persone diverso da quello promesso.
  limit?: number;
  // Su chi centrare la finestra quando c'è un limite. In home è chi guarda:
  // le tre righe che contano sono la sua e quelle che ha davanti e dietro,
  // non le prime tre di una classifica in cui magari non compare.
  focusId?: string | null;
  bare?: boolean;
}) {
  const sorted = sortPadelProfiles(profiles).filter((profile) => profile.matches_played > 0);
  const ranks = padelRanks(sorted);
  const start = limit === undefined
    ? 0
    : rankingWindowStart(sorted.length, limit, sorted.findIndex((profile) => profile.id === focusId));
  const visible = limit === undefined ? sorted : sorted.slice(start, start + limit);
  const moves = showTrend && trendMatches ? rankMovements(sorted, ranks, trendMatches) : null;
  return (
    <div className={`${expanded ? "ranking-table" : "ranking-list"}${bare ? " ranking-table-bare" : ""}`}>
      {visible.map((profile, index) => {
        const isRanked = profile.matches_played > 0;
        // La posizione va letta sull'elenco intero, non sulla finestra:
        // altrimenti la prima riga visibile direbbe sempre "1".
        const rank = ranks[start + index];
        const winRate = padelWinRate(profile.wins, profile.losses);
        const content = (
          <>
            <span className={`rank-number ${isRanked ? `rank-${rank}` : "rank-nc"}`}>
              {isRanked ? rank : "N/C"}
            </span>
            <Avatar profile={profile} size={expanded ? "md" : "sm"} />
            <div className="ranking-name">
              <b>{profile.display_name}</b>
              <span>{padelTraits(profile) ?? `${profile.matches_played} partite`}</span>
            </div>
            {expanded ? (
              <>
                <span className="table-stat"><b>{profile.matches_played}</b><small>Partite</small></span>
                <span className="table-stat"><b>{profile.wins}</b><small>Vinte</small></span>
                <span className="table-stat"><b>{winRate}%</b><small>Win rate</small></span>
                <span className={`streak ${isRanked ? (profile.current_streak >= 0 ? "up" : "down") : ""}`}>
                  {isRanked ? `${profile.current_streak >= 0 ? "↗" : "↘"} ${Math.abs(profile.current_streak)}` : "N/C"}
                </span>
              </>
            ) : (
              (() => {
                // Non la freccia della serie, ma di quanto ti sei mosso in
                // classifica in settimana: "▲2", "▼1".
                const move = moves?.get(profile.id);
                // Fermo o senza un prima: niente segno, una colonna di "="
                // non dice nulla.
                if (!move) return <span className="trend" aria-hidden="true" />;
                const label = move > 0 ? `${move} ${move === 1 ? "posizione guadagnata" : "posizioni guadagnate"} in settimana`
                  : `${-move} ${move === -1 ? "posizione persa" : "posizioni perse"} in settimana`;
                return <span className={`trend ${move > 0 ? "up" : "down"}`} title={label} aria-label={label}>
                  {move > 0 ? `▲${move}` : `▼${-move}`}
                </span>;
              })()
            )}
            <span className="ranking-points">
              <b>{isRanked ? eloLabel(profile.rating) : "N/C"}</b>
              <small>{isRanked ? "PT" : "0 PARTITE"}</small>
            </span>
          </>
        );
        const tone = isRanked ? medalClass(rank) : "";
        return onSelect ? (
          <button
            type="button"
            className={`ranking-row ranking-row-link ${tone} ${isRanked ? "" : "unranked"}`}
            key={profile.id}
            onClick={() => onSelect(profile)}
            aria-label={`Apri la scheda di ${profile.display_name}`}
          >
            {content}
          </button>
        ) : (
          <div className={`ranking-row ${tone} ${isRanked ? "" : "unranked"}`} key={profile.id}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function RankingHistoryChart({ profiles, matches, awards, season, compact }: { profiles: Profile[]; matches: PadelMatch[]; awards: RankingAward[] | null; season: number; compact: boolean }) {
  const chartId = useId().replace(/:/g, "");
  const players = sortPadelProfiles(profiles).filter((profile) => profile.matches_played > 0);
  const orderedMatches = matches.filter((match) => !match.is_friendly).sort((a, b) =>
      new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
      || new Date(a.created_at ?? a.played_at).getTime() - new Date(b.created_at ?? b.played_at).getTime()
      || a.id.localeCompare(b.id),
    );
  const seasonMatches = orderedMatches.filter((match) => new Date(match.played_at).getFullYear() === season);

  if (!players.length || !seasonMatches.length) {
    return (
      <article className="ranking-history-panel">
        <div className="ranking-history-head"><div><p className="eyebrow dark">STAGIONE {season}</p><h2>Andamento classifica</h2></div></div>
        <p className="ranking-history-empty">Il grafico apparirà dopo la prima partita della stagione.</p>
      </article>
    );
  }

  if (awards === null) {
    return (
      <article className="ranking-history-panel">
        <div className="ranking-history-head"><div><p className="eyebrow dark">STAGIONE {season}</p><h2>Andamento classifica</h2></div></div>
        <p className="ranking-history-empty">Non è stato possibile caricare i premi Elo del grafico. Riprova tra poco.</p>
      </article>
    );
  }

  // Il ricalcolo Elo riparte sempre da 1000 e ripassa TUTTO lo storico.
  // Riproduciamo quel percorso, premi compresi, prima della stagione scelta:
  // sottrarre i soli delta stagionali dal rating finale anticipava i premi.
  const awardsByMatch = new Map<string, RankingAward[]>();
  for (const award of awards) awardsByMatch.set(award.matchId, [...(awardsByMatch.get(award.matchId) ?? []), award]);
  const ratings = new Map(players.map((profile) => [profile.id, 1000]));
  const applyMatch = (match: PadelMatch) => {
    for (const player of match.players) {
      if (ratings.has(player.profile_id)) ratings.set(player.profile_id, ratings.get(player.profile_id)! + (player.rating_delta ?? 0));
    }
    for (const award of awardsByMatch.get(match.id) ?? []) {
      if (ratings.has(award.profileId)) ratings.set(award.profileId, ratings.get(award.profileId)! + award.points);
    }
  };
  for (const match of orderedMatches) {
    if (new Date(match.played_at).getFullYear() >= season) break;
    applyMatch(match);
  }

  // Un solo punto per giornata: due partite nella stessa data producono il
  // rating di fine giornata, e ogni giornata occupa lo stesso passo nel grafico.
  const dayOf = (date: string) => {
    const local = new Date(date);
    return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate());
  };
  const matchDays = [...new Set(seasonMatches.map((match) => dayOf(match.played_at)))];
  const firstDay = matchDays[0];
  const startDay = firstDay - 86_400_000;
  const dayPositions = new Map(matchDays.map((day, index) => [day, index + 1]));
  const series = players.map((profile) => ({ profile, values: [{ day: startDay, rating: ratings.get(profile.id)! }] }));
  let nextMatch = 0;
  for (const day of matchDays) {
    while (nextMatch < seasonMatches.length && dayOf(seasonMatches[nextMatch].played_at) <= day) {
      applyMatch(seasonMatches[nextMatch]);
      nextMatch += 1;
    }
    for (const line of series) line.values.push({ day, rating: ratings.get(line.profile.id)! });
  }

  const allRatings = series.flatMap((line) => line.values.map((point) => point.rating));
  const rawMin = Math.min(...allRatings);
  const rawMax = Math.max(...allRatings);
  const minRating = Math.min(950, Math.floor(rawMin / 50) * 50);
  const maxRating = Math.max(1050, Math.ceil(rawMax / 50) * 50);
  const gridValues = Array.from({ length: (maxRating - minRating) / 50 + 1 }, (_, index) => maxRating - index * 50);
  const width = compact ? 360 : 760;
  const height = Math.max(compact ? 340 : 310, players.length * 40 + 80, gridValues.length * 40 + 40);
  const padding = { top: 30, right: compact ? 43 : 52, bottom: 22, left: compact ? 38 : 52 };
  const plotRight = width - padding.right;
  const plotBottom = height - padding.bottom;
  const xAt = (day: number) => padding.left + ((dayPositions.get(day) ?? 0) / matchDays.length) * (plotRight - padding.left);
  const yAt = (rating: number) => padding.top + ((maxRating - rating) / Math.max(1, maxRating - minRating)) * (plotBottom - padding.top);
  const badgeRadius = compact ? 14 : 16;
  const badgeX = plotRight + (compact ? 23 : 27);
  const endings = series.map((line, index) => ({ index, y: yAt(line.values[line.values.length - 1].rating) })).sort((a, b) => a.y - b.y);
  const badgeY = new Map<number, number>();
  const gap = badgeRadius * 2 + 6;
  let lastY = padding.top + badgeRadius - gap;
  for (const ending of endings) {
    lastY = Math.max(ending.y, lastY + gap);
    badgeY.set(ending.index, lastY);
  }
  const overflow = Math.max(0, lastY - (plotBottom - badgeRadius));
  if (overflow) for (const ending of endings) badgeY.set(ending.index, badgeY.get(ending.index)! - overflow);
  return (
    <article className="ranking-history-panel">
      <div className="ranking-history-head">
        <div><p className="eyebrow dark">STAGIONE {season}</p><h2>Andamento classifica</h2></div>
      </div>
      <figure className="ranking-history-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Andamento Elo di ${players.length} giocatori nella stagione ${season}`}>
          {gridValues.map((rating) => {
            const y = yAt(rating);
            const baseline = rating === 1000 ? " is-baseline" : "";
            return <g key={rating}><line className={`elo-grid-line${baseline}`} x1={padding.left} x2={plotRight} y1={y} y2={y} /><text className={`elo-axis-label${baseline}`} x={padding.left - 8} y={y + 4} textAnchor="end">{rating}</text></g>;
          })}
          {series.map((line, index) => {
            const color = `hsl(${Math.round((index * 137.5 + 195) % 360)} 62% 40%)`;
            const path = line.values.map((point, index) => `${index ? "L" : "M"} ${xAt(point.day)} ${yAt(point.rating)}`).join(" ");
            const endY = badgeY.get(index)!;
            const clipId = `${chartId}-avatar-${index}`;
            const finalRating = line.values[line.values.length - 1].rating;
            return (
              <g key={line.profile.id}>
                <title>{`${line.profile.display_name}: ${eloLabel(finalRating)} punti Elo`}</title>
                <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={compact ? 2.5 : 3} />
                <path d={`M ${plotRight} ${yAt(finalRating)} L ${badgeX - badgeRadius} ${endY}`} fill="none" stroke={color} strokeDasharray={endY === yAt(finalRating) ? undefined : "3 3"} strokeWidth="2" />
                <circle cx={badgeX} cy={endY} r={badgeRadius + 2} fill="var(--white)" stroke={color} strokeWidth="3" />
                {line.profile.avatar_url ? (
                  <>
                    <defs><clipPath id={clipId}><circle cx={badgeX} cy={endY} r={badgeRadius} /></clipPath></defs>
                    <image href={line.profile.avatar_url} x={badgeX - badgeRadius} y={endY - badgeRadius} width={badgeRadius * 2} height={badgeRadius * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
                  </>
                ) : (
                  <text className="ranking-history-initials" x={badgeX} y={endY + 4} textAnchor="middle">{initials(line.profile.display_name)}</text>
                )}
              </g>
            );
          })}
        </svg>
      </figure>
    </article>
  );
}

export function EloChart({ profile, matches, awards, isSelf }: { profile: Profile; matches: PadelMatch[]; awards: RankingAward[] | null; isSelf?: boolean }) {
  const personalMatches = [...matches]
    .filter((match) => !match.is_friendly && match.players.some((player) => player.profile_id === profile.id))
  const awardsByMatch = new Map<string, number>();
  for (const award of awards ?? []) {
    if (award.profileId === profile.id) {
      awardsByMatch.set(award.matchId, (awardsByMatch.get(award.matchId) ?? 0) + award.points);
    }
  }
  // Anche un premio ottenuto senza giocare la partita conclusiva del torneo
  // deve apparire nel giorno giusto: ripercorriamo tutti gli eventi cronologici.
  const events = chronologicalMatches(matches).flatMap((match) => {
    const matchDelta = match.players.find((player) => player.profile_id === profile.id)?.rating_delta;
    const prize = awardsByMatch.get(match.id) ?? 0;
    return matchDelta === undefined && prize === 0 ? [] : [{ match, matchDelta: matchDelta ?? 0, prize }];
  });
  const matchPoints: { id: string; rating: number; playedAt: string; delta: number; prize: number }[] = [];
  for (const { match, matchDelta, prize } of events) {
    const rating = (matchPoints.at(-1)?.rating ?? 1000) + matchDelta + prize;
    matchPoints.push({ id: match.id, rating, playedAt: match.played_at, delta: matchDelta + prize, prize });
  }
  const points = [
    { id: "start", rating: 1000, playedAt: events[0]?.match.played_at ?? null, delta: 0, prize: 0 },
    ...matchPoints,
  ];

  if (awards === null) {
    return (
      <article className="elo-panel elo-panel-empty">
        <div className="elo-panel-head"><div><p className="eyebrow dark">ANDAMENTO ELO</p><h2>Grafico non disponibile.</h2></div></div>
        <p>Non è stato possibile caricare i premi Elo. Riprova tra poco.</p>
      </article>
    );
  }

  if (!events.length) {
    return (
      <article className="elo-panel elo-panel-empty">
        <div className="elo-panel-head"><div><p className="eyebrow dark">ANDAMENTO ELO</p><h2>Il grafico parte dalla prima sfida.</h2></div></div>
        <p>Registra una partita per iniziare a seguire l&apos;andamento del punteggio.</p>
      </article>
    );
  }

  const width = 760;
  const height = 270;
  const padding = { top: 28, right: 24, bottom: 42, left: 54 };
  const ratings = points.map((point) => point.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const spread = Math.max(30, rawMax - rawMin);
  const minRating = Math.floor((rawMin - spread * 0.16) / 10) * 10;
  const maxRating = Math.ceil((rawMax + spread * 0.16) / 10) * 10;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xAt = (index: number) => padding.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yAt = (rating: number) => padding.top + ((maxRating - rating) / Math.max(1, maxRating - minRating)) * plotHeight;
  const coordinates = points.map((point, index) => ({ ...point, x: xAt(index), y: yAt(point.rating) }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${coordinates[coordinates.length - 1].x} ${height - padding.bottom} L ${coordinates[0].x} ${height - padding.bottom} Z`;
  const gridValues = Array.from({ length: 4 }, (_, index) =>
    Math.round(maxRating - (index / 3) * (maxRating - minRating)),
  );
  const firstDate = events[0].match.played_at;
  const middleDate = events[Math.floor((events.length - 1) / 2)].match.played_at;
  const lastDate = events[events.length - 1].match.played_at;
  const dateLabels = [firstDate, middleDate, lastDate];
  const formatDate = (date: string) => new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(new Date(date));
  const overallDelta = profile.rating - 1000;

  return (
    <article className="elo-panel">
      <div className="elo-panel-head">
        <div><p className="eyebrow dark">ANDAMENTO ELO</p><h2>{isSelf ? "La mia corsa" : `La corsa di ${profile.display_name}`}</h2></div>
        <div className="elo-current"><b>{eloLabel(profile.rating)}</b><small>PT ATTUALI</small><span className={overallDelta >= 0 ? "positive" : "negative"}>{eloDeltaLabel(overallDelta)} dal debutto</span></div>
      </div>
      <figure className="elo-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grafico Elo di ${profile.display_name} su ${personalMatches.length} partite`}>
          <defs>
            <linearGradient id={`elo-fill-${profile.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {gridValues.map((value) => {
            const y = yAt(value);
            return <g key={value}><line className="elo-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} /><text className="elo-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">{value}</text></g>;
          })}
          <path d={area} fill={`url(#elo-fill-${profile.id})`} />
          <path className="elo-line" d={line} />
          {coordinates.slice(1).map((point) => (
            <circle className="elo-point" key={point.id} cx={point.x} cy={point.y} r="5">
              <title>{`${new Intl.DateTimeFormat("it-IT").format(new Date(point.playedAt!))}: ${eloLabel(point.rating)} punti (${eloDeltaLabel(point.delta)}${point.prize ? `, premio +${point.prize}` : ""})`}</title>
            </circle>
          ))}
          {dateLabels.map((date, index) => (
            <text className="elo-date-label" key={`${date}-${index}`} x={padding.left + (index / 2) * plotWidth} y={height - 10} textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}>{formatDate(date)}</text>
          ))}
        </svg>
        <figcaption>Ogni punto rappresenta il punteggio dopo una partita. Toccalo per vedere data e variazione Elo.</figcaption>
      </figure>
    </article>
  );
}
