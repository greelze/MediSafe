// assets/supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Initialize Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper to get current user
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
