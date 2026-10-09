import { demoDisciplines } from "../data/disciplines.js";

const state = {
  supabase: null,
  connected: false,
  session: null,
  authRestoring: true,
  authSubscription: null,
  profileLoadError: "",
  profile: null,
  disciplines: [],
  achievements: new Map(),
  activeView: "dex",
  filters: {
    search: "",
    category: "alle",
    generation: "alle",
    dsaOnly: false
  }
};

const els = {
  title: document.querySelector("#view-title"),
  connection: document.querySelector("#connection-state"),
  views: document.querySelectorAll(".view"),
  nav: document.querySelectorAll(".bottom-nav button"),
  list: document.querySelector("#discipline-list"),
  dexState: document.querySelector("#dex-state"),
  resultCount: document.querySelector("#result-count"),
  search: document.querySelector("#search-input"),
  category: document.querySelector("#category-filter"),
  generation: document.querySelector("#generation-filter"),
  dsa: document.querySelector("#dsa-filter"),
  reset: document.querySelector("#reset-filter"),
  authTabs: document.querySelectorAll("[data-auth-tab]"),
  panes: document.querySelectorAll(".auth-pane"),
  profileState: document.querySelector("#profile-state"),
  profileView: document.querySelector("#view-profile"),
  profileTitle: document.querySelector("#profile-title"),
  profileRank: document.querySelector("#profile-rank"),
  profileAvatar: document.querySelector("#profile-avatar"),
  statDone: document.querySelector("#stat-done"),
  statGold: document.querySelector("#stat-gold"),
  statTotal: document.querySelector("#stat-total"),
  loginForm: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  editForm: document.querySelector("#edit-form"),
  logout: document.querySelector("#logout-button")
};

const categoryColors = {
  Basketball: "#f4c84f",
  Koordination: "#32d3c7",
  Fussball: "#79df72",
  Schwimmen: "#58a6ff",
  Laufen: "#ff7a59",
  Fahrrad: "#c792ea",
  Kraft: "#ff5a58",
  Volleyball: "#f7a8d8",
  Leichtathletik: "#d4f45f",
  Tempo: "#ffffff",
  Ausdauer: "#9fb1c8"
};

init();

async function init() {
  bindUi();
  setDexState("Disziplinen werden geladen ...");
  await initSupabase();
  await loadSession();
  await loadDisciplines();
  await loadProfileAndStats();
  finishAuthRestore();
  renderFilters();
  renderDex();
  renderProfile();
}

function bindUi() {
  els.nav.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  els.search.addEventListener("input", () => {
    state.filters.search = els.search.value.trim().toLowerCase();
    renderDex();
  });
  els.category.addEventListener("change", () => {
    state.filters.category = els.category.value;
    renderDex();
  });
  els.generation.addEventListener("change", () => {
    state.filters.generation = els.generation.value;
    renderDex();
  });
  els.dsa.addEventListener("change", () => {
    state.filters.dsaOnly = els.dsa.checked;
    renderDex();
  });
  els.reset.addEventListener("click", () => {
    state.filters = { search: "", category: "alle", generation: "alle", dsaOnly: false };
    els.search.value = "";
    els.category.value = "alle";
    els.generation.value = "alle";
    els.dsa.checked = false;
    renderDex();
  });

  els.authTabs.forEach((button) => {
    button.addEventListener("click", () => showAuthPane(button.dataset.authTab));
  });

  els.loginForm.addEventListener("submit", handleLogin);
  els.registerForm.addEventListener("submit", handleRegister);
  els.editForm.addEventListener("submit", handleProfileSave);
  els.logout.addEventListener("click", handleLogout);
}

async function initSupabase() {
  if (state.supabase) return;

  try {
    const response = await fetch("./config.local.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Keine lokale Supabase-Konfiguration");
    const config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
      throw new Error("Supabase-Konfiguration unvollstaendig");
    }
    state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    state.connected = true;
    els.connection.textContent = "Supabase verbunden";
  } catch {
    state.connected = false;
    state.authRestoring = false;
    els.connection.textContent = "Demo-Modus";
  }
}

