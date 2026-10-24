"use client";

import Image from "next/image";
import { type CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, type PadelMatch, type PlannedMatch, type PlayerPlay, type Profile, type Tournament, supabase } from "@/lib/supabase";
import MonthGroup from "./MonthGroup";
import WansportBoard from "./WansportBoard";
import CashoutPage, { formatMoney } from "./Cashout";
import AdminAccess from "./AdminUsers";
import ProfilePassword from "./ProfilePassword";
import CodGaming from "./CodGaming";
import CodProfile from "./CodProfile";
import CodRanking from "./CodRanking";
import CodMeta from "./CodMeta";
import useCodGbs from "./useCodGbs";
import PlayerInsights from "./PlayerInsights";
import { MatchFilterBar } from "./PadelPresentation";
import { filterMatchPeriod, filterMatchResults, type PeriodFilter, type ResultFilter } from "@/lib/padel-presentation";
import { buildIndividualStandings } from "@/lib/individual-standings";
import HomeProfile from "./profile/HomeProfile";
import PizzaProfile from "./profile/PizzaProfile";
import CashoutProfile, { useCashoutSummary } from "./profile/CashoutProfile";
import { ProfileHeader, StatRow } from "./profile/parts";
import { BottomSheet } from "./BottomSheet";
import { GamingView, MvpMatchState, MvpProgress, PIZZA_CRITERIA_KEYS, PIZZA_WEIGHT_TOTAL, PROFILE_MATCH_PREVIEW, PadelTeam, PadelTeamRecord, PadelView, PizzaRankingMode, PizzaRestaurantRecord, PizzaSession, PizzaSessionVote, SeasonStanding, Section, SectionView, View, ViewerMvpVote, basePath, buildClassicPizzaRanking, buildContemporaryPizzaRanking, buildPadelTeams, buildPersonalPizzaRanking, eloLabel, finalPizzaScore, heroGreetingPool, heroSalutePool, lastPlayedLabel, padelTraits, padelWinRate, pizzaCriteria, pizzaMedalTones, rankOf, rankedPadelTeams, sectionMeta, sections, sessionIsOpen, sortPadelProfiles, teamLabel, teamRatingLabel } from "./core";
import { CTA_FACES, MATCHES_FACES, NAV_PILL_TRANSITION, formatClock, scrollPageTo, useButtonRail, useCardCarousel, useIsPhone } from "./motion";
import { BadgeList, Emblem, FieldRegister, playerBadges, youtubeId } from "./padel/emblems";
import { NewMatchModal } from "./padel/match-form";
import { MatchCard, MvpVoteModal, PlannedMatchCard, SeasonPicker, TeamAvatars, TeamCreateModal, TeamEditor, TeamRankingList } from "./padel/matches";
import { PlayCreateModal } from "./padel/plays";
import { EloChart, RankingHistoryChart, RankingList } from "./padel/ranking";
import { MONKEY_TROPHY_PATH, RankingAward, TournamentAwardEntry, TournamentFormModal, TournamentMatchContext, TournamentRow, TournamentsPage, TrophyList, buildTournamentStandings, tournamentIsCompleted, tournamentSetsFormat } from "./padel/tournaments";
import { PizzaSessionCreateModal, PizzaVoteModal } from "./pizza/modals";
import { Avatar, BlockMark, Brand, GlyphName, LoadingScreen, LoginScreen, NavGlyph, SetupScreen } from "./ui";

