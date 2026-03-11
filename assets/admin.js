(() => {
  const refs = {};
  const state = {
    data: null,
    tab: "settings",
    githubSha: null,
    selectedItemId: null,
    selectedCardId: null,
    selectedFieldId: null,
    dragFieldId: null,
  };

  const fieldTypeOptions = [
    { value: "start", label: "Start" },
    { value: "shop", label: "Bolt" },
    { value: "chance", label: "Szerencsekártya" },
    { value: "skip", label: "Kimaradás" },
    { value: "move", label: "Mozgás" },
    { value: "salary", label: "Bevétel" },
    { value: "bonus", label: "Bónusz" },
    { value: "tax", label: "Befizetés" },
    { value: "penalty", label: "Kiadás" }
  ];

  const settingLabels = {
    currency: { label: "Pénznem", help: "Mi jelenjen meg az összegek után." },
    startingMoney: { label: "Kezdő pénz", help: "Mennyi pénzzel indul minden játékos." },
    passStartMoney: { label: "Starton áthaladás pénze", help: "Ennyit kap a játékos, amikor áthalad a starton." },
    landStartMoney: { label: "Startra érkezés pénze", help: "Extra jutalom, ha pontosan a startmezőre érkezik." },
    fieldRevealMs: { label: "Mező felfedés ideje (ms)", help: "Ennyi ideig látszik nagyban a mező." },
    cardRevealMs: { label: "Kártya felfedés ideje (ms)", help: "Ennyi ideig látszik nagyban a kihúzott kártya." },
    diceRollMs: { label: "Dobás animáció ideje (ms)", help: "Amíg ez tart, a bábu még nem indul el." },
    stepMoveMs: { label: "Egy lépés animáció ideje (ms)", help: "Ennyi idő alatt megy végig egy mezőn a bábu." },
    autoNextDelayMs: { label: "Automata várakozás (ms)", help: "Két esemény közt ennyit vár a rendszer." },
    minPlayersToStart: { label: "Minimum játékos az induláshoz", help: "Ennyi ember kell a Játék indítása gombhoz." },
    winCondition: { label: "Győzelmi feltétel", help: "Jelenleg azt támogatja a játék, hogy valaki megszerezze az összes tárgyat." },
    boardTileSizeDesktop: { label: "Mezőméret asztali nézetben", help: "A pályán látható mezők mérete desktopon." },
    boardTileSizeMobile: { label: "Mezőméret mobilon", help: "A pályán látható mezők mérete telón." }
  };

  const metaLabels = {
    title: { label: "Játék címe", help: "Belső megnevezés vagy megjelenített cím." },
    version: { label: "Verzió", help: "Pl. 1.0.0 vagy saját jelölés." },
    description: { label: "Leírás", help: "Rövid összefoglaló az aktuális csomagról." }
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
      state.data = normalizeData(await response.json());
      state.githubSha = null;
      ensureSelections();
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
      state.data = normalizeData(JSON.parse(result.content));
      state.githubSha = result.sha;
      ensureSelections();
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

      const payload = JSON.stringify(state.data, null, 2);
      const result = await window.GitHubRepoApi.upsertFile({
        ...cfg,
        sha: state.githubSha,
        message: `Admin mentés: ${new Date().toLocaleString("hu-HU")}`,
        content: payload
      });
      state.githubSha = result?.content?.sha || result?.commit?.sha || state.githubSha;
      showBanner("Mentés GitHubra kész.", "ok");
    } catch (error) {
      showBanner(`GitHub mentési hiba: ${error.message}`, "warning");
    }
  }

  function exportJson() {
    if (!state.data) return;
    downloadTextFile(`gazdalkodj-okosan-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.data, null, 2));
  }

  async function importJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      state.data = normalizeData(JSON.parse(text));
      ensureSelections();
      render();
      showBanner("JSON import sikeres.", "ok");
    } catch (error) {
      showBanner(`Import hiba: ${error.message}`, "warning");
    } finally {
      event.target.value = "";
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
    localStorage.setItem("go_admin_github", JSON.stringify(getGitHubConfig()));
  }

  function loadGitHubConfig() {
    try {
      const stored = JSON.parse(localStorage.getItem("go_admin_github") || "{}");
      refs.ghOwner.value = stored.owner || "";
      refs.ghRepo.value = stored.repo || "";
      refs.ghBranch.value = stored.branch || "main";
      refs.ghPath.value = stored.path || "data/game-data.json";
      refs.ghToken.value = stored.token || "";
    } catch (error) {
      console.warn(error);
    }
  }

  function render() {
    if (!state.data) {
      refs.adminContent.innerHTML = `<div class="muted">Nincs betöltött adat.</div>`;
      return;
    }

    ensureSelections();
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
      default:
        renderSettingsTab();
        break;
    }
  }

  function renderStats() {
    const warnings = validateData();
    refs.statsBox.innerHTML = `
      <div><strong>Mezők:</strong> ${state.data.fields.length}</div>
      <div><strong>Kártyák:</strong> ${state.data.cards.length}</div>
      <div><strong>Tárgyak:</strong> ${state.data.items.length}</div>
      <div><strong>Start mezők:</strong> ${state.data.fields.filter((field) => field.type === "start").length}</div>
      <div><strong>Győzelmi feltétel:</strong> ${escapeHtml(state.data.settings.winCondition || "all_items")}</div>
      <div class="divider-line"></div>
      <div><strong>Figyelmeztetések:</strong></div>
      ${warnings.length
        ? `<div class="warning-list">${warnings.map((warning) => `<div class="warning-item">• ${escapeHtml(warning)}</div>`).join("")}</div>`
        : `<div class="small muted">Nincs kritikus szerkesztési figyelmeztetés.</div>`}
    `;
  }

  function validateData() {
    const warnings = [];
    const startCount = state.data.fields.filter((field) => field.type === "start").length;
    if (startCount !== 1) warnings.push(`Pontosan 1 start mező ajánlott, most ${startCount} van.`);

    const duplicateFieldIds = findDuplicateIds(state.data.fields);
    const duplicateCardIds = findDuplicateIds(state.data.cards);
    const duplicateItemIds = findDuplicateIds(state.data.items);
    if (duplicateFieldIds.length) warnings.push(`Duplikált mező ID-k: ${duplicateFieldIds.join(", ")}`);
    if (duplicateCardIds.length) warnings.push(`Duplikált kártya ID-k: ${duplicateCardIds.join(", ")}`);
    if (duplicateItemIds.length) warnings.push(`Duplikált tárgy ID-k: ${duplicateItemIds.join(", ")}`);

    const sortedFields = [...state.data.fields].sort((a, b) => Number(a.id) - Number(b.id));
    for (let i = 1; i < sortedFields.length; i += 1) {
      if (sortedFields[i].type === sortedFields[i - 1].type) {
        warnings.push(`Egymás után két azonos mezőtípus van a sorrendben: #${sortedFields[i - 1].id} és #${sortedFields[i].id}.`);
        break;
      }
    }

    return warnings;
  }

  function renderSettingsTab() {
    const settings = state.data.settings || {};
    const meta = state.data.meta || {};

    refs.adminContent.innerHTML = `
      <div class="admin-section-stack">
        <section class="editor-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Projekt adatok</h2>
              <p class="muted small">A játék alapadatai és megnevezései.</p>
            </div>
            <div class="inline-actions">
              <button id="addMetaBtn" class="ghost-btn">Egyéni meta mező</button>
            </div>
          </div>
          <div class="settings-grid">
            ${Object.keys(meta).map((key) => renderConfigInput("meta", key, meta[key], metaLabels[key])).join("")}
          </div>
        </section>

        <section class="editor-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Globális játékszabályok</h2>
              <p class="muted small">Kezdő pénz, startpénz, animációk, minimum játékos, tábla méret és minden fő szabály innen állítható.</p>
            </div>
            <button id="addSettingBtn" class="ghost-btn">Új beállítás</button>
          </div>
          <div class="settings-grid">
            ${Object.keys(settings).map((key) => renderConfigInput("settings", key, settings[key], settingLabels[key])).join("")}
          </div>
        </section>
      </div>
    `;

    refs.adminContent.querySelectorAll("[data-config-group]").forEach((input) => {
      input.addEventListener("input", () => {
        const group = input.dataset.configGroup;
        const key = input.dataset.configKey;
        state.data[group][key] = parseInputValue(input, state.data[group][key]);
      });
    });

    document.getElementById("addMetaBtn").onclick = () => addConfigKey("meta");
    document.getElementById("addSettingBtn").onclick = () => addConfigKey("settings");
  }

  function renderItemsTab() {
    const item = getSelectedItem();
    refs.adminContent.innerHTML = `
      <div class="editor-split">
        <section class="editor-card entity-list-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Tárgyak</h2>
              <p class="muted small">A győzelemhez szükséges megvásárolható tárgyak.</p>
            </div>
            <button id="addItemBtn" class="primary-btn">Új tárgy</button>
          </div>
          <div class="entity-list">
            ${state.data.items.map((entry) => `
              <button class="entity-row ${entry.id === state.selectedItemId ? "active" : ""}" data-item-select="${entry.id}">
                <div>
                  <div class="entity-row-title">${escapeHtml(entry.name || "Névtelen tárgy")}</div>
                  <div class="small muted">${escapeHtml(entry.key || "nincs-kulcs")}</div>
                </div>
                <div class="entity-row-meta">${formatNumber(entry.price)} ${escapeHtml(state.data.settings.currency || "Ft")}</div>
              </button>
            `).join("")}
          </div>
        </section>

        <section class="editor-card">
          ${item ? `
            <div class="section-header-row">
              <div>
                <h2 class="section-title">Tárgy szerkesztése</h2>
                <p class="muted small">Minden tárgy külön szerkeszthető névvel, kulccsal, árral és leírással.</p>
              </div>
              <div class="inline-actions">
                <button id="duplicateItemBtn" class="ghost-btn">Másolat</button>
                <button id="deleteItemBtn" class="danger-btn">Törlés</button>
              </div>
            </div>
            <div class="editor-form">
              <div class="inline-two">
                <label class="input-group">
                  <span>ID</span>
                  <input id="itemIdInput" type="number" value="${Number(item.id)}">
                </label>
                <label class="input-group">
                  <span>Kulcs</span>
                  <input id="itemKeyInput" type="text" value="${escapeHtml(item.key || "")}" placeholder="pl. auto">
                </label>
              </div>
              <label class="input-group">
                <span>Név</span>
                <input id="itemNameInput" type="text" value="${escapeHtml(item.name || "")}" placeholder="pl. Autó">
              </label>
              <label class="input-group">
                <span>Ár</span>
                <input id="itemPriceInput" type="number" step="1" value="${Number(item.price || 0)}">
              </label>
              <label class="input-group">
                <span>Leírás</span>
                <textarea id="itemDescInput">${escapeHtml(item.description || "")}</textarea>
              </label>
            </div>
          ` : `<div class="muted">Nincs kiválasztott tárgy.</div>`}
        </section>
      </div>
    `;

    refs.adminContent.querySelectorAll("[data-item-select]").forEach((button) => {
      button.onclick = () => {
        state.selectedItemId = Number(button.dataset.itemSelect);
        render();
      };
    });

    document.getElementById("addItemBtn").onclick = () => {
      const newItem = {
        id: nextId(state.data.items),
        key: slugify(`targy-${state.data.items.length + 1}`),
        name: "Új tárgy",
        price: 500,
        description: "Új tárgy leírása."
      };
      state.data.items.push(newItem);
      state.selectedItemId = newItem.id;
      render();
    };

    if (item) {
      document.getElementById("itemIdInput").oninput = (event) => item.id = Number(event.target.value || 0);
      document.getElementById("itemKeyInput").oninput = (event) => item.key = event.target.value;
      document.getElementById("itemNameInput").oninput = (event) => item.name = event.target.value;
      document.getElementById("itemPriceInput").oninput = (event) => item.price = Number(event.target.value || 0);
      document.getElementById("itemDescInput").oninput = (event) => item.description = event.target.value;
      document.getElementById("duplicateItemBtn").onclick = () => duplicateEntry("items", item, (copy) => {
        copy.key = uniqueKey(copy.key || slugify(copy.name || "targy"), state.data.items);
      });
      document.getElementById("deleteItemBtn").onclick = () => deleteSelectedEntry("items", "selectedItemId", item.id);
    }
  }

  function renderCardsTab() {
    const card = getSelectedCard();
    refs.adminContent.innerHTML = `
      <div class="editor-split">
        <section class="editor-card entity-list-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Szerencsekártyák</h2>
              <p class="muted small">Szöveg, leírás és hatások mind űrlapból szerkeszthetők.</p>
            </div>
            <div class="inline-actions">
              <button id="addMoneyCardBtn" class="ghost-btn">+ Pénzes kártya</button>
              <button id="addMoveCardBtn" class="ghost-btn">+ Mozgás kártya</button>
              <button id="addCardBtn" class="primary-btn">Új kártya</button>
            </div>
          </div>
          <div class="entity-list">
            ${state.data.cards.map((entry) => `
              <button class="entity-row ${entry.id === state.selectedCardId ? "active" : ""}" data-card-select="${entry.id}">
                <div>
                  <div class="entity-row-title">${escapeHtml(entry.title || "Névtelen kártya")}</div>
                  <div class="small muted">${escapeHtml(shorten(entry.description || "", 72))}</div>
                </div>
                <div class="entity-row-meta">${renderEffectCount(entry.effects)}</div>
              </button>
            `).join("")}
          </div>
        </section>

        <section class="editor-card">
          ${card ? `
            <div class="section-header-row">
              <div>
                <h2 class="section-title">Kártya szerkesztése</h2>
                <p class="muted small">A kártyahatások itt már nem JSON-ként, hanem külön mezőkkel állíthatók.</p>
              </div>
              <div class="inline-actions">
                <button id="duplicateCardBtn" class="ghost-btn">Másolat</button>
                <button id="deleteCardBtn" class="danger-btn">Törlés</button>
              </div>
            </div>
            <div class="editor-form">
              <div class="inline-two">
                <label class="input-group">
                  <span>ID</span>
                  <input id="cardIdInput" type="number" value="${Number(card.id)}">
                </label>
                <label class="input-group">
                  <span>Cím</span>
                  <input id="cardTitleInput" type="text" value="${escapeHtml(card.title || "")}">
                </label>
              </div>
              <label class="input-group">
                <span>Leírás</span>
                <textarea id="cardDescInput">${escapeHtml(card.description || "")}</textarea>
              </label>
            </div>
            <div id="cardEffectsBox"></div>
          ` : `<div class="muted">Nincs kiválasztott kártya.</div>`}
        </section>
      </div>
    `;

    refs.adminContent.querySelectorAll("[data-card-select]").forEach((button) => {
      button.onclick = () => {
        state.selectedCardId = Number(button.dataset.cardSelect);
        render();
      };
    });

    document.getElementById("addCardBtn").onclick = () => createCardPreset("money");
    document.getElementById("addMoneyCardBtn").onclick = () => createCardPreset("money");
    document.getElementById("addMoveCardBtn").onclick = () => createCardPreset("move");

    if (card) {
      document.getElementById("cardIdInput").oninput = (event) => card.id = Number(event.target.value || 0);
      document.getElementById("cardTitleInput").oninput = (event) => card.title = event.target.value;
      document.getElementById("cardDescInput").oninput = (event) => card.description = event.target.value;
      document.getElementById("duplicateCardBtn").onclick = () => duplicateEntry("cards", card);
      document.getElementById("deleteCardBtn").onclick = () => deleteSelectedEntry("cards", "selectedCardId", card.id);
      renderEffectEditor(document.getElementById("cardEffectsBox"), card.effects, "card");
    }
  }

  function renderFieldsTab() {
    const field = getSelectedField();
    refs.adminContent.innerHTML = `
      <div class="editor-split">
        <section class="editor-card entity-list-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Mezők</h2>
              <p class="muted small">Itt a mező neve, típusa, leírása és minden hatása szerkeszthető.</p>
            </div>
            <div class="inline-actions">
              <button id="addBonusFieldBtn" class="ghost-btn">+ Pénzmező</button>
              <button id="addShopFieldBtn" class="ghost-btn">+ Bolt</button>
              <button id="addChanceFieldBtn" class="ghost-btn">+ Kártyamező</button>
              <button id="addFieldBtn" class="primary-btn">Új mező</button>
            </div>
          </div>
          <div class="entity-list field-list">
            ${[...state.data.fields].sort((a, b) => Number(a.id) - Number(b.id)).map((entry) => `
              <button class="entity-row ${entry.id === state.selectedFieldId ? "active" : ""}" data-field-select="${entry.id}">
                <div>
                  <div class="entity-row-title">#${entry.id} – ${escapeHtml(entry.title || "Névtelen mező")}</div>
                  <div class="small muted">${fieldTypeLabel(entry.type)}</div>
                </div>
                <div class="entity-row-meta">${renderEffectCount(entry.effects)}</div>
              </button>
            `).join("")}
          </div>
        </section>

        <section class="editor-card">
          ${field ? `
            <div class="section-header-row">
              <div>
                <h2 class="section-title">Mező szerkesztése</h2>
                <p class="muted small">Nem kódot szerkesztesz: választható mezőtípusokkal és külön hatásblokkokkal dolgozol.</p>
              </div>
              <div class="inline-actions">
                <button id="jumpBoardBtn" class="ghost-btn">Pályaeditor</button>
                <button id="duplicateFieldBtn" class="ghost-btn">Másolat</button>
                <button id="deleteFieldBtn" class="danger-btn">Törlés</button>
              </div>
            </div>

            <div class="editor-form">
              <div class="inline-two">
                <label class="input-group">
                  <span>ID</span>
                  <input id="fieldIdInput" type="number" value="${Number(field.id)}">
                </label>
                <label class="input-group">
                  <span>Típus</span>
                  <select id="fieldTypeInput">
                    ${fieldTypeOptions.map((option) => `<option value="${option.value}" ${field.type === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
                  </select>
                </label>
              </div>

              <label class="input-group">
                <span>Név</span>
                <input id="fieldTitleInput" type="text" value="${escapeHtml(field.title || "")}">
              </label>

              <label class="input-group">
                <span>Leírás</span>
                <textarea id="fieldDescInput">${escapeHtml(field.description || "")}</textarea>
              </label>

              <div class="inline-two">
                <label class="input-group">
                  <span>Bal pozíció (%)</span>
                  <input id="fieldLeftInput" type="number" min="0" max="100" step="0.1" value="${Number(field.position?.left || 0)}">
                </label>
                <label class="input-group">
                  <span>Felső pozíció (%)</span>
                  <input id="fieldTopInput" type="number" min="0" max="100" step="0.1" value="${Number(field.position?.top || 0)}">
                </label>
              </div>
            </div>

            <div id="fieldEffectsBox"></div>
          ` : `<div class="muted">Nincs kiválasztott mező.</div>`}
        </section>
      </div>
    `;

    refs.adminContent.querySelectorAll("[data-field-select]").forEach((button) => {
      button.onclick = () => {
        state.selectedFieldId = Number(button.dataset.fieldSelect);
        render();
      };
    });

    document.getElementById("addFieldBtn").onclick = () => createFieldPreset("bonus");
    document.getElementById("addBonusFieldBtn").onclick = () => createFieldPreset("bonus");
    document.getElementById("addShopFieldBtn").onclick = () => createFieldPreset("shop");
    document.getElementById("addChanceFieldBtn").onclick = () => createFieldPreset("chance");

    if (field) {
      document.getElementById("fieldIdInput").oninput = (event) => field.id = Number(event.target.value || 0);
      document.getElementById("fieldTypeInput").onchange = (event) => {
        field.type = event.target.value;
        if (field.type === "start" && !field.effects.some((effect) => effect.kind === "start")) {
          field.effects = [{ kind: "start" }];
        }
        render();
      };
      document.getElementById("fieldTitleInput").oninput = (event) => field.title = event.target.value;
      document.getElementById("fieldDescInput").oninput = (event) => field.description = event.target.value;
      document.getElementById("fieldLeftInput").oninput = (event) => field.position.left = round2(clamp(Number(event.target.value || 0), 0, 100));
      document.getElementById("fieldTopInput").oninput = (event) => field.position.top = round2(clamp(Number(event.target.value || 0), 0, 100));
      document.getElementById("jumpBoardBtn").onclick = () => {
        state.tab = "board";
        refs.tabRow.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === "board"));
        render();
      };
      document.getElementById("duplicateFieldBtn").onclick = () => duplicateEntry("fields", field, (copy) => {
        copy.position = { left: clamp((copy.position?.left || 50) + 2, 2, 98), top: clamp((copy.position?.top || 50) + 2, 2, 98) };
      });
      document.getElementById("deleteFieldBtn").onclick = () => deleteSelectedEntry("fields", "selectedFieldId", field.id);
      renderEffectEditor(document.getElementById("fieldEffectsBox"), field.effects, "field");
    }
  }

  function renderBoardTab() {
    const field = getSelectedField();
    refs.adminContent.innerHTML = `
      <div class="editor-split board-layout-split">
        <section class="editor-card board-editor-card">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Pályaeditor</h2>
              <p class="muted small">Húzd a mezőket, vagy állítsd a pozíciókat kézzel. A módosítás rögtön mentődik az adatba.</p>
            </div>
          </div>
          <div class="board-help">
            <div class="small muted">Kiválasztott mező: <strong>#${field?.id ?? "—"} ${escapeHtml(field?.title || "")}</strong></div>
            <div class="small muted">A kék keretes mező az aktív kijelölés.</div>
          </div>
          <div class="board-editor" id="boardEditor">
            ${state.data.fields.map((entry) => `
              <div class="board-editor-tile ${entry.id === state.selectedFieldId ? "selected" : ""}"
                   data-board-field-id="${entry.id}"
                   title="#${entry.id} ${escapeHtml(entry.title || "") }"
                   style="left:${entry.position.left}%; top:${entry.position.top}%">
                ${entry.id}
              </div>
            `).join("")}
          </div>
        </section>

        <section class="editor-card">
          ${field ? `
            <div class="section-header-row">
              <div>
                <h2 class="section-title">Kijelölt mező</h2>
                <p class="muted small">Finomhangolás kézzel is.</p>
              </div>
              <button id="backToFieldsBtn" class="ghost-btn">Vissza a mezőkhöz</button>
            </div>
            <div class="editor-form">
              <label class="input-group">
                <span>Név</span>
                <input id="boardFieldTitleInput" type="text" value="${escapeHtml(field.title || "")}">
              </label>
              <label class="input-group">
                <span>Típus</span>
                <select id="boardFieldTypeInput">
                  ${fieldTypeOptions.map((option) => `<option value="${option.value}" ${field.type === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
                </select>
              </label>
              <div class="inline-two">
                <label class="input-group">
                  <span>Bal (%)</span>
                  <input id="boardFieldLeftInput" type="number" min="0" max="100" step="0.1" value="${Number(field.position.left)}">
                </label>
                <label class="input-group">
                  <span>Fent (%)</span>
                  <input id="boardFieldTopInput" type="number" min="0" max="100" step="0.1" value="${Number(field.position.top)}">
                </label>
              </div>
              <div class="nudge-grid">
                <button class="ghost-btn" data-nudge="up">↑ Felfelé</button>
                <button class="ghost-btn" data-nudge="left">← Balra</button>
                <button class="ghost-btn" data-nudge="right">Jobbra →</button>
                <button class="ghost-btn" data-nudge="down">↓ Lefelé</button>
              </div>
            </div>
          ` : `<div class="muted">Előbb válassz ki egy mezőt.</div>`}
        </section>
      </div>
    `;

    const boardEditor = document.getElementById("boardEditor");
    boardEditor.querySelectorAll("[data-board-field-id]").forEach((tile) => {
      tile.addEventListener("pointerdown", (event) => {
        state.dragFieldId = Number(tile.dataset.boardFieldId);
        state.selectedFieldId = state.dragFieldId;
        tile.setPointerCapture(event.pointerId);
      });
      tile.addEventListener("pointermove", (event) => {
        if (state.dragFieldId !== Number(tile.dataset.boardFieldId)) return;
        const rect = boardEditor.getBoundingClientRect();
        const fieldEntry = state.data.fields.find((entry) => entry.id === Number(tile.dataset.boardFieldId));
        if (!fieldEntry) return;
        fieldEntry.position.left = round2(clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98));
        fieldEntry.position.top = round2(clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98));
        tile.style.left = `${fieldEntry.position.left}%`;
        tile.style.top = `${fieldEntry.position.top}%`;
        syncBoardInputs(fieldEntry);
      });
      tile.addEventListener("pointerup", () => {
        state.dragFieldId = null;
        render();
      });
      tile.addEventListener("click", () => {
        state.selectedFieldId = Number(tile.dataset.boardFieldId);
        render();
      });
    });

    if (field) {
      document.getElementById("backToFieldsBtn").onclick = () => {
        state.tab = "fields";
        refs.tabRow.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === "fields"));
        render();
      };
      document.getElementById("boardFieldTitleInput").oninput = (event) => field.title = event.target.value;
      document.getElementById("boardFieldTypeInput").onchange = (event) => field.type = event.target.value;
      document.getElementById("boardFieldLeftInput").oninput = (event) => {
        field.position.left = round2(clamp(Number(event.target.value || 0), 0, 100));
        render();
      };
      document.getElementById("boardFieldTopInput").oninput = (event) => {
        field.position.top = round2(clamp(Number(event.target.value || 0), 0, 100));
        render();
      };
      refs.adminContent.querySelectorAll("[data-nudge]").forEach((button) => {
        button.onclick = () => {
          const amount = 0.5;
          const move = button.dataset.nudge;
          if (move === "up") field.position.top = round2(clamp(field.position.top - amount, 0, 100));
          if (move === "down") field.position.top = round2(clamp(field.position.top + amount, 0, 100));
          if (move === "left") field.position.left = round2(clamp(field.position.left - amount, 0, 100));
          if (move === "right") field.position.left = round2(clamp(field.position.left + amount, 0, 100));
          render();
        };
      });
    }
  }

  function renderJsonTab() {
    refs.adminContent.innerHTML = `
      <div class="editor-card">
        <div class="section-header-row">
          <div>
            <h2 class="section-title">Nyers JSON</h2>
            <p class="muted small">Haladó mód. Csak akkor nyúlj hozzá, ha tudod mit csinálsz.</p>
          </div>
          <button id="applyJsonBtn" class="primary-btn">JSON alkalmazása</button>
        </div>
        <textarea id="jsonEditor" class="json-editor">${escapeHtml(JSON.stringify(state.data, null, 2))}</textarea>
      </div>
    `;

    document.getElementById("applyJsonBtn").onclick = () => {
      const editor = document.getElementById("jsonEditor");
      try {
        state.data = normalizeData(JSON.parse(editor.value));
        ensureSelections();
        showBanner("A nyers JSON sikeresen alkalmazva.", "ok");
        render();
      } catch (error) {
        showBanner(`JSON hiba: ${error.message}`, "warning");
      }
    };
  }

  function renderEffectEditor(container, effects, scope) {
    container.innerHTML = `
      <section class="editor-card sub-editor-card">
        <div class="section-header-row">
          <div>
            <h3 class="section-title">Hatások</h3>
            <p class="muted small">Tetszőleges számú hatást adhatsz hozzá. Nem kell hozzá kódot írni.</p>
          </div>
          <button class="primary-btn" id="addEffectBtn">Új hatás</button>
        </div>

        <div class="effect-list">
          ${effects.length ? effects.map((effect, index) => renderEffectRow(effect, index, scope)).join("") : `<div class="muted small">Még nincs hatás. Adj hozzá egyet.</div>`}
        </div>
      </section>
    `;

    container.querySelector("#addEffectBtn").onclick = () => {
      effects.push(defaultEffectForKind(allowedEffectKinds(scope)[0]));
      render();
    };

    container.querySelectorAll(".effect-row").forEach((row) => {
      const index = Number(row.dataset.effectIndex);
      const effect = effects[index];
      const kindSelect = row.querySelector(".effect-kind-input");
      kindSelect.onchange = () => {
        effects[index] = defaultEffectForKind(kindSelect.value);
        render();
      };

      row.querySelectorAll("[data-effect-param]").forEach((input) => {
        input.addEventListener("input", () => {
          const param = input.dataset.effectParam;
          effect[param] = parseInputValue(input, effect[param]);
        });
      });

      row.querySelector(".remove-effect-btn").onclick = () => {
        effects.splice(index, 1);
        render();
      };
    });
  }

  function renderEffectRow(effect, index, scope) {
    return `
      <div class="effect-row" data-effect-index="${index}">
        <div class="section-header-row compact-row">
          <strong>${index + 1}. hatás</strong>
          <button class="danger-btn remove-effect-btn" type="button">Hatás törlése</button>
        </div>
        <div class="effect-grid">
          <label class="input-group">
            <span>Hatás típusa</span>
            <select class="effect-kind-input">
              ${allowedEffectKinds(scope).map((kind) => `<option value="${kind}" ${effect.kind === kind ? "selected" : ""}>${effectKindLabel(kind)}</option>`).join("")}
            </select>
          </label>
          ${renderEffectParams(effect)}
        </div>
        <div class="small muted">Összegzés: ${escapeHtml(effectSummary(effect))}</div>
      </div>
    `;
  }

  function renderEffectParams(effect) {
    switch (effect.kind) {
      case "money":
        return `
          <label class="input-group">
            <span>Összeg</span>
            <input data-effect-param="amount" type="number" value="${Number(effect.amount || 0)}">
          </label>
        `;
      case "move":
        return `
          <label class="input-group">
            <span>Lépések száma</span>
            <input data-effect-param="steps" type="number" value="${Number(effect.steps || 0)}">
          </label>
        `;
      case "skip":
        return `
          <label class="input-group">
            <span>Kimaradó körök</span>
            <input data-effect-param="turns" type="number" min="1" value="${Number(effect.turns || 1)}">
          </label>
        `;
      case "shop":
        return `
          <label class="input-group">
            <span>Felajánlott tárgy</span>
            <select data-effect-param="itemId">
              ${state.data.items.map((item) => `<option value="${item.id}" ${Number(effect.itemId) === Number(item.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
            </select>
          </label>
        `;
      case "card_shop":
        return `
          <label class="input-group">
            <span>Árkategória</span>
            <select data-effect-param="tier">
              <option value="cheap" ${effect.tier === "cheap" ? "selected" : ""}>Olcsóbb tárgyak</option>
              <option value="expensive" ${effect.tier === "expensive" ? "selected" : ""}>Drágább tárgyak</option>
              <option value="any" ${effect.tier === "any" ? "selected" : ""}>Bármelyik tárgy</option>
            </select>
          </label>
        `;
      case "draw_card":
        return `<div class="effect-static-note">A játékos kártyát húzhat a pakliból.</div>`;
      case "start":
        return `<div class="effect-static-note">Ez a startmező alapjelölése.</div>`;
      default:
        return `<div class="effect-static-note">Ehhez a hatáshoz nincs extra paraméter.</div>`;
    }
  }

  function allowedEffectKinds(scope) {
    if (scope === "card") return ["money", "move", "skip", "card_shop"];
    return ["start", "money", "draw_card", "shop", "skip", "move"];
  }

  function defaultEffectForKind(kind) {
    switch (kind) {
      case "money":
        return { kind: "money", amount: 100 };
      case "move":
        return { kind: "move", steps: 3 };
      case "skip":
        return { kind: "skip", turns: 1 };
      case "shop":
        return { kind: "shop", itemId: state.data.items?.[0]?.id || 1 };
      case "card_shop":
        return { kind: "card_shop", tier: "cheap" };
      case "draw_card":
        return { kind: "draw_card" };
      case "start":
      default:
        return { kind: kind || "start" };
    }
  }

  function createCardPreset(kind) {
    const presets = {
      money: {
        title: "Pénzes kártya",
        description: "Adj vagy vonj le pénzt a játékostól.",
        effects: [defaultEffectForKind("money")]
      },
      move: {
        title: "Mozgás kártya",
        description: "Mozgasd a játékost előre vagy hátra.",
        effects: [defaultEffectForKind("move")]
      }
    };
    const preset = presets[kind] || presets.money;
    const newCard = {
      id: nextId(state.data.cards),
      title: preset.title,
      description: preset.description,
      effects: preset.effects.map((effect) => structuredClone(effect))
    };
    state.data.cards.push(newCard);
    state.selectedCardId = newCard.id;
    render();
  }

  function createFieldPreset(kind) {
    const presets = {
      bonus: {
        type: "bonus",
        title: "Pénzmező",
        description: "A játékos pénzt kap vagy fizet.",
        effects: [defaultEffectForKind("money")]
      },
      shop: {
        type: "shop",
        title: "Boltmező",
        description: "A játékos itt megvehet egy tárgyat.",
        effects: [defaultEffectForKind("shop")]
      },
      chance: {
        type: "chance",
        title: "Szerencsekártya mező",
        description: "A játékos innen kártyát húzhat.",
        effects: [defaultEffectForKind("draw_card")]
      }
    };
    const preset = presets[kind] || presets.bonus;
    const newField = {
      id: nextId(state.data.fields),
      type: preset.type,
      title: preset.title,
      description: preset.description,
      effects: preset.effects.map((effect) => structuredClone(effect)),
      position: findNewFieldPosition()
    };
    state.data.fields.push(newField);
    state.selectedFieldId = newField.id;
    render();
  }

  function addConfigKey(group) {
    const rawKey = window.prompt(group === "settings" ? "Új beállítás kulcsa:" : "Új meta mező kulcsa:");
    if (!rawKey) return;
    const key = rawKey.trim();
    if (!key) return;
    if (state.data[group][key] != null) {
      showBanner("Ez a kulcs már létezik.", "warning");
      return;
    }
    const defaultValueRaw = window.prompt("Kezdő érték (szöveg vagy szám):", "");
    const value = defaultValueRaw !== null && defaultValueRaw !== "" && !Number.isNaN(Number(defaultValueRaw))
      ? Number(defaultValueRaw)
      : (defaultValueRaw || "");
    state.data[group][key] = value;
    render();
  }

  function duplicateEntry(collectionKey, entry, mutateCopy) {
    const copy = JSON.parse(JSON.stringify(entry));
    copy.id = nextId(state.data[collectionKey]);
    if (collectionKey === "cards") copy.title = `${copy.title || "Kártya"} másolat`;
    if (collectionKey === "fields") copy.title = `${copy.title || "Mező"} másolat`;
    if (collectionKey === "items") copy.name = `${copy.name || "Tárgy"} másolat`;
    if (typeof mutateCopy === "function") mutateCopy(copy);
    state.data[collectionKey].push(copy);
    if (collectionKey === "items") state.selectedItemId = copy.id;
    if (collectionKey === "cards") state.selectedCardId = copy.id;
    if (collectionKey === "fields") state.selectedFieldId = copy.id;
    render();
  }

  function deleteSelectedEntry(collectionKey, stateKey, id) {
    state.data[collectionKey] = state.data[collectionKey].filter((entry) => Number(entry.id) !== Number(id));
    const next = state.data[collectionKey][0] || null;
    state[stateKey] = next ? next.id : null;
    render();
  }

  function ensureSelections() {
    if (!state.data) return;
    const itemIds = new Set(state.data.items.map((item) => Number(item.id)));
    const cardIds = new Set(state.data.cards.map((card) => Number(card.id)));
    const fieldIds = new Set(state.data.fields.map((field) => Number(field.id)));

    if (!itemIds.has(Number(state.selectedItemId))) state.selectedItemId = state.data.items[0]?.id ?? null;
    if (!cardIds.has(Number(state.selectedCardId))) state.selectedCardId = state.data.cards[0]?.id ?? null;
    if (!fieldIds.has(Number(state.selectedFieldId))) state.selectedFieldId = state.data.fields[0]?.id ?? null;
  }

  function getSelectedItem() {
    return state.data.items.find((item) => Number(item.id) === Number(state.selectedItemId)) || null;
  }

  function getSelectedCard() {
    return state.data.cards.find((card) => Number(card.id) === Number(state.selectedCardId)) || null;
  }

  function getSelectedField() {
    return state.data.fields.find((field) => Number(field.id) === Number(state.selectedFieldId)) || null;
  }

  function syncBoardInputs(field) {
    const leftInput = document.getElementById("boardFieldLeftInput");
    const topInput = document.getElementById("boardFieldTopInput");
    if (leftInput) leftInput.value = String(field.position.left);
    if (topInput) topInput.value = String(field.position.top);
  }

  function normalizeData(data) {
    const normalized = JSON.parse(JSON.stringify(data || {}));
    normalized.meta = normalized.meta || {};
    normalized.settings = normalized.settings || {};
    normalized.items = Array.isArray(normalized.items) ? normalized.items : [];
    normalized.cards = Array.isArray(normalized.cards) ? normalized.cards : [];
    normalized.fields = Array.isArray(normalized.fields) ? normalized.fields : [];

    normalized.items = normalized.items.map((item, index) => ({
      id: Number(item.id ?? index + 1),
      key: item.key || slugify(item.name || `targy-${index + 1}`),
      name: item.name || `Tárgy ${index + 1}`,
      price: Number(item.price ?? 0),
      description: item.description || ""
    }));

    normalized.cards = normalized.cards.map((card, index) => ({
      id: Number(card.id ?? index + 1),
      title: card.title || `Kártya ${index + 1}`,
      description: card.description || "",
      effects: Array.isArray(card.effects) ? card.effects : []
    }));

    normalized.fields = normalized.fields.map((field, index) => ({
      id: Number(field.id ?? index),
      type: field.type || "bonus",
      title: field.title || `Mező ${index}`,
      description: field.description || "",
      effects: Array.isArray(field.effects) ? field.effects : [],
      position: {
        left: round2(clamp(Number(field.position?.left ?? 50), 0, 100)),
        top: round2(clamp(Number(field.position?.top ?? 50), 0, 100))
      }
    }));

    return normalized;
  }

  function renderConfigInput(group, key, value, info) {
    const label = info?.label || key;
    const help = info?.help || "";
    if (typeof value === "boolean") {
      return `
        <label class="input-group config-card">
          <span>${escapeHtml(label)}</span>
          <select data-config-group="${group}" data-config-key="${escapeHtml(key)}">
            <option value="true" ${value ? "selected" : ""}>Igen</option>
            <option value="false" ${!value ? "selected" : ""}>Nem</option>
          </select>
          <small class="muted">${escapeHtml(help)}</small>
        </label>
      `;
    }
    const inputType = typeof value === "number" ? "number" : "text";
    return `
      <label class="input-group config-card">
        <span>${escapeHtml(label)}</span>
        <input data-config-group="${group}" data-config-key="${escapeHtml(key)}" type="${inputType}" value="${escapeHtml(value)}">
        <small class="muted">${escapeHtml(help)}</small>
      </label>
    `;
  }

  function parseInputValue(input, oldValue) {
    if (input.tagName === "SELECT" && (input.value === "true" || input.value === "false")) {
      return input.value === "true";
    }
    if (input.type === "number") {
      return Number(input.value || 0);
    }
    if (typeof oldValue === "number" && input.value !== "") {
      const maybe = Number(input.value);
      return Number.isNaN(maybe) ? oldValue : maybe;
    }
    return input.value;
  }

  function renderEffectCount(effects) {
    const count = Array.isArray(effects) ? effects.length : 0;
    return `${count} hatás`;
  }

  function effectKindLabel(kind) {
    return {
      start: "Startjelölés",
      money: "Pénz módosítása",
      draw_card: "Kártyahúzás",
      shop: "Konkrét tárgy felajánlása",
      skip: "Kimaradás",
      move: "Mozgás",
      card_shop: "Vásárlási lehetőség kategória alapján"
    }[kind] || kind;
  }

  function effectSummary(effect) {
    switch (effect.kind) {
      case "money":
        return `${Number(effect.amount || 0) >= 0 ? "+" : ""}${Number(effect.amount || 0)} ${state.data.settings.currency || "Ft"}`;
      case "move":
        return `${Number(effect.steps || 0) >= 0 ? "+" : ""}${Number(effect.steps || 0)} mező`;
      case "skip":
        return `${Number(effect.turns || 1)} kör kimaradás`;
      case "shop": {
        const item = state.data.items.find((entry) => Number(entry.id) === Number(effect.itemId));
        return `Felajánlott tárgy: ${item?.name || `#${effect.itemId}`}`;
      }
      case "card_shop":
        return `Vásárlás kategória szerint: ${effect.tier || "cheap"}`;
      case "draw_card":
        return "Kártyahúzás a pakliból";
      case "start":
        return "Start mező";
      default:
        return "Egyedi hatás";
    }
  }

  function fieldTypeLabel(type) {
    return fieldTypeOptions.find((option) => option.value === type)?.label || type;
  }

  function findNewFieldPosition() {
    const last = [...state.data.fields].sort((a, b) => Number(a.id) - Number(b.id)).at(-1);
    if (!last) return { left: 50, top: 50 };
    return {
      left: round2(clamp((last.position?.left || 50) + 3, 4, 96)),
      top: round2(clamp((last.position?.top || 50) + 3, 4, 96))
    };
  }

  function findDuplicateIds(collection) {
    const seen = new Set();
    const duplicates = new Set();
    collection.forEach((entry) => {
      const id = Number(entry.id);
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    });
    return [...duplicates];
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

  function formatNumber(value) {
    return new Intl.NumberFormat("hu-HU").format(Number(value || 0));
  }

  function shorten(value, max) {
    const text = String(value || "");
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "uj-kulcs";
  }

  function uniqueKey(baseKey, collection) {
    const existing = new Set(collection.map((item) => item.key));
    if (!existing.has(baseKey)) return baseKey;
    let index = 2;
    while (existing.has(`${baseKey}-${index}`)) index += 1;
    return `${baseKey}-${index}`;
  }

  function showBanner(message, tone = "warning") {
    refs.adminBanner.textContent = message;
    refs.adminBanner.className = `status-banner ${tone}`;
    refs.adminBanner.classList.remove("hidden");
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
