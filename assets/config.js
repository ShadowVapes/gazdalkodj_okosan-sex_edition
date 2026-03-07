export const SUPABASE_URL = 'https://ciajlartqwfygyejvznl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpYWpsYXJ0cXdmeWd5ZWp2em5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mzk4NTgsImV4cCI6MjA4ODIxNTg1OH0.mHDpTvmTLcaZ-VhgBDoRhZYeOMZamJWnEzYaevhX_YE
export const DEMO_MODE =
  SUPABASE_URL.includes('YOUR_PROJECT') ||
  SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
