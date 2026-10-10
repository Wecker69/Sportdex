import { demoDisciplines } from "../data/disciplines.js";

const state = {
  supabase: null,
  connected: false,
  session: null,
  authRestoring: true,
  authSubscription: null,
  profileLoadError: "",
  profile: null,
  users: [],
  expandedUserId: null,
  outgoingFollows: new Map(),
  incomingFollows: new Map(),
  incomingRequests: [],
  openFollowMenuId: "",
  openRequestFollowMenuId: "",
  pendingFollowIds: new Set(),
  pendingRequestIds: new Set(),
  followMessage: "",
  followMessageType: "",
  connectMessage: "",
  connectMessageType: "",
  connectTab: "all",
  disciplines: [],
  achievements: new Map(),
  activeView: "dex",
  filters: {
    search: "",
    userSearch: ""
  }
};

const els = {
  title: document.querySelector("#view-title"),
  connection: document.querySelector("#connection-state"),
  views: document.querySelectorAll(".view"),
  nav: document.querySelectorAll(".bottom-nav button"),
  dexFilter: document.querySelector("#dex-filter"),
  list: document.querySelector("#discipline-list"),
  dexState: document.querySelector("#dex-state"),
  resultCount: document.querySelector("#result-count"),
  search: document.querySelector("#search-input"),
  userSearchForm: document.querySelector("#user-search-form"),
  userSearch: document.querySelector("#user-search-input"),
  userSearchState: document.querySelector("#user-search-state"),
  userList: document.querySelector("#user-list"),
  connectState: document.querySelector("#connect-state"),
  requestList: document.querySelector("#request-list"),
  connectBadge: document.querySelector("#connect-badge"),
  connectTabs: document.querySelectorAll("[data-connect-tab]"),
  authTabs: document.querySelectorAll("[data-auth-tab]"),
  panes: document.querySelectorAll(".auth-pane"),
  profileState: document.querySelector("#profile-state"),
  profileView: document.querySelector("#view-profile"),
  profileTitle: document.querySelector("#profile-title"),
  profileRank: document.querySelector("#profile-rank"),
  profileAvatar: document.querySelector("#profile-avatar"),
  statDex: document.querySelector("#stat-dex"),
  statBronze: document.querySelector("#stat-bronze"),
  statSilver: document.querySelector("#stat-silver"),
  statGold: document.querySelector("#stat-gold"),
  statFollowers: document.querySelector("#stat-followers"),
  statFollowing: document.querySelector("#stat-following"),
  loginForm: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  editForm: document.querySelector("#edit-form"),
  logout: document.querySelector("#logout-button"),
  deleteProfile: document.querySelector("#delete-profile-button")
};

const categoryColors = {
  Basketball: "var(--color-category-basketball)",
  Koordination: "var(--color-category-koordination)",
  Fussball: "var(--color-category-fussball)",
  Schwimmen: "var(--color-category-schwimmen)",
  Laufen: "var(--color-category-laufen)",
  Fahrrad: "var(--color-category-fahrrad)",
  Kraft: "var(--color-category-kraft)",
  Volleyball: "var(--color-category-volleyball)",
  Leichtathletik: "var(--color-category-leichtathletik)",
  Tempo: "var(--color-category-tempo)",
  Ausdauer: "var(--color-category-ausdauer)"
};

init();

async function init() {
  bindUi();
  setDexState("Disziplinen werden geladen ...");
  await initSupabase();
  await loadSession();
  await loadDisciplines();
  await loadUsers();
  await loadFollowData();
  await loadProfileAndStats();
  finishAuthRestore();
  renderDex();
  renderUserSearch();
  renderConnect();
  renderProfile();
}

function bindUi() {
  setActiveNavIndicator(2);
  window.addEventListener("resize", () => {
    const activeIndex = [...els.nav].findIndex((button) => button.classList.contains("is-active"));
    setActiveNavIndicator(activeIndex < 0 ? 0 : activeIndex);
  });

  els.nav.forEach((button) => {
    button.addEventListener("click", () => {
      void showView(button.dataset.view);
    });
  });

  els.search.addEventListener("input", () => {
    state.filters.search = els.search.value.trim().toLowerCase();
    renderDex();
  });
  els.dexFilter.addEventListener("submit", (event) => {
    event.preventDefault();
    els.search.blur();
  });
  els.userSearch.addEventListener("input", () => {
    state.filters.userSearch = els.userSearch.value.trim().toLowerCase();
    state.expandedUserId = null;
    renderUserSearch();
  });
  els.userSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    els.userSearch.blur();
  });

  els.authTabs.forEach((button) => {
    button.addEventListener("click", () => showAuthPane(button.dataset.authTab));
  });
  els.connectTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.connectTab = button.dataset.connectTab;
      renderConnect();
    });
  });

  els.loginForm.addEventListener("submit", handleLogin);
  els.registerForm.addEventListener("submit", handleRegister);
  els.editForm.addEventListener("submit", handleProfileSave);
  els.logout.addEventListener("click", handleLogout);
  els.deleteProfile.addEventListener("click", handleProfileDelete);
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
    await loadUsers();
    await loadFollowData();
    finishAuthRestore();
    renderDex();
    renderUserSearch();
    renderConnect();
    renderProfile();
    showAuthPane("login");
    return;
  }
  await loadUsers();
  await loadFollowData();
  await loadProfileAndStats();
  finishAuthRestore();
  renderDex();
  renderUserSearch();
  renderConnect();
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

