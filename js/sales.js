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

const MARKET_CONTAINER_FIELDS = ['market_contena'];

const JFP_COUNT_FIELDS = [
  'jfp_contena', 'jfp_fukabako_5kg', 'jfp_b_5kg', 'jfp_cd_10kg',
];

const ALL_COUNT_FIELDS = [
  ...JA_COUNT_FIELDS, ...MARKET_COUNT_FIELDS, ...MARKET_CONTAINER_FIELDS, ...JFP_COUNT_FIELDS,
];

/* ===========================
   出荷箱数マッピング（売上種類 → harvests フィールド）
=========================== */
const JA_BOX_FIELDS = {
  nagabako:  ['ja_nagabako_am'],
  fukabako:  ['ja_fukabako_am'],
  hirabako:  ['ja_hirabako_as', 'ja_hirabako_am'],
  '10k':     ['ja_10khira_am'],
  regular:   ['ja_regular_al', 'ja_regular_am', 'ja_regular_as', 'ja_regular_a2s', 'ja_regular_bl', 'ja_regular_bm', 'ja_regular_bs'],
  kobukuro:  ['ja_kobukuro_al', 'ja_kobukuro_bl', 'ja_kobukuro_bm', 'ja_kobukuro_cm'],
  kikakugai: ['ja_kikakugai_dm', 'ja_kikakugai_ds'],
};

const MARKET_BOX_FIELDS = {
  market_uriage_fukabako_a: ['market_fukabako_a'],
  market_uriage_as:         ['market_regular_as'],
  market_uriage_am:         ['market_regular_am'],
  market_uriage_al:         ['market_regular_al'],
  market_uriage_bs:         ['market_regular_bs'],
  market_uriage_bm:         ['market_regular_bm'],
  market_uriage_bl:         ['market_regular_bl'],
  market_uriage_pori:       ['market_10k_pori'],
};

const JFP_BOX_FIELDS = {
  jfp_uriage_contena:  ['jfp_contena'],
  jfp_uriage_fukabako: ['jfp_fukabako_5kg'],
  jfp_uriage_b:        ['jfp_b_5kg'],
  jfp_uriage_cd:       ['jfp_cd_10kg'],
};

/* ===========================
   売上入力定数
=========================== */
const JA_ITEMS = [
  { key: 'nagabako',  label: '長箱AM' },
  { key: 'fukabako',  label: '深箱AM' },
  { key: 'hirabako',  label: '平箱' },
  { key: '10k',       label: '10k平' },
  { key: 'regular',   label: 'レギュラー' },
  { key: 'kobukuro',  label: '小袋' },
  { key: 'kikakugai', label: '規格外' },
];

const MARKET_URIAGE_ITEMS = [
  { id: 'market_uriage_fukabako_a', label: '深箱A' },
  { id: 'market_uriage_as',         label: 'AS' },
  { id: 'market_uriage_am',         label: 'AM' },
  { id: 'market_uriage_al',         label: 'AL' },
  { id: 'market_uriage_bs',         label: 'BS' },
  { id: 'market_uriage_bm',         label: 'BM' },
  { id: 'market_uriage_bl',         label: 'BL' },
  { id: 'market_uriage_pori',       label: 'ポリ' },
];

const JFP_URIAGE_ITEMS = [
  { id: 'jfp_uriage_contena',  label: 'コンテナ' },
  { id: 'jfp_uriage_fukabako', label: '深箱5kg' },
  { id: 'jfp_uriage_b',        label: 'B5kg' },
  { id: 'jfp_uriage_cd',       label: 'CD10kg' },
];

/* ===========================
   状態
=========================== */
let receivingDate  = getTodayStr();
let currentHouseId = 0;      // 0 = 全体タブ
let globalRecord   = null;   // global_sales の現在のレコード
let allSalesRecs   = [];     // 全ハウスの channel_sales（現在の荷受日）
let allHarvestData = [];     // 全ハウスの harvests（現在の荷受日付け合致分）

/* ===========================
   ユーティリティ
=========================== */
function getTodayStr() {
  return new Date().toLocaleDateString('sv-SE');
}

