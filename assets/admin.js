(() => {
  const refs = {};
  const state = {
    data: null,
    tab: "settings",
    githubSha: null,
    selectedFieldId: 0,
    dragFieldId: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheRefs();
    bindUi();
    loadGitHubConfig();
    await loadLocalData();
  }

  function cacheRefs() {
    [
      "adminBanner","ghOwner","ghRepo","ghBranch","ghPath","ghToken",
      "loadLocalBtn","loadGithubBtn","saveGithubBtn","exportBtn","importBtn",
      "importInput","statsBox","tabRow","adminContent"
    ].forEach((id) => refs[id] = document.getElementById(id));
  }

  function bindUi() {
    refs.loadLocalBtn.addEventListener("click", loadLocalData);
    refs.loadGithubBtn.addEventListener("click", loadFromGitHub);
    refs.saveGithubBtn.addEventListener("click", saveToGitHub);
    refs.exportBtn.addEventListener("click", exportJson);
    refs.importBtn.addEventListener("click", () => refs.importInput.click());
    refs.importInput.addEventListener("change", importJsonFile);
    refs.tabRow.addEventListener("click", (event) => {
      const button = event.target.closest(".tab-btn");
      if (!button) return;
      state.tab = button.dataset.tab;
      refs.tabRow.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn === button));
      render();
    });

    ["ghOwner","ghRepo","ghBranch","ghPath","ghToken"].forEach((id) => {
      refs[id].addEventListener("change", persistGitHubConfig);
    });
  }

  async function loadLocalData() {
    try {
      const response = await fetch("./data/game-data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Nem érhető el a helyi game-data.json.");
      state.data = await response.json();
      state.githubSha = null;
      showBanner("Helyi JSON betöltve.", "ok");
      render();
    } catch (error) {
      showBanner(`Hiba: ${error.message}`, "warning");
    }
  }

  async function loadFromGitHub() {
    const cfg = getGitHubConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      showBanner("Add meg a GitHub owner, repo és token mezőket.", "warning");
      return;
    }

    try {
      const result = await window.GitHubRepoApi.getFile(cfg);
      state.data = JSON.parse(result.content);
      state.githubSha = result.sha;
      showBanner("GitHubról sikeresen betöltve.", "ok");
      render();
    } catch (error) {
      showBanner(`GitHub betöltési hiba: ${error.message}`, "warning");
    }
  }

  async function saveToGitHub() {
    if (!state.data) return;
    const cfg = getGitHubConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      showBanner("Add meg a GitHub owner, repo és token mezőket.", "warning");
      return;
    }

    try {
      if (!state.githubSha) {
        try {
          const remote = await window.GitHubRepoApi.getFile(cfg);
          state.githubSha = remote.sha;
        } catch (error) {
          state.githubSha = null;
        }
      }

      const response = await window.GitHubRepoApi.upsertFile({
        ...cfg,
        sha: state.githubSha,
        message: `Admin mentés – ${new Date().toLocaleString("hu-HU")}`,
        content: JSON.stringify(state.data, null, 2)
      });

      state.githubSha = response.content?.sha || response.commit?.sha || state.githubSha;
      showBanner("Sikeres GitHub mentés.", "ok");
    } catch (error) {
      showBanner(`GitHub mentési hiba: ${error.message}`, "warning");
    }
  }

  function getGitHubConfig() {
    return {
      owner: refs.ghOwner.value.trim(),
      repo: refs.ghRepo.value.trim(),
      branch: refs.ghBranch.value.trim() || "main",
      path: refs.ghPath.value.trim() || "data/game-data.json",
      token: refs.ghToken.value.trim()
    };
  }

  function persistGitHubConfig() {
    const payload = {
      owner: refs.ghOwner.value.trim(),
      repo: refs.ghRepo.value.trim(),
      branch: refs.ghBranch.value.trim(),
      path: refs.ghPath.value.trim(),
      token: refs.ghToken.value.trim()
    };
    localStorage.setItem("go_admin_github", JSON.stringify(payload));
  }

  function loadGitHubConfig() {
    const raw = localStorage.getItem("go_admin_github");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      refs.ghOwner.value = data.owner || "";
      refs.ghRepo.value = data.repo || "";
      refs.ghBranch.value = data.branch || "main";
      refs.ghPath.value = data.path || "data/game-data.json";
      refs.ghToken.value = data.token || "";
    } catch (error) {
      console.warn(error);
    }
  }

  function exportJson() {
    if (!state.data) return;
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "game-data.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      state.data = JSON.parse(text);
      showBanner("JSON import kész.", "ok");
      render();
    } catch (error) {
      showBanner(`Import hiba: ${error.message}`, "warning");
    } finally {
      refs.importInput.value = "";
    }
  }

  function showBanner(message, tone = "warning") {
    refs.adminBanner.textContent = message;
    refs.adminBanner.className = `status-banner ${tone}`;
    refs.adminBanner.classList.remove("hidden");
  }

  function render() {
    renderStats();
    switch (state.tab) {
      case "settings":
        renderSettingsTab();
        break;
      case "items":
        renderItemsTab();
        break;
      case "cards":
        renderCardsTab();
        break;
      case "fields":
        renderFieldsTab();
        break;
      case "board":
        renderBoardTab();
        break;
      case "json":
        renderJsonTab();
        break;
      default:
        renderSettingsTab();
        break;
    }
  }

  function renderStats() {
    const data = state.data;
    if (!data) {
      refs.statsBox.innerHTML = `<div class="muted">Nincs adat.</div>`;
      return;
    }
    refs.statsBox.innerHTML = `
      <div>Verzió: <strong>${escapeHtml(String(data.meta?.version ?? "—"))}</strong></div>
      <div>Mezők: <strong>${data.fields?.length || 0}</strong></div>
      <div>Kártyák: <strong>${data.cards?.length || 0}</strong></div>
      <div>Tárgyak: <strong>${data.items?.length || 0}</strong></div>
      <div>Kezdőpénz: <strong>${Number(data.settings?.startingMoney || 0).toLocaleString("hu-HU")} ${escapeHtml(data.settings?.currency || "Ft")}</strong></div>
    `;
  }

  function renderSettingsTab() {
    const s = state.data.settings;
    refs.adminContent.innerHTML = `
      <h2 style="margin-top:0;">Globális beállítások</h2>
      <div class="settings-grid">
        ${renderSettingInput("Pénznem","currency",s.currency,"text")}
        ${renderSettingInput("Kezdőpénz","startingMoney",s.startingMoney,"number")}
        ${renderSettingInput("Starton áthaladás pénze","passStartMoney",s.passStartMoney,"number")}
        ${renderSettingInput("Startra érkezés pénze","landStartMoney",s.landStartMoney,"number")}
        ${renderSettingInput("Mező megjelenési idő (ms)","fieldRevealMs",s.fieldRevealMs,"number")}
        ${renderSettingInput("Kártya megjelenési idő (ms)","cardRevealMs",s.cardRevealMs,"number")}
        ${renderSettingInput("Kockadobás animáció (ms)","diceRollMs",s.diceRollMs,"number")}
        ${renderSettingInput("Lépésenkénti mozgás (ms)","stepMoveMs",s.stepMoveMs,"number")}
        ${renderSettingInput("Körváltás késleltetés (ms)","autoNextDelayMs",s.autoNextDelayMs,"number")}
        ${renderSettingInput("Min. játékos a startnál","minPlayersToStart",s.minPlayersToStart,"number")}
        ${renderSettingInput("Asztali mezőméret","boardTileSizeDesktop",s.boardTileSizeDesktop,"number")}
        ${renderSettingInput("Mobil mezőméret","boardTileSizeMobile",s.boardTileSizeMobile,"number")}
      </div>
    `;
    refs.adminContent.querySelectorAll("[data-setting-key]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.settingKey;
        state.data.settings[key] = input.type === "number" ? Number(input.value) : input.value;
      });
    });
  }

  function renderSettingInput(label, key, value, type) {
    return `
      <label class="input-group">
        <span>${label}</span>
        <input data-setting-key="${key}" type="${type}" value="${escapeHtml(String(value ?? ""))}">
      </label>
    `;
  }

  function renderItemsTab() {
    refs.adminContent.innerHTML = `
      <div class="player-top" style="margin-bottom:12px;">
        <div>
          <h2 style="margin:0;">Tárgyak</h2>
          <p class="muted small" style="margin:.35rem 0 0 0;">Ezeket kell megvenni a győzelemhez.</p>
        </div>
        <button id="addItemBtn" class="primary-btn">Új tárgy</button>
      </div>
      <div class="collection-grid">
        ${state.data.items.map((item, index) => `
          <div class="editor-card" data-item-index="${index}">
            <h4>${escapeHtml(item.name)}</h4>
            <div class="editor-form">
              <input data-field="name" type="text" value="${escapeHtml(item.name)}" placeholder="Név">
              <input data-field="price" type="number" value="${Number(item.price)}" placeholder="Ár">
              <textarea data-field="description" placeholder="Leírás">${escapeHtml(item.description || "")}</textarea>
              <div class="inline-two">
                <input data-field="key" type="text" value="${escapeHtml(item.key || "")}" placeholder="Kulcs">
                <input data-field="id" type="number" value="${Number(item.id)}" placeholder="ID">
              </div>
              <button class="danger-btn delete-item-btn">Tárgy törlése</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    document.getElementById("addItemBtn").onclick = () => {
      state.data.items.push({
        id: nextId(state.data.items),
        key: `uj_targy_${Date.now()}`,
        name: "Új tárgy",
        price: 500,
        description: "Új tárgy leírása."
      });
      render();
    };

    refs.adminContent.querySelectorAll("[data-item-index]").forEach((card) => {
      const index = Number(card.dataset.itemIndex);
      card.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.field;
          state.data.items[index][key] = input.type === "number" ? Number(input.value) : input.value;
        });
      });
      card.querySelector(".delete-item-btn").onclick = () => {
        state.data.items.splice(index, 1);
        render();
      };
    });
  }

  function renderCardsTab() {
    refs.adminContent.innerHTML = `
      <div class="player-top" style="margin-bottom:12px;">
        <div>
          <h2 style="margin:0;">Kártyák</h2>
          <p class="muted small" style="margin:.35rem 0 0 0;">Az effektet JSON tömbként tudod a legszabadabban szerkeszteni.</p>
        </div>
        <button id="addCardBtn" class="primary-btn">Új kártya</button>
      </div>
      <div class="collection-grid">
        ${state.data.cards.map((card, index) => `
          <div class="editor-card" data-card-index="${index}">
            <h4>${escapeHtml(card.title)}</h4>
            <div class="editor-form">
              <input data-field="title" type="text" value="${escapeHtml(card.title)}" placeholder="Cím">
              <textarea data-field="description" placeholder="Leírás">${escapeHtml(card.description || "")}</textarea>
              <textarea data-field="effects">${escapeHtml(JSON.stringify(card.effects || [], null, 2))}</textarea>
              <div class="inline-two">
                <input data-field="id" type="number" value="${Number(card.id)}" placeholder="ID">
                <div class="small muted" style="align-self:center;">Példa effekt: [{"kind":"money","amount":300}]</div>
              </div>
              <button class="danger-btn delete-card-btn">Kártya törlése</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    document.getElementById("addCardBtn").onclick = () => {
      state.data.cards.push({
        id: nextId(state.data.cards),
        title: "Új kártya",
        description: "Új kártya leírása.",
        effects: [{ kind: "money", amount: 100 }]
      });
      render();
    };

    refs.adminContent.querySelectorAll("[data-card-index]").forEach((cardEl) => {
      const index = Number(cardEl.dataset.cardIndex);
      cardEl.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.field;
          if (key === "effects") {
            try {
              state.data.cards[index].effects = JSON.parse(input.value);
              input.style.borderColor = "rgba(79,209,139,.35)";
            } catch (error) {
              input.style.borderColor = "rgba(255,109,122,.45)";
            }
            return;
          }
          state.data.cards[index][key] = input.type === "number" ? Number(input.value) : input.value;
        });
      });
      cardEl.querySelector(".delete-card-btn").onclick = () => {
        state.data.cards.splice(index, 1);
        render();
      };
    });
  }

  function renderFieldsTab() {
    refs.adminContent.innerHTML = `
      <div class="player-top" style="margin-bottom:12px;">
        <div>
          <h2 style="margin:0;">Mezők</h2>
          <p class="muted small" style="margin:.35rem 0 0 0;">Itt a mező funkcióit és leírását állítod. Pozíciót a pályaeditorban húzgálj.</p>
        </div>
        <button id="addFieldBtn" class="primary-btn">Új mező</button>
      </div>
      <div class="collection-grid">
        ${state.data.fields.map((field, index) => `
          <div class="editor-card" data-field-index="${index}">
            <h4>#${field.id} – ${escapeHtml(field.title)}</h4>
            <div class="editor-form">
              <input data-field="title" type="text" value="${escapeHtml(field.title)}" placeholder="Mező neve">
              <select data-field="type">
                ${["start","shop","chance","skip","move","salary","bonus","tax","penalty"].map((type) => `
                  <option value="${type}" ${field.type === type ? "selected" : ""}>${type}</option>
                `).join("")}
              </select>
              <textarea data-field="description">${escapeHtml(field.description || "")}</textarea>
              <textarea data-field="effects">${escapeHtml(JSON.stringify(field.effects || [], null, 2))}</textarea>
              <div class="inline-two">
                <input data-field="id" type="number" value="${Number(field.id)}" placeholder="ID">
                <div class="small muted" style="align-self:center;">Pozíció: ${Number(field.position.left).toFixed(2)}% / ${Number(field.position.top).toFixed(2)}%</div>
              </div>
              <button class="danger-btn delete-field-btn">Mező törlése</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    document.getElementById("addFieldBtn").onclick = () => {
      state.data.fields.push({
        id: nextId(state.data.fields),
        type: "bonus",
        title: "Új mező",
        description: "Új mező leírása.",
        effects: [{ kind: "money", amount: 100 }],
        position: { left: 50, top: 50 }
      });
      render();
    };

    refs.adminContent.querySelectorAll("[data-field-index]").forEach((fieldEl) => {
      const index = Number(fieldEl.dataset.fieldIndex);
      fieldEl.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.field;
          if (key === "effects") {
            try {
              state.data.fields[index].effects = JSON.parse(input.value);
              input.style.borderColor = "rgba(79,209,139,.35)";
            } catch (error) {
              input.style.borderColor = "rgba(255,109,122,.45)";
            }
            return;
          }
          state.data.fields[index][key] = input.type === "number" ? Number(input.value) : input.value;
        });
      });
      fieldEl.querySelector(".delete-field-btn").onclick = () => {
        state.data.fields.splice(index, 1);
        render();
      };
    });
  }

  function renderBoardTab() {
    const selected = state.data.fields.find((field) => Number(field.id) === Number(state.selectedFieldId)) || state.data.fields[0];
    if (selected) state.selectedFieldId = selected.id;

    refs.adminContent.innerHTML = `
      <div class="player-top" style="margin-bottom:12px;">
        <div>
          <h2 style="margin:0;">Pályaeditor</h2>
          <p class="muted small" style="margin:.35rem 0 0 0;">Húzd a mezőket, és rögtön átíródik a százalékos pozíciójuk.</p>
        </div>
      </div>

      <div class="board-help">
        <div class="small muted">Kattints egy mezőre a kiválasztáshoz, majd húzd arrébb.</div>
        <div class="small muted">Kijelölt mező: <strong>#${selected?.id ?? "—"} ${escapeHtml(selected?.title || "")}</strong></div>
      </div>

      <div class="inline-two" style="align-items:start;">
        <div class="board-editor" id="boardEditor">
          ${state.data.fields.map((field) => `
            <div class="board-editor-tile ${Number(field.id) === Number(state.selectedFieldId) ? "selected" : ""}"
                 data-field-id="${field.id}"
                 style="left:${field.position.left}%; top:${field.position.top}%;">
              ${field.id}
            </div>
          `).join("")}
        </div>

        <div class="editor-card">
          <h4>Kijelölt mező szerkesztése</h4>
          <div class="editor-form">
            <input id="selectedFieldTitle" type="text" value="${escapeHtml(selected?.title || "")}" placeholder="Név">
            <textarea id="selectedFieldDesc">${escapeHtml(selected?.description || "")}</textarea>
            <div class="inline-two">
              <label class="input-group">
                <span>Bal (%)</span>
                <input id="selectedFieldLeft" type="number" min="0" max="100" step="0.1" value="${Number(selected?.position.left || 0)}">
              </label>
              <label class="input-group">
                <span>Fent (%)</span>
                <input id="selectedFieldTop" type="number" min="0" max="100" step="0.1" value="${Number(selected?.position.top || 0)}">
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    const boardEditor = document.getElementById("boardEditor");
    boardEditor.querySelectorAll(".board-editor-tile").forEach((tile) => {
      tile.addEventListener("pointerdown", (event) => {
        state.dragFieldId = Number(tile.dataset.fieldId);
        state.selectedFieldId = state.dragFieldId;
        tile.setPointerCapture(event.pointerId);
      });
      tile.addEventListener("pointermove", (event) => {
        if (state.dragFieldId !== Number(tile.dataset.fieldId)) return;
        const rect = boardEditor.getBoundingClientRect();
        const left = clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98);
        const top = clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98);
        const field = state.data.fields.find((entry) => Number(entry.id) === Number(tile.dataset.fieldId));
        if (!field) return;
        field.position.left = round2(left);
        field.position.top = round2(top);
        tile.style.left = `${field.position.left}%`;
        tile.style.top = `${field.position.top}%`;
        syncSelectedBoardInputs(field);
      });
      tile.addEventListener("pointerup", () => {
        state.dragFieldId = null;
        render();
      });
      tile.addEventListener("click", () => {
        state.selectedFieldId = Number(tile.dataset.fieldId);
        render();
      });
    });

    const titleInput = document.getElementById("selectedFieldTitle");
    const descInput = document.getElementById("selectedFieldDesc");
    const leftInput = document.getElementById("selectedFieldLeft");
    const topInput = document.getElementById("selectedFieldTop");
    if (selected) {
      titleInput.addEventListener("input", () => {
        selected.title = titleInput.value;
      });
      descInput.addEventListener("input", () => {
        selected.description = descInput.value;
      });
      leftInput.addEventListener("input", () => {
        selected.position.left = round2(clamp(Number(leftInput.value), 0, 100));
        render();
      });
      topInput.addEventListener("input", () => {
        selected.position.top = round2(clamp(Number(topInput.value), 0, 100));
        render();
      });
    }
  }

  function syncSelectedBoardInputs(field) {
    const leftInput = document.getElementById("selectedFieldLeft");
    const topInput = document.getElementById("selectedFieldTop");
    if (leftInput) leftInput.value = String(field.position.left);
    if (topInput) topInput.value = String(field.position.top);
  }

  function renderJsonTab() {
    refs.adminContent.innerHTML = `
      <div class="player-top" style="margin-bottom:12px;">
        <div>
          <h2 style="margin:0;">Nyers JSON</h2>
          <p class="muted small" style="margin:.35rem 0 0 0;">Itt tényleg mindent át tudsz írni egyszerre.</p>
        </div>
        <button id="applyJsonBtn" class="primary-btn">JSON alkalmazása</button>
      </div>
      <textarea id="jsonEditor" class="json-editor">${escapeHtml(JSON.stringify(state.data, null, 2))}</textarea>
    `;
    document.getElementById("applyJsonBtn").onclick = () => {
      const editor = document.getElementById("jsonEditor");
      try {
        state.data = JSON.parse(editor.value);
        showBanner("A nyers JSON sikeresen alkalmazva.", "ok");
        render();
      } catch (error) {
        showBanner(`JSON hiba: ${error.message}`, "warning");
      }
    };
  }

  function nextId(collection) {
    return Math.max(0, ...collection.map((item) => Number(item.id) || 0)) + 1;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