async function loadUsers() {
  state.users = [];
  if (!state.connected) {
    setUserSearchState("Demo-Modus: Nutzersuche ist erst mit Supabase-Verbindung verfuegbar.");
    return;
  }

  const { data, error } = await state.supabase
    .from("oeffentliche_profile")
    .select("id, nutzername, profilbild, rank, dex, bronze, silver, gold, followers, following")
    .order("nutzername", { ascending: true });

  if (error) {
    setUserSearchState(`Nutzer konnten nicht geladen werden: ${error.message}`, "error");
    return;
  }

  state.users = data ?? [];
  if (!state.users.length) {
    setUserSearchState("Keine Profile gefunden. Pruefe in Supabase, ob in public.nutzer fuer beide Accounts ein Profil existiert.", "error");
    return;
  }
  hideState(els.userSearchState);
}

async function loadFollowData() {
  state.outgoingFollows = new Map();
  state.incomingFollows = new Map();
  state.incomingRequests = [];
  if (!state.connected || !state.session?.user) {
    updateConnectBadge();
    return;
  }

  const userId = state.session.user.id;
  const [{ data: outgoing, error: outgoingError }, { data: incoming, error: incomingError }] = await Promise.all([
    state.supabase
      .from("follow")
      .select("follower_id, gefolgter_id, status, erstellt_am")
      .eq("follower_id", userId),
    state.supabase
      .from("follow")
      .select("follower_id, gefolgter_id, status, erstellt_am")
      .eq("gefolgter_id", userId)
      .order("erstellt_am", { ascending: false })
  ]);

  if (outgoingError || incomingError) {
    state.connectMessage = "Follow-Daten konnten nicht geladen werden.";
    state.connectMessageType = "error";
    updateConnectBadge();
    return;
  }

  state.connectMessage = "";
  state.connectMessageType = "";
  (outgoing ?? []).forEach((follow) => {
    state.outgoingFollows.set(follow.gefolgter_id, follow.status);
  });
  state.incomingRequests = incoming ?? [];
  state.incomingRequests.forEach((follow) => {
    state.incomingFollows.set(follow.follower_id, follow.status);
  });
  updateConnectBadge();
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
  return !query || discipline.name.toLowerCase().includes(query);
}

function renderUserSearch() {
  const query = state.filters.userSearch;
  const currentUserId = state.session?.user?.id ?? "";
  const otherUsers = state.users.filter((user) => user.id !== currentUserId);
  const users = otherUsers.filter((user) => matchesUserSearch(user, query));
  if (state.expandedUserId && !users.some((user) => user.id === state.expandedUserId)) {
    state.expandedUserId = null;
  }

  els.userList.innerHTML = "";

  if (!state.connected) {
    setUserSearchState("Demo-Modus: Nutzersuche ist erst mit Supabase-Verbindung verfuegbar.");
    return;
  }

  if (!otherUsers.length) {
    setUserSearchState("Noch keine anderen Nutzer gefunden.");
    return;
  }

  if (!users.length) {
    setUserSearchState("Kein Nutzer passt zu dieser Suche.");
    return;
  }

  if (state.followMessage) {
    setUserSearchState(state.followMessage, state.followMessageType);
  } else {
    hideState(els.userSearchState);
  }
  const fragment = document.createDocumentFragment();
  users.forEach((user) => fragment.append(renderUserCard(user)));
  els.userList.append(fragment);
}

