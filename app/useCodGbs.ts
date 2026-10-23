"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CodGb } from "@/lib/cod-gb";

export default function useCodGbs() {
  const [gbs, setGbs] = useState<CodGb[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from("cod_gbs")
      .select("id,created_by,mode,map_name,played_at,status,review_note,image_count,photos_deleted_at,team1_score,team2_score,players")
      .order("played_at", { ascending: false });
    setError(queryError ? "Impossibile caricare i risultati MW4. Riprova." : "");
    if (!queryError) setGbs((data ?? []) as CodGb[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    const refresh = () => { void load(); };
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  return { gbs, loading, error, setError, load };
}
