import { demoDisciplines } from "../data/disciplines.js";

const state = {
  supabase: null,
  connected: false,
  session: null,
  authRestoring: true,
  authSubscription: null,
  profileLoadError: "",
  profileMessage: "",
  profileMessageType: "",
  profile: null,
  users: [],
  expandedUserId: null,
  expandedDisciplineId: "",
  activeEntryDisciplineId: "",
  activeEditEffortId: "",
  effortByDiscipline: new Map(),
  effortVisibleCounts: new Map(),
  pendingEffortIds: new Set(),
  effortMessages: new Map(),
  effortDrafts: new Map(),
  feedPosts: [],
  feedOffset: 0,
  feedHasMore: true,
  feedLoading: false,
  feedError: "",
  feedMessage: "",
  feedMessageType: "",
  feedNeedsRefresh: true,
  expandedFeedTextIds: new Set(),
  pendingPostIds: new Set(),
  pendingLikeIds: new Set(),
  feedPullStartY: null,
  feedPullDistance: 0,
  feedWheelPull: 0,
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
  connectTab: "follows",
  connectFollowTab: "all",
  connectActivityTab: "received",
  activityReceived: [],
  activityGiven: [],
  activityOffsets: { received: 0, given: 0 },
  activityHasMore: { received: true, given: true },
  activityLoading: false,
  activityError: "",
  disciplines: [],
  achievements: new Map(),
  activeView: "dex",
  filters: {
    search: "",
    userSearch: "",
    category: "",
    status: ""
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
  dexSummary: document.querySelector("#dex-summary"),
  resultCount: document.querySelector("#result-count"),
  search: document.querySelector("#search-input"),
  categoryFilter: document.querySelector("#category-filter"),
  statusFilter: document.querySelector("#status-filter"),
  feedState: document.querySelector("#feed-state"),
  feedList: document.querySelector("#feed-list"),
  feedMore: document.querySelector("#feed-more"),
  userSearchForm: document.querySelector("#user-search-form"),
  userSearch: document.querySelector("#user-search-input"),
  userSearchState: document.querySelector("#user-search-state"),
  userList: document.querySelector("#user-list"),
  connectState: document.querySelector("#connect-state"),
  requestList: document.querySelector("#request-list"),
  connectBadge: document.querySelector("#connect-badge"),
  connectTabs: document.querySelectorAll("[data-connect-tab]"),
  connectFollowTabs: document.querySelectorAll("[data-connect-follow-tab]"),
  connectActivityTabs: document.querySelectorAll("[data-connect-activity-tab]"),
  activityMore: document.querySelector("#activity-more"),
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

const likeBurstDurationMs = 1100;

init();

async function init() {
  bindUi();
  setDexState("Disziplinen werden geladen ...");
  await initSupabase();
  await loadSession();
  handleAuthRedirectStatus();
  await loadDisciplines();
  await loadUsers();
  await loadFollowData();
  await loadProfileAndStats();
  await loadFeed(true);
  finishAuthRestore();
  renderDex();
  renderFeed();
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
    state.filters.search = normalizeSearch(els.search.value.trim());
    renderDex();
  });
  els.categoryFilter.addEventListener("change", () => {
    state.filters.category = els.categoryFilter.value;
    renderDex();
  });
  els.statusFilter.addEventListener("change", () => {
    state.filters.status = els.statusFilter.value;
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
      if (state.connectTab === "activity") {
        void ensureActivityLoaded();
      } else {
        renderConnect();
      }
    });
  });
  els.connectFollowTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.connectFollowTab = button.dataset.connectFollowTab;
      renderConnect();
    });
  });
  els.connectActivityTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.connectActivityTab = button.dataset.connectActivityTab;
      void ensureActivityLoaded();
    });
  });
  els.activityMore?.addEventListener("click", () => {
    void loadActivity(false);
  });

  els.loginForm.addEventListener("submit", handleLogin);
  els.registerForm.addEventListener("submit", handleRegister);
  els.editForm.addEventListener("submit", handleProfileSave);
  els.logout.addEventListener("click", handleLogout);
  els.deleteProfile.addEventListener("click", handleProfileDelete);
  els.feedMore.addEventListener("click", () => {
    void loadFeed(false);
  });
  bindFeedPullRefresh();
  window.addEventListener("scroll", () => {
    if (state.activeView !== "feed" || state.feedLoading || !state.feedHasMore || state.feedError) return;
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 360) {
      void loadFeed(false);
    }
  }, { passive: true });
}

function bindFeedPullRefresh() {
  window.addEventListener("touchstart", (event) => {
    if (!canStartFeedPull()) return;
    state.feedPullStartY = event.touches[0]?.clientY ?? null;
    state.feedPullDistance = 0;
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (state.feedPullStartY == null || !canStartFeedPull()) return;
    const y = event.touches[0]?.clientY ?? state.feedPullStartY;
    state.feedPullDistance = Math.max(0, y - state.feedPullStartY);
  }, { passive: true });

  window.addEventListener("touchend", () => {
    if (state.feedPullStartY == null) return;
    const shouldRefresh = state.feedPullDistance >= 74;
    state.feedPullStartY = null;
    state.feedPullDistance = 0;
    if (shouldRefresh) {
      void loadFeed(true);
    }
  });

  window.addEventListener("wheel", (event) => {
    if (!canStartFeedPull() || event.deltaY >= 0) {
      state.feedWheelPull = 0;
      return;
    }
    state.feedWheelPull = Math.min(120, state.feedWheelPull + Math.abs(event.deltaY));
    state.feedPullDistance = state.feedWheelPull;
    if (state.feedWheelPull >= 90) {
      state.feedWheelPull = 0;
      state.feedPullDistance = 0;
      void loadFeed(true);
    }
  }, { passive: true });
}

function canStartFeedPull() {
  return state.activeView === "feed"
    && window.scrollY <= 0
    && state.connected
    && Boolean(state.session?.user)
    && !state.feedLoading;
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
  if (event === "SIGNED_IN" && window.location.hash.includes("access_token")) {
    state.profileMessage = "E-Mail bestaetigt. Deine Registrierung ist abgeschlossen.";
    state.profileMessageType = "success";
  }
  if (event === "SIGNED_OUT") {
    clearPersonalState();
    await loadUsers();
    await loadFollowData();
    await loadFeed(true);
    finishAuthRestore();
    renderDex();
    renderUserSearch();
    renderConnect();
    renderFeed();
    renderProfile();
    showAuthPane("login");
    return;
  }
  await loadUsers();
  await loadFollowData();
  await loadProfileAndStats();
  await loadFeed(true);
  finishAuthRestore();
  renderDex();
  renderUserSearch();
  renderConnect();
  renderFeed();
  renderProfile();
}

function finishAuthRestore() {
  state.authRestoring = false;
  els.profileView.classList.remove("is-auth-restoring");
}

function handleAuthRedirectStatus() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const error = params.get("error_description") || hash.get("error_description") || params.get("error") || hash.get("error");
  if (error) {
    state.profileMessage = `Der Bestaetigungslink ist ungueltig oder abgelaufen: ${error}`;
    state.profileMessageType = "error";
    showAuthPane("login");
    return;
  }
  const hasAuthTokens = hash.has("access_token") || params.has("code");
  if (hasAuthTokens && state.session?.user) {
    state.profileMessage = "E-Mail bestaetigt. Du kannst dich jetzt anmelden oder bist bereits angemeldet.";
    state.profileMessageType = "success";
    showAuthPane("login");
  }
}

function authRedirectUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  const path = url.pathname;
  if (!path.endsWith("/") && !path.endsWith(".html")) {
    url.pathname = `${path.replace(/\/$/, "")}/`;
  }
  return url.toString();
}