function matchesUserSearch(user, query) {
  if (!query) return true;
  return [
    user.nutzername,
    user.vorname,
    user.nachname
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function renderUserCard(user) {
  const isExpanded = state.expandedUserId === user.id;
  const stats = publicUserStats(user);
  const followStatus = state.outgoingFollows.get(user.id) ?? "";
  const incomingStatus = state.incomingFollows.get(user.id) ?? "";
  const isPending = state.pendingFollowIds.has(user.id);
  const canShowFollow = state.session?.user?.id !== user.id;
  const isMenuOpen = state.openFollowMenuId === user.id;
  const article = document.createElement("article");
  article.className = `user-card${isExpanded ? " is-expanded" : ""}`;
  article.innerHTML = `
    <button class="user-card-toggle" type="button" aria-expanded="${isExpanded}" aria-label="Profil von @${escapeHtml(user.nutzername ?? "nutzer")} ${isExpanded ? "einklappen" : "ausklappen"}">
      <div class="avatar small-avatar">${escapeHtml(initials(user))}</div>
      <div>
        <h3>@${escapeHtml(user.nutzername ?? "nutzer")}</h3>
      </div>
      <div class="user-card-action">
        <span class="rank-label ${escapeHtml(rankClass(user.rank))}">${escapeHtml(rankLabel(user.rank))}</span>
      </div>
    </button>
    ${isExpanded ? `
      <div class="user-card-details">
        <div class="profile-metrics user-card-metrics" aria-label="Profilzahlen">
          <span><strong>${stats.dex}</strong> Dex</span>
          <span><strong>${stats.followers}</strong> Follower</span>
          <span><strong>${stats.following}</strong> Gefolgt</span>
        </div>
        <div class="user-card-medals" aria-label="Medaillen">
          <span class="stat-card stat-bronze"><strong>${stats.bronze}</strong><span>Bronze</span></span>
          <span class="stat-card stat-silver"><strong>${stats.silver}</strong><span>Silber</span></span>
          <span class="stat-card stat-gold"><strong>${stats.gold}</strong><span>Gold</span></span>
        </div>
        ${canShowFollow ? `
          <button class="follow-button ${escapeHtml(followButtonClass(followStatus))}" type="button" data-follow-user="${escapeHtml(user.id)}" ${isPending ? "disabled" : ""}>${escapeHtml(followButtonLabel(followStatus, incomingStatus, isPending))}</button>
          ${isMenuOpen && followStatus ? `<div class="follow-menu"><button type="button" data-follow-menu-action="${followStatus === "angefragt" ? "withdraw" : "unfollow"}">${followStatus === "angefragt" ? "Anfrage zurueckziehen" : "Entfolgen"}</button></div>` : ""}
          ${incomingStatus === "angefragt" ? `
            <div class="incoming-search-actions">
              <button class="accept-button" type="button" data-incoming-action="accept" ${isPending ? "disabled" : ""}>Annehmen</button>
              <button class="decline-button" type="button" data-incoming-action="decline" ${isPending ? "disabled" : ""}>Ablehnen</button>
            </div>
          ` : ""}
        ` : ""}
      </div>
    ` : ""}
  `;
  article.querySelector(".user-card-toggle").addEventListener("click", () => {
    state.expandedUserId = isExpanded ? null : user.id;
    renderUserSearch();
  });
  article.querySelector("[data-follow-user]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    void handleFollowClick(user.id);
  });
  article.querySelector("[data-follow-menu-action]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    void handleFollowMenuAction(user.id, event.currentTarget.dataset.followMenuAction);
  });
  article.querySelectorAll("[data-incoming-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void handleIncomingSearchAction(user.id, button.dataset.incomingAction);
    });
  });
  return article;
}

function publicUserStats(user) {
  return {
    dex: user.dex ?? 0,
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    bronze: user.bronze ?? 0,
    silver: user.silver ?? 0,
    gold: user.gold ?? 0
  };
}

function ownFollowCounts() {
  if (!state.session?.user) {
    return { followers: 0, following: 0 };
  }
  const ownPublicProfile = state.users.find((user) => user.id === state.session.user.id);
  const followers = state.incomingRequests.filter((request) => request.status === "angenommen").length;
  const following = [...state.outgoingFollows.values()].filter((status) => status === "angenommen").length;
  return {
    followers: followers || ownPublicProfile?.followers || 0,
    following: following || ownPublicProfile?.following || 0
  };
}

function followButtonLabel(status, incomingStatus, isPending) {
  if (isPending) return "Speichert ...";
  if (status === "angefragt") return "Angefragt";
  if (status === "angenommen") return "Gefolgt";
  if (incomingStatus === "angenommen") return "Zurueckfolgen";
  return "Folgen";
}

function followButtonClass(status) {
  return status ? "is-secondary" : "is-positive";
}

function renderDisciplineCard(discipline) {
  const article = document.createElement("article");
  article.className = "discipline-card";
  article.style.setProperty("--category-color", categoryColors[discipline.kategorie_1] ?? "var(--color-primary)");
  const medal = state.achievements.get(discipline.id) ?? "offen";
  const icons = [
    renderSportIcon(discipline.kategorie_1),
    discipline.kategorie_2 ? renderSportIcon(discipline.kategorie_2) : ""
  ].join("");
  const dsaLabel = discipline.dsa ? '<span class="dsa-badge">DSA</span>' : "";
  article.innerHTML = `
    <div class="card-head">
      <div>
        <div class="dex-no">#${String(discipline.sortierung).padStart(3, "0")}</div>
        <h3>${escapeHtml(discipline.name)}</h3>
      </div>
      <div class="icon-row" aria-label="Kategoriezeichen">${icons}</div>
    </div>
    <div class="medal-row" aria-label="Medaillenplaetze">
      <span class="medal bronze">Bronze</span>
      <span class="medal silver">Silber</span>
      <span class="medal gold">Gold</span>
    </div>
    <div class="status-row"><span class="status">Status: ${medalLabel(medal)}</span>${dsaLabel}</div>
  `;
  return article;
}

