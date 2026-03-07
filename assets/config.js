export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const DEMO_MODE =
  SUPABASE_URL.includes('YOUR_PROJECT') ||
  SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
