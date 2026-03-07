import {
  createSupabase,
  showToast,
  randomCode,
  getSession,
  setSession,
  clearSession,
  currency,
  cloneInventory,
  escapeHtml,
  getTileColor,
} from './lib.js';
import { DEMO_MODE } from './config.js';

const supabase = createSupabase();
const state = {
  session: getSession(),
  room: null,
  players: [],
  tiles: [],
  logs: [],
  config: {
    starting_money: 1500,
    pass_start_bonus: 300,
    win_item_count: 3,
    default_deck: 'default',
  },
  isBusy: false,
  pollTimer: null,
  subscriptions: [],
};

const els = {
  playerName: document.getElementById('playerName'),
  roomCode: document.getElementById('roomCode'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  leaveRoomBtn: document.getElementById('leaveRoomBtn'),
  connectionStatus: document.getElementById('connectionStatus'),
  startGameBtn: document.getElementById('startGameBtn'),
  playersLobby: document.getElementById('playersLobby'),
  turnInfo: document.getElementById('turnInfo'),
  roomCodeBadge: document.getElementById('roomCodeBadge'),
  roundBadge: document.getElementById('roundBadge'),
  lastRollBadge: document.getElementById('lastRollBadge'),
  winConditionBadge: document.getElementById('winConditionBadge'),
  board: document.getElementById('board'),
  playersGame: document.getElementById('playersGame'),
  logList: document.getElementById('logList'),
  rollBtn: document.getElementById('rollBtn'),
  processSkipBtn: document.getElementById('processSkipBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
};

init();

async function init() {
  bindEvents();
  if (DEMO_MODE) {
    showToast('Előbb állítsd be a Supabase URL-t és anon kulcsot az assets/config.js fájlban.', 'error');
  }

  if (state.session && supabase) {
    const ok = await hydrateFromSession();
    if (!ok) {
      clearSession();
      state.session = null;
    }
  }

  await loadStaticData();
  renderAll();
}

function bindEvents() {
  els.createRoomBtn.addEventListener('click', createRoom);
  els.joinRoomBtn.addEventListener('click', joinRoom);
  els.leaveRoomBtn.addEventListener('click', leaveRoom);
  els.startGameBtn.addEventListener('click', startGame);
  els.rollBtn.addEventListener('click', handleRollTurn);
  els.processSkipBtn.addEventListener('click', processSkipTurn);
  els.refreshBtn.addEventListener('click', refreshRoomState);
}

async function loadStaticData() {
  if (!supabase) return;

  const [{ data: configRows, error: configError }, { data: tiles, error: tilesError }] = await Promise.all([
    supabase.from('game_config').select('*').limit(1),
    supabase.from('game_tiles').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
  ]);

  if (configError) {
    showToast(`Config hiba: ${configError.message}`, 'error');
  } else if (configRows?.[0]) {
    state.config = configRows[0];
  }

  if (tilesError) {
    showToast(`Tábla hiba: ${tilesError.message}`, 'error');
  } else {
    state.tiles = tiles || [];
  }
}

async function hydrateFromSession() {
  const { room_id: roomId, player_id: playerId } = state.session;
  const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (roomError || !room) return false;
  const { data: player, error: playerError } = await supabase.from('room_players').select('*').eq('id', playerId).maybeSingle();
  if (playerError || !player) return false;

  state.room = room;
  await refreshRoomState(false);
  attachRoomListeners();
  return true;
}

async function createRoom() {
  if (!supabase) return;
  const name = normalizeName(els.playerName.value);
  if (!name) {
    showToast('Adj meg egy játékosnevet.', 'error');
    return;
  }

  state.isBusy = true;
  renderButtons();

  try {
    const code = randomCode(6);
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        code,
        status: 'waiting',
        current_turn_index: 0,
        turn_number: 1,
        last_roll: null,
      })
      .select()
      .single();

    if (roomError) throw roomError;

    const { data: players, error: playerError } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        name,
        player_order: 0,
        position: 0,
        money: Number(state.config.starting_money || 1500),
        skip_turns: 0,
        inventory: [],
        is_host: true,
      })
      .select();

    if (playerError) throw playerError;

    state.session = {
      room_id: room.id,
      player_id: players[0].id,
      room_code: code,
    };
    setSession(state.session);
    state.room = room;

    await addLog(room.id, `${name} létrehozta a szobát (${code}).`);
    await refreshRoomState(false);
    attachRoomListeners();
    showToast(`Szoba létrehozva: ${code}`, 'success');
  } catch (error) {
    showToast(error.message || 'Nem sikerült létrehozni a szobát.', 'error');
  } finally {
    state.isBusy = false;
    renderAll();
  }
}

