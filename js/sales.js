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

const URIAGE_FIELDS = ['ja_uriage', 'market_uriage', 'market_container_uriage', 'jfp_uriage'];

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
  URIAGE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = record ? (record[f] ?? 0) : 0;
  });
  updateTotals();
}

function getFormValues() {
  const data = { receiving_date: receivingDate };
  URIAGE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    data[f] = el ? (parseFloat(el.value) || 0) : 0;
  });
  return data;
}

function updateTotals() {
  const ja        = parseFloat(document.getElementById('ja_uriage')?.value)                || 0;
  const market    = parseFloat(document.getElementById('market_uriage')?.value)            || 0;
  const container = parseFloat(document.getElementById('market_container_uriage')?.value)  || 0;
  const jfp       = parseFloat(document.getElementById('jfp_uriage')?.value)               || 0;
  const grand     = ja + market + container + jfp;

  document.getElementById('total-ja').textContent               = `¥${ja.toLocaleString()}`;
  document.getElementById('total-market').textContent           = `¥${market.toLocaleString()}`;
  document.getElementById('total-market-container').textContent = `¥${container.toLocaleString()}`;
  document.getElementById('total-jfp').textContent              = `¥${jfp.toLocaleString()}`;
  document.getElementById('total-grand').textContent            = `¥${grand.toLocaleString()}`;
}

/* ===========================
   出荷実績サマリー表示
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

  // チャンネルごとに箱数を集計（各レコードの荷受日カラムで振り分け）
  let jaBoxes = 0, marketBoxes = 0, containerBoxes = 0, jfpBoxes = 0;
  (harvestsRes.data || []).forEach(rec => {
    if (rec.ja_date               === dateStr) jaBoxes        += sumFields(rec, JA_COUNT_FIELDS);
    if (rec.market_date           === dateStr) marketBoxes    += sumFields(rec, MARKET_COUNT_FIELDS);
    if (rec.market_container_date === dateStr) containerBoxes += sumFields(rec, MARKET_CONTAINER_FIELDS);
    if (rec.jfp_date              === dateStr) jfpBoxes       += sumFields(rec, JFP_COUNT_FIELDS);
  });
  renderShipmentSummary(jaBoxes, marketBoxes, containerBoxes, jfpBoxes);

  // 売上レコード取得（PGRST116 = 該当行なし、正常）
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
      .select('*')
      .order('receiving_date', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      container.innerHTML = '<div class="loading">データがありません</div>';
      return;
    }

    container.innerHTML = data.map(rec => {
      const total = URIAGE_FIELDS.reduce((s, f) => s + (Number(rec[f]) || 0), 0);
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
  URIAGE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.addEventListener('input', updateTotals);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initDateInput();
  initForm();
  await Promise.all([loadByReceivingDate(receivingDate), loadHistory()]);
});