async function loadDisciplines() {
  if (!state.connected) {
    state.disciplines = demoDisciplines;
    renderCategoryOptions();
    return;
  }

  const { data, error } = await state.supabase
    .from("disziplin")
    .select("*")
    .eq("aktiv", true)
    .order("sortierung", { ascending: true });

  if (error) {
    state.disciplines = demoDisciplines;
    renderCategoryOptions();
    setDexState(`Supabase konnte nicht geladen werden: ${error.message}. Demo-Daten werden angezeigt.`, "error");
    els.connection.textContent = "Demo-Fallback";
    return;
  }

  state.disciplines = data ?? [];
  renderCategoryOptions();
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
  const [{ data: profile, error: profileError }, { data: efforts, error: effortsError }, { data: posts, error: postsError }] = await Promise.all([
    state.supabase.from("nutzer").select("*").eq("id", userId).maybeSingle(),
    state.supabase
      .from("leistung")
      .select("id, disziplin_id, wert, medaille, erstellt_am, geleistet_am")
      .eq("nutzer_id", userId)
      .order("erstellt_am", { ascending: false }),
    state.supabase
      .from("beitrag")
      .select("id, leistung_id, text")
  ]);

  if (profileError || effortsError || postsError) {
    state.profileLoadError = "Profildaten konnten gerade nicht geladen werden. Die Anmeldung bleibt erhalten.";
    return;
  }

  state.profile = profile ?? null;
  state.achievements = new Map();
  state.effortByDiscipline = new Map();
  const postsByEffort = new Map((posts ?? []).map((post) => [post.leistung_id, post]));
  (efforts ?? []).forEach((effort) => {
    const post = postsByEffort.get(effort.id);
    const normalized = normalizeEffort({
      ...effort,
      beitrag_id: post?.id ?? null,
      beitrag_text: post?.text ?? ""
    });
    const current = state.achievements.get(normalized.disziplin_id);
    state.achievements.set(normalized.disziplin_id, bestMedal(current, normalized.medaille));
    const list = state.effortByDiscipline.get(normalized.disziplin_id) ?? [];
    list.push(normalized);
    state.effortByDiscipline.set(normalized.disziplin_id, list);
  });
}

async function loadFeed(reset = false) {
  if (reset) {
    state.feedPosts = [];
    state.feedOffset = 0;
    state.feedHasMore = true;
    state.feedError = "";
    state.feedMessage = "";
    state.feedMessageType = "";
    state.feedNeedsRefresh = false;
  }
  if (!state.connected || !state.session?.user || state.feedLoading || !state.feedHasMore) {
    renderFeed();
    return;
  }

  state.feedLoading = true;
  renderFeed();
  const { data, error } = await state.supabase.rpc("feed_beitraege", {
    p_limit: 10,
    p_offset: state.feedOffset
  });
  state.feedLoading = false;

  if (error) {
    state.feedError = `Feed konnte nicht geladen werden: ${error.message}`;
    renderFeed();
    return;
  }

  const posts = data ?? [];
  const known = new Set(reset ? [] : state.feedPosts.map((post) => post.beitrag_id));
  const uniquePosts = posts.filter((post) => !known.has(post.beitrag_id));
  state.feedPosts = reset ? posts : [...state.feedPosts, ...uniquePosts];
  state.feedOffset += posts.length;
  state.feedHasMore = posts.length === 10;
  state.feedError = "";
  renderFeed();
}

function renderDex() {
  const filtered = state.disciplines.filter(matchesFilters);
  els.resultCount.textContent = `${filtered.length} von ${state.disciplines.length}`;
  renderDexSummary();
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
  const status = disciplineStatus(discipline);
  const categoryMatch = !state.filters.category
    || discipline.kategorie_1 === state.filters.category
    || discipline.kategorie_2 === state.filters.category;
  const statusMatch = !state.filters.status
    || (state.filters.status === "offen" ? !["bronze", "silber", "gold"].includes(status) : status === state.filters.status);
  const queryMatch = !query || [
    discipline.name,
    discipline.kategorie_1,
    discipline.kategorie_2
  ].filter(Boolean).some((value) => normalizeSearch(value).includes(query));
  return categoryMatch && statusMatch && queryMatch;
}

function renderCategoryOptions() {
  const categories = [...new Set(state.disciplines.flatMap((discipline) => [discipline.kategorie_1, discipline.kategorie_2]).filter(Boolean))].sort();
  els.categoryFilter.innerHTML = '<option value="">Alle Kategorien</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.categoryFilter.append(option);
  });
}

function renderDexSummary() {
  if (!state.session?.user) {
    els.dexSummary.textContent = `${state.disciplines.length} Disziplinen. Anforderungen bleiben auch ohne Anmeldung sichtbar.`;
    return;
  }
  const counts = medalSummary();
  els.dexSummary.textContent = `${counts.collected} von ${state.disciplines.length} gesammelt`;
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

function renderFeed() {
  els.feedList.innerHTML = "";
  els.feedMore.hidden = true;

  if (!state.connected) {
    setFeedState("Demo-Modus: Der Feed ist erst mit Supabase-Verbindung verfuegbar.");
    return;
  }
  if (!state.session?.user) {
    hideState(els.feedState);
    renderFeedActionState("Melde dich an, um deine Beitraege und die Beitraege deiner gefolgten Sportler zu sehen.", [{ label: "Zur Anmeldung", view: "profile" }]);
    return;
  }
  if (state.feedError) {
    hideState(els.feedState);
    renderFeedActionState(state.feedError, [{ label: "Erneut versuchen", action: "retry" }], "error");
    return;
  }
  if (state.feedLoading && !state.feedPosts.length) {
    hideState(els.feedState);
    renderFeedSkeletons();
    return;
  }
  if (!state.feedPosts.length) {
    hideState(els.feedState);
    renderFeedActionState("Hier beginnt dein Sport-Feed.\nTeile deine erste Leistung oder finde Sportler, denen du folgen moechtest.", [
      { label: "Zum Dex", view: "dex" },
      { label: "Sportler suchen", view: "search" }
    ]);
    return;
  }

  if (state.feedMessage) {
    setFeedState(state.feedMessage, state.feedMessageType);
  } else {
    hideState(els.feedState);
  }
  const fragment = document.createDocumentFragment();
  state.feedPosts.forEach((post) => fragment.append(renderFeedCard(post)));
  els.feedList.append(fragment);
  if (state.feedLoading) renderFeedSkeletons(2);
  if (!state.feedHasMore) {
    const end = document.createElement("p");
    end.className = "feed-end";
    end.textContent = "Du bist auf dem neuesten Stand";
    els.feedList.append(end);
  }
  els.feedMore.hidden = true;
  els.feedMore.disabled = state.feedLoading;
  els.feedMore.textContent = state.feedLoading ? "Laedt ..." : "Mehr laden";
}

function normalizeEffort(effort) {
  const beitrag = Array.isArray(effort.beitrag) ? effort.beitrag[0] : effort.beitrag;
  return {
    ...effort,
    beitrag_id: effort.beitrag_id ?? beitrag?.id ?? null,
    beitrag_text: effort.beitrag_text ?? beitrag?.text ?? "",
    geleistet_am: effort.geleistet_am ?? toDateInputValue(effort.erstellt_am)
  };
}

function renderFeedCard(post) {
  const article = document.createElement("article");
  article.className = `feed-card medal-${medalCssClass(post.medaille)}${post.liked_by_me ? " is-liked" : ""}`;
  const discipline = state.disciplines.find((item) => item.id === post.disziplin_id) ?? {
    id: post.disziplin_id,
    einheit: post.einheit,
    nachkommastellen: post.nachkommastellen,
    name: post.disziplin_name,
    kategorie_1: "",
    kategorie_2: "",
    dsa: false
  };
  article.style.setProperty("--category-color", categoryColors[discipline.kategorie_1] ?? "var(--color-primary)");
  const text = post.beitrag_text ?? "";
  const isLong = text.length > 180;
  const isExpanded = state.expandedFeedTextIds.has(post.beitrag_id);
  const displayText = isLong && !isExpanded ? `${text.slice(0, 180).trim()}...` : text;
  const disciplineImage = disciplineImageUrl(post.disziplin_id);
  const canEdit = post.autor_id === state.session?.user?.id;
  const likeCount = Number(post.like_count ?? 0);
  const isLikePending = state.pendingLikeIds.has(post.beitrag_id);
  const performedAt = post.geleistet_am ?? post.beitrag_erstellt_am;
  article.innerHTML = `
    <div class="feed-author">
      <div class="avatar small-avatar">${escapeHtml(initials(post))}</div>
      <div>
        <h3>@${escapeHtml(post.nutzername ?? "nutzer")}</h3>
        <time datetime="${escapeHtml(post.beitrag_erstellt_am)}">${escapeHtml(formatDate(post.beitrag_erstellt_am))}</time>
      </div>
      ${canEdit ? `<button class="text-button feed-edit-button" type="button" data-feed-edit="${escapeHtml(post.leistung_id)}">Bearbeiten</button>` : ""}
    </div>
    <div class="feed-media" aria-label="Disziplinbild">
      ${disciplineImage
        ? `<img src="${escapeHtml(disciplineImage)}" alt="Disziplinbild zu ${escapeHtml(post.disziplin_name)}" loading="lazy" decoding="async" data-feed-image>`
        : feedImageFallback(discipline)}
      <span class="feed-like-burst" aria-hidden="true">${heartIcon()}</span>
    </div>
    <div class="feed-social">
      <button class="like-button${post.liked_by_me ? " is-liked" : ""}" type="button" data-like-post="${escapeHtml(post.beitrag_id)}" aria-pressed="${post.liked_by_me ? "true" : "false"}" aria-label="${post.liked_by_me ? "Like entfernen" : "Beitrag liken"}" ${isLikePending ? "disabled" : ""}>
        ${heartIcon()}
        <span>${escapeHtml(likeCountLabel(likeCount))}</span>
      </button>
    </div>
    <div class="feed-performance">
      <div class="feed-performance-head">
        <span class="feed-discipline">${escapeHtml(post.disziplin_name)}</span>
        <time class="feed-date" datetime="${escapeHtml(performedAt)}">${escapeHtml(formatDateOnly(performedAt))}</time>
      </div>
      <strong>${escapeHtml(formatFeedEffortValue(post.wert, discipline))}</strong>
      <div class="feed-meta-row">
        <span class="medal feed-medal ${escapeHtml(post.medaille ?? "unbewertet")} is-earned">${escapeHtml(medalSymbol(post.medaille))} ${escapeHtml(medalLabel(post.medaille))}</span>
        ${renderFeedMetaIcons(discipline)}
      </div>
    </div>
    ${text ? `
      <p class="feed-text"><strong>@${escapeHtml(post.nutzername ?? "nutzer")}</strong> ${escapeHtml(displayText)}</p>
      ${isLong ? `<button class="text-button" type="button" data-feed-text="${escapeHtml(post.beitrag_id)}">${isExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}</button>` : ""}
    ` : ""}
  `;
  article.querySelector("[data-feed-image]")?.addEventListener("error", (event) => {
    const media = event.currentTarget.closest(".feed-media");
    if (media) {
      media.innerHTML = feedImageFallback(discipline, "Bild nicht verfuegbar");
    }
  });
  article.querySelector(".feed-media")?.addEventListener("dblclick", () => {
    void togglePostLike(post.beitrag_id, { animate: true });
  });
  article.querySelector(".feed-media")?.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") return;
    const media = event.currentTarget;
    const now = Date.now();
    const previous = Number(media.dataset.lastTapAt || 0);
    media.dataset.lastTapAt = String(now);
    if (now - previous <= 340) {
      void togglePostLike(post.beitrag_id, { animate: true });
    }
  });
  article.querySelector("[data-like-post]")?.addEventListener("click", (event) => {
    playLikeButtonAnimation(event.currentTarget);
    void togglePostLike(event.currentTarget.dataset.likePost);
  });
  article.querySelector("[data-feed-text]")?.addEventListener("click", (event) => {
    const id = event.currentTarget.dataset.feedText;
    if (state.expandedFeedTextIds.has(id)) {
      state.expandedFeedTextIds.delete(id);
    } else {
      state.expandedFeedTextIds.add(id);
    }
    renderFeed();
  });
  article.querySelector("[data-feed-edit]")?.addEventListener("click", (event) => {
    void openEffortEditorFromFeed(event.currentTarget.dataset.feedEdit, post.disziplin_id);
  });
  return article;
}

function heartIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z"/></svg>`;
}

function playLikeBurst(article) {
  const burst = article.querySelector(".feed-like-burst");
  if (!burst) return;
  burst.classList.remove("is-animating");
  void burst.offsetWidth;
  burst.classList.add("is-animating");
}

function playLikeBurstForPost(postId) {
  const button = document.querySelector(`[data-like-post="${CSS.escape(postId)}"]`);
  const article = button?.closest(".feed-card");
  if (article) playLikeBurst(article);
}

function playLikeButtonAnimation(button) {
  button.classList.remove("is-popping");
  void button.offsetWidth;
  button.classList.add("is-popping");
}

function likeCountLabel(count) {
  return `${count} ${count === 1 ? "Like" : "Likes"}`;
}

async function togglePostLike(postId, options = {}) {
  if (!postId || state.pendingLikeIds.has(postId) || !state.connected || !state.session?.user) return;
  const previousPosts = state.feedPosts.map((post) => ({ ...post }));
  const current = state.feedPosts.find((post) => post.beitrag_id === postId);
  const optimisticLiked = !(current?.liked_by_me ?? false);
  state.pendingLikeIds.add(postId);
  applyLikeState(postId, optimisticLiked, Math.max(0, Number(current?.like_count ?? 0) + (optimisticLiked ? 1 : -1)));
  renderFeed();
  const animationStartedAt = options.animate ? Date.now() : 0;
  if (options.animate) {
    playLikeBurstForPost(postId);
  }
  renderConnect();

  const { data, error } = await state.supabase.rpc("toggle_beitrag_like", { p_beitrag_id: postId });
  if (options.animate) {
    await wait(Math.max(0, likeBurstDurationMs - (Date.now() - animationStartedAt)));
  }
  state.pendingLikeIds.delete(postId);

  if (error) {
    state.feedPosts = previousPosts;
    state.feedMessage = `Like konnte nicht gespeichert werden: ${error.message}`;
    state.feedMessageType = "error";
    renderFeed();
    renderConnect();
    return;
  }

  const saved = Array.isArray(data) ? data[0] : data;
  if (saved) {
    applyLikeState(postId, Boolean(saved.liked_by_me), Number(saved.like_count ?? 0));
  }
  state.feedMessage = "";
  state.feedMessageType = "";
  if (options.source === "activity") {
    state.activityGiven = state.activityGiven.filter((item) => item.beitrag_id !== postId || saved?.liked_by_me);
    state.activityOffsets.given = Math.max(0, state.activityOffsets.given - 1);
  } else {
    state.activityOffsets = { received: 0, given: 0 };
    state.activityHasMore = { received: true, given: true };
    state.activityReceived = [];
    state.activityGiven = [];
  }
  renderFeed();
  renderConnect();
}