function renderSportIcon(category) {
  const color = categoryColors[category] ?? "var(--color-primary)";
  return `<span class="sport-icon" style="--icon-color: ${color}" title="${escapeHtml(category)}" aria-label="${escapeHtml(category)}">${iconFor(category)}</span>`;
}

function renderConnect() {
  els.requestList.innerHTML = "";
  els.connectTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.connectTab === state.connectTab);
  });

  if (!state.connected) {
    setConnectState("Demo-Modus: Anfragen sind erst mit Supabase-Verbindung verfuegbar.");
    return;
  }
  if (!state.session?.user) {
    setConnectState("Bitte melde dich im Profil an, um Follow-Anfragen zu sehen.");
    return;
  }

  const openRequests = state.incomingRequests.filter((request) => request.status === "angefragt");
  const followers = state.incomingRequests.filter((request) => request.status === "angenommen");
  const usersById = new Map(state.users.map((user) => [user.id, user]));
  const following = [...state.outgoingFollows.entries()]
    .filter(([, status]) => status === "angenommen")
    .map(([userId]) => usersById.get(userId) ?? { id: userId, nutzername: "nutzer", rank: 1 });
  const cards = connectCardsForTab(state.connectTab, openRequests, followers, following);

  if (state.connectMessage) {
    setConnectState(state.connectMessage, state.connectMessageType);
  } else if (!cards.length) {
    setConnectState(connectEmptyMessage(state.connectTab));
  } else {
    hideState(els.connectState);
  }

  if (!cards.length) return;

  const fragment = document.createDocumentFragment();
  cards.forEach((card) => {
    if (card.kind === "following") {
      fragment.append(renderFollowingCard(card.user));
      return;
    }
    const requester = usersById.get(card.request.follower_id) ?? { id: card.request.follower_id, nutzername: "nutzer", rank: 1 };
    fragment.append(renderRequestCard(card.request, requester));
  });
  els.requestList.append(fragment);
}

function connectCardsForTab(tab, openRequests, followers, following) {
  const incomingCards = [
    ...openRequests.map((request) => ({ kind: "incoming", request })),
    ...followers.map((request) => ({ kind: "incoming", request }))
  ];
  const followingCards = following.map((user) => ({ kind: "following", user }));
  if (tab === "followers") return incomingCards;
  if (tab === "following") return followingCards;
  return [...incomingCards, ...followingCards];
}

function connectEmptyMessage(tab) {
  if (tab === "followers") return "Keine Follower oder offenen Anfragen";
  if (tab === "following") return "Du folgst noch niemandem";
  return "Keine Follower, offenen Anfragen oder gefolgten Profile";
}

function renderRequestCard(request, requester) {
  const article = document.createElement("article");
  article.className = "request-card";
  const requesterId = request.follower_id;
  const reverseStatus = state.outgoingFollows.get(requesterId) ?? "";
  const isPending = state.pendingRequestIds.has(requesterId);
  const isAccepted = request.status === "angenommen";
  article.innerHTML = `
    <div class="avatar small-avatar">${escapeHtml(initials(requester))}</div>
    <div class="request-body">
      <h3>@${escapeHtml(requester.nutzername ?? "nutzer")}</h3>
      <span class="rank-label ${escapeHtml(rankClass(requester.rank))}">${escapeHtml(rankLabel(requester.rank))}</span>
    </div>
    <span class="request-type">${request.status === "angefragt" ? "Anfrage" : "Follower"}</span>
    <div class="request-actions">
      ${request.status === "angefragt" ? `
        <button class="accept-button" type="button" data-request-action="accept" ${isPending ? "disabled" : ""}>Annehmen</button>
        <button class="decline-button" type="button" data-request-action="decline" ${isPending ? "disabled" : ""}>Ablehnen</button>
      ` : ""}
      ${isAccepted ? `
        ${renderReverseFollowButton(reverseStatus, isPending)}
        <button class="decline-button" type="button" data-request-action="remove-follower" ${isPending ? "disabled" : ""}>Entfernen</button>
      ` : ""}
    </div>
  `;
  article.querySelectorAll("[data-request-action]").forEach((button) => {
    button.addEventListener("click", () => {
      void handleRequestAction(requesterId, button.dataset.requestAction);
    });
  });
  return article;
}