async function joinRoom() {
  if (!supabase) return;
  const name = normalizeName(els.playerName.value);
  const code = els.roomCode.value.trim().toUpperCase();

  if (!name || !code) {
    showToast('Adj meg játékosnevet és szobakódot is.', 'error');
    return;
  }

  state.isBusy = true;
  renderButtons();

  try {
    const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new Error('Nincs ilyen szoba.');

    const { data: existingPlayers, error: existingError } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', room.id)
      .order('player_order', { ascending: true });
    if (existingError) throw existingError;

    const nextOrder = existingPlayers.length;
    const { data: players, error: playerError } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        name,
        player_order: nextOrder,
        position: 0,
        money: Number(state.config.starting_money || 1500),
        skip_turns: 0,
        inventory: [],
        is_host: false,
      })
      .select();

    if (playerError) throw playerError;

    state.session = {
      room_id: room.id,
      player_id: players[0].id,
      room_code: room.code,
    };
    setSession(state.session);
    state.room = room;

    await addLog(room.id, `${name} csatlakozott a szobához.`);
    await refreshRoomState(false);
    attachRoomListeners();
    showToast(`Csatlakoztál a(z) ${room.code} szobához.`, 'success');
  } catch (error) {
    showToast(error.message || 'Nem sikerült csatlakozni.', 'error');
  } finally {
    state.isBusy = false;
    renderAll();
  }
}

async function leaveRoom() {
  if (!supabase || !state.session) return;
  const player = getMe();
  const room = state.room;
  if (!player || !room) return;

  try {
    await addLog(room.id, `${player.name} kilépett a szobából.`);
    const { error } = await supabase.from('room_players').delete().eq('id', player.id);
    if (error) throw error;
  } catch (error) {
    showToast(error.message || 'Nem sikerült kilépni.', 'error');
    return;
  }

  detachListeners();
  clearInterval(state.pollTimer);
  state.pollTimer = null;
  clearSession();
  state.session = null;
  state.room = null;
  state.players = [];
  state.logs = [];
  renderAll();
  showToast('Kiléptél a szobából.', 'success');
}

async function startGame() {
  if (!supabase || !state.room) return;
  const me = getMe();
  if (!me?.is_host) {
    showToast('Csak a host indíthatja a játékot.', 'error');
    return;
  }
  if (state.players.length < 2) {
    showToast('Legalább 2 játékos kell a kezdéshez.', 'error');
    return;
  }

  try {
    const baseMoney = Number(state.config.starting_money || 1500);
    for (const player of state.players) {
      await supabase.from('room_players').update({
        position: 0,
        money: baseMoney,
        skip_turns: 0,
        inventory: [],
      }).eq('id', player.id);
    }

    const { error } = await supabase.from('rooms').update({
      status: 'playing',
      current_turn_index: 0,
      turn_number: 1,
      last_roll: null,
      winner_player_id: null,
    }).eq('id', state.room.id);

    if (error) throw error;
    await addLog(state.room.id, 'A játék elindult.');
    await refreshRoomState(false);
    showToast('Játék elindítva.', 'success');
  } catch (error) {
    showToast(error.message || 'Nem sikerült elindítani a játékot.', 'error');
  }
}