function applyLikeState(postId, likedByMe, likeCount) {
  state.feedPosts = state.feedPosts.map((post) => (
    post.beitrag_id === postId
      ? { ...post, liked_by_me: likedByMe, like_count: likeCount }
      : post
  ));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function openEffortEditorFromFeed(effortId, disciplineId) {
  if (!effortId || !disciplineId) return;
  state.expandedDisciplineId = disciplineId;
  state.activeEntryDisciplineId = "";
  state.activeEditEffortId = effortId;
  const effort = (state.effortByDiscipline.get(disciplineId) ?? []).find((item) => item.id === effortId);
  const discipline = state.disciplines.find((item) => item.id === disciplineId);
  if (effort && discipline) {
    state.effortDrafts.set(editEffortDraftKey(effortId), effortDraftFromEffort(effort, discipline));
  }
  await showView("dex");
  renderDex();
}

function disciplineImageUrl(disciplineId) {
  if (!state.supabase || !disciplineId) return "";
  return state.supabase.storage
    .from("disziplinbilder")
    .getPublicUrl(`${disciplineId}.png`).data.publicUrl;
}

function feedImageFallback(discipline, text = "Disziplinbild nicht verfuegbar") {
  return `<div class="feed-media-icon">${iconFor(discipline.kategorie_1)}</div><span>${escapeHtml(text)}</span>`;
}

function medalCssClass(value) {
  return ["bronze", "silber", "gold"].includes(value) ? value : "neutral";
}

function renderFeedMetaIcons(discipline) {
  const icons = [
    discipline.kategorie_1 ? renderSportIcon(discipline.kategorie_1) : "",
    discipline.kategorie_2 ? renderSportIcon(discipline.kategorie_2) : "",
    discipline.dsa ? renderDsaIcon() : ""
  ].filter(Boolean).join("");
  return icons ? `<div class="feed-meta-icons" aria-label="Kategorien">${icons}</div>` : "";
}

async function deleteContributionPost(postId) {
  if (!postId || state.pendingPostIds.has(postId)) return;
  const confirmed = window.confirm("Beitrag wirklich löschen? Die Leistung bleibt erhalten.");
  if (!confirmed) return;

  state.pendingPostIds.add(postId);
  renderDex();
  renderFeed();
  const { error } = await state.supabase
    .from("beitrag")
    .delete()
    .eq("id", postId);
  state.pendingPostIds.delete(postId);

  if (error) {
    state.feedError = `Beitrag konnte nicht geloescht werden: ${error.message}`;
    renderDex();
    renderFeed();
    return;
  }

  state.feedPosts = state.feedPosts.filter((post) => post.beitrag_id !== postId);
  await loadProfileAndStats();
  renderDex();
  renderFeed();
  renderProfile();
}

async function deleteEffort(effort, discipline) {
  if (!effort?.id) return;
  const confirmed = window.confirm("Leistung wirklich löschen? Ein verknüpfter Beitrag wird ebenfalls gelöscht.");
  if (!confirmed) return;

  const pendingKey = deleteEffortPendingKey(effort.id);
  state.pendingEffortIds.add(pendingKey);
  renderDex();
  const { error } = await state.supabase
    .from("leistung")
    .delete()
    .eq("id", effort.id);
  state.pendingEffortIds.delete(pendingKey);

  if (error) {
    state.effortMessages.set(discipline.id, { type: "error", text: `Leistung konnte nicht geloescht werden: ${error.message}` });
    renderDex();
    return;
  }

  const list = (state.effortByDiscipline.get(discipline.id) ?? []).filter((item) => item.id !== effort.id);
  state.effortByDiscipline.set(discipline.id, list);
  state.achievements.set(discipline.id, bestMedalForEfforts(list));
  state.activeEditEffortId = "";
  state.effortDrafts.delete(editEffortDraftKey(effort.id));
  state.effortMessages.set(discipline.id, { type: "success", text: "Leistung wurde geloescht." });
  if (effort.beitrag_id) {
    state.feedPosts = state.feedPosts.filter((post) => post.leistung_id !== effort.id);
  }
  await loadProfileAndStats();
  renderDex();
  renderFeed();
  renderProfile();
}

function renderFeedActionState(message, actions, type = "") {
  const wrapper = document.createElement("div");
  wrapper.className = `feed-empty${type ? ` is-${type}` : ""}`;
  wrapper.innerHTML = `
    <p>${escapeHtml(message)}</p>
    <div class="feed-empty-actions">
      ${actions.map((action) => `<button class="${action.action === "retry" ? "accept-button" : "ghost-button"}" type="button" data-feed-empty-action="${escapeHtml(action.action ?? "")}" data-feed-empty-view="${escapeHtml(action.view ?? "")}">${escapeHtml(action.label)}</button>`).join("")}
    </div>
  `;
  wrapper.querySelectorAll("[data-feed-empty-action], [data-feed-empty-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.feedEmptyAction;
      const view = button.dataset.feedEmptyView;
      if (action === "retry") {
        void loadFeed(true);
      } else if (view) {
        void showView(view);
      }
    });
  });
  els.feedList.append(wrapper);
}

function renderFeedSkeletons(count = 3) {
  for (let index = 0; index < count; index += 1) {
    const skeleton = document.createElement("article");
    skeleton.className = "feed-card feed-card-skeleton";
    skeleton.innerHTML = `
      <div class="feed-author"><span></span><div><span></span><span></span></div></div>
      <div class="feed-media"></div>
      <div class="feed-performance"><span></span><strong></strong><span></span></div>
    `;
    els.feedList.append(skeleton);
  }
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
  const isExpanded = state.expandedDisciplineId === discipline.id;
  const medal = disciplineStatus(discipline);
  article.className = `discipline-card${isExpanded ? " is-expanded" : ""}`;
  article.style.setProperty("--category-color", categoryColors[discipline.kategorie_1] ?? "var(--color-primary)");
  const icons = [
    renderSportIcon(discipline.kategorie_1),
    discipline.kategorie_2 ? renderSportIcon(discipline.kategorie_2) : ""
  ].join("");
  const dsaLabel = discipline.dsa ? renderDsaIcon() : "";
  const boundaryWarning = hasBoundaries(discipline) ? "" : renderWarningIcon("Grenzen fehlen");
  const hintIcons = [dsaLabel, boundaryWarning].filter(Boolean).join("");
  article.innerHTML = `
    <button class="discipline-toggle" type="button" aria-expanded="${isExpanded}" aria-label="${escapeHtml(discipline.name)} ${isExpanded ? "einklappen" : "ausklappen"}">
      <div class="card-head">
        <div>
          <div class="dex-no">#${String(discipline.sortierung).padStart(3, "0")}</div>
          <h3>${escapeHtml(discipline.name)}</h3>
        </div>
        <div class="card-icons">
          <div class="icon-row" aria-label="Kategoriezeichen">${icons}</div>
          ${hintIcons ? `<div class="icon-row hint-icon-row" aria-label="Disziplinhinweise">${hintIcons}</div>` : ""}
        </div>
      </div>
      ${renderMedalProgress(medal)}
    </button>
    ${isExpanded ? renderDisciplineDetails(discipline) : ""}
  `;
  article.querySelector(".discipline-toggle").addEventListener("click", () => {
    state.expandedDisciplineId = isExpanded ? "" : discipline.id;
    renderDex();
  });
  article.querySelectorAll("[data-discipline-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleDisciplineAction(discipline.id, button.dataset.disciplineAction);
    });
  });
  article.querySelectorAll("[data-effort-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleEffortAction(discipline, button.dataset.effortAction, button.dataset.effortId);
    });
  });
  article.querySelector(".effort-form")?.addEventListener("submit", (event) => {
    event.stopPropagation();
    void handleEffortSubmit(event, discipline);
  });
  article.querySelector(".effort-form")?.addEventListener("input", (event) => {
    if (event.target.type === "file") return;
    saveEffortDraft(article.querySelector(".effort-form"));
  });
  article.querySelector("[data-share-toggle]")?.addEventListener("change", (event) => {
    event.stopPropagation();
    const form = event.currentTarget.closest(".effort-form");
    const shareFields = form?.querySelector("[data-share-fields]");
    if (shareFields) shareFields.hidden = !event.currentTarget.checked;
    const submit = form?.querySelector("[data-effort-submit]");
    if (submit && !form?.dataset.editEffortId) submit.textContent = event.currentTarget.checked ? "Speichern & teilen" : "Leistung speichern";
    saveEffortDraft(form);
  });
  return article;
}

function renderDisciplineDetails(discipline) {
  const efforts = sortedEfforts(discipline);
  const visibleCount = state.effortVisibleCounts.get(discipline.id) ?? 3;
  const visibleEfforts = efforts.slice(0, visibleCount);
  const best = efforts[0] ?? null;
  const medal = disciplineStatus(discipline);
  const showForm = state.activeEntryDisciplineId === discipline.id;
  const message = state.effortMessages.get(discipline.id);
  const classHint = state.profile?.wertungsklasse ? `Wertungsklasse ${state.profile.wertungsklasse}` : "m/w Anforderungen";
  return `
    <div class="discipline-details">
      <p>${escapeHtml(discipline.beschreibung || "Keine Beschreibung hinterlegt.")}</p>
      <div class="detail-grid">
        <div>
          <h4>Anforderungen (${escapeHtml(classHint)})</h4>
          ${renderRequirements(discipline)}
        </div>
      </div>
      <div class="best-panel">
        <span>Bestleistung: <strong>${best ? formatEffortValue(best.wert, discipline) : "Noch keine Leistung"}</strong></span>
        <span>Hoechste Medaille: <strong>${escapeHtml(medalLabel(medal))}</strong></span>
      </div>
      <div class="effort-list">
        <h4>Beste Leistungen</h4>
        ${visibleEfforts.length ? visibleEfforts.map((effort) => (
          state.activeEditEffortId === effort.id
            ? renderEffortEditPanel(effort, discipline)
            : renderEffortRow(effort, discipline)
        )).join("") : '<p class="request-empty">Noch keine Leistung gespeichert.</p>'}
        ${efforts.length > 3 ? `<button class="ghost-button compact-button" type="button" data-discipline-action="${visibleCount >= efforts.length ? "less-efforts" : "more-efforts"}">${visibleCount >= efforts.length ? "Weniger anzeigen" : "Alle anzeigen"}</button>` : ""}
      </div>
      ${message ? `<div class="state-box is-${escapeHtml(message.type)}">${escapeHtml(message.text)}</div>` : ""}
      ${showForm ? renderEffortForm(discipline) : `<button class="accept-button" type="button" data-discipline-action="show-form">Neue Leistung eintragen</button>`}
    </div>
  `;
}