function renderFollowingCard(user) {
  const article = document.createElement("article");
  article.className = "request-card";
  const userId = user.id;
  const isPending = state.pendingRequestIds.has(userId);
  article.innerHTML = `
    <div class="avatar small-avatar">${escapeHtml(initials(user))}</div>
    <div class="request-body">
      <h3>@${escapeHtml(user.nutzername ?? "nutzer")}</h3>
      <span class="rank-label ${escapeHtml(rankClass(user.rank))}">${escapeHtml(rankLabel(user.rank))}</span>
    </div>
    <span class="request-type">Gefolgt</span>
    <div class="request-actions">
      <button class="accept-back-button is-secondary" type="button" disabled>Gefolgt</button>
      <button class="decline-button" type="button" data-request-action="unfollow-outgoing" ${isPending ? "disabled" : ""}>Entfolgen</button>
    </div>
  `;
  article.querySelectorAll("[data-request-action]").forEach((button) => {
    button.addEventListener("click", () => {
      void handleRequestAction(userId, button.dataset.requestAction);
    });
  });
  return article;
}

function renderReverseFollowButton(status, isPending) {
  if (status === "angefragt") {
    return `<button class="accept-back-button is-secondary" type="button" data-request-action="toggle-follow-menu" ${isPending ? "disabled" : ""}>Angefragt</button>`;
  }
  if (status === "angenommen") {
    return `<button class="accept-back-button is-secondary" type="button" disabled>Gefolgt</button>`;
  }
  return `<button class="accept-back-button" type="button" data-request-action="follow-back" ${isPending ? "disabled" : ""}>Zurueckfolgen</button>`;
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
    els.profileTitle.textContent = `@${profile.nutzername}`;
    els.profileRank.textContent = rankLabel(profile.rank);
    els.profileRank.className = `eyebrow rank-label ${rankClass(profile.rank)}`;
    els.profileAvatar.textContent = initials(profile);
    fillEditForm(profile);
  } else {
    els.profileTitle.textContent = isSignedIn ? "Profil wird vorbereitet" : "Nicht angemeldet";
    els.profileRank.textContent = "Sportler";
    els.profileRank.className = "eyebrow rank-label rank-sportler";
    els.profileAvatar.textContent = "SD";
  }

  const medals = [...state.achievements.values()];
  els.statDex.textContent = String(state.achievements.size);
  els.statBronze.textContent = String(medals.filter((medal) => medal === "bronze").length);
  els.statSilver.textContent = String(medals.filter((medal) => medal === "silber").length);
  els.statGold.textContent = String(medals.filter((medal) => medal === "gold").length);
  const ownCounts = ownFollowCounts();
  els.statFollowers.textContent = String(ownCounts.followers);
  els.statFollowing.textContent = String(ownCounts.following);

  if (state.authRestoring) {
    return;
  }

  showAuthPane(isSignedIn ? "edit" : "login");
  els.loginForm.querySelector("button").disabled = !isConnected;
  els.registerForm.querySelector("button").disabled = !isConnected;
  els.editForm.querySelector("button").disabled = !isConnected || !isSignedIn;
  els.logout.disabled = !isConnected || !isSignedIn;
  els.deleteProfile.disabled = !isConnected || !isSignedIn;
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
  await loadUsers();
  renderUserSearch();
  renderProfile();
  setProfileState("Profil gespeichert.", "success");
}

async function handleProfileDelete() {
  if (!state.connected || !state.session?.user) return;
  const confirmed = window.confirm("Profil wirklich loeschen? Deine Leistungen, Beitraege und Follow-Beziehungen werden entfernt.");
  if (!confirmed) return;

  els.deleteProfile.disabled = true;
  setProfileState("Profil wird geloescht ...");
  const { data, error } = await state.supabase
    .from("nutzer")
    .delete()
    .eq("id", state.session.user.id)
    .select("id");

  if (error || !Array.isArray(data) || data.length === 0) {
    els.deleteProfile.disabled = false;
    setProfileState(error?.message ?? "Profil konnte nicht geloescht werden.", "error");
    return;
  }

  await state.supabase.auth.signOut();
  clearPersonalState();
  await loadUsers();
  await loadFollowData();
  renderDex();
  renderUserSearch();
  renderConnect();
  renderProfile();
  setProfileState("Profil geloescht.", "success");
  showAuthPane("login");
}

async function handleFollowClick(userId) {
  state.followMessage = "";
  state.followMessageType = "";
  if (!state.connected) {
    state.followMessage = "Supabase ist nicht verbunden. Folgen ist im Demo-Modus nicht verfuegbar.";
    renderUserSearch();
    return;
  }
  if (!state.session?.user) {
    state.followMessage = "Bitte melde dich im Profil an, um anderen Nutzern folgen zu koennen.";
    state.followMessageType = "error";
    renderUserSearch();
    await showView("profile");
    return;
  }
  if (state.session.user.id === userId || state.pendingFollowIds.has(userId)) return;

  const currentStatus = state.outgoingFollows.get(userId) ?? "";
  if (currentStatus) {
    state.openFollowMenuId = state.openFollowMenuId === userId ? "" : userId;
    renderUserSearch();
    return;
  }

  state.pendingFollowIds.add(userId);
  renderUserSearch();

  let error = null;
  let data = null;
  ({ data, error } = await state.supabase
    .from("follow")
    .insert({ follower_id: state.session.user.id, gefolgter_id: userId, status: "angefragt" })
    .select("follower_id"));

  if (!error && Array.isArray(data) && data.length === 0) {
    error = new Error("Die Follow-Aktion konnte nicht gespeichert werden.");
  }

  if (error) {
    state.followMessage = followErrorMessage(error);
    state.followMessageType = "error";
  }

  state.pendingFollowIds.delete(userId);
  await refreshSocialState();
}