async function handleRollTurn() {
  if (!supabase || !state.room || state.isBusy) return;
  const me = getMe();
  const activePlayer = getActivePlayer();
  if (!me || !activePlayer) return;

  if (activePlayer.id !== me.id) {
    showToast('Most nem te jössz.', 'error');
    return;
  }

  if (me.skip_turns > 0) {
    showToast('Ennek a játékosnak kimaradó köre van.', 'error');
    return;
  }

  state.isBusy = true;
  renderButtons();

  try {
    const roll = Math.floor(Math.random() * 6) + 1;
    const boardSize = Math.max(1, state.tiles.length);
    let newPosition = (Number(me.position) + roll) % boardSize;
    let newMoney = Number(me.money);
    let inventory = cloneInventory(me.inventory);
    let logLines = [`${me.name} dobott: ${roll}.`];

    if (Number(me.position) + roll >= boardSize) {
      const bonus = Number(state.config.pass_start_bonus || 0);
      newMoney += bonus;
      logLines.push(`${me.name} áthaladt a starton és kapott ${currency(bonus)} pénzt.`);
    }

    const tile = state.tiles[newPosition];
    const resolution = await resolveTileEffect({
      player: me,
      tile,
      position: newPosition,
      money: newMoney,
      inventory,
      depth: 0,
    });

    newPosition = resolution.position;
    newMoney = resolution.money;
    inventory = resolution.inventory;
    logLines = [...logLines, ...resolution.logs];

    const { error: updatePlayerError } = await supabase.from('room_players').update({
      position: newPosition,
      money: newMoney,
      inventory,
    }).eq('id', me.id);
    if (updatePlayerError) throw updatePlayerError;

    const next = computeNextTurnIndex();
    const winner = inventory.length >= Number(state.config.win_item_count || 3);

    const roomPatch = {
      last_roll: roll,
      current_turn_index: next,
      turn_number: next === 0 ? Number(state.room.turn_number || 1) + 1 : Number(state.room.turn_number || 1),
      winner_player_id: winner ? me.id : null,
      status: winner ? 'finished' : state.room.status,
    };

    const { error: roomError } = await supabase.from('rooms').update(roomPatch).eq('id', state.room.id);
    if (roomError) throw roomError;

    for (const line of logLines) {
      await addLog(state.room.id, line);
    }
    if (winner) {
      await addLog(state.room.id, `${me.name} megnyerte a játékot!`);
    }

    await refreshRoomState(false);
    showToast(winner ? 'Nyertél!' : 'Lépés feldolgozva.', 'success');
  } catch (error) {
    showToast(error.message || 'Hiba történt a dobásnál.', 'error');
  } finally {
    state.isBusy = false;
    renderAll();
  }
}

async function processSkipTurn() {
  if (!supabase || !state.room || state.isBusy) return;
  const activePlayer = getActivePlayer();
  const me = getMe();
  if (!activePlayer || activePlayer.skip_turns <= 0) {
    showToast('Nincs kimaradó kör feldolgozásra.', 'error');
    return;
  }
  if (activePlayer.id !== me?.id && !me?.is_host) {
    showToast('Ezt most az aktív játékos vagy a host intézheti.', 'error');
    return;
  }

  state.isBusy = true;
  renderButtons();

  try {
    const nextSkip = Math.max(0, Number(activePlayer.skip_turns) - 1);
    const { error: playerError } = await supabase.from('room_players').update({ skip_turns: nextSkip }).eq('id', activePlayer.id);
    if (playerError) throw playerError;

    const next = computeNextTurnIndex();
    const { error: roomError } = await supabase.from('rooms').update({
      current_turn_index: next,
      turn_number: next === 0 ? Number(state.room.turn_number || 1) + 1 : Number(state.room.turn_number || 1),
      last_roll: null,
    }).eq('id', state.room.id);
    if (roomError) throw roomError;

    await addLog(state.room.id, `${activePlayer.name} köre kimarad. Hátralévő kihagyások: ${nextSkip}.`);
    await refreshRoomState(false);
    showToast('Kimaradó kör feldolgozva.', 'success');
  } catch (error) {
    showToast(error.message || 'Nem sikerült feldolgozni a kimaradást.', 'error');
  } finally {
    state.isBusy = false;
    renderAll();
  }
}