function renderRequirements(discipline) {
  const classes = state.profile?.wertungsklasse ? [state.profile.wertungsklasse] : ["m", "w"];
  return classes.map((wertungsklasse) => {
    const suffix = wertungsklasse === "w" ? "w" : "m";
    const values = ["bronze", "silber", "gold"].map((level) => {
      const value = discipline[`${level}_${suffix}`];
      return `<span class="requirement ${level}">${medalSymbol(level)} ${value == null ? "fehlt" : formatEffortValue(value, discipline)}</span>`;
    }).join("");
    return `<div class="requirement-row"><strong>${suffix}</strong>${values}</div>`;
  }).join("");
}

function renderEffortRow(effort, discipline) {
  return `
    <div class="effort-row">
      <div class="effort-row-head">
        <strong>${escapeHtml(formatEffortValue(effort.wert, discipline))}</strong>
        <button class="ghost-button compact-button" type="button" data-effort-action="edit" data-effort-id="${escapeHtml(effort.id)}">Bearbeiten</button>
      </div>
      <div class="effort-row-meta">
        <span>${escapeHtml(medalLabel(effort.medaille))}</span>
        <time datetime="${escapeHtml(effort.geleistet_am ?? effort.erstellt_am)}">${escapeHtml(formatDateOnly(effort.geleistet_am ?? effort.erstellt_am))}</time>
      </div>
    </div>
  `;
}

function renderEffortEditPanel(effort, discipline) {
  return `
    <div class="effort-edit-panel">
      ${renderEffortForm(discipline, effort)}
    </div>
  `;
}

function renderEffortForm(discipline, effort = null) {
  const formKey = effort ? editEffortDraftKey(effort.id) : newEffortDraftKey(discipline.id);
  const isPending = state.pendingEffortIds.has(formKey);
  const isDeleting = effort ? state.pendingEffortIds.has(deleteEffortPendingKey(effort.id)) : false;
  const draft = state.effortDrafts.get(formKey) ?? (effort ? effortDraftFromEffort(effort, discipline) : {});
  const input = renderEffortInput(discipline, draft);
  const shareChecked = draft.share;
  const editActionCount = effort?.beitrag_id ? 4 : 3;
  return `
    <form class="effort-form" autocomplete="off" data-form-key="${escapeHtml(formKey)}" ${effort ? `data-edit-effort-id="${escapeHtml(effort.id)}"` : ""}>
      ${input}
      <label>Datum<input name="performedDate" type="date" required value="${escapeHtml(draft.performedDate ?? todayInputValue())}"></label>
      <label class="share-toggle"><input type="checkbox" name="share" data-share-toggle ${shareChecked ? "checked" : ""}> Im Feed teilen</label>
      <div data-share-fields ${shareChecked ? "" : "hidden"}>
        <label>Beitragstext<textarea name="text" rows="3" maxlength="240" placeholder="Optionaler Text zu deiner Leistung">${escapeHtml(draft.text ?? "")}</textarea></label>
      </div>
      <div class="form-actions${effort ? " edit-actions" : ""}" ${effort ? `style="--edit-action-count: ${editActionCount}"` : ""}>
        <button class="accept-button" type="submit" data-effort-submit ${isPending ? "disabled" : ""}>${effort ? "Ändern" : "Leistung speichern"}</button>
        <button class="ghost-button" type="button" ${effort ? `data-effort-action="cancel-edit" data-effort-id="${escapeHtml(effort.id)}"` : 'data-discipline-action="hide-form"'}>Abbrechen</button>
        ${effort?.beitrag_id ? `<button class="decline-button" type="button" data-effort-action="delete-post" data-effort-id="${escapeHtml(effort.id)}" data-post-id="${escapeHtml(effort.beitrag_id)}" ${state.pendingPostIds.has(effort.beitrag_id) ? "disabled" : ""}>Beitrag löschen</button>` : ""}
        ${effort ? `<button class="decline-button" type="button" data-effort-action="delete-effort" data-effort-id="${escapeHtml(effort.id)}" ${isDeleting ? "disabled" : ""}>Leistung löschen</button>` : ""}
      </div>
    </form>
  `;
}

function renderEffortInput(discipline, draft = {}) {
  if (discipline.name === "Distanzwurf") {
    return `
      <label>Stufe
        <select name="stage" required>
          <option value="">Stufe waehlen</option>
          <option value="1" ${draft.stage === "1" ? "selected" : ""}>Dreierlinie</option>
          <option value="2" ${draft.stage === "2" ? "selected" : ""}>Mittelkreis</option>
          <option value="3" ${draft.stage === "3" ? "selected" : ""}>Mittellinie</option>
        </select>
      </label>
    `;
  }
  if (discipline.einheit === "Sekunden") {
    return `
      <div class="time-inputs">
        <label>Minuten<input name="minutes" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(draft.minutes ?? "")}"></label>
        <label>Sekunden<input name="seconds" type="number" min="0" step="0.1" inputmode="decimal" value="${escapeHtml(draft.seconds ?? "")}"></label>
      </div>
    `;
  }
  const step = discipline.nachkommastellen > 0 ? String(1 / (10 ** discipline.nachkommastellen)) : "1";
  return `<label>${escapeHtml(discipline.einheit)}<input name="value" type="number" min="0" step="${step}" required inputmode="${discipline.nachkommastellen > 0 ? "decimal" : "numeric"}" value="${escapeHtml(draft.value ?? "")}"></label>`;
}

function handleDisciplineAction(disciplineId, action) {
  if (action === "show-form") {
    if (!state.session?.user) {
      void showView("profile");
      return;
    }
    state.activeEntryDisciplineId = disciplineId;
    state.activeEditEffortId = "";
  } else if (action === "hide-form") {
    state.activeEntryDisciplineId = "";
    state.effortDrafts.delete(newEffortDraftKey(disciplineId));
  } else if (action === "more-efforts") {
    const discipline = state.disciplines.find((item) => item.id === disciplineId);
    const count = sortedEfforts(discipline).length;
    state.effortVisibleCounts.set(disciplineId, Math.min((state.effortVisibleCounts.get(disciplineId) ?? 3) + 10, count));
  } else if (action === "less-efforts") {
    state.effortVisibleCounts.set(disciplineId, 3);
  }
  renderDex();
}

function handleEffortAction(discipline, action, effortId) {
  const effort = (state.effortByDiscipline.get(discipline.id) ?? []).find((item) => item.id === effortId);
  if (action === "edit" && effort) {
    state.activeEntryDisciplineId = "";
    state.activeEditEffortId = effort.id;
    state.effortDrafts.set(editEffortDraftKey(effort.id), effortDraftFromEffort(effort, discipline));
  } else if (action === "cancel-edit") {
    state.activeEditEffortId = "";
    state.effortDrafts.delete(editEffortDraftKey(effortId));
  } else if (action === "delete-post" && effort?.beitrag_id) {
    void deleteContributionPost(effort.beitrag_id);
    return;
  } else if (action === "delete-effort" && effort) {
    void deleteEffort(effort, discipline);
    return;
  }
  renderDex();
}

function newEffortDraftKey(disciplineId) {
  return `new:${disciplineId}`;
}

function editEffortDraftKey(effortId) {
  return `edit:${effortId}`;
}

