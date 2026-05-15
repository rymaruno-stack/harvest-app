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
  'market_contena',
];

const JFP_COUNT_FIELDS = [
  'jfp_contena', 'jfp_fukabako_5kg', 'jfp_b_5kg', 'jfp_cd_10kg',
];

const ALL_COUNT_FIELDS = [...JA_COUNT_FIELDS, ...MARKET_COUNT_FIELDS, ...JFP_COUNT_FIELDS];
const ALL_FETCH_FIELDS = ['house_id', 'date', ...ALL_COUNT_FIELDS];

// 日次ログ用
const LOG_MARKET_BOX_FIELDS = [
  'market_fukabako_a', 'market_regular_as', 'market_regular_am', 'market_regular_al',
  'market_regular_bs', 'market_regular_bm', 'market_regular_bl', 'market_10k_pori',
];
const LOG_JA_WEIGHT_KEYS = [
  'ja_weight_nagabako', 'ja_weight_fukabako', 'ja_weight_hirabako',
  'ja_weight_10k', 'ja_weight_regular', 'ja_weight_kobukuro', 'ja_weight_kikakugai',
];
const LOG_JFP_5KG_FIELDS  = ['jfp_fukabako_5kg', 'jfp_b_5kg'];
const LOG_JFP_10KG_FIELDS = ['jfp_contena', 'jfp_cd_10kg'];

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
let selectedYear   = new Date().getFullYear();
let selectedMonth  = new Date().getMonth(); // 0-indexed

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
      const from        = new Date(selectedYear, selectedMonth, 1);
      const lastOfMonth = new Date(selectedYear, selectedMonth + 1, 0);
      return { from: toDateStr(from), to: toDateStr(lastOfMonth < today ? lastOfMonth : today) };
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

// 気象庁 weather_code → 天気アイコン絵文字
function weatherCodeToIcon(code) {
  if (!code) return '';
  const n = Number(code);
  if (isNaN(n)) return '';

  if (n >= 400) return '🌨';                                          // 雪
  if (n >= 300) return (n === 308 || n === 350) ? '⛈' : '🌧';       // 雨（雷雨含む）
  if (n >= 200) {
    if (n === 208 || n === 240 || n === 250) return '⛈';             // 曇り+雷雨
    if (n === 209 || n === 231)              return '🌫';             // 霧
    if (n === 200)                           return '☁';             // 曇り
    if (n === 201 || n === 210 || n === 211 || n === 223) return '⛅'; // 曇り時々晴れ
    return '🌧';                                                      // 曇り+雨
  }
  // 1xx: 晴れ系
  if (n === 100)                   return '☀';
  if (n === 108 || n === 140)      return '⛈';                       // 晴れ+雷雨
  if (n === 130 || n === 131)      return '🌫';                       // 霧のち晴れ
  if (n === 101 || n === 110 || n === 111) return '⛅';               // 晴れ時々/のち曇り
  return '🌦';                                                        // 晴れ+雨
}