function sumFields(record, fields) {
  return fields.reduce((s, f) => s + (Number(record[f]) || 0), 0);
}

function formatDateJa(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast${isError ? ' toast--error' : ''}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

/* ===========================
   箱数表示（読み取り専用）
=========================== */
function setBoxCounts(harvestRecs, dateStr) {
  function total(fields, dateField) {
    return harvestRecs
      .filter(r => r[dateField] === dateStr)
      .reduce((s, r) => s + fields.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
  }

  JA_ITEMS.forEach(i => {
    const el = document.getElementById(`boxes_ja_${i.key}`);
    if (el) { const n = total(JA_BOX_FIELDS[i.key], 'ja_date'); el.textContent = n > 0 ? `${n}` : '—'; }
  });
  MARKET_URIAGE_ITEMS.forEach(i => {
    const el = document.getElementById(`boxes_${i.id}`);
    if (el) { const n = total(MARKET_BOX_FIELDS[i.id], 'market_date'); el.textContent = n > 0 ? `${n}` : '—'; }
  });
  const containerEl = document.getElementById('boxes_market_container');
  if (containerEl) {
    const n = total(MARKET_CONTAINER_FIELDS, 'market_container_date');
    containerEl.textContent = n > 0 ? `${n}` : '—';
  }
  JFP_URIAGE_ITEMS.forEach(i => {
    const el = document.getElementById(`boxes_${i.id}`);
    if (el) { const n = total(JFP_BOX_FIELDS[i.id], 'jfp_date'); el.textContent = n > 0 ? `${n}` : '—'; }
  });
}

/* ===========================
   フォーム操作
=========================== */
function setFormValues(record) {
  JA_ITEMS.forEach(i => {
    const amtEl = document.getElementById(`ja_uriage_${i.key}`);
    const wgtEl = document.getElementById(`ja_weight_${i.key}`);
    if (amtEl) amtEl.value = record ? (record[`ja_uriage_${i.key}`] ?? 0) : 0;
    if (wgtEl) wgtEl.value = record ? (record[`ja_weight_${i.key}`] ?? 0) : 0;
  });
  MARKET_URIAGE_ITEMS.forEach(i => {
    const el = document.getElementById(i.id);
    if (el) el.value = record ? (record[i.id] ?? 0) : 0;
  });
  const containerEl = document.getElementById('market_container_uriage');
  if (containerEl) containerEl.value = record ? (record.market_container_uriage ?? 0) : 0;
  JFP_URIAGE_ITEMS.forEach(i => {
    const el = document.getElementById(i.id);
    if (el) el.value = record ? (record[i.id] ?? 0) : 0;
  });
  updateTotals();
}

function getFormValues() {
  if (currentHouseId === 0) {
    const data = { receiving_date: receivingDate };
    JA_ITEMS.forEach(i => {
      data[`ja_uriage_${i.key}`] = parseFloat(document.getElementById(`ja_uriage_${i.key}`)?.value) || 0;
    });
    MARKET_URIAGE_ITEMS.forEach(i => {
      data[i.id] = parseFloat(document.getElementById(i.id)?.value) || 0;
    });
    data.market_container_uriage = parseFloat(document.getElementById('market_container_uriage')?.value) || 0;
    JFP_URIAGE_ITEMS.forEach(i => {
      data[i.id] = parseFloat(document.getElementById(i.id)?.value) || 0;
    });
    return data;
  }

  const data = { receiving_date: receivingDate, house_id: currentHouseId };
  let jaTotal = 0;
  JA_ITEMS.forEach(i => {
    const amt = parseFloat(document.getElementById(`ja_uriage_${i.key}`)?.value) || 0;
    const wgt = parseFloat(document.getElementById(`ja_weight_${i.key}`)?.value) || 0;
    data[`ja_uriage_${i.key}`] = amt;
    data[`ja_weight_${i.key}`] = wgt;
    jaTotal += amt;
  });
  data.ja_uriage = jaTotal;

  let marketTotal = 0;
  MARKET_URIAGE_ITEMS.forEach(i => {
    const amt = parseFloat(document.getElementById(i.id)?.value) || 0;
    data[i.id] = amt;
    marketTotal += amt;
  });
  data.market_uriage = marketTotal;

  data.market_container_uriage = parseFloat(document.getElementById('market_container_uriage')?.value) || 0;

  let jfpTotal = 0;
  JFP_URIAGE_ITEMS.forEach(i => {
    const amt = parseFloat(document.getElementById(i.id)?.value) || 0;
    data[i.id] = amt;
    jfpTotal += amt;
  });
  data.jfp_uriage = jfpTotal;

  return data;
}

function updateTotals() {
  const jaTotal        = JA_ITEMS.reduce((s, i) => s + (parseFloat(document.getElementById(`ja_uriage_${i.key}`)?.value) || 0), 0);
  const marketTotal    = MARKET_URIAGE_ITEMS.reduce((s, i) => s + (parseFloat(document.getElementById(i.id)?.value) || 0), 0);
  const containerTotal = parseFloat(document.getElementById('market_container_uriage')?.value) || 0;
  const jfpTotal       = JFP_URIAGE_ITEMS.reduce((s, i) => s + (parseFloat(document.getElementById(i.id)?.value) || 0), 0);
  const grand          = jaTotal + marketTotal + containerTotal + jfpTotal;

  document.getElementById('subtotal-ja').textContent               = `¥${jaTotal.toLocaleString()}`;
  document.getElementById('subtotal-market').textContent           = `¥${marketTotal.toLocaleString()}`;
  document.getElementById('subtotal-market-container').textContent = `¥${containerTotal.toLocaleString()}`;
  document.getElementById('subtotal-jfp').textContent              = `¥${jfpTotal.toLocaleString()}`;
  document.getElementById('total-ja').textContent               = `¥${jaTotal.toLocaleString()}`;
  document.getElementById('total-market').textContent           = `¥${marketTotal.toLocaleString()}`;
  document.getElementById('total-market-container').textContent = `¥${containerTotal.toLocaleString()}`;
  document.getElementById('total-jfp').textContent              = `¥${jfpTotal.toLocaleString()}`;
  document.getElementById('total-grand').textContent            = `¥${grand.toLocaleString()}`;
}

/* ===========================
   出荷実績サマリー表示（読み取り専用）
=========================== */
function renderShipmentSummary(ja, market, container, jfp) {
  const section = document.getElementById('shipment-summary');
  const cardsEl = document.getElementById('shipment-summary-cards');
  const total   = ja + market + container + jfp;

  if (total === 0) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  const channels = [
    { label: 'JA',          boxes: ja,        color: 'var(--green-mid)' },
    { label: '市場',         boxes: market,    color: 'var(--market-color)' },
    { label: '市場コンテナ', boxes: container, color: 'var(--market-container-color)' },
    { label: 'JFP',         boxes: jfp,       color: 'var(--jfp-color)' },
  ].filter(c => c.boxes > 0);
  channels.push({ label: '合計', boxes: total, color: 'var(--green-dark)', bold: true });

  cardsEl.innerHTML = channels.map(c => `
    <div class="total-card"${c.bold ? ' style="border-top:3px solid var(--green-dark)"' : ''}>
      <div class="total-card__house">${c.label}</div>
      <div class="total-card__count" style="color:${c.color}">${c.boxes.toLocaleString()}<span class="total-card__unit"> 箱</span></div>
    </div>`).join('');
}

/* ===========================
   売上按分計算
=========================== */
function calcAllocation(gRec, salesRecs, harvestRecs, houseId, dateStr) {
  const result = {};

  function ratio(houseVal, totalVal) {
    return totalVal > 0 ? houseVal / totalVal : 0;
  }

  // JA: 実際のJA重量入力値（channel_sales の ja_weight_* カラム）で按分
  JA_ITEMS.forEach(i => {
    const globalAmt = Number(gRec[`ja_uriage_${i.key}`]) || 0;
    const weightKey = `ja_weight_${i.key}`;
    const totalWeight = salesRecs.reduce((s, r) => s + (Number(r[weightKey]) || 0), 0);
    const houseWeight = (salesRecs.find(r => r.house_id === houseId) || {})[weightKey] || 0;
    result[`ja_uriage_${i.key}`] = Math.round(globalAmt * ratio(houseWeight, totalWeight));
    result[weightKey] = houseWeight;
  });

  // 市場: 箱数比率で按分（箱数×5kg だが定数は相殺されるので箱数比で等価）
  MARKET_URIAGE_ITEMS.forEach(i => {
    const globalAmt = Number(gRec[i.id]) || 0;
    const fields = MARKET_BOX_FIELDS[i.id];
    const totalBoxes = harvestRecs
      .filter(r => r.market_date === dateStr)
      .reduce((s, r) => s + fields.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
    const houseBoxes = harvestRecs
      .filter(r => r.house_id === houseId && r.market_date === dateStr)
      .reduce((s, r) => s + fields.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
    result[i.id] = Math.round(globalAmt * ratio(houseBoxes, totalBoxes));
  });

  // 市場コンテナ: コンテナ数×10kg → 箱数比で等価
  const globalContainer = Number(gRec.market_container_uriage) || 0;
  const totalContena = harvestRecs
    .filter(r => r.market_container_date === dateStr)
    .reduce((s, r) => s + (Number(r.market_contena) || 0), 0);
  const houseContena = harvestRecs
    .filter(r => r.house_id === houseId && r.market_container_date === dateStr)
    .reduce((s, r) => s + (Number(r.market_contena) || 0), 0);
  result.market_container_uriage = Math.round(globalContainer * ratio(houseContena, totalContena));

  // JFP: 箱数比率で按分（深箱・B = ×5kg、コンテナ・CD = ×10kg も同種内なら比率は変わらない）
  JFP_URIAGE_ITEMS.forEach(i => {
    const globalAmt = Number(gRec[i.id]) || 0;
    const fields = JFP_BOX_FIELDS[i.id];
    const totalBoxes = harvestRecs
      .filter(r => r.jfp_date === dateStr)
      .reduce((s, r) => s + fields.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
    const houseBoxes = harvestRecs
      .filter(r => r.house_id === houseId && r.jfp_date === dateStr)
      .reduce((s, r) => s + fields.reduce((ss, f) => ss + (Number(r[f]) || 0), 0), 0);
    result[i.id] = Math.round(globalAmt * ratio(houseBoxes, totalBoxes));
  });

  return result;
}

function updateAllocationBar() {
  const bar = document.getElementById('allocation-bar');
  if (!bar) return;
  bar.classList.toggle('hidden', currentHouseId === 0 || !globalRecord);
}

function applyAllocation() {
  if (!globalRecord) { showToast('全体売上データがありません', true); return; }
  const allocated = calcAllocation(globalRecord, allSalesRecs, allHarvestData, currentHouseId, receivingDate);
  setFormValues(allocated);
  showToast('按分を適用しました');
}

/* ===========================
   Supabase アクセス
=========================== */
async function loadByReceivingDate(dateStr) {
  document.getElementById('shipment-summary').classList.add('hidden');
  setFormValues(null);
  setBoxCounts([], dateStr);
  if (!db) return;

  const harvestCols = [
    'house_id', 'ja_date', 'market_date', 'market_container_date', 'jfp_date',
    ...ALL_COUNT_FIELDS,
  ].join(', ');

  const [harvestsRes, globalRes, salesRes] = await Promise.all([
    db.from('harvests')
      .select(harvestCols)
      .or(`ja_date.eq.${dateStr},market_date.eq.${dateStr},market_container_date.eq.${dateStr},jfp_date.eq.${dateStr}`),
    db.from('global_sales').select('*').eq('receiving_date', dateStr).single(),
    db.from('channel_sales').select('*').eq('receiving_date', dateStr),
  ]);

  allHarvestData = harvestsRes.data || [];
  globalRecord   = (globalRes.error && globalRes.error.code !== 'PGRST116') ? null : (globalRes.data || null);
  allSalesRecs   = salesRes.data || [];

  if (harvestsRes.error) console.error('harvests:', harvestsRes.error);
  if (salesRes.error)    console.error('channel_sales:', salesRes.error);

  if (currentHouseId === 0) {
    // 全体タブ: 全ハウス合計の出荷箱数を表示
    let jaBoxes = 0, marketBoxes = 0, containerBoxes = 0, jfpBoxes = 0;
    allHarvestData.forEach(rec => {
      if (rec.ja_date               === dateStr) jaBoxes        += sumFields(rec, JA_COUNT_FIELDS);
      if (rec.market_date           === dateStr) marketBoxes    += sumFields(rec, MARKET_COUNT_FIELDS);
      if (rec.market_container_date === dateStr) containerBoxes += sumFields(rec, MARKET_CONTAINER_FIELDS);
      if (rec.jfp_date              === dateStr) jfpBoxes       += sumFields(rec, JFP_COUNT_FIELDS);
    });
    renderShipmentSummary(jaBoxes, marketBoxes, containerBoxes, jfpBoxes);
    setBoxCounts(allHarvestData, dateStr);
    setFormValues(globalRecord);
  } else {
    // ハウスタブ: そのハウスの出荷箱数を表示
    const houseHarvestData = allHarvestData.filter(r => r.house_id === currentHouseId);
    let jaBoxes = 0, marketBoxes = 0, containerBoxes = 0, jfpBoxes = 0;
    houseHarvestData.forEach(rec => {
      if (rec.ja_date               === dateStr) jaBoxes        += sumFields(rec, JA_COUNT_FIELDS);
      if (rec.market_date           === dateStr) marketBoxes    += sumFields(rec, MARKET_COUNT_FIELDS);
      if (rec.market_container_date === dateStr) containerBoxes += sumFields(rec, MARKET_CONTAINER_FIELDS);
      if (rec.jfp_date              === dateStr) jfpBoxes       += sumFields(rec, JFP_COUNT_FIELDS);
    });
    renderShipmentSummary(jaBoxes, marketBoxes, containerBoxes, jfpBoxes);
    setBoxCounts(houseHarvestData, dateStr);

    const thisSalesRec = allSalesRecs.find(r => r.house_id === currentHouseId);
    if (thisSalesRec) {
      setFormValues(thisSalesRec);
    } else if (globalRecord) {
      // 未保存の場合は全体売上から按分を自動入力
      const allocated = calcAllocation(globalRecord, allSalesRecs, allHarvestData, currentHouseId, dateStr);
      setFormValues(allocated);
    } else {
      setFormValues(null);
    }
  }

  updateAllocationBar();
}

async function saveRecord() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    if (!db) throw new Error('Supabase未接続');
    const payload = getFormValues();

    if (currentHouseId === 0) {
      const { error } = await db
        .from('global_sales')
        .upsert(payload, { onConflict: 'receiving_date' });
      if (error) throw error;
      globalRecord = payload;
    } else {
      const { error } = await db
        .from('channel_sales')
        .upsert(payload, { onConflict: 'receiving_date,house_id' });
      if (error) throw error;
      const idx = allSalesRecs.findIndex(r => r.house_id === currentHouseId);
      if (idx >= 0) allSalesRecs[idx] = payload; else allSalesRecs.push(payload);
    }

    showToast('保存しました');
    updateAllocationBar();
    await loadHistory();
  } catch (err) {
    showToast('保存に失敗しました', true);
    console.error('saveRecord:', err);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存';
  }
}

async function loadHistory() {
  const container = document.getElementById('history-cards');
  if (!db) { container.innerHTML = '<div class="loading">データがありません</div>'; return; }

  try {
    let data, error;

    if (currentHouseId === 0) {
      const res = await db
        .from('global_sales')
        .select('receiving_date, ' + [
          ...JA_ITEMS.map(i => `ja_uriage_${i.key}`),
          ...MARKET_URIAGE_ITEMS.map(i => i.id),
          'market_container_uriage',
          ...JFP_URIAGE_ITEMS.map(i => i.id),
        ].join(', '))
        .order('receiving_date', { ascending: false })
        .limit(10);
      data = res.data; error = res.error;
    } else {
      const res = await db
        .from('channel_sales')
        .select('receiving_date, ja_uriage, market_uriage, market_container_uriage, jfp_uriage')
        .eq('house_id', currentHouseId)
        .order('receiving_date', { ascending: false })
        .limit(10);
      data = res.data; error = res.error;
    }

    if (error || !data || data.length === 0) {
      container.innerHTML = '<div class="loading">データがありません</div>';
      return;
    }

    container.innerHTML = data.map(rec => {
      let total, parts;
      if (currentHouseId === 0) {
        total =
          JA_ITEMS.reduce((s, i) => s + (Number(rec[`ja_uriage_${i.key}`]) || 0), 0) +
          MARKET_URIAGE_ITEMS.reduce((s, i) => s + (Number(rec[i.id]) || 0), 0) +
          (Number(rec.market_container_uriage) || 0) +
          JFP_URIAGE_ITEMS.reduce((s, i) => s + (Number(rec[i.id]) || 0), 0);
        parts = [`全体合計:¥${total.toLocaleString()}`];
      } else {
        total = (Number(rec.ja_uriage) || 0) + (Number(rec.market_uriage) || 0) +
                (Number(rec.market_container_uriage) || 0) + (Number(rec.jfp_uriage) || 0);
        parts = [
          rec.ja_uriage               > 0 ? `JA:¥${Number(rec.ja_uriage).toLocaleString()}`                             : '',
          rec.market_uriage           > 0 ? `市場:¥${Number(rec.market_uriage).toLocaleString()}`                        : '',
          rec.market_container_uriage > 0 ? `市場コンテナ:¥${Number(rec.market_container_uriage).toLocaleString()}` : '',
          rec.jfp_uriage              > 0 ? `JFP:¥${Number(rec.jfp_uriage).toLocaleString()}`                           : '',
        ].filter(Boolean);
      }

      return `
        <div class="history-card" data-date="${rec.receiving_date}">
          <div class="history-card__date">${formatDateJa(rec.receiving_date)}</div>
          <div class="history-card__detail">${parts.join(' / ') || '—'}</div>
          <div class="history-card__total" style="color:var(--uriage-color)">¥${total.toLocaleString()}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        receivingDate = card.dataset.date;
        document.getElementById('receiving-date').value = receivingDate;
        loadByReceivingDate(receivingDate);
      });
    });
  } catch (err) {
    console.error('loadHistory:', err);
    container.innerHTML = '<div class="loading">データがありません</div>';
  }
}

/* ===========================
   初期化
=========================== */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentHouseId = parseInt(btn.dataset.houseId, 10);
      document.getElementById('sales-form').classList.toggle('form--global', currentHouseId === 0);
      loadByReceivingDate(receivingDate);
      loadHistory();
    });
  });
}

function initDateInput() {
  const input = document.getElementById('receiving-date');
  input.value = receivingDate;
  input.addEventListener('change', () => {
    receivingDate = input.value;
    loadByReceivingDate(receivingDate);
  });
}

function initForm() {
  document.getElementById('sales-form').addEventListener('submit', async e => {
    e.preventDefault();
    await saveRecord();
  });

  const amountFields = [
    ...JA_ITEMS.map(i => `ja_uriage_${i.key}`),
    ...MARKET_URIAGE_ITEMS.map(i => i.id),
    'market_container_uriage',
    ...JFP_URIAGE_ITEMS.map(i => i.id),
  ];
  amountFields.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.addEventListener('input', updateTotals);
  });
}

function initAllocationBtn() {
  const btn = document.getElementById('reapply-btn');
  if (btn) btn.addEventListener('click', applyAllocation);
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sales-form').classList.add('form--global');
  initTabs();
  initDateInput();
  initForm();
  initAllocationBtn();
  await Promise.all([loadByReceivingDate(receivingDate), loadHistory()]);
});