function deleteEffortPendingKey(effortId) {
  return `delete:${effortId}`;
}

function effortDraftFromEffort(effort, discipline) {
  const draft = {
    share: Boolean(effort.beitrag_id),
    text: effort.beitrag_text ?? "",
    performedDate: effort.geleistet_am ?? toDateInputValue(effort.erstellt_am)
  };
  if (discipline.name === "Distanzwurf") {
    draft.stage = String(effort.wert ?? "");
  } else if (discipline.einheit === "Sekunden") {
    const total = Number(effort.wert) || 0;
    draft.minutes = String(Math.floor(total / 60));
    draft.seconds = String(Number((total % 60).toFixed(discipline.nachkommastellen || 1)));
  } else {
    draft.value = String(effort.wert ?? "");
  }
  return draft;
}

function saveEffortDraft(form) {
  if (!form) return;
  const data = new FormData(form);
  state.effortDrafts.set(form.dataset.formKey, {
    value: data.get("value") ?? "",
    minutes: data.get("minutes") ?? "",
    seconds: data.get("seconds") ?? "",
    stage: data.get("stage") ?? "",
    performedDate: data.get("performedDate") ?? todayInputValue(),
    share: data.get("share") === "on",
    text: data.get("text") ?? ""
  });
}

async function handleEffortSubmit(event, discipline) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const editEffortId = formElement.dataset.editEffortId ?? "";
  const formKey = formElement.dataset.formKey || (editEffortId ? editEffortDraftKey(editEffortId) : newEffortDraftKey(discipline.id));
  if (!state.connected || !state.session?.user || state.pendingEffortIds.has(formKey)) return;

  const form = new FormData(formElement);
  saveEffortDraft(formElement);
  const parsed = parseEffortValue(form, discipline);
  if (parsed.error) {
    state.effortMessages.set(discipline.id, { type: "error", text: parsed.error });
    renderDex();
    return;
  }

  const previousMedal = disciplineStatus(discipline);
  const previousBest = sortedEfforts(discipline)[0] ?? null;
  const previousEffort = editEffortId ? (state.effortByDiscipline.get(discipline.id) ?? []).find((item) => item.id === editEffortId) : null;
  state.pendingEffortIds.add(formKey);
  state.effortMessages.delete(discipline.id);
  renderDex();

  const share = form.get("share") === "on";
  const performedDate = parsePerformedDate(form);
  if (performedDate.error) {
    state.pendingEffortIds.delete(formKey);
    state.effortMessages.set(discipline.id, { type: "error", text: performedDate.error });
    renderDex();
    return;
  }
  const rpcName = editEffortId ? "update_leistung_with_optional_beitrag" : "create_leistung_with_optional_beitrag";
  const rpcArgs = editEffortId
    ? {
      p_leistung_id: editEffortId,
      p_wert: parsed.value,
      p_share: share,
      p_text: form.get("text") ?? null,
      p_geleistet_am: performedDate.value
    }
    : {
      p_disziplin_id: discipline.id,
      p_wert: parsed.value,
      p_share: share,
      p_text: form.get("text") ?? null,
      p_geleistet_am: performedDate.value
    };
  const { data, error } = await state.supabase.rpc(rpcName, rpcArgs);

  state.pendingEffortIds.delete(formKey);
  if (error || !Array.isArray(data) || !data.length) {
    state.effortMessages.set(discipline.id, { type: "error", text: error?.message ?? "Leistung konnte nicht gespeichert werden." });
    renderDex();
    return;
  }

  const saved = data[0];
  const effort = {
    id: saved.leistung_id,
    disziplin_id: saved.disziplin_id,
    wert: saved.wert,
    medaille: saved.medaille,
    erstellt_am: saved.erstellt_am,
    geleistet_am: saved.geleistet_am,
    beitrag_id: saved.beitrag_id ?? null,
    beitrag_text: saved.beitrag_text ?? ""
  };
  const currentList = state.effortByDiscipline.get(discipline.id) ?? [];
  const list = editEffortId
    ? currentList.map((item) => (item.id === editEffortId ? { ...item, ...effort } : item))
    : [...currentList, effort];
  state.effortByDiscipline.set(discipline.id, list);
  state.achievements.set(discipline.id, bestMedalForEfforts(list));
  state.activeEntryDisciplineId = "";
  state.activeEditEffortId = "";
  state.effortDrafts.delete(formKey);
  state.effortMessages.set(discipline.id, {
    type: "success",
    text: editEffortId ? "Leistung wurde aktualisiert." : effortSuccessMessage(effort, discipline, previousMedal, previousBest)
  });
  await loadProfileAndStats();
  if (share || previousEffort?.beitrag_id) await loadFeed(true);
  renderDex();
  renderFeed();
  renderProfile();
}

function parseEffortValue(form, discipline) {
  let value;
  if (discipline.name === "Distanzwurf") {
    value = Number(form.get("stage"));
  } else if (discipline.einheit === "Sekunden") {
    const minutes = Number(form.get("minutes") || 0);
    const seconds = Number(form.get("seconds") || 0);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return { error: "Bitte eine gueltige Zeit eingeben." };
    value = minutes * 60 + seconds;
  } else {
    value = Number(form.get("value"));
  }
  const validation = validateEffortValue(value, discipline);
  return validation ? { error: validation } : { value };
}

