// Supabaseクライアント初期化 (config.js が先に読み込まれること)
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
