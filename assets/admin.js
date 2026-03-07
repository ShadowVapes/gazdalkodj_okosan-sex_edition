import {
  createSupabase,
  showToast,
  escapeHtml,
} from './lib.js';
import { DEMO_MODE } from './config.js';

const supabase = createSupabase();

const els = {
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  cfgStartingMoney: document.getElementById('cfgStartingMoney'),
  cfgPassStartBonus: document.getElementById('cfgPassStartBonus'),
  cfgWinItemCount: document.getElementById('cfgWinItemCount'),
  cfgDefaultDeck: document.getElementById('cfgDefaultDeck'),

  tileForm: document.getElementById('tileForm'),
  tileId: document.getElementById('tileId'),
  tileOrder: document.getElementById('tileOrder'),
  tileName: document.getElementById('tileName'),
  tileDescription: document.getElementById('tileDescription'),
  tileType: document.getElementById('tileType'),
  tileAmount: document.getElementById('tileAmount'),
  tileTurns: document.getElementById('tileTurns'),
  tileSteps: document.getElementById('tileSteps'),
  tileDeck: document.getElementById('tileDeck'),
  tileItemName: document.getElementById('tileItemName'),
  tileItemPrice: document.getElementById('tileItemPrice'),
  tileResetBtn: document.getElementById('tileResetBtn'),
  tileTableBody: document.getElementById('tileTableBody'),
  reloadTilesBtn: document.getElementById('reloadTilesBtn'),

  cardForm: document.getElementById('cardForm'),
  cardId: document.getElementById('cardId'),
  cardDeck: document.getElementById('cardDeck'),
  cardTitle: document.getElementById('cardTitle'),
  cardDescription: document.getElementById('cardDescription'),
  cardActionType: document.getElementById('cardActionType'),
  cardAmount: document.getElementById('cardAmount'),
  cardTurns: document.getElementById('cardTurns'),
  cardSteps: document.getElementById('cardSteps'),
  cardItemName: document.getElementById('cardItemName'),
  cardItemPrice: document.getElementById('cardItemPrice'),
  cardResetBtn: document.getElementById('cardResetBtn'),
  cardTableBody: document.getElementById('cardTableBody'),
  reloadCardsBtn: document.getElementById('reloadCardsBtn'),
};

const state = {
  config: null,
  tiles: [],
  cards: [],
};

init();

async function init() {
  bindEvents();
  if (DEMO_MODE) {
    showToast('Előbb állítsd be a Supabase URL-t és anon kulcsot az assets/config.js fájlban.', 'error');
    return;
  }
  await Promise.all([loadConfig(), loadTiles(), loadCards()]);
}

function bindEvents() {
  els.saveConfigBtn.addEventListener('click', saveConfig);
  els.tileForm.addEventListener('submit', saveTile);
  els.tileResetBtn.addEventListener('click', resetTileForm);
  els.reloadTilesBtn.addEventListener('click', loadTiles);
  els.cardForm.addEventListener('submit', saveCard);
  els.cardResetBtn.addEventListener('click', resetCardForm);
  els.reloadCardsBtn.addEventListener('click', loadCards);
}

async function loadConfig() {
  const { data, error } = await supabase.from('game_config').select('*').limit(1);
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  state.config = data?.[0] || null;
  if (!state.config) return;
  els.cfgStartingMoney.value = state.config.starting_money;
  els.cfgPassStartBonus.value = state.config.pass_start_bonus;
  els.cfgWinItemCount.value = state.config.win_item_count;
  els.cfgDefaultDeck.value = state.config.default_deck;
}

async function saveConfig() {
  if (!state.config) return;
  const payload = {
    starting_money: Number(els.cfgStartingMoney.value || 0),
    pass_start_bonus: Number(els.cfgPassStartBonus.value || 0),
    win_item_count: Number(els.cfgWinItemCount.value || 3),
    default_deck: els.cfgDefaultDeck.value.trim() || 'default',
  };

  const { error } = await supabase.from('game_config').update(payload).eq('id', state.config.id);
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  showToast('Globális beállítások mentve.', 'success');
  await loadConfig();
}

async function loadTiles() {
  const { data, error } = await supabase.from('game_tiles').select('*').order('sort_order', { ascending: true });
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  state.tiles = data || [];
  renderTiles();
}

async function saveTile(event) {
  event.preventDefault();
  const payload = {
    sort_order: Number(els.tileOrder.value || 0),
    name: els.tileName.value.trim(),
    description: els.tileDescription.value.trim(),
    tile_type: els.tileType.value,
    amount: Number(els.tileAmount.value || 0),
    turns: Number(els.tileTurns.value || 0),
    steps: Number(els.tileSteps.value || 0),
    deck_name: els.tileDeck.value.trim() || 'default',
    item_name: els.tileItemName.value.trim(),
    item_price: Number(els.tileItemPrice.value || 0),
    is_active: true,
  };

  let error;
  if (els.tileId.value) {
    ({ error } = await supabase.from('game_tiles').update(payload).eq('id', els.tileId.value));
  } else {
    ({ error } = await supabase.from('game_tiles').insert(payload));
  }

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  showToast('Mező mentve.', 'success');
  resetTileForm();
  await loadTiles();
}