async function loadSession() {
  if (!state.connected) {
    return;
  }

  setProfileState("Anmeldung wird wiederhergestellt ...");
  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    state.session = null;
    setProfileState("Gespeicherte Anmeldung konnte nicht geprueft werden. Bitte Verbindung pruefen.", "error");
  } else {
    state.session = data.session;
  }
  bindAuthStateListener();
}

function bindAuthStateListener() {
  if (state.authSubscription) return;

  const { data } = state.supabase.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      void handleAuthStateChange(event, session);
    }, 0);
  });

  state.authSubscription = data.subscription;
}

async function handleAuthStateChange(event, session) {
  state.session = session;
  if (event === "SIGNED_OUT") {
    clearPersonalState();
    finishAuthRestore();
    renderDex();
    renderProfile();
    showAuthPane("login");
    return;
  }
  await loadProfileAndStats();
  finishAuthRestore();
  renderDex();
  renderProfile();
}

function finishAuthRestore() {
  state.authRestoring = false;
  els.profileView.classList.remove("is-auth-restoring");
}

async function loadDisciplines() {
  if (!state.connected) {
    state.disciplines = demoDisciplines;
    return;
  }

  const { data, error } = await state.supabase
    .from("disziplin")
    .select("*")
    .eq("aktiv", true)
    .order("sortierung", { ascending: true });

  if (error) {
    state.disciplines = demoDisciplines;
    setDexState(`Supabase konnte nicht geladen werden: ${error.message}. Demo-Daten werden angezeigt.`, "error");
    els.connection.textContent = "Demo-Fallback";
    return;
  }

  state.disciplines = data ?? [];
}

async function loadProfileAndStats() {
  state.profileLoadError = "";
  if (!state.connected || !state.session?.user) {
    clearPersonalData();
    return;
  }

  const userId = state.session.user.id;
  const [{ data: profile, error: profileError }, { data: efforts, error: effortsError }] = await Promise.all([
    state.supabase.from("nutzer").select("*").eq("id", userId).maybeSingle(),
    state.supabase.from("leistung").select("disziplin_id, medaille").eq("nutzer_id", userId)
  ]);

  if (profileError || effortsError) {
    state.profileLoadError = "Profildaten konnten gerade nicht geladen werden. Die Anmeldung bleibt erhalten.";
    return;
  }

  state.profile = profile ?? null;
  state.achievements = new Map();
  (efforts ?? []).forEach((effort) => {
    const current = state.achievements.get(effort.disziplin_id);
    state.achievements.set(effort.disziplin_id, bestMedal(current, effort.medaille));
  });
}

function renderFilters() {
  const categories = new Set();
  const generations = new Set();
  state.disciplines.forEach((discipline) => {
    categories.add(discipline.kategorie_1);
    if (discipline.kategorie_2) categories.add(discipline.kategorie_2);
    generations.add(String(discipline.generation));
  });

  els.category.innerHTML = option("alle", "Alle Kategorien") + [...categories].sort().map((item) => option(item, item)).join("");
  els.generation.innerHTML = option("alle", "Alle") + [...generations].sort((a, b) => Number(a) - Number(b)).map((item) => option(item, `Generation ${item}`)).join("");
}

function renderDex() {
  const filtered = state.disciplines.filter(matchesFilters);
  els.resultCount.textContent = `${filtered.length} von ${state.disciplines.length}`;
  els.list.innerHTML = "";

  if (!state.disciplines.length) {
    setDexState("Keine Disziplinen verfuegbar.", "error");
    return;
  }

  if (!filtered.length) {
    setDexState("Keine Disziplin passt zu diesen Filtern.");
    return;
  }

  hideState(els.dexState);
  const fragment = document.createDocumentFragment();
  filtered.forEach((discipline) => fragment.append(renderDisciplineCard(discipline)));
  els.list.append(fragment);
}

function matchesFilters(discipline) {
  const query = state.filters.search;
  const inName = !query || discipline.name.toLowerCase().includes(query);
  const inCategory = state.filters.category === "alle" || discipline.kategorie_1 === state.filters.category || discipline.kategorie_2 === state.filters.category;
  const inGeneration = state.filters.generation === "alle" || String(discipline.generation) === state.filters.generation;
  const inDsa = !state.filters.dsaOnly || discipline.dsa;
  return inName && inCategory && inGeneration && inDsa;
}