async function resolveTileEffect(context) {
  const out = {
    position: context.position,
    money: Number(context.money),
    inventory: cloneInventory(context.inventory),
    logs: [],
  };

  if (!context.tile || context.depth > 3) {
    return out;
  }

  const tile = context.tile;
  out.logs.push(`${context.player.name} mezőre lépett: ${tile.name}.`);

  switch (tile.tile_type) {
    case 'money': {
      out.money += Number(tile.amount || 0);
      out.logs.push(`Pénz változás: ${currency(tile.amount || 0)}.`);
      break;
    }
    case 'skip': {
      const skipTurns = Math.max(0, Number(tile.turns || 0));
      await supabase.from('room_players').update({ skip_turns: skipTurns }).eq('id', context.player.id);
      out.logs.push(`${context.player.name} ${skipTurns} kört kihagy.`);
      break;
    }
    case 'move': {
      const steps = Number(tile.steps || 0);
      const boardSize = Math.max(1, state.tiles.length);
      out.position = normalizePosition(out.position + steps, boardSize);
      out.logs.push(`Továbblépés: ${steps > 0 ? '+' : ''}${steps} mező.`);
      const chained = await resolveTileEffect({
        ...context,
        tile: state.tiles[out.position],
        position: out.position,
        money: out.money,
        inventory: out.inventory,
        depth: context.depth + 1,
      });
      chained.logs = [...out.logs, ...chained.logs];
      return chained;
    }
    case 'card': {
      const deckName = tile.deck_name || state.config.default_deck || 'default';
      const card = await drawRandomCard(deckName);
      if (!card) {
        out.logs.push(`A ${deckName} pakliban nincs aktív kártya.`);
        break;
      }
      out.logs.push(`Húzott kártya: ${card.title} — ${card.description}`);
      const cardResult = await applyCardEffect(context.player, card, out.position, out.money, out.inventory);
      out.position = cardResult.position;
      out.money = cardResult.money;
      out.inventory = cardResult.inventory;
      out.logs.push(...cardResult.logs);
      break;
    }
    case 'shop': {
      const itemName = tile.item_name || 'Ismeretlen tárgy';
      const price = Number(tile.item_price || 0);
      const canAfford = out.money >= price;
      const confirmed = canAfford && window.confirm(`${itemName} megvásárlása ${currency(price)} pénzért?`);
      if (confirmed) {
        out.money -= price;
        out.inventory.push(itemName);
        out.logs.push(`${context.player.name} megvette ezt: ${itemName} (${currency(price)}).`);
      } else {
        out.logs.push(`${context.player.name} nem vásárolt a boltban.`);
      }
      break;
    }
    default:
      out.logs.push('Semmi extra nem történt ezen a mezőn.');
      break;
  }

  return out;
}