/* ===========================
   データ集計
=========================== */
function aggregateByDate(records) {
  const map = {};
  records.forEach(rec => {
    const key = rec.date;
    if (!map[key]) map[key] = { date: key, ja: 0, market: 0, jfp: 0 };
    map[key].ja     += sumFields(rec, JA_COUNT_FIELDS);
    map[key].market += sumFields(rec, MARKET_COUNT_FIELDS);
    map[key].jfp    += sumFields(rec, JFP_COUNT_FIELDS);
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByMonth(records) {
  const map = {};
  records.forEach(rec => {
    const key = rec.date.slice(0, 7); // YYYY-MM
    if (!map[key]) map[key] = { month: key, ja: 0, market: 0, jfp: 0 };
    map[key].ja     += sumFields(rec, JA_COUNT_FIELDS);
    map[key].market += sumFields(rec, MARKET_COUNT_FIELDS);
    map[key].jfp    += sumFields(rec, JFP_COUNT_FIELDS);
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateByHouse(records) {
  const map = {};
  records.forEach(rec => {
    const key = rec.house_id;
    if (!map[key]) map[key] = { house_id: key, ja: 0, market: 0, jfp: 0 };
    map[key].ja     += sumFields(rec, JA_COUNT_FIELDS);
    map[key].market += sumFields(rec, MARKET_COUNT_FIELDS);
    map[key].jfp    += sumFields(rec, JFP_COUNT_FIELDS);
  });
  return HOUSES.map(h => map[h.id] || { house_id: h.id, ja: 0, market: 0, jfp: 0 });
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

async function fetchChannelSales(from, to) {
  const { data, error } = await db
    .from('channel_sales')
    .select('ja_uriage, market_uriage, market_container_uriage, jfp_uriage')
    .gte('receiving_date', from)
    .lte('receiving_date', to);
  if (error) { console.error('fetchChannelSales:', error); return []; }
  return data || [];
}

async function fetchWeather(from, to) {
  const { data, error } = await db
    .from('weather_logs')
    .select('date, temp_max, temp_min, weather_code')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (error) return [];
  return data || [];
}

/* ===========================
   サマリーカード
=========================== */
function renderSummary(aggregated, unitLabel, totalUriage = 0) {
  const totalBoxes = aggregated.reduce((s, r) => s + r.ja + r.market + r.jfp, 0);
  const count      = aggregated.length || 1;
  const avg        = Math.round(totalBoxes / count);

  document.getElementById('summary-boxes').textContent    = `${totalBoxes.toLocaleString()} 箱`;
  document.getElementById('summary-uriage').textContent   = `¥${totalUriage.toLocaleString()}`;
  document.getElementById('summary-avg').textContent      = `${avg.toLocaleString()} 箱`;
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
          ticks: {
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 20,
            callback: (value, index) => {
              const label = labels[index];
              const icon = weatherByDate?.[label]?.weather_code
                ? weatherCodeToIcon(weatherByDate[label].weather_code)
                : '';
              return icon ? [icon, label] : label;
            },
          },
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

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const target      = MONTHLY_TARGET_PER_HOUSE[currentHouseId] ?? 900;

  const labels     = byDate.map(r => formatDateLabel(r.date, 'month'));
  let cumul        = 0;
  const cumulData  = byDate.map(r => { cumul += r.ja + r.market + r.jfp; return cumul; });
  const targetData = byDate.map(r => {
    const day = new Date(r.date + 'T00:00:00').getDate();
    return Math.round(target * day / daysInMonth);
  });

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
  const [records, weatherRaw, channelSalesRaw] = await Promise.all([
    fetchHarvests(from, to),
    needWeather ? fetchWeather(from, to) : Promise.resolve([]),
    fetchChannelSales(from, to),
  ]);

  const totalUriage = channelSalesRaw.reduce((s, r) =>
    s + (Number(r.ja_uriage) || 0) + (Number(r.market_uriage) || 0) +
    (Number(r.market_container_uriage) || 0) + (Number(r.jfp_uriage) || 0), 0);

  // 気温を日付キーでマップ
  const weatherByDate = {};
  weatherRaw.forEach(w => { weatherByDate[w.date] = w; });

  // チャートタイトル更新
  const titles = { day: '本日の出荷箱数（ハウス別）', week: '週間出荷箱数', year: '年間出荷箱数（月次）' };
  const chartTitle = currentPeriod === 'month'
    ? `${selectedYear}年${selectedMonth + 1}月の出荷箱数`
    : titles[currentPeriod];
  document.getElementById('shipment-chart-title').textContent = chartTitle;

  if (currentPeriod === 'day') {
    const byHouse = aggregateByHouse(records);
    const labels  = HOUSES.map(h => h.name);
    renderShipmentChart(labels, byHouse.map(r => r.ja), byHouse.map(r => r.market), byHouse.map(r => r.jfp), null);
    renderSummary(byHouse, '本日合計', totalUriage);
    cumulChart = destroyChart(cumulChart);
    document.getElementById('cumulative-card').style.display = 'none';
    return;
  }

  if (currentPeriod === 'year') {
    const byMonth = aggregateByMonth(records);
    const labels  = byMonth.map(r => formatMonthLabel(r.month));
    renderShipmentChart(labels, byMonth.map(r => r.ja), byMonth.map(r => r.market), byMonth.map(r => r.jfp), null);
    renderSummary(byMonth, '月平均', totalUriage);
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
  renderSummary(byDate, currentPeriod === 'week' ? '日平均' : '日平均', totalUriage);
  renderCumulativeChart(byDate);
}

/* ===========================
   日次ログ
=========================== */
async function fetchDailyLogData(dateStr) {
  const harvestCols = [
    'house_id', 'ja_date', 'market_date', 'market_container_date', 'jfp_date',
    ...JA_COUNT_FIELDS, ...LOG_MARKET_BOX_FIELDS, 'market_contena',
    ...LOG_JFP_5KG_FIELDS, ...LOG_JFP_10KG_FIELDS,
  ].join(', ');

  const [harvestsRes, salesRes] = await Promise.all([
    db.from('harvests')
      .select(harvestCols)
      .or(`ja_date.eq.${dateStr},market_date.eq.${dateStr},market_container_date.eq.${dateStr},jfp_date.eq.${dateStr}`),
    db.from('channel_sales')
      .select(['house_id', ...LOG_JA_WEIGHT_KEYS].join(', '))
      .eq('receiving_date', dateStr),
  ]);

  if (harvestsRes.error) console.error('fetchDailyLogData harvests:', harvestsRes.error);
  if (salesRes.error)    console.error('fetchDailyLogData sales:', salesRes.error);
  return { harvests: harvestsRes.data || [], sales: salesRes.data || [] };
}

function calcHouseLogStats(harvestRecs, salesRecs, houseId, dateStr) {
  const hRecs = houseId > 0 ? harvestRecs.filter(r => r.house_id === houseId) : harvestRecs;

  const jaBoxes = hRecs
    .filter(r => r.ja_date === dateStr)
    .reduce((s, r) => s + JA_COUNT_FIELDS.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);

  const jaWeight = houseId > 0
    ? LOG_JA_WEIGHT_KEYS.reduce((s, f) => s + (Number((salesRecs.find(r => r.house_id === houseId) || {})[f]) || 0), 0)
    : salesRecs.reduce((s, r) => s + LOG_JA_WEIGHT_KEYS.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);

  const marketBoxes = hRecs
    .filter(r => r.market_date === dateStr)
    .reduce((s, r) => s + LOG_MARKET_BOX_FIELDS.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
  const marketWeight = marketBoxes * 5;

  const containerBoxes = hRecs
    .filter(r => r.market_container_date === dateStr)
    .reduce((s, r) => s + (Number(r.market_contena) || 0), 0);
  const containerWeight = containerBoxes * 10;

  const jfp5  = hRecs
    .filter(r => r.jfp_date === dateStr)
    .reduce((s, r) => s + LOG_JFP_5KG_FIELDS.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
  const jfp10 = hRecs
    .filter(r => r.jfp_date === dateStr)
    .reduce((s, r) => s + LOG_JFP_10KG_FIELDS.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
  const jfpBoxes  = jfp5 + jfp10;
  const jfpWeight = jfp5 * 5 + jfp10 * 10;

  const totalWeight = jaWeight + marketWeight + containerWeight + jfpWeight;
  return { jaBoxes, jaWeight, marketBoxes, marketWeight, containerBoxes, containerWeight, jfpBoxes, jfpWeight, totalWeight };
}

function renderDailyLog(dateStr, harvests, sales) {
  const container = document.getElementById('daily-log-container');
  if (!container) return;

  if (harvests.length === 0 && sales.length === 0) {
    container.innerHTML = '<div class="log-empty">この日のデータがありません</div>';
    return;
  }

  const cols = [
    ...HOUSES.map(h => ({ id: h.id, name: h.name })),
    { id: 0, name: '全体' },
  ].map(c => ({ ...c, ...calcHouseLogStats(harvests, sales, c.id, dateStr) }));

  const totalCol = cols[cols.length - 1];
  const per10a   = totalCol.totalWeight > 0 ? (totalCol.totalWeight / 47 * 10).toFixed(1) : null;

  const fmt  = n => n > 0 ? n.toLocaleString() : '—';
  const fmtW = w => w > 0 ? w.toFixed(1) : '—';

  const channels = [
    { label: 'JA',          getB: s => s.jaBoxes,        getW: s => s.jaWeight        },
    { label: '市場',         getB: s => s.marketBoxes,    getW: s => s.marketWeight    },
    { label: '市場コンテナ', getB: s => s.containerBoxes, getW: s => s.containerWeight },
    { label: 'JFP',         getB: s => s.jfpBoxes,       getW: s => s.jfpWeight       },
  ];

  const thHouses = cols.map((c, i) =>
    `<th colspan="2" class="${i === cols.length - 1 ? 'log-th-total' : ''}">${c.name}</th>`
  ).join('');

  const thSubs = cols.map(() => '<th class="log-th-sub">箱数</th><th class="log-th-sub">重量(kg)</th>').join('');

  const bodyRows = channels.map(ch => {
    const cells = cols.map(s =>
      `<td class="log-cell-num">${fmt(ch.getB(s))}</td><td class="log-cell-num">${fmtW(ch.getW(s))}</td>`
    ).join('');
    return `<tr><td class="log-row-label">${ch.label}</td>${cells}</tr>`;
  }).join('');

  const weightCells = cols.map(s =>
    `<td class="log-cell-num" colspan="2" style="font-weight:700">${fmtW(s.totalWeight)}</td>`
  ).join('');

  const per10aRow = per10a ? (() => {
    const cells = cols.map((_, i) => i < cols.length - 1
      ? '<td colspan="2">—</td>'
      : `<td class="log-cell-10a" colspan="2">${per10a} kg</td>`
    ).join('');
    return `<tr class="log-per10a-row"><td class="log-row-label">10a収穫量</td>${cells}</tr>`;
  })() : '';

  container.innerHTML = `
    <div class="log-table-wrapper">
      <table class="log-table">
        <thead>
          <tr><th class="log-th-label"></th>${thHouses}</tr>
          <tr><th class="log-th-label"></th>${thSubs}</tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr class="log-total-row"><td class="log-row-label">総重量</td>${weightCells}</tr>
          ${per10aRow}
        </tbody>
      </table>
    </div>`;
}

async function loadDailyLog() {
  const dateStr = document.getElementById('log-date')?.value;
  if (!dateStr) return;
  const container = document.getElementById('daily-log-container');
  if (container) container.innerHTML = '<div class="log-empty">読み込み中...</div>';
  const { harvests, sales } = await fetchDailyLogData(dateStr);
  renderDailyLog(dateStr, harvests, sales);
}

function initLogDateInput() {
  const input = document.getElementById('log-date');
  if (input) input.addEventListener('change', loadDailyLog);
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
      document.getElementById('month-nav').style.display = currentPeriod === 'month' ? '' : 'none';
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

function updateMonthLabel() {
  document.getElementById('month-label').textContent = `${selectedYear}年${selectedMonth + 1}月`;
  const now = new Date();
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  document.getElementById('month-next').disabled = isCurrentMonth;
}

function initMonthNav() {
  updateMonthLabel();

  document.getElementById('month-prev').addEventListener('click', () => {
    selectedMonth--;
    if (selectedMonth < 0) { selectedMonth = 11; selectedYear--; }
    updateMonthLabel();
    refresh();
  });

  document.getElementById('month-next').addEventListener('click', () => {
    selectedMonth++;
    if (selectedMonth > 11) { selectedMonth = 0; selectedYear++; }
    updateMonthLabel();
    refresh();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPeriodTabs();
  initHouseButtons();
  initMonthNav();
  initLogDateInput();
  refresh();
});
