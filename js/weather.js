'use strict';

// 宮崎県の予報 (都道府県コード 450000)
const JMA_FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/450000.json';

/* ===========================
   ユーティリティ
=========================== */
function getTodayJST() {
  // ブラウザのタイムゾーンに関わらず JST の日付を返す
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

/* ===========================
   Supabase チェック
=========================== */
async function todayWeatherExists(dateStr) {
  // maybeSingle: 0件でもエラーにならない（single は0件時に PGRST116 エラーを返す）
  const { data, error } = await db
    .from('weather_logs')
    .select('date')
    .eq('date', dateStr)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/* ===========================
   JMA レスポンス解析
=========================== */
function parseJMAData(jmaData, targetDate) {
  let tempMax     = null;
  let tempMin     = null;
  let weatherCode = null;
  let weatherDesc = null;

  const shortTerm = jmaData[0];
  if (!shortTerm) return { tempMax, tempMin, weatherCode, weatherDesc };

  // ── 天気コード・天気概況（短期予報 timeSeries[0]）──
  const wxTs = shortTerm.timeSeries?.[0];
  if (wxTs) {
    const area = wxTs.areas?.[0];
    wxTs.timeDefines?.some((dt, i) => {
      if (!dt.startsWith(targetDate)) return false;
      weatherCode = area?.weatherCodes?.[i] ?? null;
      weatherDesc = (area?.weathers?.[i] ?? '').replace(/\s+/g, ' ').trim() || null;
      return true; // 当日1件目のみ取得
    });
  }

  // ── 最高・最低気温（週間予報 data[1] timeSeries[1] を優先）──
  // 17時以降のフェッチでは当日が週間予報に含まれないため、
  // 当日マッチがない場合は先頭の有効データ（翌日予報）を使用する
  const weekly = jmaData[1];
  if (weekly) {
    const tempTs = weekly.timeSeries?.[1];
    if (tempTs) {
      const area = tempTs.areas?.[0];
      tempTs.timeDefines?.forEach((dt, i) => {
        if (!dt.startsWith(targetDate)) return;
        const maxV = area?.tempsMax?.[i];
        const minV = area?.tempsMin?.[i];
        if (maxV !== '' && maxV != null) tempMax = Number(maxV);
        if (minV !== '' && minV != null) tempMin = Number(minV);
      });
      // 当日分が週間予報にない場合、先頭から最初の有効値を使用
      if (tempMax === null && tempMin === null) {
        for (let i = 0; i < (tempTs.timeDefines?.length ?? 0); i++) {
          const maxV = area?.tempsMax?.[i];
          const minV = area?.tempsMin?.[i];
          if (tempMax === null && maxV !== '' && maxV != null) tempMax = Number(maxV);
          if (tempMin === null && minV !== '' && minV != null) tempMin = Number(minV);
          if (tempMax !== null && tempMin !== null) break;
        }
      }
    }
  }

  // ── 週間に値がない場合は短期予報の気温で代替（timeSeries[2]）──
  if (tempMax === null || tempMin === null) {
    const tempTs = shortTerm.timeSeries?.[2];
    if (tempTs) {
      const area = tempTs.areas?.[0];
      const temps = [];
      tempTs.timeDefines?.forEach((dt, i) => {
        if (!dt.startsWith(targetDate)) return;
        const v = area?.temps?.[i];
        if (v !== '' && v != null) temps.push(Number(v));
      });
      // 当日データがない場合は全エントリを使用（翌日以降の予報値）
      if (temps.length === 0) {
        tempTs.timeDefines?.forEach((dt, i) => {
          const v = area?.temps?.[i];
          if (v !== '' && v != null) temps.push(Number(v));
        });
      }
      if (temps.length > 0) {
        if (tempMax === null) tempMax = Math.max(...temps);
        if (tempMin === null) tempMin = Math.min(...temps);
      }
    }
  }

  return { tempMax, tempMin, weatherCode, weatherDesc };
}

/* ===========================
   メイン処理
=========================== */
async function fetchAndSaveWeather() {
  if (!db) {
    console.warn('Supabase が未初期化のため weather.js をスキップします');
    return;
  }

  const today = getTodayJST();

  // 当日データが既にあればスキップ（確認失敗でも取得・保存を続行する）
  try {
    const exists = await todayWeatherExists(today);
    if (exists) return;
  } catch (e) {
    console.warn('weather_logs 確認失敗（取得を続行します）:', e.message);
  }

  // 気象庁API 取得
  let jmaData;
  try {
    const res = await fetch(JMA_FORECAST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    jmaData = await res.json();
  } catch (e) {
    console.warn('気象庁API 取得失敗:', e.message);
    return;
  }

  const { tempMax, tempMin, weatherCode, weatherDesc } = parseJMAData(jmaData, today);

  // Supabase に保存（UPSERT）
  const { error } = await db
    .from('weather_logs')
    .upsert(
      {
        date:         today,
        temp_max:     tempMax,
        temp_min:     tempMin,
        weather_code: weatherCode,
        weather_desc: weatherDesc,
        fetched_at:   new Date().toISOString(),
      },
      { onConflict: 'date' }
    );

  if (error) {
    console.error('weather_logs 保存失敗:', JSON.stringify(error));
  } else {
    console.info(`気象データ保存完了: ${today} 最高${tempMax ?? '?'}℃ 最低${tempMin ?? '?'}℃ ${weatherDesc ?? ''}`);
  }
}

// ページ読み込み時に自動実行（db が確実にセットアップ済みのため DOMContentLoaded 後）
document.addEventListener('DOMContentLoaded', fetchAndSaveWeather);