function AppShell({ session }: { session: Session | null }) {
  // Dopo il login si entra nello smistamento, non dentro una sezione: da li si
  // sceglie dove andare e la barra in basso si riempie di conseguenza.
  const [view, setView] = useState<View>("home");
  const [padelView, setPadelView] = useState<PadelView>("overview");
  const [pizzaView, setPizzaView] = useState<SectionView>("overview");
  const [gamingView, setGamingView] = useState<GamingView>("overview");
  // Le scorciatoie della pagina Gaming aprono la vista giusta col modulo gia
  // aperto. Si azzera a ogni altro cambio di vista, cosi tornando sulla
  // stessa pagina dalla barra il modulo non si riapre da solo.
  const [gamingAction, setGamingAction] = useState<null | "gb" | "build">(null);
  // I profili che non sono la scheda del Padel o quello MW4: il riassunto
  // della home e i profili di Pizza e Cashout. Valgono solo nella loro
  // vista; ogni altro cambio di pagina li chiude.
  const [sectionProfile, setSectionProfile] = useState<null | "home" | "pizza" | "cashout">(null);
  // Il gruppo Cashout da aprire arrivando dal profilo ("Salda").
  const [cashoutGroupId, setCashoutGroupId] = useState<string | null>(null);
  // La scheda giocatore vive dentro il Padel, ma ci si arriva da qualunque
  // sezione: senza ricordarsi da dove si veniva, aprire il profilo dal
  // Cashout riportava la barra su quella del Padel. Questo e l'ultimo
  // smistamento scelto, e resta null finche si e in home.
  const [lastSection, setLastSection] = useState<Section | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<PadelMatch[]>([]);
  const [mvpSchemaReady, setMvpSchemaReady] = useState(true);
  const [votingMvpMatch, setVotingMvpMatch] = useState<PadelMatch | null>(null);
  const [pizzaRestaurants, setPizzaRestaurants] = useState<PizzaRestaurantRecord[]>([]);
  const [showMatch, setShowMatch] = useState(false);
  const [pizzaSchemaReady, setPizzaSchemaReady] = useState(true);
  const [pizzaSessions, setPizzaSessions] = useState<PizzaSession[]>([]);
  const [pizzaSessionVotes, setPizzaSessionVotes] = useState<PizzaSessionVote[]>([]);
  const [pizzaSessionsReady, setPizzaSessionsReady] = useState(true);
  const [votingSession, setVotingSession] = useState<PizzaSession | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showPizzaInfo, setShowPizzaInfo] = useState(false);
  // La home mostra soltanto un'anteprima; i "Vedi tutto" aprono le pagine
  // complete, così la schermata principale non cambia altezza.
  const HOME_MATCHES = 3;
  const HOME_TOURNAMENTS = 2;

  // La pagina della classifica conserva la scelta fra singoli e squadre.
  const [rankingMode, setRankingMode] = useState<"single" | "team">("single");
  const isPhone = useIsPhone();
  // Quali partite mostrano la card e il foglio: le proprie o tutte, in
  // quest'ordine, che e quello dei pallini.
  const [matchesMode, setMatchesMode] = useState<"mine" | "all">("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [resultPeriod, setResultPeriod] = useState<PeriodFilter>("all");
  // Quale raccoglitore del mese è aperto, uno solo per volta. Tre stati e non
  // due: undefined vuol dire "nessuna scelta ancora", e allora vale il mese
  // più recente; null vuol dire chiuso perché è stato chiuso apposta. Senza
  // questa distinzione non si potrebbe distinguere "non ho ancora deciso" da
  // "li voglio tutti chiusi".
  const [chosenMonth, setChosenMonth] = useState<string | null | undefined>(undefined);
  // Le partite complete e i pannelli accessori si aprono in un foglio dal
  // basso; la classifica ha invece una pagina propria.
  const [sheet, setSheet] = useState<null | "matches" | "campi">(null);

  // Il carosello delle partite in home. Le facce sono in fila nell'ordine dei
  // pallini, e il cambio automatico va avanti e indietro lungo quella fila.
  // Girano solo in home e a fogli chiusi: dentro a un foglio si guarda una
  // cosa sola, e vedere la card cambiare dietro al velo sarebbe una
  // distrazione.
  const carouselEnabled = !sheet && view === "padel" && padelView === "overview";

  const {
    setCard: setMatchesCard,
    trackRef: matchesTrackRef,
    swipeHandled: matchesSwipeHandled,
    touch: touchMatches,
  } = useCardCarousel({
    faces: MATCHES_FACES,
    face: matchesMode,
    // Cambiando insieme cambiano i mesi del foglio, e va riaperto il piu
    // recente di quelli nuovi.
    onChange: (next) => { setMatchesMode(next); setChosenMonth(undefined); },
    // Solo su telefono: su desktop la card delle partite non ha i pallini,
    // e vederla cambiare da sola senza niente che dica perche sembrerebbe
    // un difetto. Li l'elenco resta quello che e.
    enabled: carouselEnabled && isPhone,
  });

  // Quale dei due tasti e in scena in cima alla home.
  // Non e un carosello come le card ma un nastro: i due tasti sono uno accanto
  // all'altro e si scorre fra loro. E mai da solo — un tasto che cambia mentre
  // lo stai per premere fa aprire la cosa sbagliata: questo si muove solo col
  // dito.
  const [ctaFace, setCtaFace] = useState<"match" | "tournament">("match");
  const {
    setCard: setCtaCard,
    trackRef: ctaTrackRef,
    swipeHandled: ctaSwipeHandled,
    preview: ctaPreview,
    offset: ctaOffset,
    settling: ctaSettling,
  } = useButtonRail({
    faces: CTA_FACES,
    face: ctaFace,
    onChange: setCtaFace,
  });

  // Ogni cinque secondi il tasto si sporge di un dito verso il lato da cui
  // arriva l'altro, e torna. E il modo di dire "qui si scorre" senza
  // scriverlo: i pallini sotto al tasto lo dicevano meglio, ma erano una
  // riga in piu fra due card in una schermata che vive di passi uguali.
  // Non cambia faccia, la accenna soltanto: cambiarla resta cosa del dito.
  useEffect(() => {
    if (!carouselEnabled || !isPhone) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer = 0;
    function schedule() {
      timer = window.setTimeout(() => {
        const track = ctaTrackRef.current;
        // Solo a nastro fermo. Se il dito lo sta gia spostando, o la corsa non
        // e finita, il suggerimento e superfluo e arriverebbe come uno
        // strattone in mano.
        if (track?.animate && ctaOffset === 0 && !ctaPreview) {
          const nudge = ctaFace === "match" ? -16 : 16;
          track.animate(
            [
              { transform: "translate3d(0, 0, 0)" },
              { transform: `translate3d(${nudge}px, 0, 0)`, offset: 0.4 },
              { transform: "translate3d(0, 0, 0)" },
            ],
            { duration: 760, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)" },
          );
        }
        schedule();
      }, 5000);
    }

    // A scheda nascosta non parte: un movimento che nessuno guarda e solo
    // batteria.
    function sync() {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") schedule();
    }

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [carouselEnabled, isPhone, ctaFace, ctaTrackRef, ctaOffset, ctaPreview]);

  const [editingMatch, setEditingMatch] = useState<PadelMatch | null>(null);
  const [plannedMatches, setPlannedMatches] = useState<PlannedMatch[]>([]);
  const [completingPlannedMatch, setCompletingPlannedMatch] = useState<PlannedMatch | null>(null);
  const [plannedMatchesReady, setPlannedMatchesReady] = useState(true);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [pizzaRankingMode, setPizzaRankingMode] = useState<PizzaRankingMode>("contemporary");
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showAllPlayerMatches, setShowAllPlayerMatches] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [notice, setNotice] = useState("");
  const [profileName, setProfileName] = useState("");
  const [handedness, setHandedness] = useState("");
  const [courtSide, setCourtSide] = useState("");
  const [paypalMeUsername, setPaypalMeUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUrlInitial, setAvatarUrlInitial] = useState("");
  const [teamRecords, setTeamRecords] = useState<PadelTeamRecord[]>([]);
  const [teamSchemaReady, setTeamSchemaReady] = useState(true);
  const [plays, setPlays] = useState<PlayerPlay[]>([]);
  const [playsSchemaReady, setPlaysSchemaReady] = useState(true);
  const [showPlayCreate, setShowPlayCreate] = useState(false);
  const [playingClip, setPlayingClip] = useState<PlayerPlay | null>(null);
  const [seasonRows, setSeasonRows] = useState<SeasonStanding[]>([]);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [rankingAwards, setRankingAwards] = useState<RankingAward[] | null>(null);
  const [tournamentSchemaReady, setTournamentSchemaReady] = useState(true);
  const [showTournamentCreate, setShowTournamentCreate] = useState(false);
  const [showTeamCreate, setShowTeamCreate] = useState(false);
  // Il torneo che si sta correggendo: lo stesso foglio della creazione, con
  // dentro quello che c'e gia.
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [tournamentMatch, setTournamentMatch] = useState<TournamentMatchContext | null>(null);

  const loadData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    // Sigilla le stagioni concluse non ancora archiviate. La funzione è
    // idempotente: se non c'è nulla da fare esce subito.
    const thisYear = new Date().getFullYear();
    for (let year = thisYear - 1; year >= thisYear - 5; year -= 1) {
      await client.rpc("archive_padel_season", { p_season: year });
    }

    const [
      profilesResult,
      matchesResult,
      pizzaResult,
      teamsResult,
      seasonsResult,
      playsResult,
      pizzaSessionsResult,
      pizzaSessionVotesResult,
      tournamentsResult,
      courtsResult,
      setFlagsResult,
      lineageResult,
      originResult,
      mvpMatchesResult,
      mvpVotesResult,
      mvpProgressResult,
      plannedMatchesResult,
    ] = await Promise.all([
      client.from("profiles").select("*").order("rating", { ascending: false }),
      client
        .from("matches")
        .select("id, is_friendly, played_at, created_at, created_by, winner_team, notes, video_url, rating_delta, sets:match_sets(set_number, team1_games, team2_games), players:match_players(profile_id, team, rating_delta, profile:profiles(*))")
        .order("played_at", { ascending: false })
        .order("created_at", { ascending: false }),
      client
        .from("pizza_restaurants")
        .select("id, name, place, created_by, created_at, votes:pizza_votes(restaurant_id, voter_id, location, pizza, dessert, price, bonus_fabio)")
        .order("created_at", { ascending: false }),
      client.from("padel_teams").select("id, player_a, player_b, name, image_path"),
      client
        .from("padel_season_standings")
        .select("season, profile_id, position, rating, matches_played, wins, losses, current_streak")
        .order("season", { ascending: false })
        .order("position", { ascending: true }),
      client
        .from("player_plays")
        .select("id, profile_id, match_id, title, video_url, start_seconds, duration_seconds, created_by, created_at")
        .order("created_at", { ascending: false }),
      client
        .from("pizza_sessions")
        .select("id, restaurant_id, opened_by, opened_at, completed_at, is_solo, average_location, average_pizza, average_dessert, average_price, final_score, participants:pizza_session_participants(voter_id, voted_at)")
        .order("opened_at", { ascending: false }),
      // La RLS nasconde i voti altrui finché tutti i partecipanti non hanno votato.
      client
        .from("pizza_session_votes")
        .select("session_id, voter_id, location, pizza, dessert, price, bonus_fabio"),
      client
        .from("padel_tournaments")
        .select("id, name, status, trophy_name, trophy_badge, trophy_image_path, elo_multiplier, sets_format, legs, mode, target_matches, individual_schedule, created_by, created_at, participants:tournament_participants(profile_id, sort_order), teams:tournament_teams(id, tournament_id, name, player_a, player_b, sort_order), fixtures:tournament_fixtures(id, tournament_id, match_number, team1_id, team2_id, player1_id, player2_id, player3_id, player4_id, match_id, leg)")
        .order("created_at", { ascending: false }),
      // Il campo da gioco sta in una query a parte: se la migrazione non e
      // stata eseguita questa fallisce da sola, senza portarsi dietro il
      // caricamento delle partite.
      client.from("matches").select("id, court"),
      // Stesso motivo per il set interrotto: finche migration-pareggi.sql
      // non e stata eseguita la colonna non esiste e i set risultano tutti
      // completi, che e esattamente com'erano prima.
      client.from("match_sets").select("match_id, set_number, incomplete"),
      // La discendenza e la sua riga di nascita: da queste due esce chi ha
      // registrato la partita la prima volta e quando, che e quello su cui si
      // reggono i permessi di correzione ed eliminazione. In query separate come
      // il campo e i set interrotti: senza la migrazione dello storico
      // falliscono da sole e l'origine ricade su created_by e created_at, cioe
      // su come funzionava prima.
      client.from("matches").select("id, lineage_id"),
      client.from("match_events").select("lineage_id, author_id, created_at").eq("kind", "created"),
      // Le query MVP restano separate da quella principale: prima della
      // migrazione l'archivio partite continua così a caricarsi normalmente.
      client
        .from("matches")
        .select("id, mvp_voting_enabled, mvp_voting_closed_at, mvps:match_mvps(profile_id, awarded_at)"),
      client.from("match_mvp_votes").select("match_id, target_id"),
      client.rpc("match_mvp_progress"),
      // Le partite senza risultato vivono in una tabella separata: se la
      // migrazione non c'e ancora, lo storico concluso continua a caricarsi.
      client
        .from("planned_matches")
        .select("id, played_at, created_at, created_by, notes, court, players:planned_match_players(profile_id, team, profile:profiles(*))")
        .order("played_at", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (profilesResult.error || matchesResult.error) {
      setNotice(profilesResult.error?.message ?? matchesResult.error?.message ?? "Non è stato possibile caricare i dati.");
    } else {
      const withAvatars = (profilesResult.data ?? []).map((profile) => ({
        ...profile,
        // avatar_path ospita due cose: il percorso nello storage oppure, se
        // comincia con http, un indirizzo esterno già pronto (utile per le GIF).
        avatar_url: profile.avatar_path
          ? /^https?:\/\//i.test(profile.avatar_path)
            ? profile.avatar_path
            : client.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
      })) as Profile[];
      const profileMap = new Map(withAvatars.map((profile) => [profile.id, profile]));
      const loadedTournaments = tournamentsResult.error ? [] : (tournamentsResult.data ?? []) as unknown as Tournament[];
      const fixtureByMatch = new Map(
        loadedTournaments.flatMap((tournament) => tournament.fixtures)
          .filter((fixture) => fixture.match_id)
          .map((fixture) => [fixture.match_id as string, fixture.id]),
      );
      // Vuota finche la migrazione del campo da gioco non e stata eseguita.
      const courtMap = new Map(
        courtsResult.error
          ? []
          : ((courtsResult.data ?? []) as { id: string; court: string | null }[]).map((row) => [row.id, row.court]),
      );
      // Vuota finche la migrazione dei pareggi non e stata eseguita.
      const incompleteSets = new Set(
        setFlagsResult.error
          ? []
          : ((setFlagsResult.data ?? []) as { match_id: string; set_number: number; incomplete: boolean }[])
              .filter((row) => row.incomplete)
              .map((row) => `${row.match_id}|${row.set_number}`),
      );
      const mvpReady = !mvpMatchesResult.error && !mvpVotesResult.error && !mvpProgressResult.error;
      const mvpMatchMap = new Map(
        mvpMatchesResult.error
          ? []
          : ((mvpMatchesResult.data ?? []) as unknown as MvpMatchState[]).map((row) => [row.id, row]),
      );
      const viewerMvpVoteMap = new Map(
        mvpVotesResult.error
          ? []
          : ((mvpVotesResult.data ?? []) as ViewerMvpVote[]).map((row) => [row.match_id, row.target_id]),
      );
      const mvpProgressMap = new Map(
        mvpProgressResult.error
          ? []
          : ((mvpProgressResult.data ?? []) as MvpProgress[]).map((row) => [row.match_id, row]),
      );
      // Vuote finche la migrazione dello storico non e stata eseguita: allora
      // l'origine ricade su created_by/created_at della riga, che e come si
      // comportava l'app prima dei permessi.
      const lineageMap = new Map(
        lineageResult.error
          ? []
          : ((lineageResult.data ?? []) as { id: string; lineage_id: string | null }[])
              .map((row) => [row.id, row.lineage_id ?? row.id] as const),
      );
      // Una discendenza ha una riga di nascita sola, ma se per qualche motivo ne
      // avesse due vale la prima: e quello l'istante da cui contano le 24 ore.
      const originMap = new Map<string, { author_id: string | null; created_at: string }>();
      if (!originResult.error) {
        for (const event of (originResult.data ?? []) as { lineage_id: string; author_id: string | null; created_at: string }[]) {
          const known = originMap.get(event.lineage_id);
          if (!known || event.created_at < known.created_at) originMap.set(event.lineage_id, event);
        }
      }
      const normalized = (matchesResult.data ?? []).map((match) => {
        const origin = originMap.get(lineageMap.get(match.id) ?? match.id);
        return {
        ...match,
        origin_at: origin?.created_at ?? match.created_at ?? null,
        origin_by: origin?.author_id ?? match.created_by ?? null,
        court: courtMap.get(match.id) ?? null,
        tournament_fixture_id: fixtureByMatch.get(match.id) ?? null,
        mvp_voting_enabled: !match.is_friendly && !fixtureByMatch.has(match.id) && (mvpMatchMap.get(match.id)?.mvp_voting_enabled ?? false),
        mvp_voting_closed_at: mvpMatchMap.get(match.id)?.mvp_voting_closed_at ?? null,
        mvps: mvpMatchMap.get(match.id)?.mvps ?? [],
        mvp_votes_cast: mvpProgressMap.get(match.id)?.votes_cast ?? 0,
        mvp_total_voters: mvpProgressMap.get(match.id)?.total_voters ?? 0,
        viewer_mvp_vote: viewerMvpVoteMap.get(match.id) ?? null,
        sets: (match.sets ?? []).map((set) => ({
          ...set,
          incomplete: incompleteSets.has(`${match.id}|${set.set_number}`),
        })),
        players: (match.players ?? []).map((player) => ({
          ...player,
          profile: profileMap.get(player.profile_id) ?? player.profile,
        })),
        };
      }) as unknown as PadelMatch[];
      // Il premio Elo arriva alla partita conclusiva del torneo, ma non e
      // incluso nei rating_delta dei giocatori: lo chiediamo alla stessa RPC
      // usata dal ricalcolo, cosi il grafico lo colloca nel giorno giusto.
      const matchById = new Map(normalized.map((match) => [match.id, match]));
      const completedTournaments = loadedTournaments.filter((tournament) => tournamentIsCompleted(tournament, normalized));
      const awardResults = await Promise.all(completedTournaments.map(async (tournament) => {
        const closingMatch = tournament.fixtures
          .map((fixture) => fixture.match_id ? matchById.get(fixture.match_id) : null)
          .filter((match): match is PadelMatch => Boolean(match))
          .sort((a, b) =>
            new Date(b.played_at).getTime() - new Date(a.played_at).getTime()
            || new Date(b.created_at ?? b.played_at).getTime() - new Date(a.created_at ?? a.played_at).getTime()
            || b.id.localeCompare(a.id),
          )[0];
        if (!closingMatch) return { data: [], error: null };
        const result = await client.rpc("tournament_elo_awards", { p_tournament_id: tournament.id });
        return {
          data: ((result.data ?? []) as { profile_id: string; points: number }[]).map((award) => ({
            matchId: closingMatch.id, profileId: award.profile_id, points: award.points,
          })),
          error: result.error,
        };
      }));
      setRankingAwards(awardResults.some((result) => result.error) ? null : awardResults.flatMap((result) => result.data));
      setProfiles(withAvatars);
      setMatches(normalized);
      setPlannedMatchesReady(!plannedMatchesResult.error);
      if (!plannedMatchesResult.error) {
        setPlannedMatches((plannedMatchesResult.data ?? []).map((planned) => ({
          ...planned,
          players: (planned.players ?? []).map((player) => ({
            ...player,
            profile: profileMap.get(player.profile_id) ?? player.profile,
          })),
        })) as unknown as PlannedMatch[]);
      }
      setMvpSchemaReady(mvpReady);
      setTournamentSchemaReady(!tournamentsResult.error);
      if (!tournamentsResult.error) {
        setTournaments(loadedTournaments.map((tournament) => ({
          ...tournament,
          teams: [...(tournament.teams ?? [])].sort((a, b) => a.sort_order - b.sort_order),
          fixtures: [...(tournament.fixtures ?? [])].sort((a, b) => a.match_number - b.match_number),
        })));
      }
      setPizzaSchemaReady(!pizzaResult.error);
      if (!pizzaResult.error) setPizzaRestaurants((pizzaResult.data ?? []) as PizzaRestaurantRecord[]);
      // Finché la migrazione delle sessioni non è stata eseguita queste query
      // query falliscono da sole, senza portarsi dietro il resto.
      setPizzaSessionsReady(!pizzaSessionsResult.error);
      if (!pizzaSessionsResult.error) setPizzaSessions((pizzaSessionsResult.data ?? []) as PizzaSession[]);
      if (!pizzaSessionVotesResult.error) {
        setPizzaSessionVotes((pizzaSessionVotesResult.data ?? []) as PizzaSessionVote[]);
      }
      // Se la migrazione delle squadre non è ancora stata eseguita la query
      // fallisce: il resto dell'app deve continuare a funzionare.
      if (!seasonsResult.error) setSeasonRows((seasonsResult.data ?? []) as SeasonStanding[]);
      setPlaysSchemaReady(!playsResult.error);
      if (!playsResult.error) setPlays((playsResult.data ?? []) as PlayerPlay[]);
      setTeamSchemaReady(!teamsResult.error);
      if (!teamsResult.error) {
        setTeamRecords(
          ((teamsResult.data ?? []) as PadelTeamRecord[]).map((record) => ({
            ...record,
            image_url: record.image_path
              ? client.storage.from("avatars").getPublicUrl(record.image_path).data.publicUrl
              : null,
          })),
        );
      }
      const own = withAvatars.find((profile) => profile.id === session?.user.id);
      setProfileName(own?.display_name ?? "");
      setHandedness(own?.handedness ?? "");
      setCourtSide(own?.court_side ?? "");
      setPaypalMeUsername(own?.paypal_me_username ?? "");
      const ownExternal = /^https?:\/\//i.test(own?.avatar_path ?? "") ? own?.avatar_path ?? "" : "";
      setAvatarUrl(ownExternal);
      setAvatarUrlInitial(ownExternal);
    }
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const sorted = useMemo(() => sortPadelProfiles(profiles), [profiles]);
  const rankedProfiles = useMemo(() => sorted.filter((profile) => profile.matches_played > 0), [sorted]);
  const currentYear = new Date().getFullYear();
  const archivedSeasons = useMemo(
    () => [...new Set(seasonRows.map((row) => row.season))].sort((a, b) => b - a),
    [seasonRows],
  );
  // Stagione corrente: dati vivi. Stagione passata: la fotografia archiviata,
  // riagganciata ai profili solo per nome e foto.
  const seasonProfiles = useMemo(() => {
    if (season === currentYear) return profiles;
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return seasonRows
      .filter((row) => row.season === season)
      .map((row) => {
        const base = byId.get(row.profile_id);
        if (!base) return null;
        return {
          ...base,
          rating: row.rating,
          matches_played: row.matches_played,
          wins: row.wins,
          losses: row.losses,
          current_streak: row.current_streak,
        };
      })
      .filter(Boolean) as Profile[];
  }, [season, currentYear, seasonRows, profiles]);

  const teams = useMemo(
    () => buildPadelTeams(matches, profiles, teamRecords),
    [matches, profiles, teamRecords],
  );
  const isCurrentSeason = season === currentYear;
  // Le coppie di una stagione passata si ricostruiscono dalle partite di
  // quell'anno: l'archivio conserva le posizioni dei singoli, non quelle
  // delle squadre.
  // Le coppie di una stagione chiusa vanno lette con i punteggi di quella
  // stagione, non con quelli di oggi: altrimenti la classifica del singolo
  // resta ferma nell'archivio mentre quella delle squadre continua a
  // muoversi. Chi non compare nell'archivio tiene il profilo vivo, cosi la
  // coppia non sparisce dall'elenco.
  const seasonTeams = useMemo(() => {
    if (isCurrentSeason) return teams;
    const own = matches.filter((match) => new Date(match.played_at).getFullYear() === season);
    const frozen = new Map(profiles.map((profile) => [profile.id, profile]));
    seasonProfiles.forEach((profile) => frozen.set(profile.id, profile));
    return buildPadelTeams(own, [...frozen.values()], teamRecords);
  }, [isCurrentSeason, teams, matches, profiles, seasonProfiles, teamRecords, season]);
  // Da qui in giu si parla di classifica, quindi solo coppie battezzate.
  // "teams" resta la lista completa: serve alla scheda del giocatore, dove
  // le squadre senza nome sono proprio quelle da sistemare.
  const rankedTeams = useMemo(() => rankedPadelTeams(teams), [teams]);
  const rankedSeasonTeams = useMemo(() => rankedPadelTeams(seasonTeams), [seasonTeams]);
  // Le coppie formate, buone per tutti: la scheda del giocatore, il modulo del
  // torneo. Due giocatori qualsiasi restano una coppia possibile, non una
  // squadra.
  const savedTeams = useMemo(() => teams.filter((team) => team.isSaved), [teams]);
  // Solo le squadre formate davvero. Le coppie che hanno soltanto giocato
  // insieme una volta non sono squadre di nessuno: restano nello storico
  // delle partite, e se qualcuno le vuole se le forma dal tasto qui sotto —
  // le partite gia giocate se le ritrova appese.
  const playerTeams = useMemo(
    () => teams.filter((team) => team.isSaved && team.players.some((profile) => profile.id === selectedPlayerId)),
    [teams, selectedPlayerId],
  );
  const contemporaryPizzaEntries = useMemo(
    () => buildContemporaryPizzaRanking(pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles),
    [pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles],
  );
  const classicPizzaEntries = useMemo(
    () => buildClassicPizzaRanking(pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles),
    [pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles],
  );
  const viewerId = session?.user.id ?? "";
  const personalPizzaEntries = useMemo(
    () => buildPersonalPizzaRanking(
      pizzaRestaurants,
      pizzaSessions,
      pizzaSessionVotes,
      profiles,
      viewerId,
    ),
    [pizzaRestaurants, pizzaSessions, pizzaSessionVotes, profiles, viewerId],
  );
  const hasPersonalPizzaRanking = personalPizzaEntries.length > 0;
  const activePizzaRankingMode = pizzaRankingMode === "personal" && !hasPersonalPizzaRanking
    ? "contemporary"
    : pizzaRankingMode;
  const pizzaEntries = activePizzaRankingMode === "classic"
    ? classicPizzaEntries
    : activePizzaRankingMode === "personal"
      ? personalPizzaEntries
      : contemporaryPizzaEntries;
  const currentUser = profiles.find((profile) => profile.id === session?.user.id);
  // Votazioni ancora aperte: alimentano sia la card in cima alla pagina pizza
  // sia il pallino sull'icona della barra.
  const openPizzaSessions = pizzaSessions.filter(sessionIsOpen);
  // Il nome della pizzeria dell'ultima serata chiusa, per il titolo di Pizza.
  const lastClosedPizzaSession = pizzaSessions.find((item) => item.completed_at);
  const lastPizzaNight = lastClosedPizzaSession
    ? pizzaRestaurants.find((item) => item.id === lastClosedPizzaSession.restaurant_id)?.name ?? null
    : null;
  const pendingPizzaVotes = openPizzaSessions.filter(
    (openSession) => openSession.participants.some((participant) => participant.voter_id === session?.user.id)
      && !pizzaSessionVotes.some(
      (vote) => vote.session_id === openSession.id && vote.voter_id === session?.user.id,
    ),
  );
  // Le partite che aspettano il voto di chi guarda: ha giocato, la votazione
  // e aperta e lui non ha ancora votato. Alimentano il pallino sull'icona
  // Padel e la pastiglia sul riquadro delle partite; dentro alla card ci
  // pensa MatchCard, che la stessa cosa la sa gia per conto suo.
  // La scadenza a 12 ore non si guarda qui: a chiuderle e il lavoro che gira
  // ogni minuto su Supabase, e mvp_voting_closed_at arriva da li.
  // L'id di chi guarda, letto una volta: dentro al useMemo il React Compiler
  // non riesce a restringere `session?.user.id` e si tiene tutto `session?.user`,
  // che cambia piu spesso della dipendenza scritta a mano. Il lint segnala lo
  // scarto e salta l'ottimizzazione dell'intero componente.
  const viewerMvpId = session?.user.id;
  const pendingMvpMatches = useMemo(
    () => matches.filter((match) => !match.is_friendly && !match.tournament_fixture_id && match.mvp_voting_enabled
      && !match.mvp_voting_closed_at
      && (match.mvps ?? []).length === 0
      && !match.viewer_mvp_vote
      && match.players.some((player) => player.profile_id === viewerMvpId)),
    [matches, viewerMvpId],
  );
  // Il numero sull'icona in Home. La Badging API esiste solo per la web app
  // salvata sulla schermata Home — iOS e iPadOS dalla 16.4, Android con la
  // PWA installata — e su iPhone il numero si vede solo se sono state
  // concesse le notifiche. Dove non c'e, il metodo non esiste sull'oggetto e
  // non succede niente: nessun controllo di piattaforma da tenere aggiornato.
  // Senza service worker il numero si aggiorna quando l'app e aperta, e resta
  // sull'icona dopo che la chiudi. Per farlo cambiare ad app chiusa servono le
  // notifiche push vere: vedi LAVORI.md.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const icona = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const totale = pendingMvpMatches.length + pendingPizzaVotes.length;
    if (totale > 0) icona.setAppBadge?.(totale).catch(() => {});
    else icona.clearAppBadge?.().catch(() => {});
  }, [pendingMvpMatches.length, pendingPizzaVotes.length]);

  const currentRank = currentUser?.matches_played ? rankOf(sorted, currentUser.id) : 0;

  const selectedPlayer = profiles.find((profile) => profile.id === selectedPlayerId) ?? null;
  const isOwnCard = view === "padel" && padelView === "player" && selectedPlayerId === session?.user.id;
  // La scheda giocatore e una pagina del Padel, ma fa da profilo per tutte le
  // sezioni: mentre e aperta la barra resta quella della sezione da cui si e
  // partiti, non quella del Padel.
  const isPlayerCard = view === "padel" && padelView === "player";
  const navSection: Section | null = isPlayerCard
    ? lastSection
    : (view === "home" ? null : view);
  // Quale delle due voci centrali e accesa. Archivio partite e tornei stanno
  // sotto la voce della sezione: sono pagine del Padel, non una classifica.
  const sectionView: SectionView = navSection === "padel"
    ? (padelView === "ranking" ? "ranking" : "overview")
    : navSection === "pizza"
      ? pizzaView
      : navSection === "gaming"
        ? (gamingView === "mw4-ranking" ? "ranking" : "overview")
        : "overview";
  const selectedPlayerRank = selectedPlayer?.matches_played ? rankOf(sorted, selectedPlayer.id) : 0;
  const selectedPlayerMatches = selectedPlayer
    ? matches.filter((match) => match.players.some((player) => player.profile_id === selectedPlayer.id))
    : [];
  const visiblePlayerMatches = showAllPlayerMatches
    ? selectedPlayerMatches
    : selectedPlayerMatches.slice(0, PROFILE_MATCH_PREVIEW);
  const selectedPlayerPlays = selectedPlayer
    ? plays.filter((play) => play.profile_id === selectedPlayer.id)
    : [];
  // Tutta la bacheca confronta il giocatore con la cronologia del gruppo.
  const selectedPlayerBadges = useMemo(() => {
    if (!selectedPlayer) return [];
    return playerBadges(selectedPlayer, profiles, matches);
  }, [selectedPlayer, profiles, matches]);
  const earnedPlayerBadges = selectedPlayerBadges.filter((badge) => badge.unlocked);
  const editingTournamentContext: TournamentMatchContext | null = (() => {
    const fixtureId = editingMatch?.tournament_fixture_id;
    if (!fixtureId) return null;
    for (const tournament of tournaments) {
      const fixture = tournament.fixtures.find((item) => item.id === fixtureId);
      if (!fixture) continue;
      const team1 = tournament.teams.find((team) => team.id === fixture.team1_id);
      const team2 = tournament.teams.find((team) => team.id === fixture.team2_id);
      const playerIds = tournament.mode === "individual"
        ? [fixture.player1_id, fixture.player2_id, fixture.player3_id, fixture.player4_id]
        : [team1?.player_a, team1?.player_b, team2?.player_a, team2?.player_b];
      if (playerIds.some((id) => !id)) return null;
      return {
        fixtureId,
        tournamentName: tournament.name,
        eloMultiplier: tournament.elo_multiplier,
        setsFormat: tournamentSetsFormat(tournament),
        playerIds: playerIds as [string, string, string, string],
      };
    }
    return null;
  })();
  const selectedPlayerAwards: TournamentAwardEntry[] = selectedPlayer ? tournaments.flatMap((tournament) => {
    if (!tournament.trophy_image_path || !tournamentIsCompleted(tournament, matches)) return [];
    const monkeyAwards = tournament.trophy_image_path === MONKEY_TROPHY_PATH;
    if (tournament.mode === "individual") {
      const position = buildIndividualStandings(tournament, matches).find((row) => row.profileId === selectedPlayer.id)?.rankPosition;
      return position && (position === 1 || (monkeyAwards && position <= 3))
        ? [{ tournament, placement: position as 1 | 2 | 3 }] : [];
    }
    const standings = buildTournamentStandings(tournament, matches);
    const position = standings.findIndex((row) => row.team.player_a === selectedPlayer.id || row.team.player_b === selectedPlayer.id);
    if (position < 0) return [];
    if (monkeyAwards && position < 3) return [{ tournament, placement: (position + 1) as 1 | 2 | 3 }];
    const winner = standings[0];
    const row = standings[position];
    const tiedFirst = winner && row.wins === winner.wins
      && row.directWins === winner.directWins
      && row.gamesWon - row.gamesLost === winner.gamesWon - winner.gamesLost
      && row.gamesWon === winner.gamesWon;
    return tiedFirst ? [{ tournament, placement: 1 as const }] : [];
  }) : [];
  // Con i parimerito il giocatore da raggiungere è il primo con punteggio più
  // alto, non semplicemente quello nella riga precedente.
  const nextRankedPlayer = currentUser
    ? [...sorted].reverse().find((profile) => profile.rating > currentUser.rating) ?? null
    : null;
  const pointsToNext = nextRankedPlayer && currentUser
    ? Math.max(0, nextRankedPlayer.rating - currentUser.rating)
    : 0;
  // Lo stesso conto per la scheda aperta, che non e per forza la propria.
  const playerNextRanked = selectedPlayer
    ? [...sorted].reverse().find((profile) => profile.rating > selectedPlayer.rating) ?? null
    : null;
  const playerPointsToNext = playerNextRanked && selectedPlayer
    ? Math.max(0, playerNextRanked.rating - selectedPlayer.rating)
    : 0;
  // Ultimo posto e vantaggio risicato guardano solo chi ha gia giocato:
  // rankedProfiles (piu sopra) contiene gia i soli profili in classifica.
  const isLastRanked = Boolean(
    currentUser && rankedProfiles.length > 1 && rankedProfiles[rankedProfiles.length - 1]?.id === currentUser.id,
  );
  const chaserPlayer = currentUser
    ? rankedProfiles.find((profile) => profile.rating < currentUser.rating) ?? null
    : null;
  const leadOverChaser = chaserPlayer && currentUser ? currentUser.rating - chaserPlayer.rating : 0;
  const hasNarrowLead = leadOverChaser >= 1 && leadOverChaser <= 5;
  // Il numero casuale si estrae una volta sola all'apertura della schermata
  // (initializer pigro di useState), cosi la frase non cambia a ogni render
  // mentre si naviga tra le sezioni. AppShell esiste solo dopo il login,
  // quindi l'HTML statico non contiene nessuna frase da reidratare.
  const [greetingSeed] = useState(() => Math.random());
  // Saluto e frase si pescano indipendentemente: con un solo numero casuale
  // le due scelte sarebbero rimaste sempre appaiate.
  const [saluteSeed] = useState(() => Math.random());
  const currentUserId = currentUser?.id ?? null;
  const currentUserName = currentUser?.display_name ?? "";

  // Le partite scelte dai pallini. Il filtro sta qui e non dentro al foglio
  // perché lo stesso elenco serve in due posti: l'anteprima nella card e il
  // raccoglitore per mese. Una partita è "di torneo" se il calendario di un
  // torneo la rivendica, cioè se porta con sé il turno da cui è nata.
  const filteredMatches = useMemo(() => {
    if (matchesMode === "mine" && currentUserId) {
      return matches.filter((match) => match.players.some((player) => player.profile_id === currentUserId));
    }
    return matches;
  }, [matches, matchesMode, currentUserId]);

  const sheetPeriodMatches = useMemo(() => filterMatchPeriod(filteredMatches, resultPeriod), [filteredMatches, resultPeriod]);
  const sheetResultMatches = useMemo(() => filterMatchResults(sheetPeriodMatches, resultFilter, currentUserId ?? undefined), [sheetPeriodMatches, resultFilter, currentUserId]);
  const archivePeriodMatches = useMemo(() => filterMatchPeriod(matches, resultPeriod), [matches, resultPeriod]);
  const archiveResultMatches = useMemo(() => filterMatchResults(archivePeriodMatches, resultFilter, currentUserId ?? undefined), [archivePeriodMatches, resultFilter, currentUserId]);

  const filteredPlannedMatches = useMemo(() => {
    if (matchesMode === "mine" && currentUserId) {
      return plannedMatches.filter((match) => match.created_by === currentUserId
        || match.players.some((player) => player.profile_id === currentUserId));
    }
    return plannedMatches;
  }, [plannedMatches, matchesMode, currentUserId]);

  // Nessuna partita, detto con le parole del filtro attivo: "non ce n'è" e
  // "non ne hai ancora giocate" sono due cose diverse.
  const emptyMatchesNote = matchesMode === "mine"
    ? "Non hai partite da giocare o risultati registrati."
    : "Nessuna partita creata o registrata.";

  // Le partite del foglio, divise per mese. Il filtro agisce prima del
  // raggruppamento, così i conteggi sui raccoglitori dicono quante partite ci
  // sono davvero dentro e non quante ce ne sarebbero in totale.
  const matchMonths = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; matches: PadelMatch[] }>();
    sheetResultMatches.forEach((match) => {
      const date = new Date(match.played_at);
      // La chiave è ordinabile come testo, quindi il riordino qui sotto non
      // ha bisogno di ricostruire nessuna data.
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      let group = groups.get(key);
      if (!group) {
        const name = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(date);
        group = { key, label: name.charAt(0).toUpperCase() + name.slice(1), matches: [] };
        groups.set(key, group);
      }
      group.matches.push(match);
    });
    return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [sheetResultMatches]);

  // Il mese più recente è già aperto quando il foglio sale, e torna ad
  // aprirsi passando fra tutte le partite e le proprie: è quello che si va a
  // guardare quasi sempre, e farlo aprire a mano ogni volta era un tocco
  // chiesto per abitudine.
  // Il valore si ricava invece di essere scritto in uno stato: chi apre il
  // foglio o cambia insieme azzera la scelta, e da lì il mese giusto si
  // rilegge da solo. Tenerlo in uno stato da sincronizzare vorrebbe dire
  // riscriverlo a ogni ricarica dei dati, e il raccoglitore che stavi
  // leggendo si richiuderebbe mentre lo guardi.
  const latestMonthKey = matchMonths[0]?.key ?? null;
  const openMonth = chosenMonth === undefined ? latestMonthKey : chosenMonth;

  // Profilo e scheda giocatore sono la stessa pagina: la propria è solo la
  // scheda di sé stessi, con in più i campi modificabili. Memoizzata perche
  // finisce fra le voci della barra mobile, che altrimenti verrebbero
  // ricostruite a ogni render.
  const openOwnCard = useCallback(() => {
    if (!currentUserId) return;
    setSectionProfile(null);
    setSelectedPlayerId(currentUserId);
    setShowAllPlayerMatches(false);
    setPadelView("player");
    setView("padel");
  }, [currentUserId]);

  // Il profilo Padel si apre dalla home o dal Padel. Dentro MW4 si apre
  // quello del gioco; Pizza, Cashout e la selezione Gaming non hanno questa voce.
  const isOwnProfile = isOwnCard || (view === "gaming" && gamingView === "mw4-profile")
    || (sectionProfile === "home" && view === "home") || (sectionProfile !== null && sectionProfile === view);
  const isGamingOverview = navSection === "gaming" && gamingView === "overview";
  // Ogni sezione ha il suo profilo; la pagina dei giochi no, perche ancora
  // non si sa di quale gioco.
  const hasContextProfile = !isGamingOverview;
  const openProfile = useCallback(() => {
    if (!hasContextProfile) return;
    if (navSection === null || navSection === "pizza" || navSection === "cashout") {
      setSectionProfile(navSection ?? "home");
      scrollPageTo(0, "instant" as ScrollBehavior);
      return;
    }
    if (navSection === "padel") {
      openOwnCard();
      return;
    }
    setView("gaming");
    setLastSection("gaming");
    setGamingView("mw4-profile");
    scrollPageTo(0, "instant" as ScrollBehavior);
  }, [navSection, hasContextProfile, openOwnCard]);

  // Torna allo smistamento. Azzera anche l'ultima sezione: in home la barra
  // ha due voci sole, e senza azzerarlo resterebbero quelle della sezione da
  // cui si e usciti.
  const goHome = useCallback(() => {
    setSectionProfile(null);
    setLastSection(null);
    setView("home");
    scrollPageTo(0, "instant" as ScrollBehavior);
  }, []);

  // Apre una sezione dalla sua pagina principale.
  const openSection = useCallback((section: Section) => {
    setLastSection(section);
    setView(section);
    if (section === "padel") setPadelView("overview");
    if (section === "pizza") setPizzaView("overview");
    if (section === "gaming") setGamingView("overview");
    setGamingAction(null);
    setSectionProfile(null);
    setCashoutGroupId(null);
    scrollPageTo(0, "instant" as ScrollBehavior);
  }, []);

  // Apre la classifica della sezione: e la terza voce della barra, uguale per
  // tutte e quattro.
  const openSectionRanking = useCallback((section: Section) => {
    setLastSection(section);
    setView(section);
    if (section === "padel") setPadelView("ranking");
    if (section === "pizza") setPizzaView("ranking");
    setSectionProfile(null);
    scrollPageTo(0, "instant" as ScrollBehavior);
  }, []);

  // Lo smistamento e scuro fino ai bordi dello schermo, barre di sistema
  // comprese: il colore lo porta html, non il riquadro. Dipende anche dal
  // caricamento perche la schermata di attesa usa lo stesso interruttore e,
  // smontandosi, se lo porterebbe via lasciando la home chiara.
  useEffect(() => {
    const root = document.documentElement;
    if (view !== "home" || sectionProfile || loading) return;
    root.classList.add("theme-dark");
    return () => root.classList.remove("theme-dark");
  }, [view, sectionProfile, loading]);

  // I due tasti del nastro, disegnati una volta sola: quello in scena e il
  // vicino che arriva sono lo stesso tasto, e devono restarlo — se si
  // scrivessero due volte basterebbe ritoccarne uno per vedere il tasto
  // cambiare aspetto a meta scorrimento.
  //
  // Sta quaggiu e non accanto al nastro di proposito: legge
  // `tournamentSchemaReady` e `setShowTournamentCreate`, e una funzione che usa
  // cose dichiarate piu sotto e roba che il React Compiler non riesce a
  // seguire — si arrende sul componente e smette di riconoscere come stabili
  // tutti i setter dichiarati da li in giu. Verificato il 13 agosto 2026:
  // scritta sopra, `npm run lint` usciva con diciotto errori
  // react-hooks/preserve-manual-memoization su `loadData` e `openOwnCard`, che
  // con questo tasto non c'entrano niente. Regola generale: una funzione
  // scritta nel corpo del componente va dopo tutto quello che legge.
  const ctaButton = (which: "match" | "tournament", ghost: boolean) =>
    which === "match" ? (
      <button
        className="button button-primary cta-new-match cta-in-panel cta-between cta-aurora"
        type="button"
        tabIndex={ghost ? -1 : undefined}
        onClick={ghost ? undefined : () => {
          if (ctaSwipeHandled.current) return;
          setShowMatch(true);
        }}
      >
        Nuovo match
      </button>
    ) : (
      <button
        className="button button-lime cta-new-match cta-in-panel cta-between cta-aurora"
        type="button"
        tabIndex={ghost ? -1 : undefined}
        onClick={ghost ? undefined : () => {
          if (ctaSwipeHandled.current) return;
          setShowTournamentCreate(true);
        }}
        disabled={!tournamentSchemaReady}
      >
        + NUOVO TORNEO
      </button>
    );

  // --- Barra di navigazione mobile -----------------------------------------
  // La pastiglia viene spostata scrivendo direttamente sullo stile: passando
  // da uno stato React ogni movimento del dito farebbe ridisegnare tutta la
  // schermata, e il trascinamento risulterebbe a scatti.
  const navRef = useRef<HTMLElement | null>(null);
  const navPillRef = useRef<HTMLSpanElement | null>(null);
  const navPointerKey = useRef<string | null>(null);
  const navDragging = useRef(false);
  const navPointerStart = useRef<number | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const pageTransitioning = useRef(false);
  const pageSwipeStart = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastAt: number;
    velocityX: number;
    axis: "pending" | "horizontal" | "vertical";
  } | null>(null);

  // Gaming mostra la classifica solo dentro il gioco selezionato.
  const navItems = useMemo(() => {
    // Dal profilo della home la voce Home non e accesa: e il tasto per
    // tornare allo smistamento. Accesa, toccarla faceva solo scorrere in cima.
    const home = { key: "home", glyph: "home" as GlyphName, label: "Home", active: view === "home" && !isOwnProfile, select: goHome };
    const profile = { key: "profile", glyph: "" as GlyphName, label: "Profilo", active: isOwnProfile, select: openProfile };
    if (!navSection) return [home, profile];
    const meta = sectionMeta(navSection);
    if (navSection === "gaming") {
      const games = {
        key: "gaming", glyph: "gamepad" as GlyphName, label: "Gaming",
        active: !isPlayerCard && gamingView === "overview",
        select: () => openSection("gaming"),
      };
      if (gamingView === "overview") return [home, games];
      const selectGameView = (next: GamingView) => {
        setView("gaming");
        setLastSection("gaming");
        setGamingView(next);
        setGamingAction(null);
        scrollPageTo(0, "instant" as ScrollBehavior);
      };
      return [home, {
        key: "gb", glyph: "gamepad" as GlyphName, label: "GB",
        active: !isPlayerCard && gamingView === "mw4",
        select: () => selectGameView("mw4"),
      }, {
        key: "mw4-meta", glyph: "crosshair" as GlyphName, label: "Meta",
        active: !isPlayerCard && gamingView === "mw4-meta",
        select: () => selectGameView("mw4-meta"),
      }, {
        key: "mw4-ranking", glyph: "ranking" as GlyphName, label: "Classifica",
        active: !isPlayerCard && gamingView === "mw4-ranking",
        select: () => selectGameView("mw4-ranking"),
      }, profile];
    }
    if (navSection === "cashout") return [
      home,
      {
        key: meta.key,
        glyph: meta.glyph as GlyphName,
        label: meta.label,
        active: !isPlayerCard && !isOwnProfile,
        select: () => openSection(navSection),
      },
      profile,
    ];
    return [
      home,
      {
        key: meta.key,
        glyph: meta.glyph as GlyphName,
        label: meta.label,
        active: !isPlayerCard && !isOwnProfile && sectionView === "overview",
        select: () => openSection(navSection),
      },
      {
        key: "ranking",
        glyph: "ranking" as GlyphName,
        label: "Classifica",
        active: !isPlayerCard && !isOwnProfile && sectionView === "ranking",
        select: () => openSectionRanking(navSection),
      },
      profile,
    ];
  }, [view, navSection, sectionView, gamingView, isPlayerCard, isOwnProfile, openProfile, goHome, openSection, openSectionRanking]);

  const navActiveIndex = navItems.findIndex((item) => item.active);

  // Toccare la voce su cui si e gia riporta in cima, come nelle app di
  // sistema. Lo scorrimento e morbido perche html ha scroll-behavior.
  const selectNavItem = useCallback((index: number) => {
    const item = navItems[index];
    if (!item) return;
    if (item.active) {
      scrollPageTo(0, "smooth");
      return;
    }
    item.select();
  }, [navItems]);

  // Porta la pastiglia sopra una voce. Con animate = false ci arriva secca,
  // e quello che serve al primo disegno e mentre si trascina.
  // Dove si trova adesso la pastiglia: serve come punto di partenza
  // dell'animazione, perche il valore letto dallo stile e gia quello finale.
  const navPillLeft = useRef(0);

  const placePill = useCallback((index: number, animate: boolean) => {
    const nav = navRef.current;
    const pill = navPillRef.current;
    if (!nav || !pill) return;
    const button = nav.querySelectorAll<HTMLButtonElement>(":scope > button")[index];
    if (!button) {
      pill.style.opacity = "0";
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    pill.getAnimations().forEach((animation) => animation.cancel());
    const from = navPillLeft.current;
    const to = buttonBox.left - navBox.left;
    const wasHidden = pill.style.opacity !== "1";

    // La posizione finale viene scritta subito: l'animazione qui sotto la
    // sovrascrive solo mentre e in corso, cosi alla fine non c'e nessuno
    // scatto di assestamento.
    pill.style.transition = NAV_PILL_TRANSITION;
    pill.style.opacity = "1";
    pill.style.width = `${buttonBox.width}px`;
    pill.style.transform = `translateX(${to}px)`;
    navPillLeft.current = to;

    const distance = Math.abs(to - from);
    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || wasHidden || distance < 1 || reduceMotion || !pill.animate) return;

    // Piu e lungo il salto, piu la pastiglia si allunga nel senso della
    // corsa e si schiaccia in altezza: e la deformazione che da l'idea
    // della goccia che si sposta invece del rettangolo che trasla.
    const steps = distance / Math.max(buttonBox.width, 1);
    const stretch = 1 + Math.min(0.3, steps * 0.13);
    const squash = 1 - Math.min(0.14, steps * 0.06);

    pill.animate(
      [
        { transform: `translateX(${from}px) scale(1, 1)` },
        { transform: `translateX(${(from + to) / 2}px) scale(${stretch}, ${squash})`, offset: 0.45 },
        { transform: `translateX(${to}px) scale(1, 1)` },
      ],
      {
        duration: 340 + Math.min(140, steps * 45),
        easing: "cubic-bezier(0.32, 0.9, 0.28, 1)",
      },
    );
  }, []);

  // Segue il dito, restando dentro i due estremi della barra.
  const movePillTo = useCallback((clientX: number) => {
    const nav = navRef.current;
    const pill = navPillRef.current;
    const buttons = nav?.querySelectorAll<HTMLButtonElement>(":scope > button");
    const first = buttons?.[0];
    const last = buttons?.[buttons.length - 1];
    if (!nav || !pill || !first || !last) return;
    const navBox = nav.getBoundingClientRect();
    const firstBox = first.getBoundingClientRect();
    const lastBox = last.getBoundingClientRect();
    const left = clientX - navBox.left - firstBox.width / 2;
    pill.style.transition = NAV_PILL_TRANSITION;
    pill.style.opacity = "1";
    pill.style.width = `${firstBox.width}px`;
    const clamped = Math.min(
      lastBox.left - navBox.left,
      Math.max(firstBox.left - navBox.left, left),
    );
    pill.style.transform = `translateX(${clamped}px)`;
    navPillLeft.current = clamped;
  }, []);

  const nearestNavIndex = useCallback((clientX: number) => {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    navRef.current?.querySelectorAll<HTMLButtonElement>(":scope > button").forEach((button, index) => {
      if (!button) return;
      const box = button.getBoundingClientRect();
      const distance = Math.abs(clientX - (box.left + box.width / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }, []);

  // Riallinea la pastiglia quando cambia la voce attiva o le misure della
  // barra: qui si tocca solo lo stile, nessuno stato da aggiornare.
  // currentUser e loading sono fra le dipendenze di proposito: la barra
  // viene creata solo quando il profilo e pronto, e senza di loro questo
  // effetto non ripartirebbe al suo arrivo, lasciando la pastiglia
  // invisibile fino al primo cambio di sezione.
  useEffect(() => {
    placePill(navActiveIndex, true);
    const realign = () => placePill(navActiveIndex, false);
    window.addEventListener("resize", realign);
    window.addEventListener("orientationchange", realign);
    return () => {
      window.removeEventListener("resize", realign);
      window.removeEventListener("orientationchange", realign);
    };
  }, [navActiveIndex, navItems.length, placePill, currentUser, loading]);
  const heroGreeting = useMemo(() => {
    const pool = heroGreetingPool(currentRank, isLastRanked, hasNarrowLead);
    const salutes = heroSalutePool(currentRank, isLastRanked);
    const salute = salutes[Math.floor(saluteSeed * salutes.length)] ?? salutes[0];
    return {
      lead: salute.replace("{nome}", currentUserName),
      rest: pool[Math.floor(greetingSeed * pool.length)] ?? pool[0] ?? "",
    };
  }, [currentRank, isLastRanked, hasNarrowLead, currentUserName, greetingSeed, saluteSeed]);
  // La riga viva sotto il nome di ogni card della home. Usa solo dati che la
  // pagina ha gia caricato: Gaming e Cashout caricano i loro alla prima
  // apertura, quindi in home restano con la frase che li spiega.
  const viewerHubId = session?.user.id;
  const hubMe = profiles.find((profile) => profile.id === viewerHubId);
  const hubLastMatch = matches.find((match) => match.players.some((player) => player.profile_id === viewerHubId));
  // Il saldo Cashout di chi guarda, per dirlo in parole sulla card della home.
  const hubCashout = useCashoutSummary(viewerHubId, profiles);
  // E l'ultima GB giocata, per dire "vittoria su Skyline" invece dello slogan.
  const { gbs: hubGbs } = useCodGbs();
  const hubGbsToCheck = hubGbs.filter((gb) => gb.status === "needs_review" && gb.created_by === viewerHubId).length;
  const hubLastGb = hubGbs.find((gb) => gb.status === "processed" && gb.players.some((player) => player.profile_id === viewerHubId));
  const hubLastGbTeam = hubLastGb?.players.find((player) => player.profile_id === viewerHubId)?.team;
  const hubLastGbResult = !hubLastGb || hubLastGb.team1_score === null || hubLastGb.team2_score === null || hubLastGb.team1_score === hubLastGb.team2_score ? "pareggio"
    : (hubLastGbTeam === 1) === (hubLastGb.team1_score > hubLastGb.team2_score) ? "vittoria" : "sconfitta";
  const hubStatus: Record<Section, string> = {
    padel: hubMe?.matches_played
      ? [`#${currentRank} · ${eloLabel(hubMe.rating)} Elo`, hubLastMatch ? lastPlayedLabel(hubLastMatch.played_at) : ""]
        .filter(Boolean).join(" · ")
      : "",
    pizza: pendingPizzaVotes.length
      ? `${pendingPizzaVotes.length} ${pendingPizzaVotes.length === 1 ? "votazione da fare" : "votazioni da fare"}`
      : pizzaEntries[0] ? `In testa: ${pizzaEntries[0].name}` : "",
    gaming: hubGbsToCheck ? `${hubGbsToCheck} GB da verificare`
      : hubLastGb ? `Ultima GB: ${hubLastGbResult} su ${hubLastGb.map_name}` : "",
    cashout: hubCashout.loading || !hubCashout.groups.length ? ""
      : hubCashout.net < -0.005 ? `Devi ${formatMoney(hubCashout.net)}`
        : hubCashout.net > 0.005 ? `Ti devono ${formatMoney(hubCashout.net)}` : "Sei in pari",
  };
  // Stessa formula di padelWinRate, scritta a mano solo qui: una chiamata a
  // funzione in questo punto del componente fa rinunciare il compilatore di
  // React a tutte le memoizzazioni manuali della pagina (lo dice `npm run
  // lint`). Se la formula cambia, cambiala in tutti e due i posti.
  const decidedMatches = currentUser ? currentUser.wins + currentUser.losses : 0;
  const winRate = currentUser && decidedMatches
    ? Math.round((currentUser.wins / decidedMatches) * 100)
    : 0;
  const missingDatabaseSchema =
    notice.includes("public.profiles") ||
    notice.includes("schema cache");

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="topbar"><Brand /></header>
        <main className="content">
          {loading ? (
            <LoadingScreen />
          ) : (
            <div className="empty-state">
              <p className="eyebrow dark">
                {missingDatabaseSchema ? "DATABASE DA CONFIGURARE" : "PROFILO DA COMPLETARE"}
              </p>
              <h1>{missingDatabaseSchema ? "Completa Supabase." : "Profilo non disponibile."}</h1>
              <p>
                {missingDatabaseSchema
                  ? "Esegui lo script schema.sql nel SQL Editor di Supabase, poi ricarica questa pagina."
                  : notice || "Il tuo profilo non è ancora presente nel database Supabase."}
              </p>
              <button className="button button-dark" onClick={() => void supabase?.auth.signOut()}>Esci</button>
            </div>
          )}
        </main>
      </div>
    );
  }

  async function handleSaved(kind: "result" | "planned") {
    const wasEditing = Boolean(editingMatch);
    const wasTournament = Boolean(tournamentMatch || editingTournamentContext);
    const wasPlanned = Boolean(completingPlannedMatch);
    setShowMatch(false);
    setEditingMatch(null);
    setTournamentMatch(null);
    setCompletingPlannedMatch(null);
    await loadData();
    setNotice(
      kind === "planned"
        ? "Partita creata: le squadre casuali sono pronte. Dopo la partita potrai inserire il risultato."
        : wasPlanned
          ? "Risultato salvato. Classifica ed Elo sono stati aggiornati."
          : wasEditing
            ? "Correzione salvata. Classifica e statistiche sono state ricalcolate."
            : wasTournament
              ? "Risultato del torneo salvato. Classifica ed Elo sono stati aggiornati."
              : "Partita salvata. La classifica è stata aggiornata.",
    );
  }

  async function handleDeleted() {
    setEditingMatch(null);
    setTournamentMatch(null);
    await loadData();
    setNotice("Partita eliminata. Classifica e statistiche sono state ricalcolate.");
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file || !supabase || !session) return;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
    setNotice("Caricamento della foto…");
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      setNotice(uploadError.message);
      return;
    }
    const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", session.user.id);
    setNotice(updateError ? updateError.message : "Foto profilo aggiornata.");
    if (!updateError) await loadData();
  }

  async function updateProfile(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session || !profileName.trim()) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: profileName.trim(),
        handedness: handedness || null,
        court_side: courtSide || null,
        paypal_me_username: paypalMeUsername.trim() || null,
      })
      .eq("id", session.user.id);
    setNotice(error ? error.message : "Profilo aggiornato.");
    if (!error) await loadData();
  }

  // La foto da indirizzo web finisce nella stessa colonna del percorso nello
  // storage: chi legge distingue i due casi dal prefisso http (vedi loadData).
  async function saveAvatarUrl() {
    if (!supabase || !session) return;
    const clean = avatarUrl.trim();
    if (clean && !/^https:\/\//i.test(clean)) {
      setNotice("L'indirizzo dell'immagine deve iniziare con https://");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: clean || null })
      .eq("id", session.user.id);
    setNotice(error ? error.message : clean ? "Foto profilo aggiornata." : "Foto profilo rimossa.");
    if (!error) {
      setShowAvatarPicker(false);
      await loadData();
    }
  }

  // Toccare una riga apre l'ultima votazione associata alla pizzeria.
  function showPizzaSession(restaurantId: string, sessionId?: string) {
    const found = sessionId
      ? pizzaSessions.find((item) => item.id === sessionId)
      : pizzaSessions
          .filter((item) => item.restaurant_id === restaurantId)
          .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0];
    if (found) {
      setVotingSession(found);
      return;
    }
    setNotice("Nessuna votazione registrata per questa pizzeria.");
  }

  async function removePlay(play: PlayerPlay) {
    if (!supabase) return;
    const { error } = await supabase.from("player_plays").delete().eq("id", play.id);
    setNotice(error ? error.message : "Play rimossa.");
    if (!error) await loadData();
  }

  async function saveTeam(pairId: string, name: string, file?: File) {
    if (!supabase || !session) return;
    const [player_a, player_b] = pairId.split("|");
    let image_path: string | undefined;

    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      // Le regole dello storage impongono la cartella dell'utente: usiamo
      // quella di chi carica, il file resta pubblico in lettura.
      const path = `${session.user.id}/team-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setNotice(uploadError.message);
        return;
      }
      image_path = path;
    }

    const { error } = await supabase.from("padel_teams").upsert(
      {
        player_a,
        player_b,
        name: name.trim() || null,
        ...(image_path ? { image_path } : {}),
      },
      { onConflict: "player_a,player_b" },
    );

    // Il nome non e un vezzo: e quello che fa entrare la coppia in
    // classifica — insieme alla prima partita giocata, che il nome da solo
    // non basta.
    setNotice(
      error
        ? error.message
        : name.trim()
          ? "Squadra salvata: entra in classifica dalla prima partita insieme."
          : "Squadra senza nome: resta fuori dalla classifica.",
    );
    if (!error) await loadData();
  }

  // Sciogliere una coppia toglie nome, foto e la riga in classifica. Le
  // partite giocate restano dove sono: sono appese ai due giocatori, non alla
  // riga di padel_teams.
  async function deleteTeam(team: PadelTeam) {
    if (!supabase) return;
    if (!window.confirm(`Sciogliere ${teamLabel(team)}? Restano nome e foto da rifare, le partite giocate non si toccano.`)) return;
    const [player_a, player_b] = team.id.split("|");
    const { error } = await supabase
      .from("padel_teams")
      .delete()
      .eq("player_a", player_a)
      .eq("player_b", player_b);
    setNotice(
      error
        ? error.message.includes("policy")
          ? "Per sciogliere una squadra esegui migration-squadre-libere.sql in Supabase."
          : error.message
        : "Squadra sciolta.",
    );
    if (!error) await loadData();
  }

  function openPlayer(profile: Profile) {
    setSelectedPlayerId(profile.id);
    setShowAllPlayerMatches(false);
    setPadelView("player");
  }

  function openPadelPage(next: "matches" | "ranking" | "tournaments") {
    setLastSection("padel");
    setView("padel");
    setPadelView(next);
    scrollPageTo(0, "instant" as ScrollBehavior);
  }

  type MobileDestination = "section" | "home" | "profile";

  // Fra le sezioni si passa solo dalla barra: lo scorrimento laterale faceva
  // cambiare sezione per sbaglio mentre si leggeva. Resta solo il ritorno
  // indietro dagli archivi, che è un gesto senza ambiguità.
  function mobileDestination(direction: "left" | "right"): MobileDestination | null {
    const isPadelArchive = view === "padel"
      && (padelView === "matches" || padelView === "ranking" || padelView === "tournaments");
    if (isPadelArchive) return direction === "right" ? "section" : null;
    return null;
  }

  function openMobileDestination(destination: MobileDestination) {
    if (destination === "home") goHome();
    if (destination === "section") openSection(navSection ?? "padel");
    if (destination === "profile") openProfile();
  }

  function clearPageMotion() {
    const page = contentRef.current;
    if (!page) return;
    page.classList.remove("is-page-dragging", "is-page-transitioning");
    page.style.removeProperty("transform");
    page.style.removeProperty("opacity");
    page.style.removeProperty("filter");
  }

  async function restorePagePosition() {
    const page = contentRef.current;
    if (!page) return;
    // Un semplice tap o uno scroll verticale non hanno mai spostato la
    // pagina: in quel caso non va avviata un'animazione che potrebbe
    // intercettare il click appena dopo il touchend.
    if (!page.classList.contains("is-page-dragging") && !page.style.transform) return;
    const fromTransform = page.style.transform || "translate3d(0, 0, 0)";
    const fromOpacity = page.style.opacity || "1";
    page.classList.remove("is-page-dragging");
    page.classList.add("is-page-transitioning");
    if (!page.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearPageMotion();
      return;
    }
    const animation = page.animate(
      [
        { transform: fromTransform, opacity: fromOpacity },
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: "1" },
      ],
      { duration: 230, easing: "cubic-bezier(0.22, 0.85, 0.25, 1)" },
    );
    try { await animation.finished; } catch { /* gesto interrotto da un nuovo disegno */ }
    clearPageMotion();
  }

  async function completePageSwipe(destination: MobileDestination, direction: "left" | "right") {
    const page = contentRef.current;
    if (!page || pageTransitioning.current) return;
    pageTransitioning.current = true;
    page.classList.remove("is-page-dragging");
    page.classList.add("is-page-transitioning");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const exitSign = direction === "left" ? -1 : 1;
    let transitionLayer: HTMLDivElement | null = null;

    try {
      if (reduceMotion || !page.animate) {
        openMobileDestination(destination);
        scrollPageTo(0, "instant" as ScrollBehavior);
        return;
      }

      // React riusa lo stesso <main> per tutte le sezioni. Ne congeliamo una
      // copia solo per la durata della transizione: cosi il vecchio contenuto
      // puo uscire mentre quello nuovo, gia montato sotto, entra in parallelo.
      const outgoing = page.cloneNode(true) as HTMLElement;
      outgoing.setAttribute("aria-hidden", "true");
      outgoing.classList.remove("is-page-transitioning");
      outgoing.classList.add("is-page-outgoing");
      // Dove si trova adesso il bordo alto della pagina, letto a video: vale
      // sia quando a scorrere e la finestra sia quando scorre il contenuto,
      // e in quel caso offsetTop non direbbe niente di utile.
      const pageTop = page.getBoundingClientRect().top;
      const pageScrolled = page.scrollTop;
      outgoing.style.top = `${pageTop}px`;

      transitionLayer = document.createElement("div");
      transitionLayer.className = "page-transition-layer";
      transitionLayer.setAttribute("aria-hidden", "true");
      transitionLayer.appendChild(outgoing);
      document.body.appendChild(transitionLayer);
      // La copia nasce in cima: senza questo la pagina che esce ripartirebbe
      // dall'inizio invece che dal punto in cui la si stava leggendo.
      outgoing.scrollTop = pageScrolled;

      // Il main vivo resta invisibile mentre React sostituisce i dati: evita
      // un singolo frame della nuova pagina gia ferma al centro.
      page.getAnimations().forEach((animation) => animation.cancel());
      page.style.opacity = "0";
      page.style.filter = "none";
      openMobileDestination(destination);
      scrollPageTo(0, "instant" as ScrollBehavior);

      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const incomingTransform = `translate3d(${-exitSign * 100}vw, 0, 0) scale(0.985)`;
      page.style.transform = incomingTransform;
      page.style.opacity = "1";

      const outgoingTransform = outgoing.style.transform || "translate3d(0, 0, 0) scale(1)";
      const outgoingOpacity = outgoing.style.opacity || "1";
      const timing: KeyframeAnimationOptions = {
        duration: 340,
        easing: "cubic-bezier(0.2, 0.82, 0.2, 1)",
        fill: "forwards",
      };
      const exit = outgoing.animate(
        [
          { transform: outgoingTransform, opacity: outgoingOpacity },
          { transform: `translate3d(${exitSign * 108}vw, 0, 0) scale(0.975)`, opacity: "0.9" },
        ],
        timing,
      );
      const enter = page.animate(
        [
          { transform: incomingTransform, opacity: "1" },
          { transform: "translate3d(0, 0, 0) scale(1)", opacity: "1" },
        ],
        timing,
      );
      try { await Promise.all([exit.finished, enter.finished]); } catch { /* una nuova navigazione puo interromperle */ }
    } finally {
      transitionLayer?.remove();
      clearPageMotion();
      pageTransitioning.current = false;
    }
  }



  return (
    <div className={`app-shell${view === "home" && !sectionProfile ? " app-shell-hub" : ""}`}>
      {/* La sfocatura sotto la barra di sistema dell'iPhone: sfoca tutto
          quello che passa dietro all'ora e alle icone, e finisce dove finisce
          l'area sicura — la pagina vera, che comincia piu sotto, non la tocca.
          Due strati e non uno: la sfocatura non si puo sfumare da sola, e con
          un solo velo mascherato il taglio in basso si vedrebbe. Il secondo,
          piu forte e piu corto, fa da passaggio.
          Il contenitore e fisso ma non sfoca: la sfocatura sta sui figli, che
          sono in posizione assoluta. E la stessa precauzione della barra in
          basso — su iOS un elemento fisso che sfoca viene ridisegnato in
          ritardo durante lo scorrimento. */}
      <div className="system-blur" aria-hidden="true">
        <span />
        <span />
      </div>
      <header className="topbar">
        {/* Le stesse voci della barra in basso, senza il profilo: su desktop
            quello e gia la pastiglia col nome qui a destra. */}
        <nav className="desktop-nav" aria-label="Navigazione principale">
          {navItems.filter((item) => item.key !== "profile").map((item) => (
            <button
              key={item.key}
              className={item.active ? "active" : ""}
              onClick={item.select}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {hasContextProfile ? <button
          className={`profile-chip ${isOwnProfile ? "active" : ""}`}
          onClick={openProfile}
        >
          <span><b>{currentUser.display_name}</b><small>{navSection === "gaming" ? "MW4" : `Padel ${currentRank ? `#${currentRank}` : "N/C"}`}</small></span>
          <Avatar profile={currentUser} size="sm" />
        </button> : null}
      </header>

      {notice ? <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}

      <main
        ref={contentRef}
        className="content"
        onTouchStart={(event) => {
          const page = contentRef.current;
          const target = event.target instanceof Element ? event.target : null;
          // La card della classifica ha un gesto orizzontale suo: se il dito
          // parte da lì, la pagina non si muove. Senza questa esclusione i due
          // gesti partirebbero insieme e si contenderebbero lo stesso dito.
          const ignored = target?.closest("input, select, textarea, label, iframe, video, [role='slider'], [role='dialog'], .tournament-tabs, .badge-grid, .ranking-preview");
          if (!page || pageTransitioning.current || event.touches.length !== 1 || ignored || !window.matchMedia("(max-width: 780px)").matches) {
            pageSwipeStart.current = null;
            return;
          }
          // Dove non si va da nessuna parte la pagina non si muove nemmeno di
          // un pixel. La resistenza elastica ha senso solo se dietro c'è una
          // destinazione che si rifiuta di aprire: in Padel, Pizza e Profilo
          // non c'è, e l'unico effetto era scoprire lo sfondo di lato, che
          // sembra un difetto. Il gesto qui resta quindi del tutto inerte,
          // coerente con quanto decide mobileDestination.
          if (!mobileDestination("left") && !mobileDestination("right")) {
            pageSwipeStart.current = null;
            return;
          }
          const touch = event.touches[0];
          if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) {
            pageSwipeStart.current = null;
            return;
          }
          page.getAnimations().forEach((animation) => animation.cancel());
          const now = performance.now();
          pageSwipeStart.current = {
            x: touch.clientX,
            y: touch.clientY,
            lastX: touch.clientX,
            lastAt: now,
            velocityX: 0,
            axis: "pending",
          };
        }}
        onTouchMove={(event) => {
          const swipe = pageSwipeStart.current;
          const touch = event.touches[0];
          const page = contentRef.current;
          if (!swipe || !touch || !page) return;
          const distanceX = touch.clientX - swipe.x;
          const distanceY = touch.clientY - swipe.y;
          if (swipe.axis === "pending" && Math.max(Math.abs(distanceX), Math.abs(distanceY)) >= 9) {
            swipe.axis = Math.abs(distanceX) > Math.abs(distanceY) * 1.15 ? "horizontal" : "vertical";
          }
          if (swipe.axis !== "horizontal") return;

          const now = performance.now();
          const elapsed = Math.max(1, now - swipe.lastAt);
          swipe.velocityX = (touch.clientX - swipe.lastX) / elapsed;
          swipe.lastX = touch.clientX;
          swipe.lastAt = now;

          const direction = distanceX < 0 ? "left" : "right";
          const canMove = Boolean(mobileDestination(direction));
          const translated = canMove ? distanceX : distanceX * 0.18;
          const progress = Math.min(1, Math.abs(translated) / Math.max(window.innerWidth, 1));
          page.classList.add("is-page-dragging");
          page.style.transform = `translate3d(${translated}px, 0, 0) scale(${1 - progress * 0.018})`;
          page.style.opacity = String(1 - progress * 0.09);
          page.style.filter = `drop-shadow(${-Math.sign(translated) * 14}px 10px 20px rgba(4, 15, 24, ${0.08 + progress * 0.18}))`;
        }}
        onTouchEnd={(event) => {
          const start = pageSwipeStart.current;
          pageSwipeStart.current = null;
          const touch = event.changedTouches[0];
          if (!start || !touch || start.axis !== "horizontal") {
            void restorePagePosition();
            return;
          }
          const distanceX = touch.clientX - start.x;
          const distanceY = Math.abs(touch.clientY - start.y);
          const direction = distanceX < 0 ? "left" : "right";
          const destination = mobileDestination(direction);
          const enoughDistance = Math.abs(distanceX) >= Math.max(68, window.innerWidth * 0.2);
          const enoughMomentum = Math.abs(distanceX) >= 34 && Math.abs(start.velocityX) >= 0.42;
          if (destination && distanceX !== 0 && distanceY < Math.abs(distanceX) * 0.9 && (enoughDistance || enoughMomentum)) {
            void completePageSwipe(destination, direction);
            return;
          }
          void restorePagePosition();
        }}
        onTouchCancel={() => {
          pageSwipeStart.current = null;
          void restorePagePosition();
        }}
      >
        {loading ? (
          <LoadingScreen />
        ) : null}

        {/* Lo smistamento. Non fa da riassunto delle sezioni: sono quattro
            porte e una scheda profilo, e basta. Un'anteprima per ognuna
            avrebbe reso la prima schermata la piu lenta da caricare, che e
            l'opposto di quello che deve fare. */}
        {!loading && view === "home" && sectionProfile === "home" && currentUser ? (
          <HomeProfile profile={currentUser} profiles={profiles} avatar={<Avatar profile={currentUser} size="lg" />}
            icons={{ padel: <NavGlyph name="racket" />, pizza: <NavGlyph name="pizza" />, gaming: <NavGlyph name="gamepad" />, cashout: <NavGlyph name="wallet" /> }}
            padel={{ rank: currentRank, rating: eloLabel(currentUser.rating), winRate, played: currentUser.matches_played }}
            pizzaSessions={pizzaSessions} pizzaVotes={pizzaSessionVotes}
            onEdit={() => setShowProfileEdit(true)}
            onSignOut={supabase ? () => void supabase?.auth.signOut() : undefined}
            onOpen={(section) => {
              setSectionProfile(null);
              setLastSection(section);
              if (section === "padel") { openOwnCard(); return; }
              setView(section);
              if (section === "gaming") setGamingView("mw4-profile");
              else setSectionProfile(section);
              scrollPageTo(0, "instant" as ScrollBehavior);
            }} />
        ) : null}

        {!loading && view === "home" && !sectionProfile ? (
          <section className="hub-page">
            <div className="hub-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hub-mark" src={`${basePath}/theboyz-mark.png`} alt="" width={600} height={600} aria-hidden="true" />
              <div className="hub-hero-copy">
                <p className="eyebrow">THEBOYZ</p>
                {/* Lo stesso saluto che apre il Padel, senza la virgola: qui
                    non lo segue la frase sulla classifica. */}
                <h1 className="hero-greeting hub-greeting">{heroGreeting.lead.replace(/,$/, "")}</h1>
                <div className="hub-members">
                  <div className="mini-avatars">
                    {profiles.slice(0, 5).map((profile) => (
                      <Avatar key={profile.id} profile={profile} size="sm" />
                    ))}
                  </div>
                  <span><b>{profiles.length}</b> membri</span>
                </div>
              </div>
            </div>

            <div className="hub-cards">
              {sections.map((item) => (
                <button
                  key={item.key}
                  className={`hub-card hub-card-${item.key}`}
                  onClick={() => openSection(item.key)}
                >
                  <span className="hub-card-icon"><NavGlyph name={item.glyph} /></span>
                  {/* Un titolo dentro un bottone non e HTML valido: il nome e
                      uno span con l'aspetto di prima. Sotto, la riga coi dati
                      di chi guarda; la frase che spiega la sezione solo
                      finche dati non ce ne sono. */}
                  <span className="hub-card-copy">
                    <span className="hub-card-title">{item.label}</span>
                    {hubStatus[item.key]
                      ? <span className="hub-card-status">{hubStatus[item.key]}</span>
                      : <small>{item.claim}</small>}
                  </span>
                  {/* Gli stessi pallini della barra: da qui si vede subito
                      dove c'e qualcosa che aspetta te. */}
                  {item.key === "pizza" && pendingPizzaVotes.length ? (
                    <b className="hub-card-dot">{pendingPizzaVotes.length}</b>
                  ) : null}
                  {item.key === "padel" && pendingMvpMatches.length ? (
                    <b className="hub-card-dot hub-card-dot-mvp">{pendingMvpMatches.length}</b>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "overview" ? (
          <>
            <section className="dashboard-grid dashboard-grid-single">
              <div className="dashboard-main">
                {/* Tutta la card si tocca, ma non e un role="button": un bottone
                    non puo contenere un titolo (h1) senza che lo screen reader
                    lo perda. Da tastiera c'e il tasto vero qui sotto, che si
                    vede quando prende il focus. */}
                <article className="hero-stat hero-stat-link" onClick={openOwnCard}>
                  <button type="button" className="hero-stat-open" onClick={(event) => { event.stopPropagation(); openOwnCard(); }}>Apri la tua scheda</button>
                  <BlockMark size="lg" />
                  <div className="hero-stat-copy">
                    {/* In alto il saluto, pescato a parte dalla frase. */}
                    <h1 className="hero-greeting">{heroGreeting.lead}</h1>
                    <p className="eyebrow">LA TUA POSIZIONE</p>
                    {/* Numero e avatar sulla stessa riga: cosi restano
                        incolonnati fra loro invece che ognuno per conto suo. */}
                    <div className="hero-position-row">
                      <div className="position">{currentRank ? <><span>#</span>{currentRank}</> : "N/C"}</div>
                      <div className="hero-player">
                        <Avatar profile={currentUser} size="xl" rank={currentRank || undefined} />
                      </div>
                    </div>
                    {/* Una riga sola sotto il numero: la barra di avanzamento
                        e la frase lunga allungavano la card senza aggiungere
                        niente che il numero non dicesse già. */}
                    <p>
                      {currentRank === 0
                        ? "Gioca la prima partita per entrare nella classifica."
                        : currentRank === 1
                          ? "Sei in testa alla classifica."
                          : <>Sei a <b>{eloLabel(pointsToNext)} punti</b> dal prossimo posto.</>}
                    </p>
                  </div>
                  <div className="hero-kpis">
                    <span><b>{currentRank ? eloLabel(currentUser.rating) : "N/C"}</b><small>Elo</small></span>
                    <span><b>{winRate}%</b><small>Vittorie</small></span>
                    <span><b>{currentUser.current_streak > 0 ? `+${currentUser.current_streak}` : currentUser.current_streak}</b><small>Serie</small></span>
                  </div>
                </article>

                <div className="section-head">
                  <div className="section-head-label"><p className="eyebrow dark">ULTIMI INCONTRI</p><h2>La storia recente</h2></div>
                  <div className="court-actions">
                    <button className="button button-primary cta-new-match cta-aurora" onClick={() => setShowMatch(true)}>Nuovo match</button>
                    {/* Il tabellone dei campi liberi. Sta accanto a "nuova
                        partita" perche e la domanda che viene prima: dove si
                        gioca stasera si guarda, poi si registra. */}
                    <button className="button button-card" onClick={() => setSheet("campi")}>
                      Campi liberi
                    </button>
                    {filteredMatches.length || filteredPlannedMatches.length ? (
                      <button
                        className="button button-card cta-see-all-top"
                        onClick={() => { setChosenMonth(undefined); setSheet("matches"); }}
                      >
                        {`Vedi tutto (${filteredMatches.length + filteredPlannedMatches.length})`}
                      </button>
                    ) : null}
                  </div>
                </div>
                {/* Il tasto è uscito dal riquadro e sta fra la card di chi
                    guarda e la classifica: è la prima cosa che si fa, quindi
                    sta in cima e non in mezzo all'elenco. Su desktop resta
                    invisibile, lì comandano quelli nell'intestazione di
                    sezione.
                    È un carosello come le card, ma con due tasti al posto di
                    due elenchi: scorrendo di lato compare quello del torneo.
                    Non gira da solo — una card che cambia da sola si guarda,
                    un tasto che cambia da solo si preme per sbaglio. */}
                <div className="cta-carousel" ref={setCtaCard}>
                  <div
                    className={`cta-carousel-track${ctaSettling ? " is-settling" : ""}`}
                    ref={ctaTrackRef}
                    style={{ transform: `translate3d(${ctaOffset}px, 0, 0)` }}
                  >
                    {ctaButton(ctaFace, false)}
                    {/* Il vicino esiste solo mentre il nastro si muove: fermo
                        starebbe fuori dallo schermo e la pagina diventerebbe
                        scorrevole anche di lato. */}
                    {ctaPreview ? (
                      <div className={`cta-rail-ghost cta-rail-ghost-${ctaPreview.side}`} aria-hidden="true">
                        {ctaButton(ctaPreview.face, true)}
                      </div>
                    ) : null}
                  </div>
                </div>
                {/* Su mobile l'intestazione di sezione non c'e (`.section-head`
                    e display:none sotto i 780px), quindi il gemello di questo
                    tasto che sta li sopra non si vedrebbe. Qui invece siamo
                    nella colonna, subito sotto al comando che apre una partita
                    nuova: prima si guarda dove si gioca, poi si registra. */}
                <button
                  className="button button-full cta-campi-liberi"
                  onClick={() => setSheet("campi")}
                >
                  Campi liberi
                </button>
                <div className="match-panel matches-panel" ref={setMatchesCard}>
                  {/* Titolo interno al riquadro, come "Classifica Elo".
                      Su desktop resta nascosto: li il titolo di sezione
                      c'e gia sopra, fuori dal riquadro. Su mobile sparisce
                      del tutto: cambiava insieme ai pallini e diceva due
                      volte la stessa cosa. */}
                  <div className="match-panel-head"><h2>Ultime partite</h2></div>
                  {/* Il riquadro delle partite dice che una di quelle partite
                      ti sta aspettando. Sta qui e non dentro alla card: su
                      mobile la card e tutta un tasto che apre il foglio, ed e
                      nel foglio che si vota. */}
                  {pendingMvpMatches.length ? (
                    <b className="panel-dot">
                      {pendingMvpMatches.length}
                      <small>MVP DA VOTARE</small>
                    </b>
                  ) : null}
                  {filteredPlannedMatches.length ? (
                    <div className="planned-match-list">
                      {filteredPlannedMatches.map((planned) => (
                        <PlannedMatchCard
                          key={planned.id}
                          match={planned}
                          onResult={setCompletingPlannedMatch}
                        />
                      ))}
                    </div>
                  ) : null}
                  {filteredMatches.length ? (
                    isPhone ? (
                      /* Come la classifica: tutta la card è il bersaglio e
                         apre il foglio. Le singole partite non portano più in
                         modifica — dentro un tasto non ci possono stare altri
                         tasti, e per correggere un risultato si passa dal
                         foglio, dove le card sono per esteso. */
                      <button
                        type="button"
                        className="match-panel-open"
                        onClick={() => {
                          // Come la classifica: il tocco rimanda il cambio
                          // automatico, e il click che segue uno swipe non
                          // deve aprire il foglio.
                          touchMatches();
                          if (matchesSwipeHandled.current) return;
                          setChosenMonth(undefined);
                          setSheet("matches");
                        }}
                        aria-label={`Apri tutte le partite (${filteredMatches.length})`}
                      >
                        {/* Il nastro che si muove, col dito o da solo: e
                            l'unica cosa che scorre, il riquadro resta
                            fermo e taglia quello che esce. */}
                        <div className="match-preview-track" ref={matchesTrackRef}>
                          <div className="match-list">
                            {filteredMatches.slice(0, HOME_MATCHES).map((match) => (
                              <MatchCard
                                key={match.id}
                                match={match}
                                viewerId={session?.user.id}
                                compact
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="match-list">
                        {filteredMatches.slice(0, HOME_MATCHES).map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            onEdit={(selected) => setEditingMatch(selected)}
                            onPlayVideo={(id) => setPlayingVideo(id)}
                            onVoteMvp={mvpSchemaReady ? setVotingMvpMatch : undefined}
                            viewerId={session?.user.id}
                          />
                        ))}
                      </div>
                    )
                  ) : filteredPlannedMatches.length ? null : (
                    <div className="compact-empty panel-empty"><span className="compact-empty-icon"><NavGlyph name="racket" /></span><p>{emptyMatchesNote}</p></div>
                  )}
                  {/* Gli stessi pallini della classifica: dicono che la card
                      ha due facce e quale stai guardando. Non si toccano —
                      dentro un tasto non ci possono stare altri tasti — ma
                      la card gira da sola e si cambia con lo swipe, come la
                      classifica. */}
                  <span className="card-dots" aria-hidden="true">
                    <i className={matchesMode === "mine" ? "is-current" : ""} />
                    <i className={matchesMode === "all" ? "is-current" : ""} />
                  </span>
                </div>

                {/* Tornei: stessa impaginazione delle partite, tasto di
                    creazione sopra e riquadro con gli ultimi due sotto. */}
                <div className="section-head section-head-tournaments">
                  <div className="section-head-label"><p className="eyebrow dark">THEBOYZ CUP</p><h2>I tornei</h2></div>
                  <div className="court-actions">
                    <button
                      className="button button-lime cta-new-match cta-aurora"
                      onClick={() => setShowTournamentCreate(true)}
                      disabled={!tournamentSchemaReady}
                    >
                      + NUOVO TORNEO
                    </button>
                  </div>
                </div>
                {/* Niente tasto "+ Nuovo torneo" dentro al riquadro: su
                    mobile era l'unico modo per crearne uno e per ora il
                    torneo non si crea da qui. Il riquadro con gli ultimi
                    resta, e su desktop il tasto è ancora nell'intestazione
                    di sezione qui sopra. */}
                <div className="match-panel tournament-panel">
                  <div className="match-panel-head"><h2>Tornei</h2></div>
                  {tournaments.length ? (
                    <div className="match-list">
                      {tournaments.slice(0, HOME_TOURNAMENTS).map((tournament) => (
                        <TournamentRow
                          key={tournament.id}
                          tournament={tournament}
                          matches={matches}
                          profiles={profiles}
                          onOpen={() => openPadelPage("tournaments")}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="compact-empty panel-empty"><span className="compact-empty-icon"><NavGlyph name="ranking" /></span><p>Nessun torneo ancora. Il primo trofeo aspetta un nome.</p></div>
                  )}
                  {tournaments.length ? (
                    <button
                      className="button button-ghost button-full cta-see-all-bottom"
                      aria-label="Vedi tutti i tornei"
                      onClick={() => openPadelPage("tournaments")}
                    >
                      {`Vedi tutto (${tournaments.length})`}
                    </button>
                  ) : null}
                </div>
              </div>

            </section>
          </>
        ) : null}

        {!loading && view === "padel" && padelView === "ranking" ? (
          <section className="page-section ranking-page">
            <header className="ranking-page-controls">
              <div className="ranking-switch ranking-mode-tabs" role="group" aria-label="Tipo di ranking">
                <button
                  type="button"
                  className={rankingMode === "single" ? "active" : ""}
                  onClick={() => setRankingMode("single")}
                  aria-pressed={rankingMode === "single"}
                >
                  <NavGlyph name="person" />
                  <span>Singoli</span>
                </button>
                <button
                  type="button"
                  className={rankingMode === "team" ? "active" : ""}
                  onClick={() => setRankingMode("team")}
                  aria-pressed={rankingMode === "team"}
                >
                  <NavGlyph name="people" />
                  <span>Squadre</span>
                </button>
              </div>
              <SeasonPicker
                value={season}
                current={currentYear}
                options={[currentYear, ...archivedSeasons.filter((year) => year !== currentYear)]}
                onChange={setSeason}
              />
            </header>
            {rankingMode === "single" ? (
              <>
                <RankingList profiles={seasonProfiles} onSelect={openPlayer} trendMatches={season === currentYear ? matches : undefined} />
                <RankingHistoryChart profiles={seasonProfiles} matches={matches} awards={rankingAwards} season={season} compact={isPhone} />
              </>
            ) : rankedSeasonTeams.length ? (
              <TeamRankingList teams={rankedSeasonTeams} expanded />
            ) : (
              <div className="empty-board">
                <span className="compact-empty-icon"><NavGlyph name="racket" /></span>
                <h2>Nessuna squadra in classifica</h2>
                <p>
                  Le coppie si formano da sole con le partite, ma entrano in classifica solo quando
                  uno dei due le da un nome: apri la tua scheda, sezione &ldquo;le mie squadre&rdquo;.
                </p>
              </div>
            )}
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "tournaments" ? (
          <TournamentsPage
            tournaments={tournaments}
            profiles={profiles}
            matches={matches}
            viewerId={session?.user.id}
            schemaReady={tournamentSchemaReady}
            onCreate={() => setShowTournamentCreate(true)}
            onEdit={(tournament) => setEditingTournament(tournament)}
            onRecord={(context) => { setEditingMatch(null); setTournamentMatch(context); }}
            onDraw={async (tournament) => {
              if (!supabase) return;
              const { error } = await supabase.rpc("draw_individual_fixture", { p_tournament_id: tournament.id });
              if (error) setNotice(error.message); else await loadData();
            }}
            onDelete={async (tournament) => {
              if (!supabase || tournament.created_by !== session?.user.id) return;
              const played = tournament.fixtures.filter((fixture) => fixture.match_id).length;
              if (!window.confirm(`Eliminare il torneo individuale${played ? ` e le ${played} partite già giocate` : ""}?`)) return;
              const { error } = await supabase.rpc("delete_tournament", { p_tournament_id: tournament.id });
              if (error) setNotice(error.message); else { await loadData(); setNotice("Torneo eliminato."); }
            }}
          />
        ) : null}

        {!loading && view === "padel" && padelView === "player" && selectedPlayer ? (
          <section className="page-section player-detail-page">
            {isOwnCard && session ? <AdminAccess viewerId={session.user.id} onChanged={loadData} /> : null}
            {/* ANTEPRIMA: la testata in stile PlayPro, come gli altri profili.
                Chi sei e dove stai in alto, poi i numeri in due file da tre. */}
            <div className="player-profile-head">
            <ProfileHeader eyebrow={isOwnCard ? heroGreeting.lead.replace(/,$/, "") : "Padel · profilo"}
              name={selectedPlayer.display_name}
              avatar={<Avatar profile={selectedPlayer} size="lg" rank={selectedPlayerRank || undefined} />}
              onEdit={isOwnCard ? () => setShowProfileEdit(true) : undefined}
              pill={selectedPlayer.matches_played && selectedPlayerRank
                ? <><b>{selectedPlayerRank}°</b> in classifica{padelTraits(selectedPlayer) ? ` · ${padelTraits(selectedPlayer)}` : ""}</>
                : "Non ancora in classifica"}>
              <StatRow dark stats={[
                { label: "Elo", value: selectedPlayer.matches_played ? eloLabel(selectedPlayer.rating) : "N/C" },
                { label: "Vittorie", value: padelWinRate(selectedPlayer.wins, selectedPlayer.losses), unit: "%" },
                { label: "Partite", value: selectedPlayer.matches_played },
              ]} />
              <p className="player-next-note">
                {!selectedPlayer.matches_played
                  ? (isOwnCard ? "Gioca la prima partita per entrare nella classifica." : "Entra in classifica al primo risultato.")
                  : selectedPlayerRank === 1
                    ? (isOwnCard ? "Sei in testa alla classifica." : "È in testa alla classifica.")
                    : <>{isOwnCard ? "Sei" : "È"} a <b>{eloLabel(playerPointsToNext)} punti</b> dal prossimo posto.</>}
              </p>
            </ProfileHeader>
            <StatRow stats={[
              { label: "Vinte", value: selectedPlayer.wins },
              { label: "Perse", value: selectedPlayer.losses },
              { label: "Serie", value: selectedPlayer.current_streak > 0 ? `+${selectedPlayer.current_streak}` : selectedPlayer.current_streak, tone: selectedPlayer.current_streak > 0 ? "up" : selectedPlayer.current_streak < 0 ? "down" : undefined },
            ]} />
            {/* Nella scheda di un altro: tu e lui, contro e in coppia. E la
                prima cosa che si va a cercare aprendo la scheda di un amico. */}
            {!isOwnCard && session ? (() => {
              const viewerId = session.user.id;
              const shared = matches.filter((match) => !match.is_friendly
                && match.players.some((player) => player.profile_id === viewerId)
                && match.players.some((player) => player.profile_id === selectedPlayer.id));
              const teamOf = (match: PadelMatch, id: string) => match.players.find((player) => player.profile_id === id)?.team;
              const against = shared.filter((match) => teamOf(match, viewerId) !== teamOf(match, selectedPlayer.id));
              const together = shared.filter((match) => teamOf(match, viewerId) === teamOf(match, selectedPlayer.id));
              const won = (list: PadelMatch[]) => list.filter((match) => match.winner_team === teamOf(match, viewerId)).length;
              const lost = (list: PadelMatch[]) => list.filter((match) => match.winner_team !== 0 && match.winner_team !== teamOf(match, viewerId)).length;
              const name = selectedPlayer.display_name;
              return (
                <ul className="player-versus" aria-label={`Tu e ${name}`}>
                  <li>
                    <small>Contro {name}</small>
                    {against.length
                      ? <b><span className="up">{won(against)} {won(against) === 1 ? "vinta" : "vinte"}</span> · <span className="down">{lost(against)} {lost(against) === 1 ? "persa" : "perse"}</span></b>
                      : <b className="player-versus-none">Mai giocato contro</b>}
                  </li>
                  <li>
                    <small>In coppia con {name}</small>
                    {together.length
                      ? <b>{together.length} {together.length === 1 ? "partita" : "partite"} · {won(together)} {won(together) === 1 ? "vinta" : "vinte"}</b>
                      : <b className="player-versus-none">Mai in coppia</b>}
                  </li>
                </ul>
              );
            })() : null}
            </div>

            <section className="player-trophies">
              <div className="player-history-head">
                <div><p className="eyebrow dark">BACHECA</p></div>
              </div>

              <div className="bacheca-group-head">
                <div><span aria-hidden="true">01</span><div><h2>Emblemi</h2></div></div>
              </div>
              {earnedPlayerBadges.length ? <BadgeList badges={earnedPlayerBadges} /> : (
                <div className="player-trophies-empty"><p>Nessun emblema ancora conquistato.</p></div>
              )}

              <FieldRegister badges={selectedPlayerBadges} />

              <div className="bacheca-group-head">
                <div><span aria-hidden="true">02</span><div><p className="eyebrow dark">TORNEI</p><h2>Sala trofei</h2></div></div>
                <small>{selectedPlayerAwards.length ? `${selectedPlayerAwards.length} conquistati` : "Nessun trofeo"}</small>
              </div>
              {selectedPlayerAwards.length ? (
                <TrophyList awards={selectedPlayerAwards} matches={matches} />
              ) : (
                <div className="trophy-room-empty">
                  <div aria-hidden="true">
                    <Emblem name="trophy" className="trophy-room-empty-art" />
                  </div>
                  <span><b>La prima coppa aspetta il suo torneo.</b><small>Comparirà qui quando una coppia completerà il girone al primo posto.</small></span>
                </div>
              )}
            </section>

            <EloChart profile={selectedPlayer} matches={matches} awards={rankingAwards} isSelf={isOwnCard} />

            <PlayerInsights
              key={selectedPlayer.id}
              player={selectedPlayer}
              profiles={profiles}
              matches={matches}
              viewerId={session?.user.id}
              renderAvatar={(profile) => <Avatar profile={profile} size="md" />}
              renderMatch={(match) => <MatchCard match={match} viewerId={session?.user.id} onEdit={setEditingMatch} compact />}
            />

            <div className="player-teams">
              <div className="player-history-head">
                <div><p className="eyebrow dark">DOPPI</p><h2>{isOwnCard ? "Le mie squadre" : `Le squadre di ${selectedPlayer.display_name}`}</h2></div>
                {isOwnCard && teamSchemaReady ? (
                  <button className="button button-ghost" type="button" onClick={() => setShowTeamCreate(true)}>+ Nuova</button>
                ) : (
                  <span>{playerTeams.length} {playerTeams.length === 1 ? "squadra" : "squadre"}</span>
                )}
              </div>
              {!teamSchemaReady && isOwnCard ? (
                <p className="demo-profile-note">
                  Per dare nome e foto alle squadre esegui la migrazione
                  <code>migration-squadre.sql</code> in Supabase.
                </p>
              ) : playerTeams.length ? (
                <div className="player-teams-list">
                  {playerTeams.map((team) => (
                    isOwnCard && teamSchemaReady ? (
                      <TeamEditor
                        key={team.id}
                        team={team}
                        disabled={!supabase}
                        onSave={(pairId, name, file) => saveTeam(pairId, name, file)}
                        onDelete={(selected) => deleteTeam(selected)}
                      />
                    ) : (
                      <div key={team.id} className="player-team-row">
                        <TeamAvatars team={team} />
                        <b>{teamLabel(team)}</b>
                        <span>{teamRatingLabel(team)} pt · {team.wins}/{team.matches_played} vinte</span>
                      </div>
                    )
                  ))}
                </div>
              ) : (
                <p className="demo-profile-note">
                  {isOwnCard
                    ? "Nessuna squadra ancora. Formane una con “+ Nuova”: se avete già giocato insieme, le partite se le ritrova da sole."
                    : "Nessuna squadra ancora."}
                </p>
              )}
            </div>

            <div className="player-history-head">
              <div><p className="eyebrow dark">STORICO PERSONALE</p><h2>{isOwnCard ? "Le mie partite" : `Le partite di ${selectedPlayer.display_name}`}</h2></div>
              <span>{selectedPlayerMatches.length} {selectedPlayerMatches.length === 1 ? "risultato" : "risultati"}</span>
            </div>
            {selectedPlayerMatches.length ? (
              <div className="match-list match-list-full player-match-list">
                {visiblePlayerMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onEdit={(selected) => setEditingMatch(selected)}
                    onPlayVideo={(id) => setPlayingVideo(id)}
                    onVoteMvp={mvpSchemaReady ? setVotingMvpMatch : undefined}
                    viewerId={session?.user.id}
                  />
                ))}
                {selectedPlayerMatches.length > PROFILE_MATCH_PREVIEW ? (
                  <button
                    className="button button-ghost player-match-toggle"
                    type="button"
                    onClick={() => setShowAllPlayerMatches((current) => !current)}
                  >
                    {showAllPlayerMatches
                      ? `Mostra solo le ultime ${PROFILE_MATCH_PREVIEW}`
                      : `Vedi tutte le ${selectedPlayerMatches.length} partite`}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="empty-board"><span className="compact-empty-icon"><NavGlyph name="racket" /></span><h2>Nessuna partita giocata</h2><p>La scheda si completerà dopo il primo risultato.</p></div>
            )}

            <section className="player-plays">
              <div className="player-history-head">
                <div><p className="eyebrow dark">SPEZZONI</p><h2>{isOwnCard ? "Le mie plays" : `Le plays di ${selectedPlayer.display_name}`}</h2></div>
                {isOwnCard && playsSchemaReady ? (
                  <button className="button button-primary" onClick={() => setShowPlayCreate(true)}>＋ CLIP</button>
                ) : (
                  <span>{selectedPlayerPlays.length} clip</span>
                )}
              </div>
              {!playsSchemaReady ? (
                <p className="demo-profile-note">
                  Per salvare gli spezzoni esegui la migrazione
                  <code>migration-plays.sql</code> in Supabase.
                </p>
              ) : selectedPlayerPlays.length ? (
                <div className="plays-grid">
                  {selectedPlayerPlays.map((play) => {
                    const clipId = youtubeId(play.video_url);
                    return (
                      <article className="play-card" key={play.id}>
                        <button
                          className="play-card-preview"
                          type="button"
                          onClick={() => setPlayingClip(play)}
                          aria-label={`Guarda ${play.title ?? "la play"}`}
                        >
                          {clipId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`https://img.youtube.com/vi/${clipId}/mqdefault.jpg`} alt="" />
                          ) : null}
                          <b aria-hidden="true">▶</b>
                          <em>{play.duration_seconds}s</em>
                        </button>
                        <div className="play-card-body">
                          <b>{play.title ?? "Senza titolo"}</b>
                          <span>dal minuto {formatClock(play.start_seconds)}</span>
                        </div>
                        {isOwnCard ? (
                          <button
                            className="play-card-remove"
                            type="button"
                            onClick={() => void removePlay(play)}
                            aria-label="Elimina la play"
                            title="Elimina la play"
                          >
                            ×
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="demo-profile-note">
                  {isOwnCard
                    ? "Nessuno spezzone salvato: usa ＋ CLIP per segnare il minuto di un colpo riuscito."
                    : "Nessuno spezzone salvato."}
                </p>
              )}
            </section>
          </section>
        ) : null}

        {!loading && view === "padel" && padelView === "matches" ? (
          <section className="page-section">
            <article className="section-hero">
              <BlockMark size="lg" />
              <div className="section-hero-head">
                <div><p className="eyebrow">ARCHIVIO THEBOYZ PADEL</p><h1>Tutte le partite</h1><p>{matches.length} risultati registrati dal gruppo.</p></div>
              </div>
            </article>
            <MatchFilterBar matches={archivePeriodMatches} viewerId={currentUserId ?? undefined} viewerName={currentUserName} outcome={resultFilter} period={resultPeriod} onOutcome={setResultFilter} onPeriod={setResultPeriod} />
            {archiveResultMatches.length ? (
              <div className="match-list match-list-full">
                {archiveResultMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onEdit={(selected) => setEditingMatch(selected)}
                    onPlayVideo={(id) => setPlayingVideo(id)}
                    onVoteMvp={mvpSchemaReady ? setVotingMvpMatch : undefined}
                    viewerId={session?.user.id}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-board"><span className="compact-empty-icon"><NavGlyph name="racket" /></span><h2>{matches.length ? "Nessun risultato con questi filtri" : "Ancora nessuna partita"}</h2><p>{matches.length ? "Cambia esito o periodo per esplorare lo storico." : "Registra il primo risultato per iniziare lo storico."}</p></div>
            )}
          </section>
        ) : null}

        {/* La pagina della sezione: le votazioni. La classifica e diventata la
            voce accanto nella barra, e sta nel blocco qui sotto. */}
        {!loading && view === "pizza" && sectionProfile === "pizza" && currentUser ? (
          <PizzaProfile profile={currentUser} avatar={<Avatar profile={currentUser} size="lg" />}
            sessions={pizzaSessions} votes={pizzaSessionVotes} restaurants={pizzaRestaurants} />
        ) : null}

        {!loading && view === "pizza" && !sectionProfile && pizzaView === "overview" ? (
          <><section className="pizza-page">
            <BlockMark size="lg" />
            <div className="pizza-hero">
              <button
                className="button pizza-info-trigger"
                type="button"
                onClick={() => setShowPizzaInfo(true)}
                aria-haspopup="dialog"
              >
                <span className="pizza-info-icon" aria-hidden="true">i</span>
                <span>Info</span>
              </button>
              <div className="pizza-hero-title">
                {/* Il marchio resta piccolo in alto; il titolo grande dice come
                    stanno le cose adesso: cosa ti aspetta, o l'ultima serata. */}
                <p className="eyebrow">PIZZA NIGHT</p>
                <h1 className="pizza-hero-status">
                  {pendingPizzaVotes.length
                    ? <>Hai <span>{pendingPizzaVotes.length} {pendingPizzaVotes.length === 1 ? "voto" : "voti"}</span> da dare</>
                    : openPizzaSessions.length
                      ? <><span>{openPizzaSessions.length}</span> {openPizzaSessions.length === 1 ? "votazione aperta" : "votazioni aperte"}</>
                      : lastPizzaNight
                        ? <>Ultima serata:<br /><span>{lastPizzaNight}</span></>
                        : <>Pizza <span>Night.</span></>}
                </h1>
              </div>
              <div className="pizza-hero-actions">
                <div className="pizza-hero-buttons">
                  <button className="button button-primary pizza-open-vote" onClick={() => {
                    if (!pizzaSchemaReady || !pizzaSessionsReady) {
                      setNotice("Per votare esegui la migrazione migration-pizza-voti-0-10.sql in Supabase.");
                      return;
                    }
                    setShowSessionPicker(true);
                  }}>
                    ＋ Apri votazione
                  </button>
                </div>
              </div>
            </div>

            {/* Votazioni in corso: restano in cima finché tutti hanno votato. */}
            {openPizzaSessions.length ? (
              <div className="pizza-open-sessions">
                {openPizzaSessions.map((openSession) => {
                  const restaurant = pizzaRestaurants.find((item) => item.id === openSession.restaurant_id);
                  if (!restaurant) return null;
                  const voted = pizzaSessionVotes.some(
                    (vote) => vote.session_id === openSession.id && vote.voter_id === session?.user.id,
                  );
                  const isParticipant = openSession.participants.some(
                    (participant) => participant.voter_id === session?.user.id,
                  );
                  const completed = openSession.participants.filter((participant) => participant.voted_at).length;
                  return (
                    <button
                      className={`pizza-session-card ${voted || !isParticipant ? "is-voted" : ""}`}
                      key={openSession.id}
                      type="button"
                      onClick={() => setVotingSession(openSession)}
                    >
                      <span className="pizza-session-state">
                        {openSession.is_solo ? "PERSONALE · " : ""}
                        {isParticipant ? (voted ? "HAI VOTATO" : "DA VOTARE") : "IN CORSO"}
                      </span>
                      <b>{restaurant.name}</b>
                      <span className="pizza-session-date">
                        {new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(new Date(openSession.opened_at))}
                      </span>
                      <span className="pizza-session-progress">{completed}/{openSession.participants.length} VOTI</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

          </section>
            {/* Sotto la card scura, sul fondo della pagina: il podio delle
                pizzerie e le serate prima dell'ultima (quella e gia nel titolo). */}
            {pizzaEntries.some((item) => !item.pending) ? (
              <section className="pizza-overview-block" aria-labelledby="pizza-podium-title">
                <div className="pizza-overview-head">
                  <h2 id="pizza-podium-title">Il podio</h2>
                  <button className="text-link" type="button" onClick={() => openSectionRanking("pizza")}>Classifica completa →</button>
                </div>
                <ol className="pizza-podium">
                  {pizzaEntries.filter((item) => !item.pending).slice(0, 3).map((restaurant, index) => (
                    <li key={restaurant.id ?? restaurant.name} data-medal={pizzaMedalTones[index]}>
                      <span className="pizza-podium-position">{index + 1}</span>
                      <b>{restaurant.name}</b>
                      <span className="pizza-podium-score"><b>{restaurant.total}</b><small>/100</small></span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            {pizzaSessions.filter((item) => item.completed_at && !item.is_solo).length > 1 ? (
              <section className="pizza-overview-block" aria-labelledby="pizza-nights-title">
                <div className="pizza-overview-head"><h2 id="pizza-nights-title">Le serate prima</h2></div>
                <ul className="pizza-night-list">
                  {pizzaSessions.filter((item) => item.completed_at && !item.is_solo && item.id !== lastClosedPizzaSession?.id).slice(0, 3).map((night) => (
                    <li key={night.id}>
                      <div>
                        <b>{pizzaRestaurants.find((item) => item.id === night.restaurant_id)?.name ?? "Pizzeria"}</b>
                        <small>{new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(new Date(night.completed_at!))} · {night.participants.length} {night.participants.length === 1 ? "persona" : "persone"}</small>
                      </div>
                      <span className="pizza-podium-score"><b>{finalPizzaScore(pizzaSessionVotes.filter((vote) => vote.session_id === night.id), night, profiles)}</b><small>/100</small></span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {!loading && view === "pizza" && !sectionProfile && pizzaView === "ranking" ? (
          <><section className="pizza-page pizza-ranking-page">
            <BlockMark size="lg" />
            <div className="pizza-hero">
              <button
                className="button pizza-info-trigger"
                type="button"
                onClick={() => setShowPizzaInfo(true)}
                aria-haspopup="dialog"
              >
                <span className="pizza-info-icon" aria-hidden="true">i</span>
                <span>Info</span>
              </button>
              <div className="pizza-hero-title">
                <h1>Pizzeria<br /><span>Ranking.</span></h1>
              </div>
            </div>

            <div className="pizza-ranking-toolbar">
              <div>
                <p className="eyebrow">CLASSIFICA</p>
                <h2>
                  {activePizzaRankingMode === "classic"
                    ? "Il trio originale"
                    : activePizzaRankingMode === "personal"
                      ? "La tua classifica"
                      : "Tutto il tavolo"}
                </h2>
              </div>
              <div className="ranking-switch pizza-ranking-switch" role="group" aria-label="Classifica pizzerie">
                <button
                  className={activePizzaRankingMode === "contemporary" ? "active" : ""}
                  aria-pressed={activePizzaRankingMode === "contemporary"}
                  onClick={() => setPizzaRankingMode("contemporary")}
                >
                  Contemporanea
                </button>
                <button
                  className={activePizzaRankingMode === "classic" ? "active" : ""}
                  aria-pressed={activePizzaRankingMode === "classic"}
                  onClick={() => setPizzaRankingMode("classic")}
                >
                  Nostalgica
                </button>
                {hasPersonalPizzaRanking ? (
                  <button
                    className={activePizzaRankingMode === "personal" ? "active" : ""}
                    aria-pressed={activePizzaRankingMode === "personal"}
                    onClick={() => setPizzaRankingMode("personal")}
                  >
                    Personale
                  </button>
                ) : null}
              </div>
            </div>

          </section>
          {/* La classifica sta sotto la testata, sul fondo della pagina: dentro
              la card scura diventava una card dentro un'altra card. */}
          <section className="pizza-ranking-body" aria-label="Classifica pizzerie">
            <div className="pizza-board">
              <div className="pizza-board-head">
                <span>#</span>
                <span>PIZZERIA</span>
                <span>LOCATION</span>
                <span>PIZZA</span>
                <span>DOLCE</span>
                <span>PREZZO</span>
                <span>TOTALE</span>
              </div>
              <div className="pizza-ranking-list">
                {pizzaEntries.map((restaurant, index) => {
                  const complete = !restaurant.pending;
                  const medalTone = complete ? pizzaMedalTones[index] : undefined;
                  const rowClass = `pizza-ranking-row ${medalTone ? `pizza-ranking-medal pizza-ranking-${medalTone}` : ""} ${restaurant.isNew ? "pizza-ranking-interactive" : ""} ${restaurant.pending ? "pizza-ranking-pending" : ""}`;
                  const rowContent = (<>
                    <span className="pizza-position">{index + 1}</span>
                    <div className="pizza-name-cell">
                      <b>{restaurant.name}</b>
                      <small>{restaurant.isNew ? `${restaurant.place ?? "NUOVA SCHEDA"} · ${restaurant.votesCount ?? 0} ${restaurant.votesCount === 1 ? "VOTO" : "VOTI"}` : restaurant.address ? <a className="pizza-address-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address)}`} target="_blank" rel="noopener noreferrer">{restaurant.address}</a> : (restaurant.place ?? "THEBOYZ TESTED")}</small>
                      {/* Una barra sola a quattro colori: ogni tratto e quanto
                          quel criterio pesa nel totale. Sotto, su telefono, i
                          quattro voti in una riga al posto dei quattro riquadri. */}
                      <span className="pizza-score-track" aria-hidden="true">
                        {complete ? PIZZA_CRITERIA_KEYS.map(({ key, weight }) => (
                          <i key={key} data-criterion={key} style={{ width: `${(restaurant[key] * weight * 10) / PIZZA_WEIGHT_TOTAL}%` }} />
                        )) : null}
                      </span>
                      {complete ? <span className="pizza-criteria-line">
                        {PIZZA_CRITERIA_KEYS.map(({ key, label }) => <span key={key} data-criterion={key}>{label} <b>{restaurant[key].toFixed(1)}</b></span>)}
                      </span> : null}
                    </div>
                    <span className="pizza-category-score"><b>{complete ? restaurant.location.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-category-score"><b>{complete ? restaurant.pizza.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-category-score"><b>{complete ? restaurant.dessert.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-category-score"><b>{complete ? restaurant.price.toFixed(1) : "—"}</b><small>/10</small></span>
                    <span className="pizza-total-score"><b>{complete ? restaurant.total : "N/C"}</b><small>{complete ? "/100" : ""}</small></span>
                  </>);
                  return restaurant.isNew && restaurant.id ? (
                    <button
                      type="button"
                      className={rowClass}
                      key={`${restaurant.name}-${index}`}
                      onClick={() => showPizzaSession(restaurant.id!, restaurant.sessionId)}
                      aria-label={`Vedi la votazione di ${restaurant.name}`}
                    >
                      {rowContent}
                    </button>
                  ) : <article className={rowClass} key={`${restaurant.name}-${index}`}>{rowContent}</article>;
                })}
              </div>
            </div>
            <p className="pizza-source-note">
              {activePizzaRankingMode === "classic"
                ? "Classifica calcolata soltanto con i voti di Samu, Dani e Fabio nelle sessioni in cui erano presenti tutti e tre."
                : activePizzaRankingMode === "personal"
                  ? "Classifica calcolata soltanto con le votazioni che hai aperto in solitaria."
                  : "Classifica calcolata con tutti i partecipanti presenti alla votazione."}
              {" "}Il punteggio finale viene arrotondato all&apos;intero più vicino: da 0,5 si arrotonda per eccesso.
            </p>
          </section></>
        ) : null}

        {!loading && view === "gaming" && gamingView === "overview" ? (
          <section className="page-section gaming-page" aria-label="Gaming">
            <div className="gaming-grid" aria-label="Giochi">
              <button className="gaming-card" type="button" onClick={() => {
                setGamingView("mw4");
                scrollPageTo(0, "instant" as ScrollBehavior);
              }} aria-label="Apri Call of Duty: Modern Warfare 4">
                <Image className="gaming-card-image" src={`${basePath}/gaming/mw4.png`} alt="" width={494} height={619} />
                <span className="gaming-card-body">
                  <span><span className="gaming-card-series">Call of Duty</span><strong>Modern Warfare 4</strong></span>
                  <span className="gaming-card-arrow" aria-hidden="true">↗</span>
                </span>
              </button>
            </div>
            {/* Le due cose che si fanno piu spesso, a un tocco dalla pagina
                dei giochi invece che tre schermate piu in la. */}
            <div className="gaming-actions" aria-label="Azioni rapide MW4">
              <button className="button button-primary cta-new-match cta-aurora" type="button" onClick={() => {
                setGamingAction("gb");
                setGamingView("mw4");
                scrollPageTo(0, "instant" as ScrollBehavior);
              }}>+ Carica GB</button>
              <button className="button button-card" type="button" onClick={() => {
                setGamingAction("build");
                setGamingView("mw4-meta");
                scrollPageTo(0, "instant" as ScrollBehavior);
              }}>+ Aggiungi build</button>
            </div>
          </section>
        ) : null}

        {!loading && view === "gaming" && gamingView !== "overview" ? (
          <>
            <button className="button button-ghost gaming-back" type="button" onClick={() => openSection("gaming")}>← Tutti i giochi</button>
            {gamingView === "mw4-meta"
              ? <CodMeta viewerId={session?.user.id ?? ""} profiles={profiles} startWithForm={gamingAction === "build"} />
              : gamingView === "mw4-ranking"
                ? <CodRanking profiles={profiles} />
                : gamingView === "mw4-profile" && currentUser
                  ? <CodProfile profile={currentUser} avatar={<Avatar profile={currentUser} size="lg" />} onEdit={() => setShowProfileEdit(true)} />
                  : <CodGaming viewerId={session?.user.id ?? ""} profiles={profiles} startWithForm={gamingAction === "gb"} />}
          </>
        ) : null}
        {!loading && view === "cashout" && sectionProfile === "cashout" && currentUser ? (
          <CashoutProfile profile={currentUser} profiles={profiles} avatar={<Avatar profile={currentUser} size="lg" />}
            onOpenGroup={(groupId) => { setCashoutGroupId(groupId); setSectionProfile(null); scrollPageTo(0, "instant" as ScrollBehavior); }} />
        ) : null}
        {!loading && view === "cashout" && !sectionProfile ? (
          <CashoutPage key={cashoutGroupId ?? "all"} profiles={profiles} viewerId={session?.user.id ?? ""} initialGroupId={cashoutGroupId} />
        ) : null}

      </main>

      <nav
        className="mobile-nav"
        aria-label="Navigazione mobile"
        ref={navRef}
        /* Le voci cambiano di numero fra home e sezioni: le colonne le conta
           il JSX, perche in CSS non c'e modo di sapere quante sono. */
        style={{ "--nav-count": navItems.length } as CSSProperties}
        onPointerDown={(event) => {
          // Nei giochi il click nativo collega direttamente la voce alla pagina:
          // il riconoscimento del trascinamento non deve selezionare un'altra voce.
          if (navSection === "gaming") {
            navPointerStart.current = null;
            return;
          }
          navPointerStart.current = event.clientX;
          navPointerKey.current = (event.target as Element).closest<HTMLButtonElement>("button[data-nav-key]")?.dataset.navKey ?? null;
          navDragging.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (navPointerStart.current === null) return;
          // Finche il dito non si muove davvero la pastiglia resta dov'e:
          // se la portassimo subito sotto al tocco, un tocco secco su una
          // voce lontana le lascerebbe da percorrere solo pochi pixel e
          // lo scorrimento non si vedrebbe.
          if (!navDragging.current && Math.abs(event.clientX - navPointerStart.current) < 8) return;
          navDragging.current = true;
          movePillTo(event.clientX);
        }}
        onPointerUp={(event) => {
          if (navPointerStart.current === null) return;
          const tappedIndex = navItems.findIndex((item) => item.key === navPointerKey.current);
          const index = navDragging.current || tappedIndex < 0 ? nearestNavIndex(event.clientX) : tappedIndex;
          navPointerStart.current = null;
          navPointerKey.current = null;
          navDragging.current = false;
          placePill(index, true);
          selectNavItem(index);
        }}
        onPointerCancel={() => {
          navPointerStart.current = null;
          navPointerKey.current = null;
          navDragging.current = false;
          placePill(navActiveIndex, true);
        }}
      >
        {/* Pastiglia unica che scivola: prima ogni voce aveva la sua e il
            passaggio era una dissolvenza, non uno spostamento. */}
        <span className="mobile-nav-pill" ref={navPillRef} aria-hidden="true" />
        {navItems.map((item, index) => (
          <button
            key={item.key}
            data-nav-key={item.key}
            aria-current={item.active ? "page" : undefined}
            className={item.active ? "active" : ""}
            onClick={(event) => { if (navSection === "gaming" || event.detail === 0) selectNavItem(index); }}
          >
            <span className="mobile-nav-icon">
              {item.key === "profile"
                ? <Avatar profile={currentUser} size="sm" />
                : <NavGlyph name={item.glyph as GlyphName} />}
              {/* Pallino sulle votazioni pizza ancora da fare. */}
              {item.key === "pizza" && pendingPizzaVotes.length ? (
                <b className="nav-dot" aria-label={`${pendingPizzaVotes.length} votazioni da fare`}>
                  {pendingPizzaVotes.length}
                </b>
              ) : null}
              {/* Lo stesso pallino per gli MVP che aspettano il tuo voto, in
                  oro perche l'oro qui dentro vuol dire MVP. */}
              {item.key === "padel" && pendingMvpMatches.length ? (
                <b className="nav-dot nav-dot-mvp" aria-label={`${pendingMvpMatches.length} MVP da votare`}>
                  {pendingMvpMatches.length}
                </b>
              ) : null}
            </span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {showPizzaInfo ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowPizzaInfo(false)}>
          <section className="modal pizza-info-modal" role="dialog" aria-modal="true" aria-labelledby="pizza-info-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">COME FUNZIONA</p>
                <h2 id="pizza-info-title">Ogni punto conta.</h2>
              </div>
              <button className="icon-button" onClick={() => setShowPizzaInfo(false)} aria-label="Chiudi">×</button>
            </div>
            <p className="pizza-info-copy">Ogni criterio si vota da 0 a 10. Il backend applica i pesi 7/31, 10/31, 4/31 e 10/31; con Fabio si aggiungono i suoi 7 punti.</p>
            <p className="pizza-info-copy">Le votazioni in solitaria restano private e alimentano soltanto la classifica Personale di chi le apre.</p>
            <div className="pizza-criteria">
              {pizzaCriteria.map((criterion) => (
                <div className={`pizza-criterion criterion-${criterion.tone}`} key={criterion.label}>
                  <span>{criterion.label}</span>
                  <b>{criterion.max}</b>
                  <small>{criterion.source}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {sheet === "campi" ? (
        <BottomSheet title="Campi liberi" onClose={() => setSheet(null)}>
          <WansportBoard />
        </BottomSheet>
      ) : null}

      {sheet === "matches" ? (
        <BottomSheet
          /* Sulle proprie partite il titolo porta il nome di chi guarda
             invece della parola "personale": e la stessa informazione, ma
             detta da qualcuno che ti conosce. Se il nome manca — profilo
             appena creato — si torna alla parola. */
          title={matchesMode === "mine"
            ? `Partite - ${currentUserName || "Personale"}`
            : "Partite - Tutte"}
          onClose={() => setSheet(null)}
          /* Dentro al foglio resta l'interruttore a icone: qui c'e lo spazio
             per un comando vero, e la faccia di chi guarda dice "queste sono
             le tue" meglio di un pallino. I pallini restano sulla card, dove
             sono un'indicazione e non un tasto. */
          action={(
            <div className="mode-switch" role="group" aria-label="Quali partite">
              <button
                className={matchesMode === "mine" ? "active" : ""}
                // Il raccoglitore da aprire lo decide l'effetto qui sopra:
                // cambiando insieme cambiano i mesi, e va riaperto il più
                // recente di quelli nuovi.
                onClick={() => { setMatchesMode("mine"); setChosenMonth(undefined); }}
                aria-label="Solo le mie partite"
                title={currentUserName || "Personale"}
              >
                {/* La faccia di chi guarda al posto di un glifo: dice "queste
                    sono le tue" senza bisogno di una parola. */}
                {currentUser
                  ? <Avatar profile={currentUser} size="sm" />
                  : <NavGlyph name="person" />}
              </button>
              <button
                className={matchesMode === "all" ? "active" : ""}
                onClick={() => { setMatchesMode("all"); setChosenMonth(undefined); }}
                aria-label="Tutte le partite"
                title="Tutte"
              >
                <NavGlyph name="people" />
              </button>
            </div>
          )}
        >
          {/* Un raccoglitore per mese invece di un elenco unico: le partite
              si accumulano, e scorrerne cento per arrivare a maggio non è
              cercare, è rassegnarsi. Aperto uno, gli altri si chiudono. */}
          <div className="month-groups">
            <MatchFilterBar matches={sheetPeriodMatches} viewerId={currentUserId ?? undefined} viewerName={currentUserName} outcome={resultFilter} period={resultPeriod} onOutcome={(value) => { setResultFilter(value); setChosenMonth(undefined); }} onPeriod={(value) => { setResultPeriod(value); setChosenMonth(undefined); }} />
            {filteredPlannedMatches.length ? (
              <section className="planned-matches-sheet">
                <h3>Da giocare</h3>
                <div className="planned-match-list">
                  {filteredPlannedMatches.map((planned) => (
                    <PlannedMatchCard
                      key={planned.id}
                      match={planned}
                      onResult={(selected) => { setSheet(null); setCompletingPlannedMatch(selected); }}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {matchMonths.length ? matchMonths.map((group) => (
              <MonthGroup
                key={group.key}
                label={group.label}
                count={group.matches.length}
                open={openMonth === group.key}
                onToggle={() => setChosenMonth(openMonth === group.key ? null : group.key)}
              >
                <div className="match-list">
                  {group.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onEdit={(selected) => { setSheet(null); setEditingMatch(selected); }}
                      onPlayVideo={(id) => setPlayingVideo(id)}
                      onVoteMvp={mvpSchemaReady ? setVotingMvpMatch : undefined}
                      onOpenPlayer={(profile) => { setSheet(null); openPlayer(profile); }}
                      viewerId={session?.user.id}
                    />
                  ))}
                </div>
              </MonthGroup>
            )) : filteredPlannedMatches.length && resultFilter === "all" && resultPeriod === "all" ? null : (
              <div className="compact-empty panel-empty">
                <span className="compact-empty-icon"><NavGlyph name="racket" /></span>
                <p>{resultFilter !== "all" || resultPeriod !== "all" ? "Nessun risultato con questi filtri. Prova un altro esito o periodo." : emptyMatchesNote}</p>
              </div>
            )}
          </div>
        </BottomSheet>
      ) : null}
      {showMatch || editingMatch || tournamentMatch || completingPlannedMatch ? (
        <NewMatchModal
          profiles={profiles}
          match={editingMatch}
          viewerId={session?.user.id}
          plannedMatch={completingPlannedMatch}
          plannedMatchesReady={plannedMatchesReady}
          tournamentContext={tournamentMatch ?? editingTournamentContext}
          onClose={() => { setShowMatch(false); setEditingMatch(null); setTournamentMatch(null); setCompletingPlannedMatch(null); }}
          onSaved={(kind) => void handleSaved(kind)}
          onDeleted={() => void handleDeleted()}
        />
      ) : null}
      {showTeamCreate && session ? (
        <TeamCreateModal
          profiles={profiles}
          teams={teams}
          viewerId={session.user.id}
          onClose={() => setShowTeamCreate(false)}
          onCreate={async (pairId, name, file) => {
            await saveTeam(pairId, name, file);
            setShowTeamCreate(false);
          }}
        />
      ) : null}
      {showTournamentCreate || editingTournament ? (
        <TournamentFormModal
          profiles={profiles}
          savedTeams={savedTeams}
          tournament={editingTournament}
          viewerId={session?.user.id}
          onClose={() => { setShowTournamentCreate(false); setEditingTournament(null); }}
          onSaved={async (kind) => {
            setShowTournamentCreate(false);
            setEditingTournament(null);
            await loadData();
            setNotice(kind === "created"
              ? "Torneo creato: calendario e classifica sono pronti."
              : "Torneo aggiornato.");
          }}
          onDeleted={async () => {
            setShowTournamentCreate(false);
            setEditingTournament(null);
            await loadData();
            setNotice("Torneo eliminato: la classifica è stata ricalcolata.");
          }}
        />
      ) : null}
      {showAvatarPicker ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAvatarPicker(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">FOTO PROFILO</p>
                <h2 id="avatar-picker-title">Cambia la tua foto</h2>
              </div>
              <button className="icon-button" onClick={() => setShowAvatarPicker(false)} aria-label="Chiudi">×</button>
            </div>

            <form
              className="avatar-picker"
              onSubmit={(event) => { event.preventDefault(); void saveAvatarUrl(); }}
            >
              <div className="avatar-picker-preview">
                <Avatar profile={currentUser} size="lg" />
              </div>

              {/* Il selettore file resta nascosto: dentro un form una <label>
                  eredita gli stili dei campi e il tasto si sformerebbe. */}
              <input
                className="avatar-picker-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                ref={avatarFileRef}
                onChange={(e) => { void uploadAvatar(e.target.files?.[0]); setShowAvatarPicker(false); }}
              />
              <button
                type="button"
                className="button button-dark avatar-picker-upload"
                onClick={() => avatarFileRef.current?.click()}
              >
                Carica dal dispositivo
              </button>

              <p className="avatar-picker-divider"><span>oppure</span></p>

              <label>
                Indirizzo di un&apos;immagine sul web <span className="optional-label">anche GIF animate</span>
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…/animazione.gif"
                  inputMode="url"
                />
              </label>
              <p className="field-hint">
                Deve essere il collegamento diretto all&apos;immagine, quello che finisce in .gif, .png o .jpg —
                non la pagina che la contiene. Su Giphy o Tenor si ottiene con &quot;copia indirizzo immagine&quot;.
              </p>

              <div className="modal-actions">
                {avatarUrlInitial ? (
                  <button
                    type="button"
                    className="signout-button"
                    onClick={() => { setAvatarUrl(""); void saveAvatarUrl(); }}
                  >
                    Togli l&apos;immagine dal web
                  </button>
                ) : null}
                <button type="button" className="button button-ghost" onClick={() => setShowAvatarPicker(false)}>Annulla</button>
                <button className="button button-primary">Usa questo indirizzo</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {showProfileEdit ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowProfileEdit(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">IL TUO PROFILO</p>
                <h2 id="profile-edit-title">Dati del profilo</h2>
              </div>
              <button className="icon-button" onClick={() => setShowProfileEdit(false)} aria-label="Chiudi">×</button>
            </div>
            {/* La foto si cambia da qui, con gli altri dati del profilo: sopra
                l'avatar della scheda la scritta copriva la faccia. */}
            <div className="profile-edit-photo">
              <Avatar profile={currentUser} size="lg" />
              <button type="button" className="button button-ghost" disabled={!supabase}
                onClick={() => { setShowProfileEdit(false); setShowAvatarPicker(true); }}>Cambia foto</button>
            </div>
            <form onSubmit={(event) => { void updateProfile(event); setShowProfileEdit(false); }}>
              <label>Nome in classifica<input value={profileName || currentUser.display_name} onChange={(e) => setProfileName(e.target.value)} disabled={!supabase} /></label>
              <label>
                Mano della racchetta
                <select value={handedness} onChange={(e) => setHandedness(e.target.value)} disabled={!supabase}>
                  <option value="">Non indicata</option>
                  <option value="destro">Destro</option>
                  <option value="mancino">Mancino</option>
                </select>
              </label>
              <label>
                Lato del campo
                <select value={courtSide} onChange={(e) => setCourtSide(e.target.value)} disabled={!supabase}>
                  <option value="">Non indicato</option>
                  <option value="destra">Destra</option>
                  <option value="sinistra">Sinistra</option>
                </select>
              </label>
              <label>
                Utente PayPal.Me
                <div className="profile-paypal-field">
                  <span>paypal.me/</span>
                  <input
                    value={paypalMeUsername}
                    onChange={(event) => setPaypalMeUsername(event.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 20))}
                    placeholder="IlTuoNome"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    pattern="[A-Za-z0-9]{1,20}"
                    maxLength={20}
                    disabled={!supabase}
                  />
                </div>
                <small className="profile-paypal-hint">Facoltativo · serve per ricevere i saldi di Cashout.</small>
              </label>
              <label>Email<input value={session?.user.email ?? ""} disabled /></label>
              {supabase ? null : <p className="demo-profile-note">Il profilo diventa modificabile dopo il collegamento a Supabase.</p>}
              <div className="modal-actions">
                {/* "Esci" sta in fondo al profilo, non qui: accanto a "Salva" si
                    toccava per sbaglio. */}
                <button type="button" className="button button-ghost" onClick={() => setShowProfileEdit(false)}>Annulla</button>
                <button className="button button-primary" disabled={!supabase}>Salva modifiche</button>
              </div>
            </form>
            {session?.user.email ? <ProfilePassword account={{ id: session.user.id, email: session.user.email }} /> : null}
          </section>
        </div>
      ) : null}
      {votingMvpMatch ? (
        <MvpVoteModal
          match={votingMvpMatch}
          viewerId={session?.user.id ?? ""}
          onClose={() => setVotingMvpMatch(null)}
          onSaved={async ({ awarded, closed }) => {
            setVotingMvpMatch(null);
            await loadData();
            setNotice(
              awarded
                ? "MVP assegnato."
                : closed
                  ? "Votazione conclusa in parità: nessun MVP assegnato."
                  : "Voto MVP salvato.",
            );
          }}
        />
      ) : null}
      {playingVideo ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPlayingVideo(null)}>
          <section className="modal video-modal" role="dialog" aria-modal="true" aria-label="Video della partita">
            <div className="modal-head">
              <div><p className="eyebrow dark">VIDEO PARTITA</p></div>
              <button className="icon-button" onClick={() => setPlayingVideo(null)} aria-label="Chiudi">×</button>
            </div>
            <div className="video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playingVideo}?autoplay=1`}
                title="Video della partita"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </section>
        </div>
      ) : null}
      {playingClip ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPlayingClip(null)}>
          <section className="modal video-modal" role="dialog" aria-modal="true" aria-label="Spezzone">
            <div className="modal-head">
              <div>
                <p className="eyebrow dark">PLAY</p>
                <h2>{playingClip.title ?? "Spezzone"}</h2>
              </div>
              <button className="icon-button" onClick={() => setPlayingClip(null)} aria-label="Chiudi">×</button>
            </div>
            <div className="video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId(playingClip.video_url)}?start=${playingClip.start_seconds}&end=${playingClip.start_seconds + playingClip.duration_seconds}&autoplay=1`}
                title="Spezzone"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="field-hint">
              Da {formatClock(playingClip.start_seconds)} a {formatClock(playingClip.start_seconds + playingClip.duration_seconds)}
            </p>
          </section>
        </div>
      ) : null}
      {showPlayCreate && currentUser ? (
        <PlayCreateModal
          profileId={currentUser.id}
          matches={selectedPlayerMatches}
          onClose={() => setShowPlayCreate(false)}
          onSaved={async () => {
            setShowPlayCreate(false);
            await loadData();
            setNotice("Play salvata.");
          }}
        />
      ) : null}
      {showSessionPicker && session ? (
        <PizzaSessionCreateModal
          profiles={profiles}
          viewerId={session.user.id}
          onClose={() => setShowSessionPicker(false)}
          onSaved={async (kind) => {
            setShowSessionPicker(false);
            await loadData();
            setNotice(kind === "solo"
              ? "Votazione personale aperta. Il voto finirà soltanto nella tua classifica."
              : "Votazione aperta. Si chiuderà quando tutti i partecipanti avranno votato.");
          }}
        />
      ) : null}
      {votingSession && session ? (() => {
        const restaurant = pizzaRestaurants.find((item) => item.id === votingSession.restaurant_id);
        if (!restaurant) return null;
        return (
          <PizzaVoteModal
            restaurant={restaurant}
            session={votingSession}
            votes={pizzaSessionVotes.filter((vote) => vote.session_id === votingSession.id)}
            voters={profiles}
            viewerId={session.user.id}
            onClose={() => setVotingSession(null)}
            onSaved={async () => {
              setVotingSession(null);
              await loadData();
              setNotice(votingSession.is_solo
                ? "Voto salvato nella tua classifica Personale."
                : "Voto salvato. La votazione si chiuderà quando avranno votato tutti.");
            }}
            onDeleted={async () => {
              setVotingSession(null);
              await loadData();
              setNotice("Votazione eliminata.");
            }}
          />
        );
      })() : null}
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (checking) {
    return <LoadingScreen />;
  }
  if (!hasSupabaseConfig) {
    return <SetupScreen />;
  }
  if (!session) {
    return <LoginScreen />;
  }
  return <AppShell session={session} />;
}
