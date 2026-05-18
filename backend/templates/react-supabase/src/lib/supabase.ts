import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("http")) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch {
    supabase = null;
  }
}

export { supabase };
