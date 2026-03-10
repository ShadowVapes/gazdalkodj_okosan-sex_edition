(() => {
  const { createClient } = window.supabase || {};
  const config = window.APP_CONFIG || {};
  const state = {
    gameData: null,
    supabase: null,
    room: null,
    playerRows: [],
    roomCode: null,
    myPlayerId: getOrCreateLocalId(),
    hostTimeout: null,
    dynamicInterval: null,
    roomChannel: null,
    playersChannel: null,
    diceSpinInterval: null,
    boardBuilt: false
  };

  const refs = {};
  const phaseLabels = {
    lobby: "Lobby",
    turn_ready: "Várakozás dobásra",
    rolling: "Dobás folyamatban",
    moving: "Lépés animáció",
    field_reveal: "Mező felfedése",
    awaiting_card_draw: "Kártyahúzásra vár",
    card_reveal: "Kártya felfedése",
    purchase_decision: "Vásárlási döntés",
    skip_notice: "Kimaradó kör",
    game_over: "Játék vége"
  };

  const palette = [
    "#67b7ff","#ff7f8c","#4fd18b","#f7c65c","#a68bff","#5dd3f3",
    "#ff9d5c","#ff6dd5","#8ee267","#88a6ff","#e6a14a","#46d3a3"
  ];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheRefs();
    bindUi();
    refs.usernameInput.value = localStorage.getItem("go_username") || "";
    refs.roomCodeInput.value = new URLSearchParams(location.search).get("room") || "";
    try {
      state.gameData = await loadGameData();
      buildBoard();
    } catch (error) {
      showBanner(`Nem sikerült betölteni a játékadatokat: ${error.message}`, "warning");
    }

    if (config.supabaseUrl && config.supabaseAnonKey && createClient) {
      state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
      showBanner("Supabase kapcsolat készen áll.", "ok");
    } else {
      showBanner("Töltsd ki az assets/config.js fájlt a Supabase URL-lel és anon kulccsal.", "warning");
    }

    if (!state.dynamicInterval) {
      state.dynamicInterval = setInterval(renderDynamicsOnly, 60);
    }
    render();
  }

  function cacheRefs() {
    [
      "statusBanner","lobbyScreen","gameScreen","usernameInput","roomCodeInput",
      "createRoomBtn","joinRoomBtn","roomCodeLabel","copyCodeBtn","roomStatusLabel",
      "hostLabel","startGameBtn","lobbyPlayers","leaveRoomBtn","board","playersPanel",
      "logPanel","phaseBadge","turnInfo","diceButton","diceFace","deckButton","overlay"
    ].forEach((id) => refs[id] = document.getElementById(id));
  }

  function bindUi() {
    refs.createRoomBtn.addEventListener("click", createRoom);
    refs.joinRoomBtn.addEventListener("click", joinRoom);
    refs.startGameBtn.addEventListener("click", startGame);
    refs.copyCodeBtn.addEventListener("click", copyRoomCode);
    refs.leaveRoomBtn.addEventListener("click", leaveRoom);
    refs.diceButton.addEventListener("click", onDiceClick);
    refs.deckButton.addEventListener("click", onDeckClick);
    refs.usernameInput.addEventListener("change", persistUsername);
    refs.roomCodeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") joinRoom();
    });
  }

  function persistUsername() {
    localStorage.setItem("go_username", refs.usernameInput.value.trim());
  }

  async function loadGameData() {
    const response = await fetch(config.dataPath || "./data/game-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("A data/game-data.json nem érhető el.");
    return response.json();
  }

  function showBanner(message, tone = "warning") {
    refs.statusBanner.textContent = message;
    refs.statusBanner.className = `status-banner ${tone}`;
    refs.statusBanner.classList.remove("hidden");
  }

  function hideBanner() {
    refs.statusBanner.classList.add("hidden");
  }

  function getOrCreateLocalId() {
    const key = "go_local_player_id";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = "p_" + Math.random().toString(36).slice(2, 11);
    localStorage.setItem(key, created);
    return created;
  }

  function getUsername() {
    const value = refs.usernameInput.value.trim().slice(0, 24);
    return value || "";
  }

  function requireSupabase() {
    if (!state.supabase) {
      showBanner("Előbb töltsd ki az assets/config.js Supabase adatait.", "warning");
      return false;
    }
    return true;
  }

  function requireUsername() {
    const username = getUsername();
    if (!username) {
      showBanner("Adj meg egy felhasználónevet.", "warning");
      refs.usernameInput.focus();
      return false;
    }
    return true;
  }

  function randomRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  async function createRoom() {
    if (!requireSupabase() || !requireUsername()) return;
    persistUsername();
    hideBanner();

    try {
      let roomCode = "";
      let created = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        roomCode = randomRoomCode();
        const baseState = createBaseRoomState(roomCode);
        const { data, error } = await state.supabase
          .from("rooms")
          .insert({
            code: roomCode,
            host_player_id: state.myPlayerId,
            status: "lobby",
            state: baseState
          })
          .select()
          .single();

        if (!error) {
          created = data;
          break;
        }
        if (!String(error.message || "").toLowerCase().includes("duplicate")) {
          throw error;
        }
      }

      if (!created) throw new Error("Nem sikerült egyedi szobakódot generálni.");

      await upsertRoomPlayer(roomCode, getUsername());
      await subscribeToRoom(roomCode);
      showBanner(`Szoba létrehozva: ${roomCode}`, "ok");
    } catch (error) {
      showBanner(`Szobalétrehozási hiba: ${error.message}`, "warning");
    }
  }

  async function joinRoom() {
    if (!requireSupabase() || !requireUsername()) return;
    persistUsername();
    hideBanner();

    const roomCode = refs.roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
      showBanner("Adj meg egy szobakódot.", "warning");
      return;
    }

    try {
      const { data: room, error } = await state.supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .single();

      if (error || !room) throw new Error("Ilyen szoba nem található.");

      const started = room.status === "in_game" || room.status === "finished";
      const { data: existingPlayer } = await state.supabase
        .from("room_players")
        .select("*")
        .eq("room_code", roomCode)
        .eq("player_id", state.myPlayerId)
        .maybeSingle();

      if (started && !existingPlayer) {
        throw new Error("A játék már elindult, új játékos most nem csatlakozhat.");
      }

      await upsertRoomPlayer(roomCode, getUsername());
      await subscribeToRoom(roomCode);
      showBanner(`Csatlakoztál a(z) ${roomCode} szobához.`, "ok");
    } catch (error) {
      showBanner(`Csatlakozási hiba: ${error.message}`, "warning");
    }
  }

  async function upsertRoomPlayer(roomCode, username) {
    const payload = {
      room_code: roomCode,
      player_id: state.myPlayerId,
      username,
      last_seen: new Date().toISOString(),
      meta: {}
    };

    const { error } = await state.supabase
      .from("room_players")
      .upsert(payload, { onConflict: "room_code,player_id" });

    if (error) throw error;
  }

  function createBaseRoomState(roomCode) {
    return {
      roomCode,
      phase: "lobby",
      currentPlayerId: null,
      turnIndex: 0,
      players: {},
      log: [`A(z) ${roomCode} szoba létrejött.`],
      deckOrder: [],
      drawIndex: 0,
      availableItemIds: (state.gameData?.items || []).map((item) => item.id),
      overlay: null,
      movement: null,
      rollValue: null,
      rollStartedAt: null,
      rollEndsAt: null,
      pendingAction: null,
      winnerId: null,
      chainDepth: 0
    };
  }

  async function subscribeToRoom(roomCode) {
    cleanupChannels();
    state.roomCode = roomCode;
    refs.roomCodeInput.value = roomCode;
    refs.leaveRoomBtn.classList.remove("hidden");

    state.roomChannel = state.supabase
      .channel(`room-${roomCode}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "rooms",
        filter: `code=eq.${roomCode}`
      }, loadRoomSnapshot)
      .subscribe();

    state.playersChannel = state.supabase
      .channel(`players-${roomCode}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "room_players",
        filter: `room_code=eq.${roomCode}`
      }, loadRoomSnapshot)
      .subscribe();

    await loadRoomSnapshot();
  }

  async function loadRoomSnapshot() {
    if (!state.roomCode || !state.supabase) return;
    const { data: room, error: roomError } = await state.supabase
      .from("rooms")
      .select("*")
      .eq("code", state.roomCode)
      .maybeSingle();

    if (roomError) {
      showBanner(`Szobabetöltési hiba: ${roomError.message}`, "warning");
      return;
    }

    if (!room) {
      state.room = null;
      state.playerRows = [];
      render();
      return;
    }

    const { data: players, error: playersError } = await state.supabase
      .from("room_players")
      .select("*")
      .eq("room_code", state.roomCode)
      .order("joined_at", { ascending: true });

    if (playersError) {
      showBanner(`Játékoslista hiba: ${playersError.message}`, "warning");
      return;
    }

    state.room = room;
    state.playerRows = players || [];
    render();
    scheduleHostAutomation();
  }

  function cleanupChannels() {
    if (state.roomChannel) state.supabase?.removeChannel(state.roomChannel);
    if (state.playersChannel) state.supabase?.removeChannel(state.playersChannel);
    state.roomChannel = null;
    state.playersChannel = null;
    clearTimeout(state.hostTimeout);
  }

  async function leaveRoom() {
    if (!state.roomCode || !state.supabase) {
      resetLocalRoom();
      return;
    }

    try {
      await state.supabase
        .from("room_players")
        .delete()
        .eq("room_code", state.roomCode)
        .eq("player_id", state.myPlayerId);
    } catch (error) {
      console.warn(error);
    }

    cleanupChannels();
    resetLocalRoom();
    render();
    showBanner("Kiléptél a szobából.", "ok");
  }

  function resetLocalRoom() {
    state.room = null;
    state.playerRows = [];
    state.roomCode = null;
    refs.roomCodeLabel.textContent = "—";
    refs.roomStatusLabel.textContent = "Nincs szoba";
    refs.hostLabel.textContent = "—";
    refs.copyCodeBtn.disabled = true;
    refs.startGameBtn.classList.add("hidden");
    refs.leaveRoomBtn.classList.add("hidden");
    refs.overlay.classList.add("hidden");
    refs.overlay.innerHTML = "";
  }

  function isHost() {
    return Boolean(state.room && state.room.host_player_id === state.myPlayerId);
  }

  function buildBoard() {
    if (!state.gameData || !refs.board) return;
    const tilesHtml = state.gameData.fields.map((field) => `
      <div class="board-tile ${field.type}" data-field-id="${field.id}"
           style="left:${field.position.left}%; top:${field.position.top}%;">
        <div class="tile-icon">${getTileIcon(field.type)}</div>
        <div>${field.title}</div>
        <div class="tile-id">#${field.id}</div>
      </div>
    `).join("");
    refs.board.innerHTML = `${tilesHtml}<div id="piecesLayer"></div>`;
    state.boardBuilt = true;
    renderPieces();
  }

  function getTileIcon(type) {
    return {
      start: "🏁",
      shop: "🛒",
      chance: "🃏",
      skip: "⏸️",
      move: "↔️",
      salary: "💸",
      bonus: "🎁",
      tax: "📄",
      penalty: "🔧"
    }[type] || "•";
  }

  function render() {
    const inRoom = Boolean(state.roomCode && state.room);
    refs.roomCodeLabel.textContent = state.roomCode || "—";
    refs.roomStatusLabel.textContent = state.room ? roomStatusLabel(state.room.status) : "Nincs szoba";
    refs.copyCodeBtn.disabled = !state.roomCode;

    const hostPlayer = state.playerRows.find((row) => row.player_id === state.room?.host_player_id);
    refs.hostLabel.textContent = hostPlayer?.username || "—";

    renderLobbyPlayers();

    if (!inRoom || state.room.status === "lobby") {
      refs.lobbyScreen.classList.remove("hidden");
      refs.gameScreen.classList.add("hidden");
      refs.startGameBtn.classList.toggle("hidden", !isHost() || !state.room);
    } else {
      refs.lobbyScreen.classList.add("hidden");
      refs.gameScreen.classList.remove("hidden");
      refs.startGameBtn.classList.add("hidden");
      refs.phaseBadge.textContent = phaseLabels[state.room.state?.phase] || "—";
      renderPlayersPanel();
      renderLog();
      renderTurnInfo();
      renderOverlay();
      renderPieces();
      updateActionButtons();
    }
  }

  function renderLobbyPlayers() {
    refs.lobbyPlayers.innerHTML = "";
    if (!state.playerRows.length) {
      refs.lobbyPlayers.innerHTML = `<div class="muted small">Még nincs játékos a szobában.</div>`;
      return;
    }
    refs.lobbyPlayers.innerHTML = state.playerRows.map((row, index) => `
      <div class="player-card ${row.player_id === state.myPlayerId ? "me" : ""}">
        <div class="player-top">
          <div class="player-name-line">
            <span class="player-badge" style="background:${palette[index % palette.length]}">${initials(row.username)}</span>
            <strong>${escapeHtml(row.username)}</strong>
          </div>
          <div class="small muted">${row.player_id === state.room?.host_player_id ? "Host" : "Játékos"}</div>
        </div>
      </div>
    `).join("");
  }

  async function startGame() {
    if (!isHost() || !state.room || !state.gameData) return;
    const roomPlayers = [...state.playerRows];
    if (roomPlayers.length < Number(state.gameData.settings.minPlayersToStart || 1)) {
      showBanner(`Legalább ${state.gameData.settings.minPlayersToStart || 1} játékos kell az indításhoz.`, "warning");
      return;
    }

    const playersState = {};
    roomPlayers.forEach((row, index) => {
      playersState[row.player_id] = {
        id: row.player_id,
        username: row.username,
        money: state.gameData.settings.startingMoney,
        position: 0,
        itemsOwned: [],
        skipTurns: 0,
        color: palette[index % palette.length]
      };
    });

    const deckOrder = shuffle((state.gameData.cards || []).map((card) => card.id));
    const newState = {
      roomCode: state.roomCode,
      phase: "turn_ready",
      currentPlayerId: roomPlayers[0].player_id,
      turnIndex: 0,
      players: playersState,
      log: [`A játék elindult. ${roomPlayers[0].username} következik.`],
      deckOrder,
      drawIndex: 0,
      availableItemIds: (state.gameData.items || []).map((item) => item.id),
      overlay: null,
      movement: null,
      rollValue: null,
      rollStartedAt: null,
      rollEndsAt: null,
      pendingAction: null,
      winnerId: null,
      chainDepth: 0
    };

    await updateRoom({
      status: "in_game",
      state: newState
    });
  }

  function roomStatusLabel(status) {
    return {
      lobby: "Lobby",
      in_game: "Játékban",
      finished: "Befejezve"
    }[status] || status || "—";
  }

  function renderPlayersPanel() {
    const game = state.room?.state || {};
    const playersState = game.players || {};
    const currentPlayerId = game.currentPlayerId;
    const orderedPlayers = getOrderedPlayerIds().map((playerId) => playersState[playerId]).filter(Boolean);

    if (!orderedPlayers.length) {
      refs.playersPanel.innerHTML = `<div class="muted small">A játékosadatok még nem töltődtek be.</div>`;
      return;
    }

    refs.playersPanel.innerHTML = orderedPlayers.map((player) => {
      const isCurrent = player.id === currentPlayerId;
      const isMe = player.id === state.myPlayerId;
      return `
        <div class="player-card ${isCurrent ? "turn" : ""} ${isMe ? "me" : ""}">
          <div class="player-top">
            <div class="player-name-line">
              <span class="player-badge" style="background:${player.color}">${initials(player.username)}</span>
              <strong>${escapeHtml(player.username)}</strong>
            </div>
            <div class="player-money">${formatMoney(player.money)}</div>
          </div>
          <div class="meta-row">
            <span class="meta-pill">Mező: ${player.position}</span>
            <span class="meta-pill">Kimaradás: ${player.skipTurns}</span>
            <span class="meta-pill">Tárgyak: ${player.itemsOwned.length}/${state.gameData.items.length}</span>
          </div>
          <div class="player-items">
            ${renderOwnedItems(player.itemsOwned)}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderOwnedItems(itemIds) {
    if (!itemIds.length) return `<span class="muted small">Még nincs tárgy.</span>`;
    return itemIds.map((id) => {
      const item = getItemById(id);
      return `<span class="item-pill item-owned">${escapeHtml(item?.name || `Tárgy ${id}`)}</span>`;
    }).join("");
  }

  function renderLog() {
    const log = state.room?.state?.log || [];
    refs.logPanel.innerHTML = log.length
      ? log.slice().reverse().map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`).join("")
      : `<div class="muted small">Még nincs esemény.</div>`;
  }

  function renderTurnInfo() {
    const game = state.room?.state;
    if (!game) {
      refs.turnInfo.textContent = "Várakozás...";
      return;
    }

    const currentPlayer = game.players?.[game.currentPlayerId];
    let message = currentPlayer ? `${currentPlayer.username} következik.` : "Várakozás...";

    switch (game.phase) {
      case "turn_ready":
        message = currentPlayer?.id === state.myPlayerId
          ? "Te jössz. Kattints a kockára!"
          : `${currentPlayer?.username || "Valaki"} dobására várunk.`;
        break;
      case "rolling":
        message = `${currentPlayer?.username || "Valaki"} dob...`;
        break;
      case "moving":
        message = `${game.players?.[game.movement?.playerId]?.username || "Valaki"} lép a pályán...`;
        break;
      case "field_reveal":
        message = "Mező bemutatása...";
        break;
      case "awaiting_card_draw":
        message = game.pendingAction?.playerId === state.myPlayerId
          ? "Kattints a kártyapaklira!"
          : `${game.players?.[game.pendingAction?.playerId]?.username || "Valaki"} kártyát húz.`;
        break;
      case "card_reveal":
        message = "Szerencsekártya felfedése...";
        break;
      case "purchase_decision":
        message = game.pendingAction?.playerId === state.myPlayerId
          ? "Dönts, hogy megveszed-e az ajánlott tárgyat."
          : `${game.players?.[game.pendingAction?.playerId]?.username || "Valaki"} vásárlási döntést hoz.`;
        break;
      case "skip_notice":
        message = `${game.players?.[game.pendingAction?.playerId]?.username || "Valaki"} most kimarad.`;
        break;
      case "game_over":
        message = `${game.players?.[game.winnerId]?.username || "Valaki"} megnyerte a játékot.`;
        break;
      default:
        break;
    }

    refs.turnInfo.textContent = message;
  }

  function updateActionButtons() {
    const game = state.room?.state;
    if (!game) return;
    const canRoll = game.phase === "turn_ready" && game.currentPlayerId === state.myPlayerId;
    const canDraw = game.phase === "awaiting_card_draw" && game.pendingAction?.playerId === state.myPlayerId;
    refs.diceButton.disabled = !canRoll;
    refs.deckButton.disabled = !canDraw;
    refs.diceButton.classList.toggle("is-active", canRoll);
    refs.deckButton.classList.toggle("is-active", canDraw);
  }

  function renderOverlay() {
    const game = state.room?.state;
    if (!game) {
      refs.overlay.classList.add("hidden");
      refs.overlay.innerHTML = "";
      return;
    }

    const phase = game.phase;
    const overlayData = game.overlay || null;

    if (phase === "field_reveal" && overlayData?.fieldId != null) {
      const field = getFieldById(overlayData.fieldId);
      refs.overlay.innerHTML = `
        <div class="overlay-card">
          <div class="overlay-meta">
            <span class="meta-pill">Mező #${field.id}</span>
            <span class="meta-pill">${labelForType(field.type)}</span>
          </div>
          <h2>${escapeHtml(field.title)}</h2>
          <p>${escapeHtml(field.description)}</p>
        </div>
      `;
      refs.overlay.classList.remove("hidden");
      return;
    }

    if (phase === "card_reveal" && overlayData?.cardId != null) {
      const card = getCardById(overlayData.cardId);
      refs.overlay.innerHTML = `
        <div class="overlay-card">
          <div class="overlay-meta"><span class="meta-pill">Szerencsekártya</span></div>
          <h2>${escapeHtml(card.title)}</h2>
          <p>${escapeHtml(card.description)}</p>
        </div>
      `;
      refs.overlay.classList.remove("hidden");
      return;
    }

    if (phase === "purchase_decision") {
      renderPurchaseOverlay();
      return;
    }

    if (phase === "skip_notice") {
      const player = game.players?.[game.pendingAction?.playerId];
      refs.overlay.innerHTML = `
        <div class="overlay-card">
          <div class="overlay-meta"><span class="meta-pill">Kimaradás</span></div>
          <h2>${escapeHtml(player?.username || "Játékos")}</h2>
          <p>${escapeHtml(game.pendingAction?.reason || "Ez a játékos most kimarad.")}</p>
        </div>
      `;
      refs.overlay.classList.remove("hidden");
      return;
    }

    if (phase === "game_over") {
      const winner = game.players?.[game.winnerId];
      refs.overlay.innerHTML = `
        <div class="overlay-card">
          <div class="overlay-meta"><span class="meta-pill">Játék vége</span></div>
          <h2>${escapeHtml(winner?.username || "Győztes")}</h2>
          <p>Ő vásárolta meg leghamarabb az összes tárgyat.</p>
          <div class="overlay-actions">
            <button class="ghost-btn" id="closeOverlayBtn">Maradok nézni</button>
          </div>
        </div>
      `;
      refs.overlay.classList.remove("hidden");
      const btn = document.getElementById("closeOverlayBtn");
      if (btn) btn.onclick = () => refs.overlay.classList.add("hidden");
      return;
    }

    refs.overlay.classList.add("hidden");
    refs.overlay.innerHTML = "";
  }

  function renderPurchaseOverlay() {
    const game = state.room?.state;
    const pending = game.pendingAction || {};
    const player = game.players?.[pending.playerId];
    const canAct = pending.playerId === state.myPlayerId;
    const offeredItemIds = pending.offeredItemIds || (pending.itemId ? [pending.itemId] : []);
    const items = offeredItemIds
      .map((id) => getItemById(id))
      .filter(Boolean)
      .filter((item) => (game.availableItemIds || []).includes(item.id));

    if (!items.length) {
      refs.overlay.innerHTML = `
        <div class="overlay-card">
          <div class="overlay-meta"><span class="meta-pill">Vásárlás</span></div>
          <h2>Nincs elérhető tárgy</h2>
          <p>Az ajánlat közben elfogyott vagy már meg lett véve.</p>
        </div>
      `;
      refs.overlay.classList.remove("hidden");
      return;
    }

    refs.overlay.innerHTML = `
      <div class="overlay-card">
        <div class="overlay-meta">
          <span class="meta-pill">Vásárlási lehetőség</span>
          <span class="meta-pill">${escapeHtml(player?.username || "Játékos")}</span>
        </div>
        <h2>${pending.source === "field" ? "Boltmező" : "Kártyából nyílt vásárlás"}</h2>
        <p>Az alábbi tárgyak közül vehetsz, ha van rá elég pénzed.</p>
        <div class="overlay-item-list">
          ${items.map((item) => `
            <div class="offer-card">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <div class="small muted">${escapeHtml(item.description)}</div>
              </div>
              <div class="stack gap-sm" style="align-items:flex-end">
                <span class="price">${formatMoney(item.price)}</span>
                <button class="${canAct ? "primary-btn" : "ghost-btn"} buy-item-btn" data-item-id="${item.id}" ${(canAct && (player?.money || 0) >= item.price) ? "" : "disabled"}>
                  Megveszem
                </button>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="overlay-actions">
          <button id="skipPurchaseBtn" class="ghost-btn" ${canAct ? "" : "disabled"}>Most nem veszem meg</button>
        </div>
      </div>
    `;
    refs.overlay.classList.remove("hidden");

    refs.overlay.querySelectorAll(".buy-item-btn").forEach((button) => {
      button.addEventListener("click", () => buyItem(Number(button.dataset.itemId)));
    });

    const skipButton = document.getElementById("skipPurchaseBtn");
    if (skipButton) skipButton.onclick = declinePurchase;
  }

  function renderPieces() {
    if (!state.boardBuilt || !state.room || state.room.status === "lobby") return;
    const layer = document.getElementById("piecesLayer");
    if (!layer) return;
    const game = state.room.state || {};
    const playersState = game.players || {};
    const playerIds = Object.keys(playersState);
    const grouped = new Map();

    playerIds.forEach((playerId) => {
      const visualTileId = getVisualTileId(playerId);
      if (!grouped.has(visualTileId)) grouped.set(visualTileId, []);
      grouped.get(visualTileId).push(playerId);
    });

    const html = playerIds.map((playerId) => {
      const player = playersState[playerId];
      const tileGroup = grouped.get(getVisualTileId(playerId)) || [];
      const offsetIndex = tileGroup.indexOf(playerId);
      const pos = getVisualPosition(playerId, offsetIndex);
      if (!pos) return "";
      return `
        <div class="board-piece"
             data-player-id="${playerId}"
             style="left:${pos.left}%; top:${pos.top}%; background:${player.color};">
          ${initials(player.username)}
        </div>
      `;
    }).join("");

    layer.innerHTML = html;
  }

  function renderDynamicsOnly() {
    if (!state.room || state.room.status === "lobby") return;
    animateDiceFace();
    updateMovingPieces();
    renderTurnInfo();
    updateActionButtons();
  }

  function animateDiceFace() {
    const game = state.room?.state;
    if (!game) return;
    if (game.phase === "rolling" && game.rollEndsAt && Date.now() < game.rollEndsAt) {
      const faces = ["⚀","⚁","⚂","⚃","⚄","⚅"];
      refs.diceFace.textContent = faces[Math.floor(Math.random() * faces.length)];
      return;
    }
    const value = Number(game.rollValue);
    refs.diceFace.textContent = value >= 1 && value <= 6
      ? ["⚀","⚁","⚂","⚃","⚄","⚅"][value - 1]
      : "🎲";
  }

  function updateMovingPieces() {
    const game = state.room?.state;
    if (!game) return;
    if (game.phase !== "moving" || !game.movement) return;
    const movingElement = document.querySelector(`.board-piece[data-player-id="${game.movement.playerId}"]`);
    if (!movingElement) {
      renderPieces();
      return;
    }
    const pos = getVisualPosition(game.movement.playerId, 0);
    if (!pos) return;
    movingElement.style.left = `${pos.left}%`;
    movingElement.style.top = `${pos.top}%`;
  }

  function getVisualTileId(playerId) {
    const game = state.room?.state;
    if (!game) return 0;
    if (game.phase === "moving" && game.movement?.playerId === playerId) {
      const movement = game.movement;
      const now = Date.now();
      const elapsed = Math.max(0, now - movement.startedAt);
      const stepFloat = movement.stepMs ? elapsed / movement.stepMs : movement.path.length;
      const stepIndex = Math.min(movement.path.length - 1, Math.max(0, Math.floor(stepFloat)));
      return movement.path[stepIndex] ?? movement.to;
    }
    return game.players?.[playerId]?.position ?? 0;
  }

  function getVisualPosition(playerId, stackIndex = 0) {
    const game = state.room?.state;
    const player = game?.players?.[playerId];
    if (!player) return null;
    const fieldById = new Map((state.gameData?.fields || []).map((field) => [field.id, field]));

    if (game.phase === "moving" && game.movement?.playerId === playerId) {
      const movement = game.movement;
      const now = Date.now();
      const elapsed = Math.max(0, now - movement.startedAt);
      const stepFloat = movement.stepMs ? elapsed / movement.stepMs : movement.path.length;
      const fullIndex = Math.floor(stepFloat);
      const ratio = Math.max(0, Math.min(1, stepFloat - fullIndex));

      const startTileId = fullIndex <= 0 ? movement.from : movement.path[Math.min(fullIndex - 1, movement.path.length - 1)];
      const endTileId = movement.path[Math.min(fullIndex, movement.path.length - 1)] ?? movement.to;

      const startPos = fieldById.get(startTileId)?.position;
      const endPos = fieldById.get(endTileId)?.position;
      if (!startPos || !endPos) return fieldById.get(player.position)?.position || null;

      return {
        left: lerp(startPos.left, endPos.left, ratio),
        top: lerp(startPos.top, endPos.top, ratio)
      };
    }

    const base = fieldById.get(player.position)?.position;
    if (!base) return null;
    const offsets = [
      { left: 0, top: 0 },
      { left: 1.25, top: 1.25 },
      { left: -1.25, top: 1.25 },
      { left: 1.25, top: -1.25 },
      { left: -1.25, top: -1.25 },
      { left: 2.1, top: 0 },
      { left: 0, top: 2.1 },
      { left: -2.1, top: 0 }
    ];
    const offset = offsets[stackIndex % offsets.length];
    return { left: base.left + offset.left, top: base.top + offset.top };
  }

  async function onDiceClick() {
    const game = state.room?.state;
    if (!game || game.phase !== "turn_ready" || game.currentPlayerId !== state.myPlayerId) return;
    const rollValue = 1 + Math.floor(Math.random() * 6);
    const now = Date.now();
    const nextState = cloneState(game);
    nextState.phase = "rolling";
    nextState.rollValue = rollValue;
    nextState.rollStartedAt = now;
    nextState.rollEndsAt = now + state.gameData.settings.diceRollMs;
    nextState.overlay = null;
    nextState.pendingAction = null;
    nextState.chainDepth = 0;
    appendLog(nextState, `${nextState.players[state.myPlayerId].username} dobott: ${rollValue}.`);
    await updateRoom({ state: nextState });
  }

  async function onDeckClick() {
    const game = state.room?.state;
    if (!game || game.phase !== "awaiting_card_draw" || game.pendingAction?.playerId !== state.myPlayerId) return;
    const nextState = cloneState(game);
    if (!Array.isArray(nextState.deckOrder) || !nextState.deckOrder.length || nextState.drawIndex >= nextState.deckOrder.length) {
      nextState.deckOrder = shuffle((state.gameData.cards || []).map((card) => card.id));
      nextState.drawIndex = 0;
    }

    const cardId = nextState.deckOrder[nextState.drawIndex];
    nextState.drawIndex += 1;
    nextState.phase = "card_reveal";
    nextState.overlay = {
      cardId,
      endsAt: Date.now() + state.gameData.settings.cardRevealMs
    };
    nextState.pendingAction = {
      type: "card",
      playerId: state.myPlayerId,
      cardId
    };
    appendLog(nextState, `${nextState.players[state.myPlayerId].username} kártyát húzott.`);
    await updateRoom({ state: nextState });
  }

  async function buyItem(itemId) {
    const game = state.room?.state;
    if (!game || game.phase !== "purchase_decision") return;
    if (game.pendingAction?.playerId !== state.myPlayerId) return;

    const item = getItemById(itemId);
    if (!item) return;

    const nextState = cloneState(game);
    const player = nextState.players[state.myPlayerId];
    if (!nextState.availableItemIds.includes(itemId)) {
      appendLog(nextState, `${player.username} megpróbált egy már elfogyott tárgyat megvenni.`);
      await finalizeTurnFromState(nextState);
      return;
    }

    if (player.money < item.price) {
      appendLog(nextState, `${player.username} nem tudta megvenni ezt: ${item.name} (nincs elég pénz).`);
      await updateRoom({ state: nextState });
      return;
    }

    player.money -= item.price;
    player.itemsOwned.push(item.id);
    nextState.availableItemIds = nextState.availableItemIds.filter((id) => id !== item.id);
    appendLog(nextState, `${player.username} megvette: ${item.name} (${formatMoney(item.price)}).`);
    nextState.pendingAction = null;
    nextState.overlay = null;

    if (player.itemsOwned.length >= state.gameData.items.length) {
      nextState.phase = "game_over";
      nextState.winnerId = player.id;
      appendLog(nextState, `${player.username} megszerezte az összes tárgyat és megnyerte a játékot!`);
      await updateRoom({ status: "finished", state: nextState });
      return;
    }

    await finalizeTurnFromState(nextState);
  }

  async function declinePurchase() {
    const game = state.room?.state;
    if (!game || game.phase !== "purchase_decision" || game.pendingAction?.playerId !== state.myPlayerId) return;
    const nextState = cloneState(game);
    const player = nextState.players[state.myPlayerId];
    appendLog(nextState, `${player.username} most nem vásárolt.`);
    nextState.pendingAction = null;
    nextState.overlay = null;
    await finalizeTurnFromState(nextState);
  }

  function getOrderedPlayerIds() {
    const rowsOrder = state.playerRows.map((row) => row.player_id);
    const statePlayerIds = Object.keys(state.room?.state?.players || {});
    return rowsOrder.filter((id) => statePlayerIds.includes(id));
  }

  function scheduleHostAutomation() {
    clearTimeout(state.hostTimeout);
    if (!isHost() || !state.room || state.room.status === "lobby" || state.room.status === "finished") return;
    const game = state.room.state || {};
    const now = Date.now();

    switch (game.phase) {
      case "turn_ready":
        maybeHandleSkipTurn();
        break;
      case "rolling":
        state.hostTimeout = setTimeout(beginMovementFromRoll, Math.max(0, (game.rollEndsAt || now) - now + 40));
        break;
      case "moving":
        state.hostTimeout = setTimeout(finalizeMovement, Math.max(0, (game.movement?.endsAt || now) - now + 40));
        break;
      case "field_reveal":
        state.hostTimeout = setTimeout(resolveFieldAfterReveal, Math.max(0, (game.overlay?.endsAt || now) - now + 40));
        break;
      case "card_reveal":
        state.hostTimeout = setTimeout(resolveCardAfterReveal, Math.max(0, (game.overlay?.endsAt || now) - now + 40));
        break;
      case "skip_notice":
        state.hostTimeout = setTimeout(async () => {
          const nextState = cloneState(state.room.state);
          nextState.overlay = null;
          nextState.pendingAction = null;
          await advanceTurn(nextState);
        }, Math.max(0, (game.overlay?.endsAt || now) - now + 40));
        break;
      default:
        break;
    }
  }

  async function maybeHandleSkipTurn() {
    const game = state.room?.state;
    if (!game || game.phase !== "turn_ready") return;
    const player = game.players?.[game.currentPlayerId];
    if (!player || player.skipTurns <= 0) return;

    const nextState = cloneState(game);
    nextState.players[player.id].skipTurns = Math.max(0, nextState.players[player.id].skipTurns - 1);
    nextState.phase = "skip_notice";
    nextState.pendingAction = {
      type: "skip_notice",
      playerId: player.id,
      reason: `${player.username} kimarad ebből a körből.`
    };
    nextState.overlay = {
      endsAt: Date.now() + 1800
    };
    appendLog(nextState, `${player.username} automatikusan kimarad ebből a körből.`);
    await updateRoom({ state: nextState });
  }

  async function beginMovementFromRoll() {
    const game = state.room?.state;
    if (!game || game.phase !== "rolling") return;
    const player = game.players?.[game.currentPlayerId];
    if (!player) return;
    await startMovement(game, player.id, Number(game.rollValue) || 0, 0);
  }

  async function startMovement(currentState, playerId, steps, chainDepth = 0) {
    if (!currentState || !playerId || !steps) {
      const nextState = cloneState(currentState);
      await finalizeTurnFromState(nextState);
      return;
    }

    const nextState = cloneState(currentState);
    const player = nextState.players[playerId];
    const boardSize = state.gameData.fields.length;
    const path = [];
    let cursor = player.position;
    let passes = 0;
    const direction = steps > 0 ? 1 : -1;

    for (let i = 0; i < Math.abs(steps); i += 1) {
      const prev = cursor;
      cursor = mod(cursor + direction, boardSize);
      if (direction > 0 && cursor < prev) passes += 1;
      path.push(cursor);
    }

    const now = Date.now();
    nextState.phase = "moving";
    nextState.overlay = null;
    nextState.pendingAction = null;
    nextState.movement = {
      playerId,
      from: player.position,
      to: cursor,
      path,
      passes,
      startedAt: now,
      stepMs: state.gameData.settings.stepMoveMs,
      endsAt: now + (path.length * state.gameData.settings.stepMoveMs) + 60,
      chainDepth
    };
    await updateRoom({ state: nextState });
  }

  async function finalizeMovement() {
    const game = state.room?.state;
    if (!game || game.phase !== "moving" || !game.movement) return;
    const nextState = cloneState(game);
    const movement = nextState.movement;
    const player = nextState.players[movement.playerId];

    player.position = movement.to;

    if (movement.passes > 0) {
      const passReward = movement.passes * state.gameData.settings.passStartMoney;
      player.money += passReward;
      appendLog(nextState, `${player.username} áthaladt a starton és kapott ${formatMoney(passReward)} összeget.`);
    }

    if (movement.to === 0) {
      player.money += state.gameData.settings.landStartMoney;
      appendLog(nextState, `${player.username} a startmezőre érkezett és kapott ${formatMoney(state.gameData.settings.landStartMoney)} összeget.`);
    }

    const landedField = getFieldById(movement.to);
    nextState.movement = null;
    nextState.phase = "field_reveal";
    nextState.overlay = {
      fieldId: landedField.id,
      endsAt: Date.now() + state.gameData.settings.fieldRevealMs
    };
    nextState.chainDepth = movement.chainDepth || 0;
    await updateRoom({ state: nextState });
  }

  async function resolveFieldAfterReveal() {
    const game = state.room?.state;
    if (!game || game.phase !== "field_reveal" || game.overlay?.fieldId == null) return;
    const nextState = cloneState(game);
    const player = nextState.players[nextState.currentPlayerId];
    const field = getFieldById(nextState.overlay.fieldId);

    nextState.overlay = null;

    if (!field) {
      await finalizeTurnFromState(nextState);
      return;
    }

    await applyEffectsFromSource(nextState, player.id, field.effects || [], "field", field);
  }

  async function resolveCardAfterReveal() {
    const game = state.room?.state;
    if (!game || game.phase !== "card_reveal" || !game.pendingAction?.cardId) return;
    const nextState = cloneState(game);
    const playerId = nextState.pendingAction.playerId;
    const card = getCardById(nextState.pendingAction.cardId);
    nextState.overlay = null;
    await applyEffectsFromSource(nextState, playerId, card?.effects || [], "card", card);
  }

  async function applyEffectsFromSource(nextState, playerId, effects, sourceType, sourceObject) {
    const player = nextState.players[playerId];
    for (const effect of effects) {
      if (effect.kind === "start") {
        continue;
      }

      if (effect.kind === "money") {
        player.money += Number(effect.amount) || 0;
        appendLog(nextState, `${player.username} pénze változott: ${formatMoney(effect.amount)}.`);
        continue;
      }

      if (effect.kind === "skip") {
        player.skipTurns += Number(effect.turns) || 1;
        appendLog(nextState, `${player.username} ${effect.turns || 1} körből kimarad.`);
        continue;
      }

      if (effect.kind === "draw_card") {
        nextState.phase = "awaiting_card_draw";
        nextState.pendingAction = {
          type: "draw_card",
          playerId
        };
        appendLog(nextState, `${player.username} a paklihoz léphet kártyát húzni.`);
        await updateRoom({ state: nextState });
        return;
      }

      if (effect.kind === "shop") {
        if (!nextState.availableItemIds.includes(effect.itemId)) {
          appendLog(nextState, `${player.username} boltmezőre lépett, de a tárgy már elfogyott.`);
          continue;
        }
        nextState.phase = "purchase_decision";
        nextState.pendingAction = {
          type: "purchase",
          source: sourceType,
          playerId,
          itemId: effect.itemId,
          offeredItemIds: [effect.itemId]
        };
        appendLog(nextState, `${player.username} vásárlási lehetőséget kapott.`);
        await updateRoom({ state: nextState });
        return;
      }

      if (effect.kind === "card_shop") {
        const eligible = getEligibleItems(nextState.availableItemIds || [], effect.tier);
        if (!eligible.length) {
          appendLog(nextState, `${player.username} kapott vásárlási lehetőséget, de nincs már elérhető tárgy ebben a kategóriában.`);
          continue;
        }
        nextState.phase = "purchase_decision";
        nextState.pendingAction = {
          type: "purchase",
          source: sourceType,
          playerId,
          offeredItemIds: eligible.map((item) => item.id)
        };
        appendLog(nextState, `${player.username} kártyából vásárlási lehetőséget kapott.`);
        await updateRoom({ state: nextState });
        return;
      }

      if (effect.kind === "move") {
        const depth = Number(nextState.chainDepth || 0) + 1;
        if (depth > 5) {
          appendLog(nextState, "Túl sok egymás utáni mozgás lett volna, ezért a lánc megállt.");
          continue;
        }
        nextState.chainDepth = depth;
        appendLog(nextState, `${player.username} további ${effect.steps > 0 ? "+" : ""}${effect.steps} mezőt mozog.`);
        await startMovement(nextState, playerId, Number(effect.steps) || 0, depth);
        return;
      }
    }

    await finalizeTurnFromState(nextState);
  }

  function getEligibleItems(availableItemIds, tier) {
    const available = (state.gameData.items || []).filter((item) => availableItemIds.includes(item.id));
    if (tier === "cheap") return available.filter((item) => item.price <= 900);
    if (tier === "expensive") return available.filter((item) => item.price > 900);
    return available;
  }

  async function finalizeTurnFromState(nextState) {
    nextState.overlay = null;
    nextState.pendingAction = null;
    nextState.phase = "turn_ready";
    await advanceTurn(nextState);
  }

  async function advanceTurn(nextState) {
    const orderedPlayerIds = getOrderedPlayerIds().filter((id) => nextState.players[id]);
    if (!orderedPlayerIds.length) return;

    const currentIndex = orderedPlayerIds.indexOf(nextState.currentPlayerId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % orderedPlayerIds.length : 0;
    nextState.turnIndex = nextIndex;
    nextState.currentPlayerId = orderedPlayerIds[nextIndex];
    nextState.phase = "turn_ready";
    nextState.rollValue = null;
    nextState.rollEndsAt = null;
    nextState.rollStartedAt = null;
    nextState.chainDepth = 0;
    appendLog(nextState, `${nextState.players[nextState.currentPlayerId].username} következik.`);
    await updateRoom({ state: nextState });
  }

  async function updateRoom(patch) {
    if (!state.supabase || !state.roomCode) return;
    const payload = {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.state ? { state: patch.state } : {}),
      updated_at: new Date().toISOString()
    };

    const { error } = await state.supabase
      .from("rooms")
      .update(payload)
      .eq("code", state.roomCode);

    if (error) {
      showBanner(`Mentési hiba: ${error.message}`, "warning");
      throw error;
    }
  }

  function getFieldById(id) {
    return (state.gameData?.fields || []).find((field) => Number(field.id) === Number(id));
  }

  function getItemById(id) {
    return (state.gameData?.items || []).find((item) => Number(item.id) === Number(id));
  }

  function getCardById(id) {
    return (state.gameData?.cards || []).find((card) => Number(card.id) === Number(id));
  }

  function labelForType(type) {
    return {
      start: "Start",
      shop: "Bolt",
      chance: "Szerencsekártya",
      skip: "Kimaradás",
      move: "Mozgás",
      salary: "Bevétel",
      bonus: "Bónusz",
      tax: "Befizetés",
      penalty: "Kiadás"
    }[type] || type;
  }

  function cloneState(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function appendLog(gameState, message) {
    if (!gameState.log) gameState.log = [];
    const stamped = `${new Date().toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — ${message}`;
    gameState.log.push(stamped);
    if (gameState.log.length > 80) gameState.log = gameState.log.slice(-80);
  }

  function copyRoomCode() {
    if (!state.roomCode) return;
    navigator.clipboard?.writeText(state.roomCode);
  }

  function initials(text) {
    return String(text || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatMoney(amount) {
    const num = Number(amount) || 0;
    const sign = num > 0 ? "+" : "";
    return `${sign}${num.toLocaleString("hu-HU")} ${state.gameData?.settings?.currency || "Ft"}`;
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function mod(value, base) {
    return ((value % base) + base) % base;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
})();
