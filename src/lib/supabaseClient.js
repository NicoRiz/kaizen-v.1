import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfig = {
  isConfigured: Boolean(supabaseUrl && supabasePublishableKey),
  url: supabaseUrl,
};

export const supabase = supabaseConfig.isConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: "kaizen:v1:supabase:auth",
      },
      realtime: {
        params: {
          eventsPerSecond: 8,
        },
      },
    })
  : null;
