// ============================================================
// Supabase → Google Sheets リアルタイム同期
// Supabase Database Webhook の受信エンドポイント
//
// セットアップ手順は README.md を参照
// ============================================================

const SPREADSHEET_ID = '1iRXThJwiKP6Tv16N076iLl9cLYq8ZYBowymtxCnitvg';

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
    console.log('doPost受信 parameter:', JSON.stringify(e.parameter));

    const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (secret && e.parameter.secret !== secret) {
      console.error('unauthorized: 受信secret=[' + e.parameter.secret + '] 期待値=[' + secret + ']');
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

  const rows = JSON.parse(resp.getContentText());
  console.log('取得件数:', rows.length);
  console.log('rawRecord:', JSON.stringify(rows[0]));

  const totals = {};
  for (const rec of rows) {
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


// ── 月次シート自動生成 ────────────────────────────────────────
// 月曜=0 … 日曜=6（JavaScript の (getDay()+6)%7 に対応）
const DOW_JA = ['月', '火', '水', '木', '金', '土', '日'];

// 全セクション開始行: 全体(6), 初号機(46), 弐号機(86), 参号機(126)
const SECTION_START_ROWS = [6, 46, 86, 126];

const DATA_COL_START = 3;   // C列
const DATA_COL_END   = 51;  // AY列
const DATA_COL_COUNT = DATA_COL_END - DATA_COL_START + 1; // 49列

/**
 * 前月シートを複製して当月シートを作成する。
 * 毎月1日に時間トリガーで自動実行される。
 */
function createNextMonthSheet() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  const newSheetName  = `${month}月`;
  const prevMonth     = month === 1 ? 12 : month - 1;
  const prevSheetName = `${prevMonth}月`;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  if (ss.getSheetByName(newSheetName)) {
    console.log(`シート "${newSheetName}" は既に存在します。スキップします。`);
    return;
  }

  const srcSheet = ss.getSheetByName(prevSheetName);
  if (!srcSheet) throw new Error(`前月シート "${prevSheetName}" が見つかりません`);

  // 前月シートを複製してリネーム（末尾に追加される）
  const newSheet = srcSheet.copyTo(ss);
  newSheet.setName(newSheetName);

  // 月の末日を取得（day=0 で前月末日 → month 月の末日）
  const lastDay = new Date(year, month, 0).getDate();

  for (const startRow of SECTION_START_ROWS) {
    // A列（日）・B列（曜日）を当月の日付で上書き（31行分）
    const abValues = [];
    for (let day = 1; day <= 31; day++) {
      if (day <= lastDay) {
        const d = new Date(year, month - 1, day);
        abValues.push([day, DOW_JA[(d.getDay() + 6) % 7]]);
      } else {
        abValues.push([null, null]); // 月末以降の行をクリア
      }
    }
    newSheet.getRange(startRow, 1, 31, 2).setValues(abValues);

    // C〜AY列: 数式は保持し数値データをクリア
    const dataRange = newSheet.getRange(startRow, DATA_COL_START, 31, DATA_COL_COUNT);
    const formulas  = dataRange.getFormulas(); // 数式のあるセルは "=..." 文字列
    dataRange.clearContent();
    dataRange.setFormulas(formulas); // 数式のみ復元
  }

  SpreadsheetApp.flush();
  console.log(`シート "${newSheetName}" を作成しました（${year}年${month}月, ${lastDay}日）`);
}

/**
 * 毎月1日 午前1時に createNextMonthSheet を実行するトリガーを登録する。
 * 初回のみ GAS エディタから手動実行すること。
 */
function setupMonthlyTrigger() {
  // 既存の同名トリガーを削除（重複防止）
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'createNextMonthSheet') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('createNextMonthSheet')
    .timeBased()
    .onMonthDay(1)
    .atHour(1)
    .create();
  console.log('毎月1日 1時に createNextMonthSheet を実行するトリガーを登録しました');
}


// ── 動作確認用（GASエディタから手動実行） ──────────────────────

// Webhook経由でSupabaseの実データを書き込む（結合テスト）
function testWebhook() {
  const secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
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
    parameter: secret ? { secret } : {},
  };
  const result = doPost(mockEvent);
  console.log(result.getContent());
}

// 列マッピング単体テスト: Supabaseを使わず固定値でH列を確認する
function testColumnMapping() {
  const totals = { ja_regular_al: 10 };
  writeToSheet('2026-04-28', 1, totals);
  console.log('完了: 初号機 4/28行 のH列に 10 が書き込まれたはず');
}
