// ============================================================
// Supabase → Google Sheets リアルタイム同期
// Supabase Database Webhook の受信エンドポイント
//
// セットアップ手順は README.md を参照
// ============================================================

const SPREADSHEET_ID = '1VUvQEaa_x1Rk_KnhmSV_kbGD5Ux15d8IRby7zent69A';

// house_id → セクション開始行
const SECTIONS = {
  1: 46,   // 初号機
  2: 86,   // 弐号機
  3: 126,  // 参号機
};

// DB フィールド → スプレッドシート列のマッピング（C列〜AY列）
const COLUMN_MAP = [
  ['C',  'ja_nagabako_am'],
  ['D',  'ja_fukabako_am'],
  ['E',  'ja_hirabako_as'],
  ['F',  'ja_hirabako_am'],
  ['G',  'ja_10khira_am'],
  ['H',  'ja_regular_al'],
  ['I',  'ja_regular_am'],
  ['J',  'ja_regular_as'],
  ['K',  'ja_regular_a2s'],
  ['L',  'ja_regular_bl'],
  ['M',  'ja_regular_bm'],
  ['N',  'ja_regular_bs'],
  ['O',  'ja_kobukuro_al'],
  ['P',  'ja_kobukuro_bl'],
  ['Q',  'ja_kobukuro_bm'],
  ['R',  'ja_kobukuro_cm'],
  ['S',  'ja_kikakugai_dm'],
  ['T',  'ja_kikakugai_ds'],
  ['U',  'market_fukabako_a'],
  ['V',  'market_regular_as'],
  ['W',  'market_regular_am'],
  ['X',  'market_regular_al'],
  ['Y',  'market_regular_bs'],
  ['Z',  'market_regular_bm'],
  ['AA', 'market_regular_bl'],
  ['AB', 'market_10k_pori'],
  ['AC', 'jfp_contena'],
  ['AD', 'jfp_fukabako_5kg'],
  ['AE', 'jfp_b_5kg'],
  ['AF', 'jfp_cd_10kg'],
  ['AG', 'ja_uriage_nagabako'],
  ['AH', 'ja_uriage_fukabako'],
  ['AI', 'ja_uriage_hirabako'],
  ['AJ', 'ja_uriage_10k'],
  ['AK', 'ja_uriage_regular'],
  ['AL', 'ja_uriage_kobukuro'],
  ['AM', 'ja_uriage_kikakugai'],
  ['AN', 'market_uriage_fukabako_a'],
  ['AO', 'market_uriage_as'],
  ['AP', 'market_uriage_am'],
  ['AQ', 'market_uriage_al'],
  ['AR', 'market_uriage_bs'],
  ['AS', 'market_uriage_bm'],
  ['AT', 'market_uriage_bl'],
  ['AU', 'market_uriage_pori'],
  ['AV', 'jfp_uriage_contena'],
  ['AW', 'jfp_uriage_fukabako'],
  ['AX', 'jfp_uriage_b'],
  ['AY', 'jfp_uriage_cd'],
];


// ── Webhook エンドポイント ────────────────────────────────────
function doPost(e) {
  try {
    // オプション: Webhook シークレット検証
    // Supabase Webhook URL に ?secret=XXXX を付けて設定した場合に有効
    const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (secret && e.parameter.secret !== secret) {
      return jsonResponse({ error: 'unauthorized' });
    }

    const payload = JSON.parse(e.postData.contents);
    const record = payload.record;

    if (!record || !record.date || record.house_id == null) {
      return jsonResponse({ error: 'invalid payload', received: payload });
    }

    // 同日・同ハウスの全レコードを再取得して合算（複数レコード対応）
    const totals = fetchDailyTotals(record.date, record.house_id);
    writeToSheet(record.date, record.house_id, totals);

    return jsonResponse({ ok: true, date: record.date, house_id: record.house_id });

  } catch (err) {
    console.error(err.stack);
    return jsonResponse({ error: err.message });
  }
}


// ── Supabase からデータ取得・合算 ─────────────────────────────
function fetchDailyTotals(dateStr, houseId) {
  const props = PropertiesService.getScriptProperties();
  const url   = props.getProperty('SUPABASE_URL');
  const key   = props.getProperty('SUPABASE_KEY');

  const endpoint = `${url}/rest/v1/harvests?date=eq.${dateStr}&house_id=eq.${houseId}&select=*`;
  const resp = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
    },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error(`Supabase fetch failed: ${resp.getResponseCode()} ${resp.getContentText()}`);
  }

  const records = JSON.parse(resp.getContentText());

  const totals = {};
  for (const rec of records) {
    for (const [, field] of COLUMN_MAP) {
      totals[field] = (totals[field] || 0) + (rec[field] || 0);
    }
  }
  return totals;
}


// ── スプレッドシートへ書き込み ────────────────────────────────
function writeToSheet(dateStr, houseId, totals) {
  const [, monthStr, dayStr] = dateStr.split('-');
  const month = Number(monthStr);
  const day   = Number(dayStr);
  const sheetName = `${month}月`;

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`シート "${sheetName}" が見つかりません`);

  const startRow = SECTIONS[houseId];
  if (!startRow) throw new Error(`不明な house_id: ${houseId}`);

  const row    = startRow + day - 1;
  const values = COLUMN_MAP.map(([, field]) => totals[field] || 0);

  // C列(3) から 49 列を一括書き込み
  sheet.getRange(row, 3, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
}


// ── ヘルパー ─────────────────────────────────────────────────
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── 動作確認用（GASエディタから手動実行） ──────────────────────
function testWebhook() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        type: 'INSERT',
        table: 'harvests',
        record: {
          date: '2026-04-28',
          house_id: 1,
        },
      }),
    },
    parameter: {},
  };
  const result = doPost(mockEvent);
  console.log(result.getContent());
}