function renderDisciplineCard(discipline) {
  const article = document.createElement("article");
  article.className = "discipline-card";
  article.style.setProperty("--category-color", categoryColors[discipline.kategorie_1] ?? "#32d3c7");
  const medal = state.achievements.get(discipline.id) ?? "offen";
  article.innerHTML = `
    <div class="card-head">
      <div>
        <div class="dex-no">#${String(discipline.sortierung).padStart(3, "0")}</div>
        <h3>${escapeHtml(discipline.name)}</h3>
      </div>
      <div class="sport-icon" aria-hidden="true">${iconFor(discipline.kategorie_1)}</div>
    </div>
    <div class="chip-row">
      <span class="chip">${escapeHtml(discipline.kategorie_1)}</span>
      ${discipline.kategorie_2 ? `<span class="chip">${escapeHtml(discipline.kategorie_2)}</span>` : ""}
      <span class="chip">Gen ${discipline.generation}</span>
      ${discipline.dsa ? `<span class="chip dsa">DSA</span>` : ""}
    </div>
    <div class="detail-row">
      <span>${escapeHtml(discipline.einheit)}</span>
      <span>${discipline.bewertungsrichtung === "hoeher" ? "hoeher ist besser" : "niedriger ist besser"}</span>
    </div>
    <div class="medal-row" aria-label="Medaillenplaetze">
      <span class="medal bronze">Bronze</span>
      <span class="medal silver">Silber</span>
      <span class="medal gold">Gold</span>
    </div>
    <div class="status">Status: ${medalLabel(medal)}</div>
  `;
  return article;
}

function renderProfile() {
  const profile = state.profile;
  const isConnected = state.connected;
  const isSignedIn = Boolean(state.session?.user);

  els.profileView.classList.toggle("is-auth-restoring", state.authRestoring);

  if (state.authRestoring) {
    setProfileState("Anmeldung wird wiederhergestellt ...");
  } else if (!isConnected) {
    setProfileState("Demo-Modus: Registrierung, Anmeldung und Speichern sind deaktiviert, bis Supabase konfiguriert ist.");
  } else if (state.profileLoadError) {
    setProfileState(state.profileLoadError, "error");
  } else {
    hideState(els.profileState);
  }

  if (profile) {
    els.profileTitle.textContent = profile.nutzername;
    els.profileRank.textContent = `Rank ${profile.rank ?? 1}`;
    els.profileAvatar.textContent = initials(profile);
    fillEditForm(profile);
  } else {
    els.profileTitle.textContent = isSignedIn ? "Profil wird vorbereitet" : "Nicht angemeldet";
    els.profileRank.textContent = "Rank 1";
    els.profileAvatar.textContent = "SD";
  }

  const medals = [...state.achievements.values()];
  els.statDone.textContent = String(state.achievements.size);
  els.statGold.textContent = String(medals.filter((medal) => medal === "gold").length);
  els.statTotal.textContent = String(medals.length);

  if (state.authRestoring) {
    return;
  }

  showAuthPane(isSignedIn ? "edit" : "login");
  els.loginForm.querySelector("button").disabled = !isConnected;
  els.registerForm.querySelector("button").disabled = !isConnected;
  els.editForm.querySelector("button").disabled = !isConnected || !isSignedIn;
  els.logout.disabled = !isConnected || !isSignedIn;
}

async function handleLogin(event) {
  event.preventDefault();
  if (!state.connected) return;
  const form = new FormData(event.currentTarget);
  setProfileState("Anmeldung laeuft ...");
  const { error } = await state.supabase.auth.signInWithPassword({
    email: form.get("email"),
    password: form.get("password")
  });
  if (error) return setProfileState(error.message, "error");
  setProfileState("Angemeldet.", "success");
  showAuthPane("edit");
}