async function handleFollowMenuAction(userId, action) {
  if (!state.connected || !state.session?.user || state.pendingFollowIds.has(userId)) return;

  state.followMessage = "";
  state.followMessageType = "";
  const requiredStatus = action === "withdraw" ? "angefragt" : "angenommen";
  state.pendingFollowIds.add(userId);
  state.openFollowMenuId = "";
  renderUserSearch();

  const { data, error } = await state.supabase
    .from("follow")
    .delete()
    .eq("follower_id", state.session.user.id)
    .eq("gefolgter_id", userId)
    .eq("status", requiredStatus)
    .select("follower_id");

  if (error || !Array.isArray(data) || data.length === 0) {
    state.followMessage = error ? followErrorMessage(error) : "Die Follow-Aktion konnte nicht gespeichert werden.";
    state.followMessageType = "error";
  }

  state.pendingFollowIds.delete(userId);
  await refreshSocialState();
}

async function handleIncomingSearchAction(userId, action) {
  if (!state.connected || !state.session?.user || state.pendingFollowIds.has(userId)) return;

  state.pendingFollowIds.add(userId);
  renderUserSearch();
  const query = state.supabase.from("follow");
  const request = action === "accept"
    ? query.update({ status: "angenommen" })
    : query.delete();
  const { data, error } = await request
    .eq("follower_id", userId)
    .eq("gefolgter_id", state.session.user.id)
    .eq("status", "angefragt")
    .select("follower_id");

  if (error || !Array.isArray(data) || data.length === 0) {
    state.followMessage = error ? followErrorMessage(error) : "Die Anfrage wurde nicht gefunden oder bereits bearbeitet.";
    state.followMessageType = "error";
  }

  state.pendingFollowIds.delete(userId);
  await refreshSocialState();
}

async function handleRequestAction(requesterId, action) {
  state.connectMessage = "";
  state.connectMessageType = "";
  if (!state.connected || !state.session?.user || state.pendingRequestIds.has(requesterId)) return;

  if (action === "close") {
    renderConnect();
    return;
  }

  if (action === "toggle-follow-menu") {
    state.openRequestFollowMenuId = state.openRequestFollowMenuId === requesterId ? "" : requesterId;
    renderConnect();
    return;
  }

  state.pendingRequestIds.add(requesterId);
  state.openRequestFollowMenuId = "";
  renderConnect();

  let error = null;
  let data = null;
  if (action === "accept") {
    ({ data, error } = await state.supabase
      .from("follow")
      .update({ status: "angenommen" })
      .eq("follower_id", requesterId)
      .eq("gefolgter_id", state.session.user.id)
      .eq("status", "angefragt")
      .select("follower_id"));
    if (!error && Array.isArray(data) && data.length > 0) {
      const request = state.incomingRequests.find((item) => item.follower_id === requesterId);
      if (request) request.status = "angenommen";
      state.incomingFollows.set(requesterId, "angenommen");
    }
  } else if (action === "follow-back") {
    ({ data, error } = await state.supabase
      .from("follow")
      .insert({ follower_id: state.session.user.id, gefolgter_id: requesterId, status: "angefragt" })
      .select("follower_id"));
    if (!error && Array.isArray(data) && data.length > 0) {
      state.outgoingFollows.set(requesterId, "angefragt");
    }
  } else if (action === "decline") {
    ({ data, error } = await state.supabase
      .from("follow")
      .delete()
      .eq("follower_id", requesterId)
      .eq("gefolgter_id", state.session.user.id)
      .eq("status", "angefragt")
      .select("follower_id"));
    if (!error && Array.isArray(data) && data.length > 0) {
      const request = state.incomingRequests.find((item) => item.follower_id === requesterId);
      if (request) request.status = "abgelehnt";
      state.incomingFollows.delete(requesterId);
    }
  } else if (action === "remove-follower") {
    ({ data, error } = await state.supabase
      .from("follow")
      .delete()
      .eq("follower_id", requesterId)
      .eq("gefolgter_id", state.session.user.id)
      .eq("status", "angenommen")
      .select("follower_id"));
    if (!error && Array.isArray(data) && data.length > 0) {
      state.incomingRequests = state.incomingRequests.filter((item) => item.follower_id !== requesterId);
      state.incomingFollows.delete(requesterId);
    }
  } else if (action === "withdraw-outgoing" || action === "unfollow-outgoing") {
    const requiredStatus = action === "withdraw-outgoing" ? "angefragt" : "angenommen";
    ({ data, error } = await state.supabase
      .from("follow")
      .delete()
      .eq("follower_id", state.session.user.id)
      .eq("gefolgter_id", requesterId)
      .eq("status", requiredStatus)
      .select("follower_id"));
    if (!error && Array.isArray(data) && data.length > 0) {
      state.outgoingFollows.delete(requesterId);
    }
  } else {
    error = new Error("Unbekannte Follow-Aktion.");
  }

  if (!error && Array.isArray(data) && data.length === 0) {
    error = new Error("Die Anfrage wurde nicht gefunden oder bereits bearbeitet.");
  }

  if (error) {
    state.connectMessage = followErrorMessage(error);
    state.connectMessageType = "error";
  }

  state.pendingRequestIds.delete(requesterId);
  if (!error) {
    updateConnectBadge();
    await loadUsers();
  }
  renderConnect();
  renderUserSearch();
  renderProfile();
}

