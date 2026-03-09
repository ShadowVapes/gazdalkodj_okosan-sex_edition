export const SUPABASE_URL = 'https://ciajlartqwfygyejvznl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjaWFqbGFydHF3ZnlneWVqdnpubCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcyNjM5ODU4LCJleHAiOjIwODgyMTU4NTh9.mHDpTvmTLcaZ-VhgBDoRhZYeOMZamJWnEzYaevhX_YE';

export const DEMO_MODE =
  SUPABASE_URL.includes('YOUR_PROJECT') ||
  SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
