'use strict';

/* ===========================
   定数
=========================== */
const HOUSES = [
  { id: 1, name: '初号機' },
  { id: 2, name: '弐号機' },
  { id: 3, name: '参号機' },
];

const COUNT_FIELDS = [
  'ja_nagabako_am', 'ja_fukabako_am', 'ja_hirabako_as', 'ja_hirabako_am', 'ja_10khira_am',
  'ja_regular_al', 'ja_regular_am', 'ja_regular_as', 'ja_regular_a2s',
  'ja_regular_bl', 'ja_regular_bm', 'ja_regular_bs',
  'ja_kobukuro_al', 'ja_kobukuro_bl', 'ja_kobukuro_bm', 'ja_kobukuro_cm',
  'ja_kikakugai_dm', 'ja_kikakugai_ds',
  'market_fukabako_a', 'market_regular_as', 'market_regular_am', 'market_regular_al',
  'market_regular_bs', 'market_regular_bm', 'market_regular_bl', 'market_10k_pori',
  'jfp_contena', 'jfp_fukabako_5kg', 'jfp_b_5kg', 'jfp_cd_10kg',
];


/* ===========================
   状態
=========================== */
let currentHouseId = 1;
let currentDate    = getTodayStr();

/* ===========================
   ユーティリティ
=========================== */
function getTodayStr() {
  // sv-SE ロケールは YYYY-MM-DD を返す
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

/* ===========================
   フォーム操作
=========================== */
function setFormValues(record) {
  COUNT_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = record ? (record[f] ?? 0) : 0;
  });
  const noteEl = document.getElementById('note');
  if (noteEl) noteEl.value = record ? (record.note ?? '') : '';
}

function getFormValues() {
  const data = { house_id: currentHouseId, date: currentDate };
  COUNT_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    data[f] = el ? (parseInt(el.value, 10) || 0) : 0;
  });
  const noteEl = document.getElementById('note');
  data.note = noteEl ? noteEl.value.trim() : '';
  return data;
}

/* ===========================
   Supabase アクセス
=========================== */
async function loadRecord() {
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
    setFormValues(data || null);
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
    if (!db) throw new Error('Supabase未接続 — Vercel環境変数を確認してください');

    const payload = getFormValues();
    const { error } = await db
      .from('harvests')
      .upsert(payload, { onConflict: 'house_id,date' });

    if (error) throw error;

    showToast('保存しました');
    await Promise.all([loadTodayTotals(), loadHistory()]);
  } catch (err) {
    showToast('保存に失敗しました', true);
    console.error('saveRecord:', err);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存';
  }
}

async function loadTodayTotals() {
  const totalSection = document.getElementById('today-total');
  const container    = document.getElementById('today-total-cards');

  if (!db) return;
  try {
    const selectCols = ['house_id', ...COUNT_FIELDS].join(', ');
    const { data, error } = await db
      .from('harvests')
      .select(selectCols)
      .eq('date', currentDate);

    if (error) { console.error('loadTodayTotals error:', error); return; }
    if (!data || data.length === 0) { totalSection.classList.add('hidden'); return; }

    totalSection.classList.remove('hidden');

    let allBoxes = 0;

    const houseCards = HOUSES.map(house => {
      const rec   = data.find(r => r.house_id === house.id);
      const boxes = rec ? sumFields(rec, COUNT_FIELDS) : 0;
      allBoxes += boxes;
      return `
        <div class="total-card">
          <div class="total-card__house">${house.name}</div>
          <div class="total-card__count">${boxes.toLocaleString()}<span class="total-card__unit"> 箱</span></div>
        </div>`;
    });

    houseCards.push(`
      <div class="total-card" style="border-top: 3px solid var(--green-dark);">
        <div class="total-card__house">全体合計</div>
        <div class="total-card__count">${allBoxes.toLocaleString()}<span class="total-card__unit"> 箱</span></div>
      </div>`);

    container.innerHTML = houseCards.join('');
  } catch (err) {
    console.error('loadTodayTotals:', err);
  }
}

async function loadHistory() {
  const container = document.getElementById('history-cards');
  if (!db) { container.innerHTML = '<div class="loading">出荷データがありません</div>'; return; }

  try {
    const from = new Date();
    from.setDate(from.getDate() - 6);
    const fromStr = from.toLocaleDateString('sv-SE');

    const selectCols = ['date', ...COUNT_FIELDS].join(', ');
    const { data, error } = await db
      .from('harvests')
      .select(selectCols)
      .eq('house_id', currentHouseId)
      .gte('date', fromStr)
      .order('date', { ascending: false });

    if (error || !data || data.length === 0) {
      container.innerHTML = '<div class="loading">出荷データがありません</div>';
      return;
    }

    container.innerHTML = data.map(rec => {
      const boxes = sumFields(rec, COUNT_FIELDS);

      const details = [];
      if ((rec.ja_fukabako_am || 0) > 0) details.push(`深箱AM:${rec.ja_fukabako_am}`);
      const jaReg = (rec.ja_regular_al||0) + (rec.ja_regular_am||0) + (rec.ja_regular_as||0);
      if (jaReg > 0) details.push(`JAレギュラー:${jaReg}`);
      const mktReg = (rec.market_regular_as||0) + (rec.market_regular_am||0) + (rec.market_regular_al||0);
      if (mktReg > 0) details.push(`市場レギュラー:${mktReg}`);
      if ((rec.jfp_contena || 0) > 0) details.push(`JFPコンテナ:${rec.jfp_contena}`);

      return `
        <div class="history-card" data-date="${rec.date}">
          <div class="history-card__date">${formatDateJa(rec.date)}</div>
          <div class="history-card__detail">${details.join(' / ') || '—'}</div>
          <div class="history-card__total">${boxes}箱</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        currentDate = card.dataset.date;
        document.getElementById('date-input').value = currentDate;
        loadRecord();
        loadTodayTotals();
      });
    });
  } catch (err) {
    console.error('loadHistory:', err);
    container.innerHTML = '<div class="loading">出荷データがありません</div>';
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

function initDetailToggles() {
  document.querySelectorAll('.detail-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target  = document.getElementById(btn.dataset.target);
      const isHidden = target.classList.toggle('hidden');
      btn.textContent = isHidden ? '詳細入力 ▼' : '詳細入力 ▲';
    });
  });
}

function initDateInput() {
  const input = document.getElementById('date-input');
  input.value = currentDate;
  input.addEventListener('change', () => {
    currentDate = input.value;
    loadRecord();
    loadTodayTotals();
    loadHistory();
  });
}

function initForm() {
  document.getElementById('harvest-form').addEventListener('submit', async e => {
    e.preventDefault();
    await saveRecord();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initDetailToggles();
  initDateInput();
  initForm();
  await loadRecord();
  await Promise.all([loadTodayTotals(), loadHistory()]);
});
