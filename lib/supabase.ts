import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type Profile = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  avatar_url?: string | null;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  // Facoltativo finche migration-pareggi.sql non e stata eseguita.
  draws?: number;
  current_streak: number;
  created_at?: string;
  handedness?: string | null;
  court_side?: string | null;
};

export type PadelSet = {
  set_number: number;
  team1_games: number;
  team2_games: number;
  // Il set lasciato a meta: e l'unico che puo finire in parita e l'unico
  // che non assegna un set vinto. I suoi giochi contano lo stesso.
  incomplete?: boolean;
};

export type MatchPlayer = {
  profile_id: string;
  team: 1 | 2;
  rating_delta: number;
  profile: Profile;
};

export type PlayerPlay = {
  id: string;
  profile_id: string;
  match_id: string | null;
  title: string | null;
  video_url: string;
  start_seconds: number;
  duration_seconds: number;
  created_by: string;
  created_at: string;
};

export type MatchEvent = {
  id: string;
  lineage_id: string;
  kind: "created" | "edited";
  author_id: string | null;
  comment: string | null;
  summary: string;
  created_at: string;
};

export type MatchMvp = {
  profile_id: string;
  awarded_at: string;
};

export type PadelMatch = {
  id: string;
  played_at: string;
  // Resta uguale attraverso le modifiche: è la chiave dello storico.
  lineage_id?: string | null;
  created_at?: string;
  created_by?: string;
  // 0 = pareggio: un set a testa con il terzo interrotto.
  winner_team: 0 | 1 | 2;
  notes?: string | null;
  video_url?: string | null;
  // Etichetta libera: nome del campo o del circolo dove si e giocato.
  court?: string | null;
  sets: PadelSet[];
  players: MatchPlayer[];
  rating_delta?: number;
  tournament_fixture_id?: string | null;
  // Disponibile soltanto per le partite create dopo migration-mvp.sql.
  mvp_voting_enabled?: boolean;
  mvp_voting_closed_at?: string | null;
  mvps?: MatchMvp[];
  mvp_votes_cast?: number;
  mvp_total_voters?: number;
  viewer_mvp_vote?: string | null;
};

export type PlannedMatchPlayer = {
  profile_id: string;
  team: 1 | 2;
  profile: Profile;
};

// Una partita gia organizzata, ma ancora senza risultato. Vive separata
// dalle partite concluse per non aggiornare classifica ed Elo prima del tempo.
export type PlannedMatch = {
  id: string;
  played_at: string;
  created_at: string;
  created_by: string;
  notes?: string | null;
  court?: string | null;
  players: PlannedMatchPlayer[];
};

export type TournamentTeam = {
  id: string;
  tournament_id: string;
  name: string;
  player_a: string;
  player_b: string;
  sort_order: number;
};

export type TournamentFixture = {
  id: string;
  tournament_id: string;
  match_number: number;
  team1_id: string;
  team2_id: string;
  match_id: string | null;
};

export type Tournament = {
  id: string;
  name: string;
  status: "active" | "completed";
  trophy_name: string;
  trophy_badge: "cup" | "crown" | "shield" | "star";
  elo_multiplier: number;
  created_by: string;
  created_at: string;
  teams: TournamentTeam[];
  fixtures: TournamentFixture[];
};