function renderTiles() {
  if (!state.tiles.length) {
    els.tileTableBody.innerHTML = '<tr><td colspan="5">Még nincs mező.</td></tr>';
    return;
  }

  els.tileTableBody.innerHTML = state.tiles.map((tile) => `
    <tr>
      <td>${tile.sort_order}</td>
      <td>${escapeHtml(tile.name)}</td>
      <td>${escapeHtml(tile.tile_type)}</td>
      <td>${escapeHtml(tile.description || '–')}</td>
      <td>
        <div class="admin-actions">
          <button type="button" data-edit-tile="${tile.id}">Szerkesztés</button>
          <button type="button" data-delete-tile="${tile.id}">Törlés</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-edit-tile]').forEach((button) => {
    button.addEventListener('click', () => editTile(button.dataset.editTile));
  });
  document.querySelectorAll('[data-delete-tile]').forEach((button) => {
    button.addEventListener('click', () => deleteTile(button.dataset.deleteTile));
  });
}

function editTile(id) {
  const tile = state.tiles.find((entry) => String(entry.id) === String(id));
  if (!tile) return;
  els.tileId.value = tile.id;
  els.tileOrder.value = tile.sort_order;
  els.tileName.value = tile.name;
  els.tileDescription.value = tile.description || '';
  els.tileType.value = tile.tile_type;
  els.tileAmount.value = tile.amount || 0;
  els.tileTurns.value = tile.turns || 0;
  els.tileSteps.value = tile.steps || 0;
  els.tileDeck.value = tile.deck_name || 'default';
  els.tileItemName.value = tile.item_name || '';
  els.tileItemPrice.value = tile.item_price || 0;
}

async function deleteTile(id) {
  if (!window.confirm('Biztos törlöd ezt a mezőt?')) return;
  const { error } = await supabase.from('game_tiles').delete().eq('id', id);
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  showToast('Mező törölve.', 'success');
  await loadTiles();
}

function resetTileForm() {
  els.tileForm.reset();
  els.tileId.value = '';
  els.tileAmount.value = 0;
  els.tileTurns.value = 0;
  els.tileSteps.value = 0;
  els.tileItemPrice.value = 0;
}

async function loadCards() {
  const { data, error } = await supabase.from('game_cards').select('*').order('deck_name', { ascending: true }).order('id', { ascending: true });
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  state.cards = data || [];
  renderCards();
}

async function saveCard(event) {
  event.preventDefault();
  const payload = {
    deck_name: els.cardDeck.value.trim() || 'default',
    title: els.cardTitle.value.trim(),
    description: els.cardDescription.value.trim(),
    action_type: els.cardActionType.value,
    amount: Number(els.cardAmount.value || 0),
    turns: Number(els.cardTurns.value || 0),
    steps: Number(els.cardSteps.value || 0),
    item_name: els.cardItemName.value.trim(),
    item_price: Number(els.cardItemPrice.value || 0),
    is_active: true,
  };

  let error;
  if (els.cardId.value) {
    ({ error } = await supabase.from('game_cards').update(payload).eq('id', els.cardId.value));
  } else {
    ({ error } = await supabase.from('game_cards').insert(payload));
  }

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  showToast('Kártya mentve.', 'success');
  resetCardForm();
  await loadCards();
}

function renderCards() {
  if (!state.cards.length) {
    els.cardTableBody.innerHTML = '<tr><td colspan="5">Még nincs kártya.</td></tr>';
    return;
  }

  els.cardTableBody.innerHTML = state.cards.map((card) => `
    <tr>
      <td>${escapeHtml(card.deck_name)}</td>
      <td>${escapeHtml(card.title)}</td>
      <td>${escapeHtml(card.description)}</td>
      <td>${escapeHtml(card.action_type)}</td>
      <td>
        <div class="admin-actions">
          <button type="button" data-edit-card="${card.id}">Szerkesztés</button>
          <button type="button" data-delete-card="${card.id}">Törlés</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-edit-card]').forEach((button) => {
    button.addEventListener('click', () => editCard(button.dataset.editCard));
  });
  document.querySelectorAll('[data-delete-card]').forEach((button) => {
    button.addEventListener('click', () => deleteCard(button.dataset.deleteCard));
  });
}

function editCard(id) {
  const card = state.cards.find((entry) => String(entry.id) === String(id));
  if (!card) return;
  els.cardId.value = card.id;
  els.cardDeck.value = card.deck_name || 'default';
  els.cardTitle.value = card.title;
  els.cardDescription.value = card.description;
  els.cardActionType.value = card.action_type;
  els.cardAmount.value = card.amount || 0;
  els.cardTurns.value = card.turns || 0;
  els.cardSteps.value = card.steps || 0;
  els.cardItemName.value = card.item_name || '';
  els.cardItemPrice.value = card.item_price || 0;
}

async function deleteCard(id) {
  if (!window.confirm('Biztos törlöd ezt a kártyát?')) return;
  const { error } = await supabase.from('game_cards').delete().eq('id', id);
  if (error) {
    showToast(error.message, 'error');
    return;
  }
  showToast('Kártya törölve.', 'success');
  await loadCards();
}

function resetCardForm() {
  els.cardForm.reset();
  els.cardId.value = '';
  els.cardAmount.value = 0;
  els.cardTurns.value = 0;
  els.cardSteps.value = 0;
  els.cardItemPrice.value = 0;
}
