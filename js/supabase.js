// Supabaseクライアント初期化 (config.js が先に読み込まれること)
let db;
try {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error('[harvest-app] Supabase初期化失敗:', e.message,
    '\n→ Vercel環境変数 SUPABASE_URL / SUPABASE_ANON_KEY を設定してください');
}