function parsePerformedDate(form) {
  const value = String(form.get("performedDate") ?? "").trim();
  if (!value) return { error: "Bitte ein Datum eingeben." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Bitte ein gueltiges Datum eingeben." };
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { error: "Bitte ein gueltiges Datum eingeben." };
  return { value };
}

function validateEffortValue(value, discipline) {
  if (!Number.isFinite(value)) return "Bitte einen gueltigen Wert eingeben.";
  if (value < 0) return "Negative Werte sind nicht erlaubt.";
  if (["Sekunden", "Meter", "Stufe"].includes(discipline.einheit) && value <= 0) return "Dieser Wert muss groesser als null sein.";
  if (discipline.nachkommastellen === 0 && !Number.isInteger(value)) return "Diese Disziplin erlaubt nur ganze Zahlen.";
  const rounded = Number(value.toFixed(discipline.nachkommastellen));
  if (rounded !== value) return `Maximal ${discipline.nachkommastellen} Nachkommastellen erlaubt.`;
  if (["20x Freiwurf", "20x Dreierwuerfe"].includes(discipline.name) && value > 20) return "Maximal 20 Treffer moeglich.";
  if (discipline.name === "5x Lattenschiessen" && value > 5) return "Maximal 5 Treffer moeglich.";
  if (discipline.name === "Distanzwurf" && ![1, 2, 3].includes(value)) return "Bitte eine gueltige Stufe waehlen.";
  return "";
}

function sortedEfforts(discipline) {
  if (!discipline) return [];
  return [...(state.effortByDiscipline.get(discipline.id) ?? [])].sort((a, b) => {
    const valueDiff = discipline.bewertungsrichtung === "niedriger" ? Number(a.wert) - Number(b.wert) : Number(b.wert) - Number(a.wert);
    if (valueDiff !== 0) return valueDiff;
    return new Date(b.erstellt_am) - new Date(a.erstellt_am);
  });
}

function disciplineStatus(discipline) {
  const medal = state.achievements.get(discipline.id);
  if (["bronze", "silber", "gold"].includes(medal)) return medal;
  if (medal === "unbewertet") return "unbewertet";
  if (medal === "keine") return "keine";
  return "offen";
}

function cardStatusLabel(discipline) {
  const status = disciplineStatus(discipline);
  if (status === "offen") return "Noch nicht versucht";
  if (status === "keine") return "Versucht";
  return medalLabel(status);
}

function renderMedalProgress(status) {
  const levels = ["bronze", "silber", "gold"];
  const reachedIndex = levels.indexOf(status);
  return `<div class="medal-row" aria-label="Medaillenstatus">${levels.map((level, index) => `<span class="medal ${level}${index <= reachedIndex ? " is-earned" : ""}${level === status ? " is-current" : ""}">${medalSymbol(level)} ${medalLabel(level)}</span>`).join("")}</div>`;
}

function medalSummary() {
  const counts = { bronze: 0, silber: 0, gold: 0, collected: 0 };
  state.disciplines.forEach((discipline) => {
    const status = disciplineStatus(discipline);
    if (["bronze", "silber", "gold"].includes(status)) {
      counts[status] += 1;
      counts.collected += 1;
    }
  });
  return counts;
}

function hasBoundaries(discipline) {
  return ["bronze", "silber", "gold"].some((level) => {
    const m = discipline[`${level}_m`];
    const w = discipline[`${level}_w`];
    return m != null || w != null;
  });
}

function effortSuccessMessage(effort, discipline, previousMedal, previousBest) {
  const newMedal = bestMedal(previousMedal, effort.medaille);
  const improvedMedal = medalRank(newMedal) > medalRank(previousMedal);
  const bestImproved = !previousBest || sortedEfforts(discipline)[0]?.id === effort.id;
  if (improvedMedal && ["bronze", "silber", "gold"].includes(newMedal)) {
    return `${medalSymbol(newMedal)} ${medalLabel(newMedal)} erreicht! ${formatEffortValue(effort.wert, discipline)}.${nextMedalHint(effort, discipline, newMedal)}`;
  }
  if (bestImproved) return `Neue Bestleistung gespeichert: ${formatEffortValue(effort.wert, discipline)}.`;
  return "Leistung gespeichert.";
}

function nextMedalHint(effort, discipline, medal) {
  const next = medal === "bronze" ? "silber" : medal === "silber" ? "gold" : "";
  if (!next || !state.profile?.wertungsklasse) return "";
  const target = discipline[`${next}_${state.profile.wertungsklasse}`];
  if (target == null) return "";
  const diff = discipline.bewertungsrichtung === "niedriger" ? Number(effort.wert) - Number(target) : Number(target) - Number(effort.wert);
  if (diff <= 0) return "";
  return ` Fuer ${medalLabel(next)} fehlen ${formatEffortValue(diff, discipline)}.`;
}

function medalRank(value) {
  return { offen: 0, keine: 1, unbewertet: 1, bronze: 2, silber: 3, gold: 4 }[value] ?? 0;
}

function renderSportIcon(category) {
  const color = categoryColors[category] ?? "var(--color-primary)";
  return `<span class="sport-icon" style="--icon-color: ${color}" title="${escapeHtml(category)}" aria-label="${escapeHtml(category)}">${iconFor(category)}</span>`;
}

function renderDsaIcon() {
  return `
    <span class="sport-icon dsa-icon" title="DSA" aria-label="DSA">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 15 8l6.5.9-4.7 4.5 1.1 6.4L12 16.8 6.1 19.8l1.1-6.4L2.5 8.9 9 8l3-6Z"/></svg>
    </span>
  `;
}

function renderWarningIcon(label) {
  return `
    <span class="sport-icon warning-icon" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1.8 20h20.4L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z"/></svg>
    </span>
  `;
}

function renderConnect() {
  els.requestList.innerHTML = "";
  if (els.activityMore) els.activityMore.hidden = true;
  els.connectTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.connectTab === state.connectTab);
  });
  els.connectFollowTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.connectFollowTab === state.connectFollowTab);
    button.parentElement.hidden = state.connectTab !== "follows";
  });
  els.connectActivityTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.connectActivityTab === state.connectActivityTab);
    button.parentElement.hidden = state.connectTab !== "activity";
  });

  if (!state.connected) {
    setConnectState("Demo-Modus: Anfragen sind erst mit Supabase-Verbindung verfuegbar.");
    return;
  }
  if (!state.session?.user) {
    setConnectState("Bitte melde dich im Profil an, um Follow-Anfragen zu sehen.");
    return;
  }

  if (state.connectTab === "activity") {
    renderActivity();
    return;
  }

  const openRequests = state.incomingRequests.filter((request) => request.status === "angefragt");
  const followers = state.incomingRequests.filter((request) => request.status === "angenommen");
  const usersById = new Map(state.users.map((user) => [user.id, user]));
  const following = [...state.outgoingFollows.entries()]
    .filter(([, status]) => status === "angenommen" || status === "angefragt")
    .map(([userId, status]) => ({ user: usersById.get(userId) ?? { id: userId, nutzername: "nutzer", rank: 1 }, status }));
  const cards = connectCardsForTab(state.connectFollowTab, openRequests, followers, following);

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
      fragment.append(renderFollowingCard(card.user, card.status));
      return;
    }
    const requester = usersById.get(card.request.follower_id) ?? { id: card.request.follower_id, nutzername: "nutzer", rank: 1 };
    fragment.append(renderRequestCard(card.request, requester));
  });
  els.requestList.append(fragment);
}

async function ensureActivityLoaded() {
  const list = currentActivityList();
  if (!list.length && !state.activityLoading && !state.activityError) {
    await loadActivity(true);
  } else {
    renderConnect();
  }
}

async function loadActivity(reset = false) {
  if (!state.connected || !state.session?.user || state.activityLoading) return;
  const key = state.connectActivityTab;
  if (reset) {
    if (key === "received") state.activityReceived = [];
    if (key === "given") state.activityGiven = [];
    state.activityOffsets[key] = 0;
    state.activityHasMore[key] = true;
    state.activityError = "";
  }
  if (!state.activityHasMore[key]) {
    renderConnect();
    return;
  }

  state.activityLoading = true;
  renderConnect();
  const rpcName = key === "given" ? "own_like_activity" : "received_like_activity";
  const { data, error } = await state.supabase.rpc(rpcName, {
    p_limit: 10,
    p_offset: state.activityOffsets[key]
  });
  state.activityLoading = false;

  if (error) {
    state.activityError = `Aktivitaet konnte nicht geladen werden: ${error.message}`;
    renderConnect();
    return;
  }

  const rows = data ?? [];
  const target = key === "given" ? state.activityGiven : state.activityReceived;
  const known = new Set(reset ? [] : target.map(activityKey));
  const uniqueRows = rows.filter((item) => !known.has(activityKey(item)));
  if (key === "given") {
    state.activityGiven = reset ? rows : [...state.activityGiven, ...uniqueRows];
  } else {
    state.activityReceived = reset ? rows : [...state.activityReceived, ...uniqueRows];
  }
  state.activityOffsets[key] += rows.length;
  state.activityHasMore[key] = rows.length === 10;
  state.activityError = "";
  renderConnect();
}

function renderActivity() {
  const list = currentActivityList();
  if (state.activityError) {
    setConnectState(state.activityError, "error");
  } else if (state.activityLoading && !list.length) {
    setConnectState("Aktivitaet wird geladen ...");
  } else if (!list.length) {
    setConnectState(state.connectActivityTab === "given" ? "Du hast noch keine Beitraege geliked." : "Noch keine Likes auf deine Beitraege.");
  } else {
    hideState(els.connectState);
  }

  const fragment = document.createDocumentFragment();
  list.forEach((item) => fragment.append(renderActivityCard(item)));
  els.requestList.append(fragment);
  if (els.activityMore) {
    els.activityMore.hidden = !list.length || !state.activityHasMore[state.connectActivityTab];
    els.activityMore.disabled = state.activityLoading;
    els.activityMore.textContent = state.activityLoading ? "Laedt ..." : "Mehr laden";
  }
}

function currentActivityList() {
  return state.connectActivityTab === "given" ? state.activityGiven : state.activityReceived;
}

function activityKey(item) {
  return `${item.beitrag_id}:${item.liker_id ?? item.author_id}:${item.liked_at}`;
}