async function handleRegister(event) {
  event.preventDefault();
  if (!state.connected) return;
  const form = new FormData(event.currentTarget);
  const nutzername = String(form.get("nutzername")).toLowerCase();
  setProfileState("Registrierung laeuft ...");
  const { error } = await state.supabase.auth.signUp({
    email: form.get("email"),
    password: form.get("password"),
    options: {
      data: {
        nutzername,
        wertungsklasse: form.get("wertungsklasse")
      }
    }
  });
  if (error) return setProfileState(error.message, "error");
  setProfileState("Registrierung angelegt. Falls E-Mail-Bestaetigung aktiv ist, bitte Postfach pruefen.", "success");
}

async function handleProfileSave(event) {
  event.preventDefault();
  if (!state.connected || !state.session?.user) return;
  const form = new FormData(event.currentTarget);
  const payload = {
    id: state.session.user.id,
    nutzername: String(form.get("nutzername")).toLowerCase(),
    wertungsklasse: form.get("wertungsklasse"),
    vorname: emptyToNull(form.get("vorname")),
    nachname: emptyToNull(form.get("nachname")),
    geburtsdatum: emptyToNull(form.get("geburtsdatum")),
    beschreibung: emptyToNull(form.get("beschreibung"))
  };
  setProfileState("Profil wird gespeichert ...");
  const { data, error } = await state.supabase.from("nutzer").upsert(payload).select("*").single();
  if (error) return setProfileState(error.message, "error");
  state.profile = data;
  renderProfile();
  setProfileState("Profil gespeichert.", "success");
}

async function handleLogout() {
  if (!state.connected) return;
  await state.supabase.auth.signOut();
  clearPersonalState();
  renderProfile();
  renderDex();
  showAuthPane("login");
}

function clearPersonalState() {
  state.session = null;
  clearPersonalData();
  els.loginForm.reset();
  els.editForm.reset();
}

function clearPersonalData() {
  state.profile = null;
  state.profileLoadError = "";
  state.achievements = new Map();
}

function showView(viewName) {
  state.activeView = viewName;
  els.views.forEach((view) => view.classList.toggle("is-active", view.id === `view-${viewName}`));
  els.nav.forEach((button) => button.classList.toggle("is-active", button.dataset.view === viewName));
  els.title.textContent = viewName === "dex" ? "Dex" : viewName === "feed" ? "Feed" : "Profil";
  document.querySelector("#app").focus({ preventScroll: true });
}

function showAuthPane(tabName) {
  els.authTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.authTab === tabName));
  els.panes.forEach((pane) => pane.classList.toggle("is-active", pane.id === `${tabName}-form`));
}

function fillEditForm(profile) {
  const form = els.editForm;
  form.elements.nutzername.value = profile.nutzername ?? "";
  form.elements.wertungsklasse.value = profile.wertungsklasse ?? "m";
  form.elements.vorname.value = profile.vorname ?? "";
  form.elements.nachname.value = profile.nachname ?? "";
  form.elements.geburtsdatum.value = profile.geburtsdatum ?? "";
  form.elements.beschreibung.value = profile.beschreibung ?? "";
}

function setDexState(message, type = "") {
  setStateBox(els.dexState, message, type);
}

function setProfileState(message, type = "") {
  setStateBox(els.profileState, message, type);
}

function setStateBox(element, message, type) {
  element.hidden = false;
  element.textContent = message;
  element.className = `state-box${type ? ` is-${type}` : ""}`;
}

function hideState(element) {
  element.hidden = true;
  element.textContent = "";
  element.className = "state-box";
}

