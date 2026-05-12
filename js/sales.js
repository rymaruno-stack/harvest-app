'use strict';

/* ===========================
   定数（出荷箱数集計用）
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

let receivingDate = getTodayStr();

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
  const data = { receiving_date: receivingDate };

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
    { label: '市場',         boxes: market,     color: 'var(--market-color)' },
    { label: '市場コンテナ', boxes: container,  color: 'var(--market-container-color)' },
    { label: 'JFP',         boxes: jfp,        color: 'var(--jfp-color)' },
  ].filter(c => c.boxes > 0);

  channels.push({ label: '合計', boxes: total, color: 'var(--green-dark)', bold: true });

  cardsEl.innerHTML = channels.map(c => `
    <div class="total-card"${c.bold ? ' style="border-top:3px solid var(--green-dark)"' : ''}>
      <div class="total-card__house">${c.label}</div>
      <div class="total-card__count" style="color:${c.color}">${c.boxes.toLocaleString()}<span class="total-card__unit"> 箱</span></div>
    </div>`).join('');
}

/* ===========================
   Supabase アクセス
=========================== */
async function loadByReceivingDate(dateStr) {
  document.getElementById('shipment-summary').classList.add('hidden');
  setFormValues(null);
  if (!db) return;

  const selectCols = [
    'ja_date', 'market_date', 'market_container_date', 'jfp_date',
    ...ALL_COUNT_FIELDS,
  ].join(', ');

  const [harvestsRes, salesRes] = await Promise.all([
    db.from('harvests')
      .select(selectCols)
      .or(`ja_date.eq.${dateStr},market_date.eq.${dateStr},market_container_date.eq.${dateStr},jfp_date.eq.${dateStr}`),
    db.from('channel_sales')
      .select('*')
      .eq('receiving_date', dateStr)
      .single(),
  ]);

  if (harvestsRes.error) console.error('loadByReceivingDate harvests:', harvestsRes.error);

  let jaBoxes = 0, marketBoxes = 0, containerBoxes = 0, jfpBoxes = 0;
  (harvestsRes.data || []).forEach(rec => {
    if (rec.ja_date               === dateStr) jaBoxes        += sumFields(rec, JA_COUNT_FIELDS);
    if (rec.market_date           === dateStr) marketBoxes    += sumFields(rec, MARKET_COUNT_FIELDS);
    if (rec.market_container_date === dateStr) containerBoxes += sumFields(rec, MARKET_CONTAINER_FIELDS);
    if (rec.jfp_date              === dateStr) jfpBoxes       += sumFields(rec, JFP_COUNT_FIELDS);
  });
  renderShipmentSummary(jaBoxes, marketBoxes, containerBoxes, jfpBoxes);

  if (salesRes.error && salesRes.error.code !== 'PGRST116') {
    console.error('loadByReceivingDate channel_sales:', salesRes.error);
  }
  setFormValues(salesRes.data || null);
}

async function saveRecord() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    if (!db) throw new Error('Supabase未接続');
    const { error } = await db
      .from('channel_sales')
      .upsert(getFormValues(), { onConflict: 'receiving_date' });
    if (error) throw error;
    showToast('保存しました');
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
    const { data, error } = await db
      .from('channel_sales')
      .select('receiving_date, ja_uriage, market_uriage, market_container_uriage, jfp_uriage')
      .order('receiving_date', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      container.innerHTML = '<div class="loading">データがありません</div>';
      return;
    }

    container.innerHTML = data.map(rec => {
      const total = (Number(rec.ja_uriage) || 0) + (Number(rec.market_uriage) || 0) +
                    (Number(rec.market_container_uriage) || 0) + (Number(rec.jfp_uriage) || 0);
      const parts = [
        rec.ja_uriage               > 0 ? `JA:¥${Number(rec.ja_uriage).toLocaleString()}`                             : '',
        rec.market_uriage           > 0 ? `市場:¥${Number(rec.market_uriage).toLocaleString()}`                        : '',
        rec.market_container_uriage > 0 ? `市場コンテナ:¥${Number(rec.market_container_uriage).toLocaleString()}` : '',
        rec.jfp_uriage              > 0 ? `JFP:¥${Number(rec.jfp_uriage).toLocaleString()}`                           : '',
      ].filter(Boolean);

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

document.addEventListener('DOMContentLoaded', async () => {
  initDateInput();
  initForm();
  await Promise.all([loadByReceivingDate(receivingDate), loadHistory()]);
});
