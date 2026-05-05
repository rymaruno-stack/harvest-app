'use strict';

const HOUSES = [
  { id: 1, name: '初号機' },
  { id: 2, name: '弐号機' },
  { id: 3, name: '参号機' },
];

const JA_URIAGE_FIELDS = [
  'ja_uriage_nagabako', 'ja_uriage_fukabako', 'ja_uriage_hirabako', 'ja_uriage_10k',
  'ja_uriage_regular', 'ja_uriage_kobukuro', 'ja_uriage_kikakugai',
];

const MARKET_URIAGE_FIELDS = [
  'market_uriage_fukabako_a', 'market_uriage_as', 'market_uriage_am', 'market_uriage_al',
  'market_uriage_bs', 'market_uriage_bm', 'market_uriage_bl', 'market_uriage_pori',
];

const JFP_URIAGE_FIELDS = [
  'jfp_uriage_contena', 'jfp_uriage_fukabako', 'jfp_uriage_b', 'jfp_uriage_cd',
];

const ALL_URIAGE_FIELDS = [...JA_URIAGE_FIELDS, ...MARKET_URIAGE_FIELDS, ...JFP_URIAGE_FIELDS];

let currentHouseId = 1;
let currentDate    = getTodayStr();
let currentRecord  = null; // 既存レコードを保持（カウントフィールドを保護するため）

function getTodayStr() {
  return new Date().toLocaleDateString('sv-SE');
}

function sumFields(record, fields) {
  return fields.reduce((sum, f) => sum + (Number(record[f]) || 0), 0);
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

function setFormValues(record) {
  ALL_URIAGE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = record ? (record[f] ?? 0) : 0;
  });
  updateTotals();
}

function getUraigeValues() {
  const data = {};
  ALL_URIAGE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    data[f] = el ? (parseFloat(el.value) || 0) : 0;
  });
  return data;
}

function updateTotals() {
  const vals        = getUraigeValues();
  const jaTotal     = JA_URIAGE_FIELDS.reduce((s, f) => s + (vals[f] || 0), 0);
  const marketTotal = MARKET_URIAGE_FIELDS.reduce((s, f) => s + (vals[f] || 0), 0);
  const jfpTotal    = JFP_URIAGE_FIELDS.reduce((s, f) => s + (vals[f] || 0), 0);
  const grandTotal  = jaTotal + marketTotal + jfpTotal;

  document.getElementById('total-ja').textContent     = `¥${jaTotal.toLocaleString()}`;
  document.getElementById('total-market').textContent = `¥${marketTotal.toLocaleString()}`;
  document.getElementById('total-jfp').textContent    = `¥${jfpTotal.toLocaleString()}`;
  document.getElementById('total-grand').textContent  = `¥${grandTotal.toLocaleString()}`;
}

/* ===========================
   Supabase アクセス
=========================== */
async function loadRecord() {
  currentRecord = null;
  if (!db) { setFormValues(null); return; }
  try {
    const { data, error } = await db
      .from('harvests')
      .select('*')
      .eq('house_id', currentHouseId)
      .eq('date', currentDate)
      .single();
    // PGRST116 = 該当行なし（正常）
    if (error && error.code !== 'PGRST116') {
      console.error('loadRecord error:', error);
    }
    currentRecord = data || null;
    setFormValues(currentRecord);
  } catch (err) {
    console.error('loadRecord:', err);
    setFormValues(null);
  }
}

async function saveRecord() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    if (!db) throw new Error('Supabase未接続');

    // 既存レコードのカウントフィールドを保持しつつ売上フィールドのみ上書き
    const payload = {
      ...(currentRecord || {}),
      house_id: currentHouseId,
      date: currentDate,
      ...getUraigeValues(),
    };
    delete payload.id;
    delete payload.created_at;

    const { error } = await db
      .from('harvests')
      .upsert(payload, { onConflict: 'house_id,date' });

    if (error) throw error;

    // 保存後に最新レコードをリロード（合計表示を確定値に更新）
    await loadRecord();
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
    const from = new Date();
    from.setDate(from.getDate() - 6);
    const fromStr = from.toLocaleDateString('sv-SE');

    const selectCols = ['date', ...ALL_URIAGE_FIELDS].join(', ');
    const { data, error } = await db
      .from('harvests')
      .select(selectCols)
      .eq('house_id', currentHouseId)
      .gte('date', fromStr)
      .order('date', { ascending: false });

    if (error || !data || data.length === 0) {
      container.innerHTML = '<div class="loading">データがありません</div>';
      return;
    }

    container.innerHTML = data.map(rec => {
      const jaTotal     = sumFields(rec, JA_URIAGE_FIELDS);
      const marketTotal = sumFields(rec, MARKET_URIAGE_FIELDS);
      const jfpTotal    = sumFields(rec, JFP_URIAGE_FIELDS);
      const total       = jaTotal + marketTotal + jfpTotal;

      const details = [];
      if (jaTotal > 0)     details.push(`JA:¥${jaTotal.toLocaleString()}`);
      if (marketTotal > 0) details.push(`市場:¥${marketTotal.toLocaleString()}`);
      if (jfpTotal > 0)    details.push(`JFP:¥${jfpTotal.toLocaleString()}`);

      return `
        <div class="history-card" data-date="${rec.date}">
          <div class="history-card__date">${formatDateJa(rec.date)}</div>
          <div class="history-card__detail">${details.join(' / ') || '—'}</div>
          <div class="history-card__total" style="color:var(--uriage-color)">¥${total.toLocaleString()}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        currentDate = card.dataset.date;
        document.getElementById('date-input').value = currentDate;
        loadRecord();
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
      loadRecord();
      loadHistory();
    });
  });
}

function initDateInput() {
  const input = document.getElementById('date-input');
  input.value = currentDate;
  input.addEventListener('change', () => {
    currentDate = input.value;
    loadRecord();
    loadHistory();
  });
}

function initForm() {
  document.getElementById('sales-form').addEventListener('submit', async e => {
    e.preventDefault();
    await saveRecord();
  });

  ALL_URIAGE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.addEventListener('input', updateTotals);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initDateInput();
  initForm();
  await loadRecord();
  await loadHistory();
});