async function handleLogout() {
  if (!state.connected) return;
  await state.supabase.auth.signOut();
  clearPersonalState();
  await loadFollowData();
  renderUserSearch();
  renderConnect();
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
  state.outgoingFollows = new Map();
  state.incomingFollows = new Map();
  state.incomingRequests = [];
  state.pendingFollowIds = new Set();
  state.pendingRequestIds = new Set();
  state.followMessage = "";
  state.followMessageType = "";
  state.connectMessage = "";
  state.connectMessageType = "";
  updateConnectBadge();
}

async function showView(viewName) {
  state.activeView = viewName;
  els.views.forEach((view) => view.classList.toggle("is-active", view.id === `view-${viewName}`));
  els.nav.forEach((button, index) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      setActiveNavIndicator(index);
    }
  });
  if (viewName === "connect") {
    await loadFollowData();
    renderConnect();
  }
  document.querySelector("#app").focus({ preventScroll: true });
}

function setActiveNavIndicator(index) {
  const nav = els.nav[0]?.parentElement;
  const button = els.nav[index];
  if (!nav || !button) return;
  nav.style.setProperty("--active-x", `${button.offsetLeft}px`);
  nav.style.setProperty("--active-width", `${button.offsetWidth}px`);
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

function setUserSearchState(message, type = "") {
  setStateBox(els.userSearchState, message, type);
}

function setConnectState(message, type = "") {
  setStateBox(els.connectState, message, type);
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

async function refreshSocialState() {
  await loadUsers();
  await loadFollowData();
  renderUserSearch();
  renderConnect();
  renderProfile();
}

function updateConnectBadge() {
  const count = state.session?.user ? state.incomingRequests.filter((request) => request.status === "angefragt").length : 0;
  els.connectBadge.hidden = count === 0;
  els.connectBadge.textContent = String(count);
}

function followErrorMessage(error) {
  const message = error?.message ?? "";
  if (message.includes("duplicate key")) return "Diese Follow-Beziehung existiert bereits.";
  if (message.includes("permission") || message.includes("not allowed") || message.includes("nicht erlaubt")) {
    return "Diese Aktion ist nicht erlaubt.";
  }
  if (message.includes("Anmeldung erforderlich")) return "Bitte melde dich zuerst an.";
  return message || "Die Follow-Aktion konnte nicht gespeichert werden.";
}

function bestMedal(a = "keine", b = "keine") {
  const rank = { offen: 0, keine: 1, unbewertet: 1, bronze: 2, silber: 3, gold: 4 };
  return rank[b] > rank[a] ? b : a;
}

function medalLabel(value) {
  const labels = { offen: "offen", keine: "keine Medaille", unbewertet: "unbewertet", bronze: "Bronze", silber: "Silber", gold: "Gold" };
  return labels[value] ?? "offen";
}

function rankLabel(value) {
  const rank = Number(value ?? 1);
  return rank <= 1 ? "Sportler" : `Rank ${rank}`;
}

function rankClass(value) {
  const rank = Number(value ?? 1);
  return rank <= 1 ? "rank-sportler" : "";
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
    Koordination: '<svg viewBox="0 0 24 24"><path d="M11 2h2v4h-2V2Zm0 16h2v4h-2v-4ZM2 11h4v2H2v-2Zm16 0h4v2h-4v-2ZM5.6 4.2l2.8 2.8L7 8.4 4.2 5.6l1.4-1.4Zm10 10 2.8 2.8-1.4 1.4-2.8-2.8 1.4-1.4Zm2.8-8.6-2.8 2.8L14.2 7 17 4.2l1.4 1.4ZM8.4 15.6l-2.8 2.8-1.4-1.4 2.8-2.8 1.4 1.4ZM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/></svg>',
    Fussball: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.8 5.3-1 3.1-2.8.1-1.7-2.4 1.7-2.3 3.8 1.5ZM8.2 7.3l1.7 2.4-.9 2.7-3 .9-1.7-3.3 3.9-2.7Zm-.4 9.6-2.4-1.8.2-3.3 3.1-.9 2.2 1.7v3.1l-3.1 1.2Zm7.8 1.1-3.6 1.1-2.7-2 2.8-1.1 2.8 1.1.7.9Zm3.3-4.4-2.7 2.1-3.3-1.3v-2.6l2.9-.1 2.6 1.9Z"/></svg>',
    Schwimmen: '<svg viewBox="0 0 24 24"><path d="M7.2 8.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Zm12.6 7.8c-1.7 0-2.6-1-4-1s-2.3 1-4 1-2.6-1-4-1-2.3 1-4 1v2c1.7 0 2.6-1 4-1s2.3 1 4 1 2.6-1 4-1 2.3 1 4 1v-2ZM3.8 13.7c1.7 0 2.6-1 4-1 .8 0 1.4.3 2 .6l2.6-3.4 2.7 2.1H20v-2.2h-4.1l-4.5-3.4-4.5 5.9a6.4 6.4 0 0 0-3.1-.7v2.1Z"/></svg>',
    Laufen: '<svg viewBox="0 0 24 24"><path d="M15.5 5.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2ZM10 21l2.1-5.7 2.2 2.1V23h2.4v-6.5l-3.1-3 .9-3a8 8 0 0 0 3.8 2.1l.6-2.3a5 5 0 0 1-3.8-2.8l-.5-.9a2.3 2.3 0 0 0-3.5-.6L7.8 8.8v5h2.3v-4l1.4-1.2-1.5 5L7.4 21H10Z"/></svg>',
    Fahrrad: '<svg viewBox="0 0 24 24"><path d="M6.5 20a4.5 4.5 0 1 1 3.9-6.8l1.2-2.2H9V8.8h4l1-1.8h-2V5h4.4l-1.7 3.2 2.2 5A4.5 4.5 0 1 1 15 14.3l-1.1-2.5-1.8 3.4h-1.3A4.5 4.5 0 0 1 6.5 20Zm0-2.2a2.3 2.3 0 0 0 2-3.5l-2 3.5Zm10.9 0a2.3 2.3 0 1 0 .4-2.3l1 2.3h-1.4Z"/></svg>',
    Kraft: '<svg viewBox="0 0 24 24"><path d="M3 10h3V7h2v10H6v-3H3v-4Zm18 4h-3v3h-2V7h2v3h3v4ZM9 11h6v2H9v-2Z"/></svg>',
    Volleyball: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM6.1 7.2A8 8 0 0 1 12 4c.2 0 .4 0 .6.1A10.2 10.2 0 0 0 8.7 11a11 11 0 0 1-2.6-3.8Zm-1.9 5.4c.9.3 2 .5 3.2.4.2 2.2 1 4.1 2.2 5.8a8 8 0 0 1-5.4-6.2Zm8.2 7.3a9.1 9.1 0 0 1-2.9-7.3 11 11 0 0 0 6.4-3.9c.7 1 1.2 2.1 1.5 3.4a8.8 8.8 0 0 1-5 7.8Zm6.9-5.2a12.6 12.6 0 0 0-4.9-9.8 8 8 0 0 1 4.9 9.8Z"/></svg>',
    Leichtathletik: '<svg viewBox="0 0 24 24"><path d="M4 19h16v2H4v-2Zm2-3.5 4-7 3 2.1 4.7-6.6 1.6 1.2-5.9 8.3-2.8-2-2.9 5H6Zm1-10h4v2H7v-2Z"/></svg>',
    Tempo: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 11-14h-6l-1-6Z"/></svg>',
    Ausdauer: '<svg viewBox="0 0 24 24"><path d="M7.2 8C4.3 8 2 10 2 12.5S4.3 17 7.2 17c1.7 0 3.3-.8 4.8-2.4C13.5 16.2 15.1 17 16.8 17c2.9 0 5.2-2 5.2-4.5S19.7 8 16.8 8c-1.7 0-3.3.8-4.8 2.4C10.5 8.8 8.9 8 7.2 8Zm0 2c1 0 2 .5 3.3 2.5C9.2 14.5 8.2 15 7.2 15 5.4 15 4 13.9 4 12.5S5.4 10 7.2 10Zm9.6 0c1.8 0 3.2 1.1 3.2 2.5S18.6 15 16.8 15c-1 0-2-.5-3.3-2.5C14.8 10.5 15.8 10 16.8 10Z"/></svg>'
  };
  return icons[category] ?? '<svg viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6l-8-4Zm0 4 4 2v4c0 2.8-1.6 5-4 6-2.4-1-4-3.2-4-6V8l4-2Z"/></svg>';
}
