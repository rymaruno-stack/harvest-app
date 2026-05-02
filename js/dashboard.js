'use strict';

/* ===========================
   定数
=========================== */
const JA_COUNT_FIELDS = [
  'ja_nagabako_am', 'ja_fukabako_am', 'ja_hirabako_as', 'ja_hirabako_am', 'ja_10khira_am',
  'ja_regular_al', 'ja_regular_am', 'ja_regular_as', 'ja_regular_a2s',
  'ja_regular_bl', 'ja_regular_bm', 'ja_regular_bs',
  'ja_kobukuro_al', 'ja_kobukuro_bl', 'ja_kobukuro_bm', 'ja_kobukuro_cm',
  'ja_kikakugai_dm', 'ja_kikakugai_ds',
];

const MARKET_COUNT_FIELDS = [
  'market_fukabako_a', 'market_regular_as', 'market_regular_am', 'market_regular_al',
  'market_regular_bs', 'market_regular_bm', 'market_regular_bl', 'market_10k_pori',
];

const JFP_COUNT_FIELDS = [
  'jfp_contena', 'jfp_fukabako_5kg', 'jfp_b_5kg', 'jfp_cd_10kg',
];

const URIAGE_FIELDS = [
  'ja_uriage_nagabako', 'ja_uriage_fukabako', 'ja_uriage_hirabako', 'ja_uriage_10k',
  'ja_uriage_regular', 'ja_uriage_kobukuro', 'ja_uriage_kikakugai',
  'market_uriage_fukabako_a', 'market_uriage_as', 'market_uriage_am', 'market_uriage_al',
  'market_uriage_bs', 'market_uriage_bm', 'market_uriage_bl', 'market_uriage_pori',
  'jfp_uriage_contena', 'jfp_uriage_fukabako', 'jfp_uriage_b', 'jfp_uriage_cd',
];

const ALL_COUNT_FIELDS = [...JA_COUNT_FIELDS, ...MARKET_COUNT_FIELDS, ...JFP_COUNT_FIELDS];
const ALL_FETCH_FIELDS = ['house_id', 'date', ...ALL_COUNT_FIELDS, ...URIAGE_FIELDS];

const HOUSES = [
  { id: 1, name: '初号機' },
  { id: 2, name: '弐号機' },
  { id: 3, name: '参号機' },
];

// ハウスごとの月間目標箱数（後から変更可）
const MONTHLY_TARGET_PER_HOUSE = { 0: 900, 1: 300, 2: 300, 3: 300 };

/* ===========================
   状態
=========================== */
let currentPeriod  = 'week';
let currentHouseId = 0;
let shipmentChart  = null;
let cumulChart     = null;

/* ===========================
   ユーティリティ
=========================== */
function sumFields(rec, fields) {
  return fields.reduce((s, f) => s + (Number(rec[f]) || 0), 0);
}

function toDateStr(d) {
  return d.toLocaleDateString('sv-SE');
}