async function drawRandomCard(deckName) {
  const { data, error } = await supabase
    .from('game_cards')
    .select('*')
    .eq('is_active', true)
    .eq('deck_name', deckName);
  if (error) throw error;
  if (!data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}

async function applyCardEffect(player, card, position, money, inventory) {
  const out = {
    position,
    money: Number(money),
    inventory: cloneInventory(inventory),
    logs: [],
  };

  switch (card.action_type) {
    case 'money':
      out.money += Number(card.amount || 0);
      out.logs.push(`Kártyahatás: pénz változás ${currency(card.amount || 0)}.`);
      break;
    case 'skip': {
      const skipTurns = Math.max(0, Number(card.turns || 0));
      await supabase.from('room_players').update({ skip_turns: skipTurns }).eq('id', player.id);
      out.logs.push(`Kártyahatás: ${skipTurns} kör kimarad.`);
      break;
    }
    case 'move': {
      const boardSize = Math.max(1, state.tiles.length);
      const steps = Number(card.steps || 0);
      out.position = normalizePosition(position + steps, boardSize);
      out.logs.push(`Kártyahatás: mozgás ${steps > 0 ? '+' : ''}${steps} mező.`);
      break;
    }
    case 'shop': {
      const itemName = card.item_name || 'Kártyás tárgy';
      const price = Number(card.item_price || 0);
      const canAfford = out.money >= price;
      const confirmed = canAfford && window.confirm(`${card.title}: megveszed ezt: ${itemName} (${currency(price)})?`);
      if (confirmed) {
        out.money -= price;
        out.inventory.push(itemName);
        out.logs.push(`Kártyahatás: megvásárolva ${itemName}.`);
      } else {
        out.logs.push(`Kártyahatás: ${itemName} nem lett megvéve.`);
      }
      break;
    }
    default:
      out.logs.push('A kártyának csak szöveges hatása volt.');
      break;
  }

  return out;
}

function computeNextTurnIndex() {
  if (!state.players.length) return 0;
  return (Number(state.room.current_turn_index || 0) + 1) % state.players.length;
}

function normalizePosition(value, boardSize) {
  return ((value % boardSize) + boardSize) % boardSize;
}

async function addLog(roomId, message) {
  if (!supabase) return;
  await supabase.from('room_logs').insert({ room_id: roomId, message });
}

async function refreshRoomState(showMessage = true) {
  if (!supabase || !state.session) return;
  const roomId = state.session.room_id;

  const [{ data: room, error: roomError }, { data: players, error: playersError }, { data: logs, error: logsError }] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('room_players').select('*').eq('room_id', roomId).order('player_order', { ascending: true }),
    supabase.from('room_logs').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(12),
  ]);

  if (roomError || !room) {
    showToast(roomError?.message || 'Nem található a szoba.', 'error');
    return;
  }
  if (playersError) {
    showToast(playersError.message, 'error');
    return;
  }
  if (logsError) {
    showToast(logsError.message, 'error');
    return;
  }

  state.room = room;
  state.players = players || [];
  state.logs = logs || [];

  if (showMessage) showToast('Állapot frissítve.', 'success');
  renderAll();
}

