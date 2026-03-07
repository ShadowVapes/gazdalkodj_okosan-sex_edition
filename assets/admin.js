import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = !DEMO_MODE && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const els = {
  cfgStartingMoney: document.getElementById('cfgStartingMoney'),
  cfgStartBonus: document.getElementById('cfgStartBonus'),
  cfgWinMoney: document.getElementById('cfgWinMoney'),
  cfgRequiredItems: document.getElementById('cfgRequiredItems'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  tileList: document.getElementById('tileList'),
  newTileBtn: document.getElementById('newTileBtn'),
  tileId: document.getElementById('tileId'),
  tileSort: document.getElementById('tileSort'),
  tileName: document.getElementById('tileName'),
  tileKind: document.getElementById('tileKind'),
  tileAmount: document.getElementById('tileAmount'),
  tilePrice: document.getElementById('tilePrice'),
  tileCardGroup: document.getElementById('tileCardGroup'),
  tileEffect: document.getElementById('tileEffect'),
  saveTileBtn: document.getElementById('saveTileBtn'),
  deleteTileBtn: document.getElementById('deleteTileBtn'),
  cardList: document.getElementById('cardList'),
  newCardBtn: document.getElementById('newCardBtn'),
  cardId: document.getElementById('cardId'),
  cardGroup: document.getElementById('cardGroup'),
  cardTitle: document.getElementById('cardTitle'),
  cardAmount: document.getElementById('cardAmount'),
  cardSkipTurns: document.getElementById('cardSkipTurns'),
  cardMoveSteps: document.getElementById('cardMoveSteps'),
  cardBody: document.getElementById('cardBody'),
  cardEffect: document.getElementById('cardEffect'),
  saveCardBtn: document.getElementById('saveCardBtn'),
  deleteCardBtn: document.getElementById('deleteCardBtn'),
  adminStatus: document.getElementById('adminStatus'),
};

const state = {
  tiles: [],
  cards: [],
  config: {},
};

init().catch((error) => {
  console.error(error);
  setStatus(`Hiba: ${error.message || error}`);
});

async function init() {
  bindEvents();
  if (!supabase) {
    setStatus('Állítsd be az assets/config.js fájlt.');
    disableAll(true);
    return;
  }
  await loadAll();
}

function bindEvents() {
  els.saveConfigBtn.addEventListener('click', saveConfig);
  els.newTileBtn.addEventListener('click', clearTileForm);
  els.saveTileBtn.addEventListener('click', saveTile);
  els.deleteTileBtn.addEventListener('click', deleteTile);
  els.newCardBtn.addEventListener('click', clearCardForm);
  els.saveCardBtn.addEventListener('click', saveCard);
  els.deleteCardBtn.addEventListener('click', deleteCard);
}

function disableAll(disabled) {
  document.querySelectorAll('button, input, select, textarea').forEach((el) => {
    if (el.id !== 'adminStatus') el.disabled = disabled;
  });
}

async function loadAll() {
  setStatus('Betöltés...');
  const [configRes, tileRes, cardRes] = await Promise.all([
    supabase.from('game_config').select('key, value'),
    supabase.from('game_tiles').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_cards').select('*').order('id', { ascending: true }),
  ]);

  if (configRes.error) throw configRes.error;
  if (tileRes.error) throw tileRes.error;
  if (cardRes.error) throw cardRes.error;

  state.config = Object.fromEntries((configRes.data || []).map((row) => [row.key, valueFromConfig(row.value)]));
  state.tiles = tileRes.data || [];
  state.cards = cardRes.data || [];

  renderConfig();
  renderTiles();
  renderCards();
  clearTileForm();
  clearCardForm();
  setStatus('Admin betöltve.');
}

function renderConfig() {
  els.cfgStartingMoney.value = state.config.starting_money ?? 3000;
  els.cfgStartBonus.value = state.config.start_bonus ?? 400;
  els.cfgWinMoney.value = state.config.win_money ?? 10000;
  els.cfgRequiredItems.value = state.config.required_items ?? 4;
}

function renderTiles() {
  els.tileList.innerHTML = state.tiles.map((tile) => `
    <div class="admin-item ${Number(els.tileId.value) === Number(tile.id) ? 'active' : ''}" data-id="${tile.id}" data-kind="tile">
      <div class="admin-item-head">
        <strong>#${tile.sort_order} - ${escapeHtml(tile.name || '')}</strong>
        <small>${escapeHtml(tile.kind || '')}</small>
      </div>
      <small>ár: ${Number(tile.price || 0)} | érték: ${Number(tile.amount || 0)}</small>
    </div>
  `).join('');

  els.tileList.querySelectorAll('[data-kind="tile"]').forEach((item) => {
    item.addEventListener('click', () => {
      const tile = state.tiles.find((row) => Number(row.id) === Number(item.dataset.id));
      if (tile) fillTileForm(tile);
    });
  });
}

function renderCards() {
  els.cardList.innerHTML = state.cards.map((card) => `
    <div class="admin-item ${Number(els.cardId.value) === Number(card.id) ? 'active' : ''}" data-id="${card.id}" data-kind="card">
      <div class="admin-item-head">
        <strong>${escapeHtml(card.title || '')}</strong>
        <small>${escapeHtml(card.card_group || 'chance')}</small>
      </div>
      <small>pénz: ${Number(card.amount || 0)} | skip: ${Number(card.skip_turns || 0)} | move: ${Number(card.move_steps || 0)}</small>
    </div>
  `).join('');

  els.cardList.querySelectorAll('[data-kind="card"]').forEach((item) => {
    item.addEventListener('click', () => {
      const card = state.cards.find((row) => Number(row.id) === Number(item.dataset.id));
      if (card) fillCardForm(card);
    });
  });
}

function clearTileForm() {
  els.tileId.value = '';
  els.tileSort.value = state.tiles.length;
  els.tileName.value = '';
  els.tileKind.value = 'neutral';
  els.tileAmount.value = 0;
  els.tilePrice.value = 0;
  els.tileCardGroup.value = 'chance';
  els.tileEffect.value = '{}';
  renderTiles();
}

function fillTileForm(tile) {
  els.tileId.value = tile.id;
  els.tileSort.value = tile.sort_order ?? 0;
  els.tileName.value = tile.name ?? '';
  els.tileKind.value = tile.kind ?? 'neutral';
  els.tileAmount.value = tile.amount ?? 0;
  els.tilePrice.value = tile.price ?? 0;
  els.tileCardGroup.value = tile.card_group ?? 'chance';
  els.tileEffect.value = prettyJson(tile.effect);
  renderTiles();
}

function clearCardForm() {
  els.cardId.value = '';
  els.cardGroup.value = 'chance';
  els.cardTitle.value = '';
  els.cardAmount.value = 0;
  els.cardSkipTurns.value = 0;
  els.cardMoveSteps.value = 0;
  els.cardBody.value = '';
  els.cardEffect.value = '{}';
  renderCards();
}

function fillCardForm(card) {
  els.cardId.value = card.id;
  els.cardGroup.value = card.card_group ?? 'chance';
  els.cardTitle.value = card.title ?? '';
  els.cardAmount.value = card.amount ?? 0;
  els.cardSkipTurns.value = card.skip_turns ?? 0;
  els.cardMoveSteps.value = card.move_steps ?? 0;
  els.cardBody.value = card.body ?? '';
  els.cardEffect.value = prettyJson(card.effect);
  renderCards();
}

async function saveConfig() {
  const entries = [
    ['starting_money', Number(els.cfgStartingMoney.value || 0)],
    ['start_bonus', Number(els.cfgStartBonus.value || 0)],
    ['win_money', Number(els.cfgWinMoney.value || 0)],
    ['required_items', Number(els.cfgRequiredItems.value || 0)],
  ];

  for (const [key, value] of entries) {
    const res = await supabase.from('game_config').upsert({ key, value: { value } }, { onConflict: 'key' });
    if (res.error) {
      setStatus(res.error.message);
      return;
    }
  }

  setStatus('Beállítások elmentve.');
  await loadAll();
}

async function saveTile() {
  let effect = {};
  try {
    effect = parseJson(els.tileEffect.value);
  } catch (error) {
    alert(error.message || error);
    return;
  }

  const payload = {
    sort_order: Number(els.tileSort.value || 0),
    name: els.tileName.value.trim(),
    kind: els.tileKind.value,
    amount: Number(els.tileAmount.value || 0),
    price: Number(els.tilePrice.value || 0),
    card_group: els.tileCardGroup.value.trim() || 'chance',
    effect,
  };

  if (!payload.name) {
    alert('Adj nevet a mezőnek.');
    return;
  }

  const id = Number(els.tileId.value || 0);
  const query = id
    ? supabase.from('game_tiles').update(payload).eq('id', id)
    : supabase.from('game_tiles').insert(payload);

  const res = await query;
  if (res.error) {
    setStatus(res.error.message);
    return;
  }

  setStatus('Mező elmentve.');
  await loadAll();
}

async function deleteTile() {
  const id = Number(els.tileId.value || 0);
  if (!id) return;
  if (!confirm('Biztos törlöd ezt a mezőt?')) return;
  const res = await supabase.from('game_tiles').delete().eq('id', id);
  if (res.error) {
    setStatus(res.error.message);
    return;
  }
  setStatus('Mező törölve.');
  await loadAll();
}

async function saveCard() {
  let effect = {};
  try {
    effect = parseJson(els.cardEffect.value);
  } catch (error) {
    alert(error.message || error);
    return;
  }

  const payload = {
    card_group: els.cardGroup.value.trim() || 'chance',
    title: els.cardTitle.value.trim(),
    body: els.cardBody.value.trim(),
    amount: Number(els.cardAmount.value || 0),
    skip_turns: Number(els.cardSkipTurns.value || 0),
    move_steps: Number(els.cardMoveSteps.value || 0),
    effect,
  };

  if (!payload.title) {
    alert('Adj címet a kártyának.');
    return;
  }

  const id = Number(els.cardId.value || 0);
  const query = id
    ? supabase.from('game_cards').update(payload).eq('id', id)
    : supabase.from('game_cards').insert(payload);

  const res = await query;
  if (res.error) {
    setStatus(res.error.message);
    return;
  }

  setStatus('Kártya elmentve.');
  await loadAll();
}

async function deleteCard() {
  const id = Number(els.cardId.value || 0);
  if (!id) return;
  if (!confirm('Biztos törlöd ezt a kártyát?')) return;
  const res = await supabase.from('game_cards').delete().eq('id', id);
  if (res.error) {
    setStatus(res.error.message);
    return;
  }
  setStatus('Kártya törölve.');
  await loadAll();
}

function setStatus(message) {
  els.adminStatus.textContent = message;
}

function parseJson(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Hibás JSON.');
  }
}

function prettyJson(value) {
  try {
    return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : (value || {}), null, 2);
  } catch {
    return '{}';
  }
}

function valueFromConfig(raw) {
  return typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