function getDateRange(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case 'day':
      return { from: toDateStr(today), to: toDateStr(today) };
    case 'week': {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: toDateStr(from), to: toDateStr(today) };
    }
    case 'month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateStr(from), to: toDateStr(today) };
    }
    case 'year': {
      const from = new Date(today.getFullYear(), today.getMonth() - 11, 1);
      return { from: toDateStr(from), to: toDateStr(today) };
    }
  }
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateLabel(dateStr, period) {
  const d = new Date(dateStr + 'T00:00:00');
  if (period === 'month') return `${d.getDate()}(${DOW_JA[d.getDay()]})`;
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW_JA[d.getDay()]})`;
}

function formatMonthLabel(monthStr) {
  return `${Number(monthStr.slice(5, 7))}月`;
}

/* ===========================
   データ集計
=========================== */
function aggregateByDate(records) {
  const map = {};
  records.forEach(rec => {
    const key = rec.date;
    if (!map[key]) map[key] = { date: key, ja: 0, market: 0, jfp: 0, uriage: 0 };
    map[key].ja     += sumFields(rec, JA_COUNT_FIELDS);
    map[key].market += sumFields(rec, MARKET_COUNT_FIELDS);
    map[key].jfp    += sumFields(rec, JFP_COUNT_FIELDS);
    map[key].uriage += sumFields(rec, URIAGE_FIELDS);
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByMonth(records) {
  const map = {};
  records.forEach(rec => {
    const key = rec.date.slice(0, 7); // YYYY-MM
    if (!map[key]) map[key] = { month: key, ja: 0, market: 0, jfp: 0, uriage: 0 };
    map[key].ja     += sumFields(rec, JA_COUNT_FIELDS);
    map[key].market += sumFields(rec, MARKET_COUNT_FIELDS);
    map[key].jfp    += sumFields(rec, JFP_COUNT_FIELDS);
    map[key].uriage += sumFields(rec, URIAGE_FIELDS);
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateByHouse(records) {
  const map = {};
  records.forEach(rec => {
    const key = rec.house_id;
    if (!map[key]) map[key] = { house_id: key, ja: 0, market: 0, jfp: 0, uriage: 0 };
    map[key].ja     += sumFields(rec, JA_COUNT_FIELDS);
    map[key].market += sumFields(rec, MARKET_COUNT_FIELDS);
    map[key].jfp    += sumFields(rec, JFP_COUNT_FIELDS);
    map[key].uriage += sumFields(rec, URIAGE_FIELDS);
  });
  return HOUSES.map(h => map[h.id] || { house_id: h.id, ja: 0, market: 0, jfp: 0, uriage: 0 });
}

/* ===========================
   Supabase 取得
=========================== */
async function fetchHarvests(from, to) {
  let query = db
    .from('harvests')
    .select(ALL_FETCH_FIELDS.join(', '))
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (currentHouseId !== 0) {
    query = query.eq('house_id', currentHouseId);
  }

  const { data, error } = await query;
  if (error) { console.error('fetchHarvests:', error); return []; }
  return data || [];
}

async function fetchWeather(from, to) {
  const { data, error } = await db
    .from('weather_logs')
    .select('date, temp_max, temp_min')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (error) return [];
  return data || [];
}

/* ===========================
   サマリーカード
=========================== */
function renderSummary(aggregated, unitLabel) {
  const totalBoxes  = aggregated.reduce((s, r) => s + r.ja + r.market + r.jfp, 0);
  const totalUriage = aggregated.reduce((s, r) => s + r.uriage, 0);
  const count       = aggregated.length || 1;
  const avg         = Math.round(totalBoxes / count);

  document.getElementById('summary-boxes').textContent   = `${totalBoxes.toLocaleString()} 箱`;
  document.getElementById('summary-uriage').textContent  = `¥${totalUriage.toLocaleString()}`;
  document.getElementById('summary-avg').textContent     = `${avg.toLocaleString()} 箱`;
  document.getElementById('summary-avg-label').textContent = unitLabel;
}

/* ===========================
   チャート描画
=========================== */
function destroyChart(chart) {
  if (chart) chart.destroy();
  return null;
}

function renderShipmentChart(labels, jaData, marketData, jfpData, weatherByDate) {
  shipmentChart = destroyChart(shipmentChart);
  const ctx = document.getElementById('shipment-chart').getContext('2d');

  const datasets = [
    {
      label: 'JA',
      data: jaData,
      backgroundColor: 'rgba(46,125,50,0.85)',
      stack: 'boxes',
      yAxisID: 'y',
      order: 2,
    },
    {
      label: '市場',
      data: marketData,
      backgroundColor: 'rgba(21,101,192,0.85)',
      stack: 'boxes',
      yAxisID: 'y',
      order: 2,
    },
    {
      label: 'JFP',
      data: jfpData,
      backgroundColor: 'rgba(106,27,154,0.85)',
      stack: 'boxes',
      yAxisID: 'y',
      order: 2,
    },
  ];

  // 気温データがあれば折れ線を追加
  const hasWeather = weatherByDate && Object.keys(weatherByDate).length > 0;
  if (hasWeather) {
    datasets.push({
      type: 'line',
      label: '最高気温',
      data: labels.map(l => weatherByDate[l]?.temp_max ?? null),
      borderColor: '#E53935',
      backgroundColor: 'transparent',
      yAxisID: 'yTemp',
      tension: 0.3,
      pointRadius: 3,
      spanGaps: true,
      order: 1,
    });
    datasets.push({
      type: 'line',
      label: '最低気温',
      data: labels.map(l => weatherByDate[l]?.temp_min ?? null),
      borderColor: '#1E88E5',
      backgroundColor: 'transparent',
      yAxisID: 'yTemp',
      tension: 0.3,
      pointRadius: 3,
      spanGaps: true,
      order: 1,
    });
  }

  shipmentChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
        },
        y: {
          stacked: true,
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: '箱数' },
        },
        ...(hasWeather ? {
          yTemp: {
            position: 'right',
            title: { display: true, text: '気温 (℃)' },
            grid: { drawOnChartArea: false },
          },
        } : {}),
      },
    },
  });
}

function renderCumulativeChart(byDate) {
  cumulChart  = destroyChart(cumulChart);
  const card  = document.getElementById('cumulative-card');

  if (currentPeriod !== 'month' || byDate.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const today        = new Date();
  const daysInMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const target       = MONTHLY_TARGET_PER_HOUSE[currentHouseId] ?? 900;

  const labels      = byDate.map(r => formatDateLabel(r.date, 'month'));
  let cumul         = 0;
  const cumulData   = byDate.map(r => { cumul += r.ja + r.market + r.jfp; return cumul; });
  const targetData  = byDate.map((_, i) => Math.round(target * (i + 1) / daysInMonth));

  const ctx = document.getElementById('cumulative-chart').getContext('2d');
  cumulChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '月累計',
          data: cumulData,
          borderColor: '#2E7D32',
          backgroundColor: 'rgba(46,125,50,0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          label: `目標 ${target.toLocaleString()}箱`,
          data: targetData,
          borderColor: '#E65100',
          borderDash: [6, 4],
          backgroundColor: 'transparent',
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: '累計箱数' },
        },
      },
    },
  });
}

/* ===========================
   メイン更新処理
=========================== */
async function refresh() {
  const { from, to } = getDateRange(currentPeriod);

  // 気温は週・月のみ取得
  const needWeather = currentPeriod === 'week' || currentPeriod === 'month';
  const [records, weatherRaw] = await Promise.all([
    fetchHarvests(from, to),
    needWeather ? fetchWeather(from, to) : Promise.resolve([]),
  ]);

  // 気温を日付キーでマップ
  const weatherByDate = {};
  weatherRaw.forEach(w => { weatherByDate[w.date] = w; });

  // チャートタイトル更新
  const titles = { day: '本日の出荷箱数（ハウス別）', week: '週間出荷箱数', month: '月間出荷箱数', year: '年間出荷箱数（月次）' };
  document.getElementById('shipment-chart-title').textContent = titles[currentPeriod];

  if (currentPeriod === 'day') {
    const byHouse = aggregateByHouse(records);
    const labels  = HOUSES.map(h => h.name);
    renderShipmentChart(labels, byHouse.map(r => r.ja), byHouse.map(r => r.market), byHouse.map(r => r.jfp), null);
    renderSummary(byHouse, '本日合計');
    cumulChart = destroyChart(cumulChart);
    document.getElementById('cumulative-card').style.display = 'none';
    return;
  }

  if (currentPeriod === 'year') {
    const byMonth = aggregateByMonth(records);
    const labels  = byMonth.map(r => formatMonthLabel(r.month));
    renderShipmentChart(labels, byMonth.map(r => r.ja), byMonth.map(r => r.market), byMonth.map(r => r.jfp), null);
    renderSummary(byMonth, '月平均');
    cumulChart = destroyChart(cumulChart);
    document.getElementById('cumulative-card').style.display = 'none';
    return;
  }

  // week / month: 日付ごとの集計
  const byDate  = aggregateByDate(records);
  const labels  = byDate.map(r => formatDateLabel(r.date, currentPeriod));
  // 気温ラベルは同じラベル文字列でマップするため日付キーで引く必要がある
  const weatherByLabel = {};
  byDate.forEach(r => { weatherByLabel[formatDateLabel(r.date, currentPeriod)] = weatherByDate[r.date]; });

  renderShipmentChart(labels, byDate.map(r => r.ja), byDate.map(r => r.market), byDate.map(r => r.jfp), weatherByLabel);
  renderSummary(byDate, currentPeriod === 'week' ? '日平均' : '日平均');
  renderCumulativeChart(byDate);
}

/* ===========================
   初期化
=========================== */
function initPeriodTabs() {
  document.querySelectorAll('.tab-btn[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period;
      refresh();
    });
  });
}

function initHouseButtons() {
  document.querySelectorAll('.house-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.house-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentHouseId = parseInt(btn.dataset.houseId, 10);
      refresh();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPeriodTabs();
  initHouseButtons();
  refresh();
});