function renderActivityCard(item) {
  const isGiven = state.connectActivityTab === "given";
  const user = {
    id: isGiven ? item.author_id : item.liker_id,
    nutzername: isGiven ? item.author_name : item.liker_name,
    profilbild: isGiven ? item.author_profilbild : item.liker_profilbild,
    rank: isGiven ? item.author_rank : item.liker_rank
  };
  const discipline = state.disciplines.find((entry) => entry.id === item.disziplin_id) ?? {
    id: item.disziplin_id,
    name: item.disziplin_name,
    einheit: "",
    nachkommastellen: 0
  };
  const isPending = state.pendingLikeIds.has(item.beitrag_id);
  const article = document.createElement("article");
  article.className = "request-card activity-card";
  article.innerHTML = `
    <div class="avatar small-avatar">${escapeHtml(initials(user))}</div>
    <div class="request-body">
      <h3>@${escapeHtml(user.nutzername ?? "nutzer")}</h3>
      <span class="rank-label ${escapeHtml(rankClass(user.rank))}">${escapeHtml(rankLabel(user.rank))}</span>
      <p class="activity-copy">${isGiven ? "Du magst" : "Mag deinen Beitrag"}: <strong>${escapeHtml(item.disziplin_name ?? "Beitrag")}</strong></p>
      <p class="activity-meta">${escapeHtml(formatFeedEffortValue(item.wert, discipline))} · ${escapeHtml(formatDate(item.liked_at))}</p>
    </div>
    <span class="request-type">${isGiven ? "Eigener Like" : "Like"}</span>
    ${isGiven ? `
      <div class="request-actions">
        <button class="decline-button is-danger" type="button" data-activity-unlike="${escapeHtml(item.beitrag_id)}" ${isPending ? "disabled" : ""}>Like zuruecknehmen</button>
      </div>
    ` : ""}
  `;
  article.querySelector("[data-activity-unlike]")?.addEventListener("click", (event) => {
    void togglePostLike(event.currentTarget.dataset.activityUnlike, { source: "activity" });
  });
  return article;
}

function connectCardsForTab(tab, openRequests, followers, following) {
  const incomingCards = [
    ...openRequests.map((request) => ({ kind: "incoming", request })),
    ...followers.map((request) => ({ kind: "incoming", request }))
  ];
  const followingCards = following.map((item) => ({ kind: "following", user: item.user, status: item.status }));
  if (tab === "followers") return incomingCards;
  if (tab === "following") return followingCards;
  return [...incomingCards, ...followingCards];
}

function connectEmptyMessage(tab) {
  if (tab === "followers") return "Keine Follower oder offenen Anfragen";
  if (tab === "following") return "Du folgst noch niemandem und hast keine offenen Anfragen";
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

function renderFollowingCard(user, status = "angenommen") {
  const article = document.createElement("article");
  article.className = "request-card";
  const userId = user.id;
  const isPending = state.pendingRequestIds.has(userId);
  const isRequested = status === "angefragt";
  article.innerHTML = `
    <div class="avatar small-avatar">${escapeHtml(initials(user))}</div>
    <div class="request-body">
      <h3>@${escapeHtml(user.nutzername ?? "nutzer")}</h3>
      <span class="rank-label ${escapeHtml(rankClass(user.rank))}">${escapeHtml(rankLabel(user.rank))}</span>
    </div>
    <span class="request-type">${isRequested ? "Angefragt" : "Gefolgt"}</span>
    <div class="request-actions">
      <button class="accept-back-button is-secondary" type="button" disabled>${isRequested ? "Angefragt" : "Gefolgt"}</button>
      <button class="decline-button is-danger" type="button" data-request-action="${isRequested ? "withdraw-outgoing" : "unfollow-outgoing"}" ${isPending ? "disabled" : ""}>${isRequested ? "Anfrage zurueckziehen" : "Entfolgen"}</button>
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
  } else if (state.profileMessage) {
    setProfileState(state.profileMessage, state.profileMessageType);
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
  const medalCounts = cumulativeMedalCounts(medals);
  els.statDex.textContent = String(state.achievements.size);
  els.statBronze.textContent = String(medalCounts.bronze);
  els.statSilver.textContent = String(medalCounts.silver);
  els.statGold.textContent = String(medalCounts.gold);
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
  state.profileMessage = "";
  state.profileMessageType = "";
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
  const email = String(form.get("email"));
  state.profileMessage = "";
  state.profileMessageType = "";
  setProfileState("Registrierung laeuft ...");
  const { error } = await state.supabase.auth.signUp({
    email,
    password: form.get("password"),
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: {
        nutzername,
        wertungsklasse: form.get("wertungsklasse")
      }
    }
  });
  if (error) return setProfileState(error.message, "error");
  state.profileMessage = `Pruefe dein Postfach unter ${email}. Oeffne den Bestaetigungslink, um deine Registrierung abzuschliessen.`;
  state.profileMessageType = "success";
  setProfileState(state.profileMessage, "success");
  showAuthPane("login");
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
  state.profileMessage = "";
  state.profileMessageType = "";
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
  renderFeed();
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
    state.feedNeedsRefresh = true;
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
  await loadFeed(true);
  renderUserSearch();
  renderConnect();
  renderFeed();
  renderProfile();
  renderDex();
  showAuthPane("login");
}

function clearPersonalState() {
  state.session = null;
  state.profileMessage = "";
  state.profileMessageType = "";
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
  state.expandedDisciplineId = "";
  state.activeEntryDisciplineId = "";
  state.activeEditEffortId = "";
  state.effortByDiscipline = new Map();
  state.effortVisibleCounts = new Map();
  state.pendingEffortIds = new Set();
  state.effortMessages = new Map();
  state.feedPosts = [];
  state.feedOffset = 0;
  state.feedHasMore = true;
  state.feedLoading = false;
  state.feedError = "";
  state.feedMessage = "";
  state.feedMessageType = "";
  state.feedNeedsRefresh = true;
  state.expandedFeedTextIds = new Set();
  state.pendingPostIds = new Set();
  state.pendingLikeIds = new Set();
  state.activityReceived = [];
  state.activityGiven = [];
  state.activityOffsets = { received: 0, given: 0 };
  state.activityHasMore = { received: true, given: true };
  state.activityLoading = false;
  state.activityError = "";
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
    if (state.connectTab === "activity") {
      await ensureActivityLoaded();
    } else {
      renderConnect();
    }
  }
  if (viewName === "feed") {
    if (state.feedNeedsRefresh || (!state.feedPosts.length && !state.feedLoading)) {
      await loadFeed(true);
    } else {
      renderFeed();
    }
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

function setFeedState(message, type = "") {
  setStateBox(els.feedState, message, type);
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
  state.feedNeedsRefresh = true;
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

function formatEffortValue(value, discipline) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (discipline.name === "Distanzwurf") {
    return { 1: "Dreierlinie", 2: "Mittelkreis", 3: "Mittellinie" }[number] ?? `Stufe ${number}`;
  }
  if (discipline.einheit === "Sekunden") {
    const minutes = Math.floor(number / 60);
    const seconds = number - minutes * 60;
    const secondText = seconds.toLocaleString("de-DE", {
      minimumFractionDigits: discipline.nachkommastellen > 0 ? 1 : 0,
      maximumFractionDigits: discipline.nachkommastellen ?? 1
    });
    return minutes > 0 ? `${minutes}:${String(secondText).padStart(4, "0")} min` : `${secondText} s`;
  }
  return `${number.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: discipline.nachkommastellen ?? 0
  })} ${discipline.einheit}`;
}

function formatFeedEffortValue(value, discipline) {
  const base = formatEffortValue(value, discipline);
  if (discipline.name === "20x Freiwurf" || discipline.name === "20x Dreierwuerfe") {
    return `${Number(value).toLocaleString("de-DE")} / 20 Treffer`;
  }
  if (discipline.name === "5x Lattenschiessen") {
    return `${Number(value).toLocaleString("de-DE")} / 5 Treffer`;
  }
  return base;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}.${month}.${year}`;
  }
  return formatDate(value);
}

function toDateInputValue(value) {
  if (!value) return todayInputValue();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function medalSymbol(value) {
  return { bronze: "●", silber: "●", gold: "●" }[value] ?? "●";
}

function normalizeSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

function bestMedal(a = "keine", b = "keine") {
  const rank = { offen: 0, keine: 1, unbewertet: 1, bronze: 2, silber: 3, gold: 4 };
  return rank[b] > rank[a] ? b : a;
}

function bestMedalForEfforts(efforts) {
  return efforts.reduce((best, effort) => bestMedal(best, effort.medaille), "keine");
}

function cumulativeMedalCounts(medals) {
  return {
    bronze: medals.filter((medal) => ["bronze", "silber", "gold"].includes(medal)).length,
    silver: medals.filter((medal) => ["silber", "gold"].includes(medal)).length,
    gold: medals.filter((medal) => medal === "gold").length
  };
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
