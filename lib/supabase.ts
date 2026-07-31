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
  current_streak: number;
  created_at?: string;
};

export type PadelSet = {
  set_number: number;
  team1_games: number;
  team2_games: number;
};

export type MatchPlayer = {
  profile_id: string;
  team: 1 | 2;
  rating_delta: number;
  profile: Profile;
};

export type PadelMatch = {
  id: string;
  played_at: string;
  created_by?: string;
  winner_team: 1 | 2;
  notes?: string | null;
  sets: PadelSet[];
  players: MatchPlayer[];
  rating_delta?: number;
};