function option(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function bestMedal(a = "keine", b = "keine") {
  const rank = { offen: 0, keine: 1, unbewertet: 1, bronze: 2, silber: 3, gold: 4 };
  return rank[b] > rank[a] ? b : a;
}

function medalLabel(value) {
  const labels = { offen: "offen", keine: "keine Medaille", unbewertet: "unbewertet", bronze: "Bronze", silber: "Silber", gold: "Gold" };
  return labels[value] ?? "offen";
}

function initials(profile) {
  const source = profile.nutzername || `${profile.vorname ?? ""} ${profile.nachname ?? ""}`;
  return source.trim().slice(0, 2).toUpperCase() || "SD";
}

function emptyToNull(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function iconFor(category) {
  const icons = {
    Basketball: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.7 6.2a8 8 0 0 1 1 3.8h-3.5a15 15 0 0 0-.7-4.3 8 8 0 0 1 3.2.5Zm-5.1-3.9c.8 1.2 1.4 2.8 1.7 4.5A8.8 8.8 0 0 1 9 15.1a16.7 16.7 0 0 1-1.3-5.8 8.8 8.8 0 0 1 5.9-5Zm-3.3-.1a10.8 10.8 0 0 0-4.6 3.4 7.9 7.9 0 0 1-1.8-.9 8 8 0 0 1 6.4-2.5ZM3.1 8.5c.5.3 1.3.7 2.5 1 .1 2.1.6 4.2 1.4 6.1a9 9 0 0 1-2.3.1A8 8 0 0 1 3 12c0-1.2.3-2.4.8-3.5Zm3 9.2c.6-.1 1.2-.3 1.8-.5.7 1.2 1.5 2.2 2.5 2.8a8 8 0 0 1-4.3-2.3Zm7 2.1a7 7 0 0 1-3.4-3.2 10.8 10.8 0 0 0 5.8-5.2c0 .2 0 .4 0 .6a15 15 0 0 1-2.4 7.8Zm2.5-1.1a17 17 0 0 0 1.9-4.7h2a8 8 0 0 1-3.9 4.7Z"/></svg>',
    Schwimmen: '<svg viewBox="0 0 24 24"><path d="M7.2 8.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Zm12.6 7.8c-1.7 0-2.6-1-4-1s-2.3 1-4 1-2.6-1-4-1-2.3 1-4 1v2c1.7 0 2.6-1 4-1s2.3 1 4 1 2.6-1 4-1 2.3 1 4 1v-2ZM3.8 13.7c1.7 0 2.6-1 4-1 .8 0 1.4.3 2 .6l2.6-3.4 2.7 2.1H20v-2.2h-4.1l-4.5-3.4-4.5 5.9a6.4 6.4 0 0 0-3.1-.7v2.1Z"/></svg>',
    Laufen: '<svg viewBox="0 0 24 24"><path d="M15.5 5.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2ZM10 21l2.1-5.7 2.2 2.1V23h2.4v-6.5l-3.1-3 .9-3a8 8 0 0 0 3.8 2.1l.6-2.3a5 5 0 0 1-3.8-2.8l-.5-.9a2.3 2.3 0 0 0-3.5-.6L7.8 8.8v5h2.3v-4l1.4-1.2-1.5 5L7.4 21H10Z"/></svg>',
    Fahrrad: '<svg viewBox="0 0 24 24"><path d="M6.5 20a4.5 4.5 0 1 1 3.9-6.8l1.2-2.2H9V8.8h4l1-1.8h-2V5h4.4l-1.7 3.2 2.2 5A4.5 4.5 0 1 1 15 14.3l-1.1-2.5-1.8 3.4h-1.3A4.5 4.5 0 0 1 6.5 20Zm0-2.2a2.3 2.3 0 0 0 2-3.5l-2 3.5Zm10.9 0a2.3 2.3 0 1 0 .4-2.3l1 2.3h-1.4Z"/></svg>',
    Kraft: '<svg viewBox="0 0 24 24"><path d="M3 10h3V7h2v10H6v-3H3v-4Zm18 4h-3v3h-2V7h2v3h3v4ZM9 11h6v2H9v-2Z"/></svg>',
    Volleyball: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM6.1 7.2A8 8 0 0 1 12 4c.2 0 .4 0 .6.1A10.2 10.2 0 0 0 8.7 11a11 11 0 0 1-2.6-3.8Zm-1.9 5.4c.9.3 2 .5 3.2.4.2 2.2 1 4.1 2.2 5.8a8 8 0 0 1-5.4-6.2Zm8.2 7.3a9.1 9.1 0 0 1-2.9-7.3 11 11 0 0 0 6.4-3.9c.7 1 1.2 2.1 1.5 3.4a8.8 8.8 0 0 1-5 7.8Zm6.9-5.2a12.6 12.6 0 0 0-4.9-9.8 8 8 0 0 1 4.9 9.8Z"/></svg>'
  };
  return icons[category] ?? '<svg viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6l-8-4Zm0 4 4 2v4c0 2.8-1.6 5-4 6-2.4-1-4-3.2-4-6V8l4-2Z"/></svg>';
}
