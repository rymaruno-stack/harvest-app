// Vercel ビルド時に環境変数から js/config.js を生成するスクリプト
const fs  = require('fs');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('ERROR: SUPABASE_URL と SUPABASE_ANON_KEY を Vercel 環境変数に設定してください');
  process.exit(1);
}

fs.writeFileSync(
  'js/config.js',
  `const SUPABASE_URL = '${url}';\nconst SUPABASE_ANON_KEY = '${key}';\n`
);

console.log('js/config.js を環境変数から生成しました');