function attachRoomListeners() {
  detachListeners();
  clearInterval(state.pollTimer);
  if (!supabase || !state.session) return;

  const roomId = state.session.room_id;

  try {
    const roomChannel = supabase.channel(`room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => refreshRoomState(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => refreshRoomState(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_logs', filter: `room_id=eq.${roomId}` }, () => refreshRoomState(false))
      .subscribe();
    state.subscriptions.push(roomChannel);
  } catch {
    // fallback below
  }

  state.pollTimer = setInterval(() => refreshRoomState(false), 2500);
}

function detachListeners() {
  if (!supabase) return;
  for (const channel of state.subscriptions) {
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  }
  state.subscriptions = [];
}

function getActivePlayer() {
  if (!state.players.length) return null;
  return state.players[Number(state.room?.current_turn_index || 0)] || null;
}

function getMe() {
  if (!state.session) return null;
  return state.players.find((player) => player.id === state.session.player_id) || null;
}

function normalizeName(value) {
  return value.trim().slice(0, 24);
}

function renderAll() {
  renderConnection();
  renderLobby();
  renderGame();
  renderButtons();
}

function renderConnection() {
  const roomCode = state.room?.code || state.session?.room_code || '–';
  els.roomCodeBadge.textContent = roomCode;
  els.connectionStatus.textContent = state.session
    ? `Csatlakozva: ${roomCode}`
    : 'Még nem csatlakoztál szobához.';
  els.leaveRoomBtn.classList.toggle('hidden', !state.session);
}

function renderLobby() {
  if (!state.players.length) {
    els.playersLobby.innerHTML = '<div class="empty-state">Nincs még játékos.</div>';
  } else {
    els.playersLobby.innerHTML = state.players.map((player, index) => `
      <div class="player-card ${player.id === getActivePlayer()?.id ? 'active-player' : ''}">
        <h4>${escapeHtml(player.name)}</h4>
        <div class="player-meta">
          <span class="player-chip">Sorrend: ${index + 1}</span>
          ${player.is_host ? '<span class="player-chip">Host</span>' : ''}
          <span class="player-chip">Pénz: ${currency(player.money)}</span>
          <span class="player-chip">Tárgyak: ${cloneInventory(player.inventory).length}</span>
        </div>
      </div>
    `).join('');
  }

  const me = getMe();
  const canStart = me?.is_host && state.players.length >= 2 && state.room?.status !== 'playing';
  els.startGameBtn.classList.toggle('hidden', !canStart);
}

function renderGame() {
  const activePlayer = getActivePlayer();
  const me = getMe();

  els.roundBadge.textContent = String(state.room?.turn_number || '–');
  els.lastRollBadge.textContent = state.room?.last_roll ?? '–';
  els.winConditionBadge.textContent = `${state.config.win_item_count || 3} tárgy`;

  if (!state.session) {
    els.turnInfo.textContent = 'Csatlakozz egy szobához a kezdéshez.';
  } else if (state.room?.status === 'finished') {
    const winner = state.players.find((player) => player.id === state.room.winner_player_id);
    els.turnInfo.textContent = winner ? `A játék véget ért. Nyertes: ${winner.name}.` : 'A játék véget ért.';
  } else if (state.room?.status !== 'playing') {
    els.turnInfo.textContent = 'A játék még nem indult el.';
  } else if (activePlayer) {
    els.turnInfo.textContent = `${activePlayer.name} következik.`;
  }

  if (!state.tiles.length) {
    els.board.innerHTML = '<div class="empty-state">Nincs aktív mező. Állítsd be az admin oldalon.</div>';
  } else {
    els.board.innerHTML = state.tiles.map((tile, index) => {
      const playersOnTile = state.players.filter((player) => Number(player.position) === index);
      return `
        <div class="tile ${playersOnTile.length ? 'active-tile' : ''}" style="border-color:${getTileColor(tile.tile_type)}">
          <span class="tile-index">${index}</span>
          <h4>${escapeHtml(tile.name)}</h4>
          <p>${escapeHtml(tile.description || 'Nincs leírás')}</p>
          <span class="type-badge">${escapeHtml(tile.tile_type)}</span>
          <div class="player-markers">
            ${playersOnTile.length
              ? playersOnTile.map((player) => `<span class="player-chip">${escapeHtml(player.name)}</span>`).join('')
              : '<span class="tag">Üres</span>'}
          </div>
        </div>
      `;
    }).join('');
  }

  if (!state.players.length) {
    els.playersGame.innerHTML = '<div class="empty-state">Még nincs játékos adat.</div>';
  } else {
    els.playersGame.innerHTML = state.players.map((player) => {
      const inventory = cloneInventory(player.inventory);
      return `
        <div class="player-card ${player.id === activePlayer?.id ? 'active-player' : ''}">
          <h4>${escapeHtml(player.name)}</h4>
          <div class="player-meta">
            <span class="player-chip">Pozíció: ${Number(player.position) + 1}</span>
            <span class="player-chip">Pénz: ${currency(player.money)}</span>
            <span class="player-chip">Kimaradás: ${player.skip_turns || 0}</span>
            <span class="player-chip">Tárgyak: ${inventory.length}</span>
          </div>
          <p class="small-note" style="margin-top:10px;">${inventory.length ? inventory.map(escapeHtml).join(', ') : 'Még nincs vásárolt tárgy.'}</p>
        </div>
      `;
    }).join('');
  }

  if (!state.logs.length) {
    els.logList.innerHTML = '<div class="empty-state">Még nincs esemény.</div>';
  } else {
    els.logList.innerHTML = state.logs.map((log) => `
      <div class="log-item">
        <strong>${new Date(log.created_at).toLocaleString('hu-HU')}</strong>
        <div>${escapeHtml(log.message)}</div>
      </div>
    `).join('');
  }

  els.rollBtn.classList.toggle('hidden', !(state.room?.status === 'playing' && me && activePlayer?.id === me.id && Number(me.skip_turns || 0) === 0));
  els.processSkipBtn.classList.toggle('hidden', !(state.room?.status === 'playing' && activePlayer && Number(activePlayer.skip_turns || 0) > 0 && (me?.id === activePlayer.id || me?.is_host)));
}

function renderButtons() {
  const disabled = state.isBusy || !supabase;
  els.createRoomBtn.disabled = disabled;
  els.joinRoomBtn.disabled = disabled;
  els.startGameBtn.disabled = disabled;
  els.rollBtn.disabled = disabled;
  els.processSkipBtn.disabled = disabled;
}
