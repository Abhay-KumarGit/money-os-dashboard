const SUMMARY_URL = "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/summary";
const AUTH_URL = "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/auth";
const SESSION_KEY = "moneyos.session";
const LEGACY_KEY = "moneyos.apiToken";
const REMEMBER_KEY = "moneyos.remember";
const PRIVACY_KEY = "moneyos.privacyMask";
const THEME_KEY = "moneyos.theme";
const NAV_DOCK_KEY = "moneyos.navDock";
const REFRESH_STATUS_URL = "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/daily-refresh-status";
const HEALTH_URL = "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/health";
const MASK_TEXT = "••••••";

const $ = (id) => document.getElementById(id);
const money0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number4 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

let state = {
  data: null,
  view: "daily",
  masked: true,
  navDock: localStorage.getItem(NAV_DOCK_KEY) === "right" ? "right" : "left",
  dailyHistoryIndex: 0,
  pendingPrivacyHide: false,
  pendingPrivacyReveal: false,
  dailyRefreshStatus: null,
  dailyRefreshBusy: false,
  health: null,
  healthBusy: false,
  stockSortKey: "value",
  stockSortDirection: "desc",
  fundSortKey: "value",
  fundSortDirection: "desc"
};

let dailyRefreshPollTimer = null;

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(v, detailed = false) {
  if (state.masked) return MASK_TEXT;
  return (detailed ? money2 : money0).format(num(v));
}

function signedMoney(v, detailed = false) {
  if (state.masked) return MASK_TEXT;
  const n = num(v);
  return (n >= 0 ? "+" : "−") + (detailed ? money2 : money0).format(Math.abs(n));
}

function pct(v, digits = 2) {
  if (state.masked) return "••••";
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  return (n >= 0 ? "+" : "") + n.toFixed(digits) + "%";
}

function privateNumber(v, formatter = number4) {
  return state.masked ? "••••" : formatter.format(num(v));
}

function privateShare(v, digits = 1) {
  return state.masked ? "••••" : num(v).toFixed(digits) + "%";
}

function tone(v) {
  if (state.masked || v === null || v === undefined) return "neutral";
  return num(v) >= 0 ? "positive" : "negative";
}

function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

function applyTheme(theme, persist = true) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  if (persist) localStorage.setItem(THEME_KEY, next);
  const meta = $("themeColor");
  if (meta) meta.setAttribute("content", next === "light" ? "#f4f7fb" : "#0a0d12");
  const button = $("themeToggle");
  const label = $("themeToggleLabel");
  if (button) {
    button.setAttribute("aria-label", next === "light" ? "Switch to dark mode" : "Switch to light mode");
    button.title = next === "light" ? "Switch to dark mode" : "Switch to light mode";
    button.querySelector(".theme-icon-sun")?.classList.toggle("hidden", next === "light");
    button.querySelector(".theme-icon-moon")?.classList.toggle("hidden", next !== "light");
  }
  if (label) label.textContent = next === "light" ? "Dark" : "Light";
  if (state.data && state.view === "overview") requestAnimationFrame(drawChart);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || preferredTheme();
  applyTheme(current === "light" ? "dark" : "light");
}

function dateLabel(value) {
  if (!value) return "—";
  const d = new Date(String(value).length === 10 ? value + "T00:00:00" : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function dateTimeLabel(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function assetName(p) {
  const i = p?.instruments || {};
  return i.symbol || i.name || i.scheme_code || "Instrument";
}

function assetSubtitle(p) {
  const i = p?.instruments || {};
  if (i.asset_type === "MF") return i.name || i.scheme_code || "Mutual fund";
  return [i.name, i.exchange].filter(Boolean).join(" · ") || i.asset_type || "";
}

function showToast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add("hidden"), 3600);
}

function setFormStatus(el, message, ok) {
  el.textContent = message;
  el.className = "form-status " + (ok ? "success-text" : "error");
  el.classList.remove("hidden");
}

function updatePrivacyControls() {
  const masked = state.masked;
  const topButton = $("privacyToggle");
  const settingsButton = $("privacySettingsBtn");
  const status = $("privacyStatus");
  const label = $("privacyToggleLabel");

  if (topButton) {
    topButton.setAttribute("aria-pressed", String(masked));
    topButton.setAttribute("aria-label", masked ? "Show financial values" : "Hide financial values");
    topButton.title = masked ? "Show financial values" : "Hide financial values";
    topButton.querySelector(".privacy-icon-show")?.classList.toggle("hidden", masked);
    topButton.querySelector(".privacy-icon-hide")?.classList.toggle("hidden", !masked);
  }
  if (label) label.textContent = masked ? "Show values" : "Hide values";
  if (settingsButton) settingsButton.textContent = masked ? "Show" : "Hide";
  const pinButton = $("privacyPinSettingsBtn");
  const configured = Boolean(state.data?.security?.privacy_password_configured);
  if (pinButton) pinButton.textContent = configured ? "Reset PIN" : "Set PIN";
  if (status) {
    status.textContent = masked ? "Hidden" : "Visible";
    status.classList.toggle("active", masked);
  }
  const learningPrivacy = $("learningDialogPrivacy");
  if (learningPrivacy) {
    learningPrivacy.textContent = masked ? "Show values" : "Hide values";
    learningPrivacy.setAttribute("aria-label", masked ? "Show financial values in this lesson" : "Hide financial values in this lesson");
    learningPrivacy.setAttribute("aria-pressed", String(!masked));
  }
}

function setPrivacy(masked) {
  state.masked = Boolean(masked);
  localStorage.setItem(PRIVACY_KEY, state.masked ? "1" : "0");
  updatePrivacyControls();
  if (state.data) renderAll();
  if ($("learningDialog")?.open && state.currentLearningLesson) {
    renderLearningDialog(state.currentLearningLesson);
  }
}

function privacyPasswordConfigured() {
  return Boolean(state.data?.security?.privacy_password_configured);
}

function requestPrivacyUnlock() {
  const dialog = $("privacyUnlockDialog");
  $("privacyUnlockPassword").value = "";
  $("privacyUnlockStatus").classList.add("hidden");
  if (!dialog.open) dialog.showModal();
  setTimeout(() => $("privacyUnlockPassword").focus(), 30);
}

function openPrivacyPinDialog(forHide = false) {
  state.pendingPrivacyHide = Boolean(forHide);
  const configured = privacyPasswordConfigured();
  $("privacyPinDialogTitle").textContent = configured ? "Reset privacy PIN" : "Create privacy PIN";
  $("privacyPinDialogCopy").textContent = configured
    ? "Verify your Money OS password, then choose a new 4–8 digit privacy PIN."
    : "Create a 4–8 digit privacy PIN that is separate from your Money OS password.";
  $("privacyMainPassword").value = "";
  $("newPrivacyPin").value = "";
  $("confirmPrivacyPin").value = "";
  $("privacyPinStatus").classList.add("hidden");
  if (!$("privacyPinDialog").open) $("privacyPinDialog").showModal();
  setTimeout(() => $("privacyMainPassword").focus(), 30);
}

function togglePrivacy() {
  if (!state.masked) {
    if (!privacyPasswordConfigured()) {
      state.pendingPrivacyReveal = false;
      openPrivacyPinDialog(true);
      return;
    }
    setPrivacy(true);
    showToast("Financial values hidden");
    return;
  }
  if (!privacyPasswordConfigured()) {
    state.pendingPrivacyReveal = true;
    openPrivacyPinDialog(false);
    return;
  }
  requestPrivacyUnlock();
}

async function unlockPrivacy() {
  const privacyPassword = $("privacyUnlockPassword").value.trim();
  const button = $("privacyUnlockBtn");
  if (!/^\d{4,8}$/.test(privacyPassword)) {
    setFormStatus($("privacyUnlockStatus"), "Enter your 4–8 digit privacy PIN.", false);
    return;
  }

  button.disabled = true;
  button.textContent = "Verifying…";
  try {
    await authRequest({ action: "verify_privacy_password", privacy_password: privacyPassword }, getSession());
    setPrivacy(false);
    $("privacyUnlockDialog").close();
    showToast("Financial values revealed");
  } catch (e) {
    let message = "Incorrect privacy PIN.";
    if (e.status === 429) message = "Too many failed attempts. Try again in about 15 minutes.";
    if (e.status === 409) message = "Privacy PIN is not set yet. Reset it with your Money OS password.";
    setFormStatus($("privacyUnlockStatus"), message, false);
  } finally {
    button.disabled = false;
    button.textContent = "Reveal values";
  }
}

async function savePrivacyPin() {
  const mainPassword = $("privacyMainPassword").value;
  const pin = $("newPrivacyPin").value.trim();
  const confirm = $("confirmPrivacyPin").value.trim();
  const button = $("savePrivacyPinBtn");

  if (!mainPassword) {
    setFormStatus($("privacyPinStatus"), "Enter your Money OS password.", false);
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) {
    setFormStatus($("privacyPinStatus"), "Use a 4–8 digit privacy PIN.", false);
    return;
  }
  if (pin !== confirm) {
    setFormStatus($("privacyPinStatus"), "Privacy PINs do not match.", false);
    return;
  }
  if (pin === mainPassword) {
    setFormStatus($("privacyPinStatus"), "Privacy PIN must be different from your Money OS password.", false);
    return;
  }

  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await authRequest({
      action: "reset_privacy_password",
      main_password: mainPassword,
      privacy_password: pin
    }, getSession());

    if (state.data?.security) state.data.security.privacy_password_configured = true;
    updatePrivacyControls();
    $("privacyPinDialog").close();

    if (state.pendingPrivacyHide) {
      state.pendingPrivacyHide = false;
      state.pendingPrivacyReveal = false;
      setPrivacy(true);
      showToast("Privacy PIN created · financial values hidden");
    } else if (state.pendingPrivacyReveal) {
      state.pendingPrivacyReveal = false;
      setPrivacy(false);
      showToast("Privacy PIN reset · financial values revealed");
    } else {
      state.pendingPrivacyHide = false;
      state.pendingPrivacyReveal = false;
      showToast("Privacy PIN updated");
    }
  } catch (e) {
    let message = "Could not update privacy PIN.";
    if (e.status === 401) message = "Money OS password is incorrect.";
    if (e.status === 429) message = "Too many failed attempts. Try again in about 15 minutes.";
    if (e.body?.error === "privacy_password_must_differ") message = "Privacy PIN must be different from your Money OS password.";
    setFormStatus($("privacyPinStatus"), message, false);
  } finally {
    button.disabled = false;
    button.textContent = "Save PIN";
  }
}

function getSession() {
  return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || "";
}

function isRemembered() {
  return Boolean(localStorage.getItem(SESSION_KEY));
}

function storeSession(token, remember) {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (remember) {
    localStorage.setItem(SESSION_KEY, token);
    localStorage.setItem(REMEMBER_KEY, "1");
  } else {
    sessionStorage.setItem(SESSION_KEY, token);
    localStorage.setItem(REMEMBER_KEY, "0");
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

async function authRequest(payload, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const err = new Error(body.error || "Authentication failed");
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function login(password, remember) {
  const result = await authRequest({ action: "login", password, remember });
  storeSession(result.session, remember);
  return result;
}

async function tryLegacyMigration() {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return false;
  try {
    await login(legacy, true);
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

function showLocked(message) {
  $("boot").classList.add("hidden");
  $("app").classList.add("hidden");
  $("locked").classList.remove("hidden");
  $("loginPassword").value = "";
  $("lockError").classList.toggle("hidden", !message);
  $("lockError").textContent = message || "";
  setTimeout(() => $("loginPassword").focus(), 30);
}

function showApp() {
  const boot = $("boot");
  $("locked").classList.add("hidden");
  $("app").classList.remove("hidden");

  if (!boot || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    boot?.classList.add("hidden");
    return;
  }

  boot.classList.add("boot-exit");
  window.setTimeout(() => {
    boot.classList.add("hidden");
    boot.classList.remove("boot-exit");
  }, 600);
}

async function loadSummary() {
  const session = getSession();
  if (!session) {
    showLocked();
    return false;
  }

  const response = await fetch(SUMMARY_URL, {
    headers: { authorization: "Bearer " + session },
    cache: "no-store"
  });

  if (response.status === 401) {
    clearSession();
    showLocked("Session expired. Enter your password to continue.");
    return false;
  }
  if (!response.ok) throw new Error("Portfolio API error " + response.status);

  state.data = await response.json();
  renderAll();
  if (state.view === "daily") checkDailyRefreshStatus();
  showApp();
  return true;
}

async function unlock() {
  const password = $("loginPassword").value;
  const remember = $("rememberDevice").checked;
  const btn = $("unlockBtn");
  $("lockError").classList.add("hidden");
  if (!password) {
    showLocked("Enter your Money OS password.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Unlocking…";
  try {
    await login(password, remember);
    $("loginPassword").value = "";
    await loadSummary();
  } catch (e) {
    if (e.status === 429) {
      showLocked("Too many failed attempts. Try again in about 15 minutes.");
    } else {
      showLocked("Incorrect password.");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Unlock with password";
  }
}

function applyNavDock() {
  const app = $("app");
  const button = $("navDockToggle");
  if (!app || !button) return;
  const right = state.navDock === "right";
  app.classList.toggle("nav-right", right);
  button.setAttribute("aria-label", right ? "Move navigation to the left" : "Move navigation to the right");
  button.title = right ? "Move navigation to the left" : "Move navigation to the right";
}

function toggleNavDock() {
  state.navDock = state.navDock === "right" ? "left" : "right";
  localStorage.setItem(NAV_DOCK_KEY, state.navDock);
  applyNavDock();
}

function navigate(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "view-" + view));
  document.querySelectorAll("[data-nav]").forEach((el) => el.classList.toggle("active", el.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "overview") setTimeout(drawChart, 50);
  if (view === "daily") checkDailyRefreshStatus();
  if (view === "settings") checkHealth();
}

function renderAll() {
  const d = state.data;
  if (!d?.latest) return;

  updatePrivacyControls();
  const latest = d.latest;
  const metrics = d.metrics || {};
  const stocks = metrics.stocks || {};
  const funds = metrics.mutual_funds || {};

  $("totalValue").textContent = money(latest.total_value);
  $("totalCost").textContent = money(latest.total_cost);
  $("unrealized").textContent = signedMoney(latest.unrealized_pnl);
  $("unrealized").className = tone(latest.unrealized_pnl);
  $("unrealizedPct").textContent = pct(metrics.total_return_pct) + " since 31 Aug 2026";
  $("realized").textContent = signedMoney(latest.realized_pnl);
  $("realized").className = tone(latest.realized_pnl);

  const day = latest.day_change;
  const dayPct = latest.day_change_pct;
  const dayValue = $("dayChange");
  const dayPctEl = $("dayChangePct");
  if (day === null || day === undefined || dayPct === null || dayPct === undefined) {
    dayValue.textContent = "—";
    dayValue.className = "performance-money neutral";
    dayPctEl.textContent = "No comparable close";
    dayPctEl.className = "performance-pct neutral";
  } else {
    dayValue.textContent = signedMoney(day);
    dayValue.className = "performance-money " + tone(day);
    dayPctEl.textContent = pct(dayPct);
    dayPctEl.className = "performance-pct " + tone(dayPct);
  }

  $("totalReturn").textContent = pct(metrics.total_return_pct);
  $("totalReturn").className = tone(metrics.total_return_pct);
  $("lastRefresh").textContent = dateTimeLabel(latest.updated_at);
  $("positionCount").textContent = (d.positions || []).length + " positions";
  $("niftyDay").textContent = pct(metrics.benchmark_day_pct);
  $("niftyDay").className = tone(metrics.benchmark_day_pct);
  $("niftyDate").textContent = metrics.benchmark_price_date ? "As of " + dateLabel(metrics.benchmark_price_date) : "Latest move";

  $("stocksValue").textContent = money(stocks.value);
  $("stocksCount").textContent = (stocks.count || 0) + " holdings";
  $("stocksPnl").textContent = signedMoney(stocks.unrealized_pnl);
  $("stocksPnl").className = tone(stocks.unrealized_pnl);

  $("fundsValue").textContent = money(funds.value);
  $("fundsCount").textContent = (funds.count || 0) + " funds";
  $("fundsPnl").textContent = signedMoney(funds.unrealized_pnl);
  $("fundsPnl").className = tone(funds.unrealized_pnl);

  renderAllocation();
  renderMovers();
  renderStocks();
  renderFunds();
  renderActivity();
  renderSettings();
  renderRecommendations();
  drawChart();


}

function renderAllocation() {
  const allocations = (state.data?.metrics?.allocation || []).filter((x) => num(x.value) > 0);
  const total = allocations.reduce((sum, x) => sum + num(x.value), 0);
  $("allocationTotal").textContent = money(total);
  if (state.masked) {
    $("donut").style.background = "var(--surface-2)";
  }

  const colors = {
    stocks: "var(--asset-stock)",
    mutual_funds: "var(--asset-fund)",
    other: "var(--asset-other)"
  };

  let cursor = 0;
  const segments = [];
  allocations.forEach((a) => {
    const share = total ? num(a.value) / total * 100 : 0;
    const next = cursor + share;
    segments.push((colors[a.key] || "var(--asset-other)") + " " + cursor.toFixed(2) + "% " + next.toFixed(2) + "%");
    cursor = next;
  });
  if (!state.masked) {
    $("donut").style.background = segments.length ? "conic-gradient(" + segments.join(",") + ")" : "var(--surface-2)";
  }

  $("allocationLegend").innerHTML = allocations.map((a) => {
    const share = total ? num(a.value) / total * 100 : 0;
    return '<div class="legend-row"><span class="legend-dot" style="background:' + (colors[a.key] || "var(--asset-other)") + '"></span><div><strong>' + escapeHtml(a.label) + '</strong><small>' + escapeHtml(privateShare(share)) + " · " + escapeHtml(money(a.value)) + "</small></div></div>";
  }).join("");
}

function moverCard(label, p) {
  if (!p) return '<div class="empty-inline">Daily comparison will appear when consecutive market prices are available.</div>';
  const i = p.instruments || {};
  return '<article class="mover-card"><span class="muted">' + escapeHtml(label) + '</span><div class="mover-main"><div><strong>' + escapeHtml(i.symbol || i.name || "Holding") + '</strong><small>' + escapeHtml(i.name && i.symbol ? i.name : i.asset_type || "") + '</small></div><div class="' + tone(p.day_change_pct) + '"><strong>' + escapeHtml(pct(p.day_change_pct)) + '</strong><small>' + escapeHtml(signedMoney(p.day_change)) + "</small></div></div></article>";
}

function renderMovers() {
  const m = state.data?.metrics || {};
  const best = m.best_mover;
  const worst = m.worst_mover;
  if (!best && !worst) {
    $("movers").innerHTML = '<div class="empty-inline">Daily movers will appear after comparable market prices are available.</div>';
    return;
  }
  const same = best && worst && best.instrument_id === worst.instrument_id;
  $("movers").innerHTML = moverCard("Best mover", best) + (same ? "" : moverCard("Weakest mover", worst));
}

function sortValue(p, key) {
  if (key === "name") return assetName(p);
  if (key === "qty") return p.quantity;
  if (key === "basis") return p.close;
  if (key === "pnl") return p.unrealized_pnl;
  if (key === "day") return p.day_change_pct;
  return p.market_value;
}

function compareSortValues(a, b, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  if (key === "name") return assetName(a).localeCompare(assetName(b), undefined, { sensitivity: "base" }) * factor;

  const av = Number(sortValue(a, key));
  const bv = Number(sortValue(b, key));
  const aMissing = !Number.isFinite(av);
  const bMissing = !Number.isFinite(bv);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return (av - bv) * factor;
}

function sortedFiltered(items, search, sortKey, direction = "desc") {
  const q = search.trim().toLowerCase();
  const filtered = items.filter((p) => {
    if (!q) return true;
    const i = p.instruments || {};
    return [i.symbol, i.name, i.exchange, i.scheme_code].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  return filtered.sort((a, b) => compareSortValues(a, b, sortKey, direction));
}

function updateSortHeaders(table, key, direction) {
  document.querySelectorAll('.sort-header[data-sort-table="' + table + '"]').forEach((button) => {
    const active = button.dataset.sortKey === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    const arrow = button.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  });
}

function setHoldingSort(table, key, direction) {
  const isStocks = table === "stocks";
  const keyProp = isStocks ? "stockSortKey" : "fundSortKey";
  const directionProp = isStocks ? "stockSortDirection" : "fundSortDirection";
  const select = $(isStocks ? "stockSort" : "fundSort");

  if (!direction) {
    direction = state[keyProp] === key
      ? (state[directionProp] === "asc" ? "desc" : "asc")
      : (key === "name" ? "asc" : "desc");
  }

  state[keyProp] = key;
  state[directionProp] = direction;
  if (select && Array.from(select.options).some((option) => option.value === key)) {
    select.value = key;
    syncModernSelect(select);
  }
  (isStocks ? renderStocks : renderFunds)();
}

function syncModernSelect(select) {
  const root = select?._modernSelectRoot;
  if (!root) return;
  const selected = select.options[select.selectedIndex];
  const label = root.querySelector(".modern-select-label");
  if (label) label.textContent = selected?.textContent || "Select";

  const isStocks = select.id === "stockSort";
  const direction = state[isStocks ? "stockSortDirection" : "fundSortDirection"];
  const directionButton = root.querySelector(".modern-select-direction");
  if (directionButton) {
    directionButton.textContent = direction === "asc" ? "↑" : "↓";
    directionButton.setAttribute("aria-label", direction === "asc" ? "Sort ascending. Tap to sort descending." : "Sort descending. Tap to sort ascending.");
    directionButton.title = direction === "asc" ? "Ascending" : "Descending";
  }

  root.querySelectorAll(".modern-select-option").forEach((option) => {
    const active = option.dataset.value === select.value;
    option.classList.toggle("selected", active);
    option.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function closeModernSelect(root, returnFocus = false) {
  if (!root?.classList.contains("open")) return;
  root.classList.remove("open");
  const trigger = root.querySelector(".modern-select-trigger");
  const menu = root.querySelector(".modern-select-menu");
  trigger?.setAttribute("aria-expanded", "false");
  if (menu) menu.hidden = true;
  if (returnFocus) trigger?.focus();
}

function enhanceModernSelect(select) {
  if (!select || select.dataset.modernized === "true") return;
  select.dataset.modernized = "true";
  select.classList.add("modern-select-native");

  const root = document.createElement("div");
  root.className = "modern-select";
  root.dataset.for = select.id;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "modern-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "Choose sort");

  const label = document.createElement("span");
  label.className = "modern-select-label";
  const chevron = document.createElement("span");
  chevron.className = "modern-select-chevron";
  chevron.setAttribute("aria-hidden", "true");

  trigger.append(label, chevron);

  const direction = document.createElement("button");
  direction.type = "button";
  direction.className = "modern-select-direction";
  direction.setAttribute("aria-label", "Toggle sort direction");

  const menu = document.createElement("div");
  menu.className = "modern-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  Array.from(select.options).forEach((nativeOption) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "modern-select-option";
    option.dataset.value = nativeOption.value;
    option.setAttribute("role", "option");
    option.textContent = nativeOption.textContent;
    menu.appendChild(option);
  });

  root.append(trigger, direction, menu);
  select.insertAdjacentElement("afterend", root);
  select._modernSelectRoot = root;
  syncModernSelect(select);

  const openMenu = (focusEdge) => {
    document.querySelectorAll(".modern-select.open").forEach((other) => {
      if (other !== root) closeModernSelect(other);
    });
    root.classList.add("open");
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (focusEdge) {
      const options = Array.from(menu.querySelectorAll(".modern-select-option"));
      (focusEdge === "last" ? options[options.length - 1] : options[0])?.focus();
    }
  };

  trigger.addEventListener("click", () => {
    if (root.classList.contains("open")) closeModernSelect(root);
    else openMenu();
  });

  direction.addEventListener("click", () => {
    const table = select.id === "stockSort" ? "stocks" : "funds";
    setHoldingSort(table, select.value);
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? "last" : "first");
    }
  });

  menu.addEventListener("click", (event) => {
    const option = event.target.closest(".modern-select-option");
    if (!option) return;
    select.value = option.dataset.value;
    syncModernSelect(select);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    closeModernSelect(root, true);
  });

  menu.addEventListener("keydown", (event) => {
    const options = Array.from(menu.querySelectorAll(".modern-select-option"));
    const current = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeModernSelect(root, true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + options.length) % options.length;
    options[next]?.focus();
  });

  select.addEventListener("change", () => syncModernSelect(select));
}

function enhanceToolbarSelects() {
  document.querySelectorAll(".toolbar select").forEach(enhanceModernSelect);
  if (document.documentElement.dataset.modernSelectBound === "true") return;
  document.documentElement.dataset.modernSelectBound = "true";

  document.addEventListener("click", (event) => {
    document.querySelectorAll(".modern-select.open").forEach((root) => {
      if (!root.contains(event.target)) closeModernSelect(root);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".modern-select.open").forEach((root) => closeModernSelect(root, true));
  });
}

function stockRow(p) {
  const i = p.instruments || {};
  return '<div class="asset-row stock-grid">' +
    '<div class="holding-name" data-label="Holding"><strong>' + escapeHtml(i.symbol || i.name || "—") + '</strong><small>' + escapeHtml([i.name, i.exchange].filter(Boolean).join(" · ")) + '</small></div>' +
    '<div data-label="Qty">' + escapeHtml(privateNumber(p.quantity)) + '</div>' +
    '<div data-label="Basis / LTP"><strong>' + escapeHtml(money(p.close, true)) + '</strong><small>basis ' + escapeHtml(money(p.average_cost, true)) + '</small></div>' +
    '<div data-label="Value"><strong>' + escapeHtml(money(p.market_value)) + '</strong><small>' + escapeHtml(dateLabel(p.price_date)) + '</small></div>' +
    '<div data-label="Today" class="' + tone(p.day_change_pct) + '"><strong>' + escapeHtml(pct(p.day_change_pct)) + '</strong><small>' + (p.day_change == null ? "—" : escapeHtml(signedMoney(p.day_change))) + '</small></div>' +
    '<div data-label="Tracked change" class="' + tone(p.unrealized_pnl) + '"><strong>' + escapeHtml(signedMoney(p.unrealized_pnl)) + '</strong><small>' + escapeHtml(pct(p.return_pct)) + '</small></div>' +
  '</div>';
}

function renderStocks() {
  const d = state.data;
  const items = (d.positions || []).filter((p) => ["EQUITY", "ETF"].includes(p.instruments?.asset_type));
  const m = d.metrics?.stocks || {};
  $("stocksPageValue").textContent = money(m.value);
  $("stocksSubtitle").textContent = (m.count || 0) + " holdings";
  $("stocksCost").textContent = money(m.cost);
  $("stocksUnrealized").textContent = signedMoney(m.unrealized_pnl);
  $("stocksUnrealized").className = tone(m.unrealized_pnl);
  $("stocksRealized").textContent = signedMoney(m.realized_pnl);
  $("stocksRealized").className = tone(m.realized_pnl);

  const rows = sortedFiltered(items, $("stockSearch").value, state.stockSortKey, state.stockSortDirection);
  $("stockList").innerHTML = rows.length ? rows.map(stockRow).join("") : '<div class="empty-inline">No matching stocks.</div>';
  updateSortHeaders("stocks", state.stockSortKey, state.stockSortDirection);
}

function fundRow(p) {
  const i = p.instruments || {};
  return '<div class="asset-row fund-grid">' +
    '<div class="holding-name" data-label="Fund"><strong>' + escapeHtml(i.name || i.scheme_code || "Mutual fund") + '</strong></div>' +
    '<div data-label="Units">' + escapeHtml(privateNumber(p.quantity)) + '</div>' +
    '<div data-label="Basis / NAV"><strong>' + escapeHtml(money(p.close, true)) + '</strong><small>basis ' + escapeHtml(money(p.average_cost, true)) + '</small></div>' +
    '<div data-label="Value"><strong>' + escapeHtml(money(p.market_value)) + '</strong><small>NAV ' + escapeHtml(dateLabel(p.price_date)) + '</small></div>' +
    '<div data-label="Tracked change" class="' + tone(p.unrealized_pnl) + '"><strong>' + escapeHtml(signedMoney(p.unrealized_pnl)) + '</strong><small>' + escapeHtml(pct(p.return_pct)) + '</small></div>' +
  '</div>';
}

function renderFunds() {
  const d = state.data;
  const items = (d.positions || []).filter((p) => p.instruments?.asset_type === "MF");
  const m = d.metrics?.mutual_funds || {};
  $("fundsPageValue").textContent = money(m.value);
  $("fundsSubtitle").textContent = (m.count || 0) + " funds";
  $("fundsCost").textContent = money(m.cost);
  $("fundsUnrealized").textContent = signedMoney(m.unrealized_pnl);
  $("fundsUnrealized").className = tone(m.unrealized_pnl);
  $("fundsRealized").textContent = signedMoney(m.realized_pnl);
  $("fundsRealized").className = tone(m.realized_pnl);

  const rows = sortedFiltered(items, $("fundSearch").value, state.fundSortKey, state.fundSortDirection);
  $("fundList").innerHTML = rows.length ? rows.map(fundRow).join("") : '<div class="empty-inline">No matching mutual funds.</div>';
  updateSortHeaders("funds", state.fundSortKey, state.fundSortDirection);
}

function transactionRow(t) {
  const i = t.instruments || {};
  const rawSymbol = String(i.symbol || "").trim();
  const numericSymbol = /^\d+$/.test(rawSymbol);
  const fundCode = String(i.scheme_code || (numericSymbol ? rawSymbol : "")).trim();
  const title = i.name || (i.asset_type === "MF" && fundCode ? "Mutual fund" : rawSymbol) || "Instrument";
  const identifier = i.asset_type === "MF" && !i.name && fundCode ? " · Scheme " + fundCode : "";
  const label = t.side === "BUY" ? "Bought" : "Sold";
  return '<div class="activity-row"><div class="activity-icon ' + (t.side === "BUY" ? "buy" : "sell") + '">' + (t.side === "BUY" ? "B" : "S") + '</div><div class="activity-main"><strong>' + escapeHtml(label + " " + title) + '</strong><small>' + escapeHtml(privateNumber(t.quantity)) + " units @ " + escapeHtml(money(t.price, true)) + ' · ' + escapeHtml(t.broker || t.source) + escapeHtml(identifier) + '</small></div><time>' + escapeHtml(dateLabel(t.trade_date)) + '</time></div>';
}

function renderActivity() {
  const d = state.data;
  const sync = d.sync || {};
  $("pendingCount").textContent = sync.recent_pending ?? "—";
  $("failedCount").textContent = sync.recent_failed ?? "—";

  const all = d.activity || [];
  const baselineCount = all.filter((t) => t.source === "CDSL_BASELINE").length;
  const regular = all.filter((t) => t.source !== "CDSL_BASELINE").slice(0, 20);
  let html = regular.map(transactionRow).join("");
  if (baselineCount) {
    html += '<div class="activity-row"><div class="activity-icon baseline">B</div><div class="activity-main"><strong>Opening portfolio baseline</strong><small>' + baselineCount + ' positions established</small></div><time>31 Aug 2026</time></div>';
  }
  $("activityList").innerHTML = html || '<div class="empty-inline">No recent transactions.</div>';
}

function renderSettings() {
  const s = state.data?.security || {};
  $("sessionExpiry").textContent = s.session_expires_at ? dateTimeLabel(s.session_expires_at) : "Current session";
  $("rememberState").textContent = isRemembered() ? "On · 7 days" : "Off · this tab";
  updatePrivacyControls();
}

function healthStatusLabel(status) {
  if (status === "healthy") return "Active";
  if (status === "degraded") return "Needs attention";
  if (status === "down") return "Down";
  return "Unknown";
}

function renderHealth() {
  const summary = $("healthSummary");
  const list = $("healthList");
  const btn = $("healthCheckBtn");
  if (!summary || !list || !btn) return;

  btn.disabled = state.healthBusy;
  btn.textContent = state.healthBusy ? "Checking…" : "Check now";

  if (state.healthBusy && !state.health) {
    summary.innerHTML = '<span class="health-dot unknown"></span><div><strong>Checking services…</strong><small>Running live availability and freshness checks.</small></div>';
    list.innerHTML = "";
    return;
  }

  const h = state.health;
  if (!h) {
    summary.innerHTML = '<span class="health-dot unknown"></span><div><strong>Not checked yet</strong><small>Run a health check to verify Money OS services.</small></div>';
    list.innerHTML = "";
    return;
  }

  const overall = healthStatusLabel(h.overall);
  const counts = h.counts || {};
  summary.innerHTML = '<span class="health-dot ' + escapeHtml(h.overall || "unknown") + '"></span><div><strong>' +
    escapeHtml(overall) + '</strong><small>' +
    escapeHtml((counts.healthy || 0) + " active · " + (counts.degraded || 0) + " attention · " + (counts.down || 0) + " down") +
    '</small></div>';

  const services = Array.isArray(h.services) ? h.services : [];
  list.innerHTML = services.map((s) =>
    '<div class="health-row"><span class="health-dot ' + escapeHtml(s.status || "unknown") + '"></span><div class="health-main"><strong>' +
    escapeHtml(s.display_name || s.service_key || "Service") + '</strong><small>' +
    escapeHtml(s.detail || "No detail available.") + '</small></div><span class="health-state ' +
    escapeHtml(s.status || "unknown") + '">' + escapeHtml(healthStatusLabel(s.status)) + '</span></div>'
  ).join("");
}

async function checkHealth() {
  const session = getSession();
  if (!session || state.healthBusy) return null;
  state.healthBusy = true;
  renderHealth();
  try {
    const response = await fetch(HEALTH_URL, {
      headers: { authorization: "Bearer " + session },
      cache: "no-store"
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Health API error " + response.status);
    state.health = await response.json();
    return state.health;
  } catch (e) {
    console.error("Health check failed", e);
    state.health = {
      overall: "down",
      counts: { healthy: 0, degraded: 0, down: 1, unknown: 0 },
      services: [{ service_key: "health_api", display_name: "Health checker", status: "down", detail: "Health API could not be reached." }]
    };
    return state.health;
  } finally {
    state.healthBusy = false;
    renderHealth();
  }
}

const INFO_COPY = {
  "portfolio-basis": {
    title: "Portfolio basis",
    body: "The tracked starting capital used for performance calculations. For older holdings, Money OS starts from the verified opening baseline and then adds later confirmed buys."
  },
  "tracked-change": {
    title: "Tracked change",
    body: "Current value minus the tracked basis. It shows movement since the opening baseline, so it should not be read as your lifetime profit or loss."
  },
  "realized-change": {
    title: "Realized",
    body: "Profit or loss from positions actually sold after the tracked baseline. Unsold holdings are not counted here."
  },
  "nifty-context": {
    title: "NIFTY 50 context",
    body: "The broad-market move helps you judge whether your portfolio moved with the market or behaved differently on the day."
  },
  "stock-basis": {
    title: "Tracked stock basis",
    body: "The stock-side opening baseline plus verified purchases made after that baseline. It is a tracking basis, not necessarily original lifetime purchase cost."
  },
  "stock-change": {
    title: "Tracked stock change",
    body: "The difference between current stock value and the tracked stock basis. Use it for performance since the baseline, not lifetime P&L."
  },
  "stock-realized": {
    title: "Realized stock P&L",
    body: "Profit or loss from stock sales recorded after the baseline date. Holdings you still own remain in tracked change instead."
  },
  "screen-privacy": {
    title: "Screen privacy",
    body: "Masks amounts, quantities, prices, percentages and performance charts on this device. Showing them again requires your separate privacy PIN. The public dashboard code does not contain your holdings, passwords or backend credentials."
  },
  "privacy-pin": {
    title: "Privacy PIN",
    body: "A separate 4–8 digit PIN used only to reveal hidden financial values. It is stored only as a server-side hash. If you forget it, you can set a new PIN by verifying your Money OS password."
  },
  "market-movers": {
    title: "Market movers",
    body: "Shows the strongest and weakest daily percentage moves among holdings with comparable recent prices. It is a quick context view, not a buy or sell signal."
  },
  "fund-basis": {
    title: "Tracked fund basis",
    body: "The mutual-fund starting basis plus confirmed later purchases. Where original invested cost is unavailable, the opening baseline is used so the figure should not be read as lifetime cost."
  },
  "fund-change": {
    title: "Tracked fund change",
    body: "The difference between current mutual-fund value and the tracked basis. It measures performance since the baseline rather than lifetime profit or loss."
  },
  "fund-realized": {
    title: "Realized fund P&L",
    body: "Profit or loss from recorded mutual-fund redemptions after the baseline. Units still held remain part of tracked change."
  },
  "activity-status": {
    title: "Activity status",
    body: "A compact health view of confirmed portfolio updates. Processed means accepted updates, Review means items awaiting attention, and Issues means recent update failures."
  },
  "recent-transactions": {
    title: "Recent transactions",
    body: "Shows confirmed portfolio buys, sells and the opening baseline. Background processing details are intentionally kept out of the main interface."
  },
  "security-settings": {
    title: "Security",
    body: "Money OS uses server-verified password sessions. Failed authentication attempts are rate-limited, and changing the primary password invalidates older sessions."
  },
  "performance-basis": {
    title: "Performance basis",
    body: "Tracked performance starts from the verified 31 Aug 2026 opening portfolio. Older equities use their market value on that date as the opening basis; mutual-fund cost uses invested amount when available, otherwise the opening NAV. This keeps tracking consistent but is not the same as lifetime acquisition P&L."
  }
};

function openInfo(key) {
  const copy = INFO_COPY[key];
  if (!copy) return;
  $("infoDialogTitle").textContent = copy.title;
  $("infoDialogBody").textContent = copy.body;
  if (!$("infoDialog").open) $("infoDialog").showModal();
}

function reportDateLabel(value) {
  if (!value) return "—";
  const d = new Date(String(value).length === 10 ? value + "T00:00:00" : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function professionalDailyText(value) {
  return String(value ?? "")
    .replace(/Money OS holdings remain reconciled with no new confirmed Gmail portfolio event\.?/gi, "No newly confirmed portfolio transaction changed current holdings.")
    .replace(/Gmail search found/gi, "Portfolio review found")
    .replace(/\bGmail\b/gi, "portfolio records")
    .replace(/\bemail(s)?\b/gi, "communication$1")
    .replace(/\bdatabase snapshot\b/gi, "portfolio snapshot")
    .replace(/\bMoney OS price set\b/gi, "available portfolio price set")
    .replace(/\bMoney OS\b/gi, "portfolio")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isInternalDailyNote(value) {
  return /\b(gmail|supabase|ingestion|extraction|source of truth|database table|sql|api token|query pipeline)\b/i.test(String(value ?? ""));
}

function maskDailyFinancialText(value) {
  if (!state.masked) return value;
  return String(value ?? "")
    .replace(/(?:₹|INR\s*|Rs\.?\s*)[+\-−]?\s*\d[\d,]*(?:\.\d+)?/gi, MASK_TEXT)
    .replace(/[+\-−]?\d+(?:\.\d+)?\s*%/g, "••••%")
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, MASK_TEXT);
}

function dailyText(value) {
  return maskDailyFinancialText(professionalDailyText(value));
}

function normalizeLesson(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw;
}

function learningButtonHtml(lesson) {
  const normalized = normalizeLesson(lesson);
  if (!normalized) return "";
  return '<button class="learn-this-btn" type="button" data-learn="' +
    escapeHtml(JSON.stringify(normalized)) + '">Learn this ↗</button>';
}

function configureLearningButton(button, lesson) {
  if (!button) return;
  const normalized = normalizeLesson(lesson);
  button.classList.toggle("hidden", !normalized);
  if (normalized) button.dataset.learn = JSON.stringify(normalized);
  else button.removeAttribute("data-learn");
}

function learningText(value) {
  return escapeHtml(dailyText(value));
}

function safeLearningUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function learningLessonHtml(raw) {
  const lesson = normalizeLesson(raw);
  if (!lesson) return '<p class="learning-empty">No lesson was saved for this item.</p>';

  const parts = [];
  const intro = lesson.intro || lesson.plain_english || lesson.meaning || "";
  if (intro) parts.push('<p class="learning-intro">' + learningText(intro) + '</p>');

  const why = lesson.why_it_matters || lesson.why || "";
  if (why) parts.push('<section class="learning-section"><h4>Why this matters here</h4><p>' + learningText(why) + '</p></section>');

  const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
  sections.forEach((section) => {
    if (!section || typeof section !== "object") return;
    let body = "";
    if (section.body) body += '<p>' + learningText(section.body) + '</p>';
    if (Array.isArray(section.bullets) && section.bullets.length) {
      body += '<ul>' + section.bullets.map((x) => '<li>' + learningText(x) + '</li>').join("") + '</ul>';
    }
    if (body) parts.push('<section class="learning-section"><h4>' + learningText(section.title || "Learn") + '</h4>' + body + '</section>');
  });

  if (Array.isArray(lesson.bullets) && lesson.bullets.length) {
    parts.push('<section class="learning-section"><h4>Key idea</h4><ul>' +
      lesson.bullets.map((x) => '<li>' + learningText(x) + '</li>').join("") + '</ul></section>');
  }

  const terms = Array.isArray(lesson.terms) ? lesson.terms : [];
  if (terms.length) {
    parts.push('<section class="learning-section"><h4>Terms to remember</h4><div class="learning-terms">' +
      terms.map((x) => {
        if (typeof x === "string") return '<div><strong>' + learningText(x) + '</strong></div>';
        return '<div><strong>' + learningText(x?.term || "Term") + '</strong><span>' + learningText(x?.meaning || x?.definition || "") + '</span></div>';
      }).join("") + '</div></section>');
  }

  if (lesson.diagram) {
    parts.push('<section class="learning-section"><h4>Visual</h4><pre class="learning-diagram">' +
      learningText(lesson.diagram) + '</pre></section>');
  }

  if (lesson.example) {
    const example = typeof lesson.example === "string" ? lesson.example : (lesson.example.body || lesson.example.text || "");
    if (example) parts.push('<section class="learning-section"><h4>Example</h4><div class="learning-example">' + learningText(example) + '</div></section>');
  }

  if (lesson.takeaway || lesson.remember) {
    parts.push('<div class="learning-takeaway"><span>Remember</span><strong>' +
      learningText(lesson.takeaway || lesson.remember) + '</strong></div>');
  }

  const sources = Array.isArray(lesson.sources) ? lesson.sources : [];
  const sourceLinks = sources.map((source) => {
    const href = safeLearningUrl(typeof source === "string" ? source : source?.url);
    if (!href) return "";
    const title = typeof source === "string" ? "Read more" : (source.title || source.label || "Read more");
    return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + learningText(title) + ' ↗</a>';
  }).filter(Boolean);
  if (sourceLinks.length) {
    parts.push('<section class="learning-section learning-sources"><h4>Go deeper</h4>' + sourceLinks.join("") + '</section>');
  }

  return parts.join("") || '<p class="learning-empty">No lesson was saved for this item.</p>';
}

function renderLearningDialog(lesson) {
  const normalized = normalizeLesson(lesson);
  if (!normalized) return;
  $("learningDialogTitle").textContent = dailyText(normalized.title || normalized.topic || "Learn this");
  const formatLabel = normalized.format ? String(normalized.format).replace(/_/g, " ") : "";
  const meta = [normalized.duration, formatLabel].filter(Boolean).join(" · ");
  $("learningDialogMeta").textContent = meta || "Finance, made simple";
  $("learningDialogBody").innerHTML = learningLessonHtml(normalized);
  updatePrivacyControls();
}

function openLearningDialog(raw) {
  const lesson = normalizeLesson(raw);
  if (!lesson) return;
  state.currentLearningLesson = lesson;
  renderLearningDialog(lesson);
  if (!$("learningDialog").open) $("learningDialog").showModal();
}

function recommendationItem(item) {
  if (typeof item === "string") return { title: item, detail: "", priority: "", learn: null };
  if (!item || typeof item !== "object") return { title: "Update", detail: String(item ?? ""), priority: "", learn: null };
  return {
    title: item.title || item.action || item.label || item.name || "Update",
    detail: item.detail || item.description || item.reason || item.note || "",
    priority: String(item.priority || item.status || "").toLowerCase(),
    learn: normalizeLesson(item.learn || item.learning)
  };
}

function recommendationRows(items, kind = "action") {
  const rows = Array.isArray(items) ? items : [];
  const visible = rows.filter((raw) => {
    const item = recommendationItem(raw);
    return !isInternalDailyNote(item.title + " " + item.detail);
  });
  if (!visible.length) return '<div class="daily-list-empty">Nothing needs attention here.</div>';
  return visible.map((raw) => {
    const item = recommendationItem(raw);
    const priorityClass = ["high", "urgent", "attention", "risk"].includes(item.priority)
      ? "attention"
      : ["medium", "watch", "monitor"].includes(item.priority) ? "watch" : "calm";
    return '<div class="daily-list-item"><span class="daily-bullet ' + priorityClass + '" aria-hidden="true"></span><div class="daily-item-copy"><strong>' +
      escapeHtml(dailyText(item.title)) + '</strong>' + (item.detail ? '<p>' + escapeHtml(dailyText(item.detail)) + '</p>' : '') +
      learningButtonHtml(item.learn) + '</div></div>';
  }).join("");
}


function indiaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((x) => x.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function renderDailyRefreshStatus() {
  const btn = $("dailyRefreshBtn");
  const label = $("dailyRefreshLabel");
  if (!btn || !label) return;

  const s = state.dailyRefreshStatus;
  if (state.dailyRefreshBusy) {
    btn.disabled = true;
    btn.classList.add("loading");
    btn.classList.remove("complete");
    label.textContent = "Requesting…";
    return;
  }

  btn.classList.remove("loading");
  if (!s) {
    btn.disabled = true;
    btn.classList.remove("complete");
    label.textContent = "Checking…";
    return;
  }

  btn.classList.toggle("complete", Boolean(s.refresh_completed));

  if (s.refresh_completed) {
    btn.disabled = true;
    label.textContent = s.report_available_today ? "Up to date" : "Report pending";
  } else if (s.refresh_requested) {
    btn.disabled = true;
    label.textContent = "Queued";
  } else if (s.refresh_needed) {
    btn.disabled = false;
    label.textContent = s.report_available_today ? "Refresh data" : "Refresh today";
  } else {
    btn.disabled = true;
    label.textContent = "Not due today";
  }
}

function scheduleDailyRefreshPoll(status) {
  if (dailyRefreshPollTimer) {
    clearTimeout(dailyRefreshPollTimer);
    dailyRefreshPollTimer = null;
  }
  if (state.view !== "daily" || !status) return;

  const waitingForData = Boolean(status.refresh_requested && !status.refresh_completed);
  const waitingForReport = Boolean(status.refresh_completed && !status.report_available_today);
  if (!waitingForData && !waitingForReport) return;

  const delay = waitingForData ? 15000 : 60000;
  dailyRefreshPollTimer = setTimeout(async () => {
    const next = await checkDailyRefreshStatus();
    if (next?.report_available_today) {
      await loadSummary();
    }
  }, delay);
}

async function checkDailyRefreshStatus() {
  const session = getSession();
  if (!session) return null;
  try {
    const response = await fetch(REFRESH_STATUS_URL, {
      headers: { authorization: "Bearer " + session },
      cache: "no-store"
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Refresh status API error " + response.status);

    state.dailyRefreshStatus = await response.json();
    renderDailyRefreshStatus();
    scheduleDailyRefreshPoll(state.dailyRefreshStatus);
    return state.dailyRefreshStatus;
  } catch (e) {
    console.error("Daily refresh status failed", e);
    state.dailyRefreshStatus = {
      date: indiaDateKey(),
      report_available_today: false,
      refresh_requested: false,
      refresh_completed: false,
      refresh_needed: false,
      error: true
    };
    renderDailyRefreshStatus();
    scheduleDailyRefreshPoll(null);
    return null;
  }
}

async function refreshDailyReport() {
  const btn = $("dailyRefreshBtn");
  if (!btn || btn.disabled || state.dailyRefreshBusy) return;
  const session = getSession();
  if (!session) return;

  state.dailyRefreshBusy = true;
  renderDailyRefreshStatus();
  try {
    const response = await fetch(REFRESH_STATUS_URL, {
      method: "POST",
      headers: { authorization: "Bearer " + session, "content-type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 409 && body?.reason === "already_current") {
      showToast("Today's portfolio data is already current.");
    } else if (!response.ok) {
      throw new Error(body?.error || body?.reason || "Refresh request failed");
    } else {
      showToast(body?.message || "Portfolio refresh queued.");
    }

    await checkDailyRefreshStatus();
    if (state.dailyRefreshStatus?.refresh_completed || state.dailyRefreshStatus?.report_available_today) {
      await loadSummary();
    }
  } catch (e) {
    console.error("Daily refresh failed", e);
    showToast("Could not request today's refresh.");
  } finally {
    state.dailyRefreshBusy = false;
    renderDailyRefreshStatus();
  }
}

function renderDailyHistory(previous) {
  const tabs = $("dailyHistoryTabs");
  const panel = $("dailyHistory");
  if (!tabs || !panel) return;

  if (!previous.length) {
    tabs.innerHTML = "";
    panel.innerHTML = '<div class="daily-list-empty history-empty">Earlier reports will appear here automatically.</div>';
    return;
  }

  state.dailyHistoryIndex = Math.min(state.dailyHistoryIndex, previous.length - 1);
  tabs.innerHTML = previous.map((r, index) =>
    '<button type="button" role="tab" class="daily-history-tab ' + (index === state.dailyHistoryIndex ? 'active' : '') +
    '" aria-selected="' + (index === state.dailyHistoryIndex ? 'true' : 'false') + '" data-history-index="' + index + '">' +
    escapeHtml(reportDateLabel(r.recommendation_date)) + '</button>'
  ).join("");

  const r = previous[state.dailyHistoryIndex];
  const actions = Array.isArray(r.actions) ? r.actions : [];
  const risksForDay = Array.isArray(r.risks) ? r.risks.map((x) => {
    if (typeof x === "string") return { title: x, priority: "risk" };
    return { ...(x || {}), priority: x?.priority || "risk" };
  }) : [];
  const statusLabel = r.trading_day ? "Trading day" : "Market closed";
  panel.innerHTML = '<div class="daily-history-report" role="tabpanel"><div class="daily-history-report-head"><div><strong>' +
    escapeHtml(dateLabel(r.recommendation_date)) + '</strong><span>' + escapeHtml("Daily Report - " + reportDateLabel(r.recommendation_date)) +
    '</span></div><small>' + escapeHtml(statusLabel + " · " + actions.length + (actions.length === 1 ? " action" : " actions")) +
    '</small></div><p>' + escapeHtml(dailyText(r.summary || "No summary saved.")) +
    '</p>' + learningButtonHtml(r.learning?.summary) +
    '<div class="history-section"><span>Context</span><div class="daily-list">' + recommendationRows(r.highlights, "context") +
    '</div></div><div class="history-section"><span>Risks</span><div class="daily-list">' + recommendationRows(risksForDay, "risk") +
    '</div></div><div class="history-section"><span>Actions</span><div class="daily-list">' + recommendationRows(actions, "action") +
    '</div></div></div>';
}

function renderRecommendations() {
  const empty = $("dailyEmpty");
  const content = $("dailyContent");
  if (!empty || !content) return;

  const rows = Array.isArray(state.data?.recommendations) ? state.data.recommendations : [];
  if (!rows.length) {
    $("dailyLatestDate").textContent = "—";
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    empty.innerHTML = '<div class="daily-empty-icon" aria-hidden="true">✦</div><div><h3>No daily report yet</h3><p>Your next completed portfolio run will appear here.</p></div>';
    return;
  }

  const latest = rows[0];
  empty.classList.add("hidden");
  content.classList.remove("hidden");
  $("dailyLatestDate").textContent = dateLabel(latest.recommendation_date);
  $("dailyTitle").textContent = "Daily Report - " + reportDateLabel(latest.recommendation_date);
  $("dailySummary").textContent = dailyText(latest.summary || "No summary was saved for this run.");
  configureLearningButton($("dailySummaryLearn"), latest.learning?.summary);
  $("dailyGeneratedAt").textContent = dateTimeLabel(latest.generated_at || latest.updated_at);
  const status = $("dailyTradingStatus");
  status.textContent = latest.trading_day ? "Trading day" : "Market closed";
  status.className = "daily-status " + (latest.trading_day ? "open" : "closed");

  $("dailyActions").innerHTML = recommendationRows(latest.actions, "action");
  $("dailyHighlights").innerHTML = recommendationRows(latest.highlights, "context");
  const risks = Array.isArray(latest.risks) ? latest.risks.map((x) => {
    if (typeof x === "string") return { title: x, priority: "risk" };
    return { ...(x || {}), priority: x?.priority || "risk" };
  }) : [];
  $("dailyRisks").innerHTML = recommendationRows(risks, "risk");

  const previous = rows.slice(1);
  renderDailyHistory(previous);
}

function drawChart() {
  const canvas = $("chart");
  if (!canvas || state.view !== "overview" || !state.data) return;
  const history = state.data.history || [];
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width || 320);
  const height = 250;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const lightTheme = document.documentElement.dataset.theme === "light";
  const chartBg = lightTheme ? "#f7f9fc" : "#11161d";
  const chartGrid = lightTheme ? "#dde4ed" : "#202936";
  const chartMuted = lightTheme ? "#657386" : "#8b96a5";

  if (state.masked) {
    ctx.fillStyle = chartBg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = chartGrid;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = 24 + i * (height - 48) / 3;
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(width - 16, y);
      ctx.stroke();
    }
    ctx.fillStyle = chartMuted;
    ctx.font = "600 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Portfolio values hidden", width / 2, height / 2);
    ctx.textAlign = "start";
    $("historyRange").textContent = "Hidden";
    return;
  }

  if (history.length < 2) {
    ctx.fillStyle = chartMuted;
    ctx.font = "14px system-ui";
    ctx.fillText("History will grow with each daily snapshot.", 18, 36);
    $("historyRange").textContent = history.length + " snapshot";
    return;
  }

  const vals = history.map((x) => num(x.total_value));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const padX = 16, padY = 24;

  ctx.strokeStyle = chartGrid;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = padY + i * (height - padY * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(width - padX, y);
    ctx.stroke();
  }

  const points = vals.map((v, idx) => ({
    x: padX + idx / (vals.length - 1) * (width - padX * 2),
    y: height - padY - (v - min) / span * (height - padY * 2)
  }));

  const gradient = ctx.createLinearGradient(0, padY, 0, height);
  gradient.addColorStop(0, "rgba(104, 166, 255, .24)");
  gradient.addColorStop(1, "rgba(104, 166, 255, 0)");

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padY);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - padY);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((p, idx) => idx ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.strokeStyle = "#68a6ff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const first = history[0]?.snapshot_date;
  const last = history[history.length - 1]?.snapshot_date;
  $("historyRange").textContent = dateLabel(first) + " – " + dateLabel(last);
}

async function changePassword() {
  const form = $("passwordForm");
  if (form.returnValue === "cancel") return;
  const a = $("newPassword").value;
  const b = $("confirmPassword").value;
  if (a.length < 12) {
    setFormStatus($("dialogPasswordStatus"), "Use at least 12 characters.", false);
    return;
  }
  if (a !== b) {
    setFormStatus($("dialogPasswordStatus"), "Passwords do not match.", false);
    return;
  }

  const button = $("savePasswordBtn");
  button.disabled = true;
  button.textContent = "Updating…";
  try {
    const remember = isRemembered();
    const result = await authRequest({ action: "change_password", new_password: a, remember }, getSession());
    storeSession(result.session, remember);
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    setFormStatus($("passwordChangeStatus"), "Password updated. Other sessions were invalidated.", true);
    $("passwordDialog").close();
    await loadSummary();
    showToast("Password updated");
  } catch (e) {
    setFormStatus($("dialogPasswordStatus"), e.status === 401 ? "Session expired. Lock and sign in again." : "Could not update password.", false);
  } finally {
    button.disabled = false;
    button.textContent = "Update password";
  }
}

function bindEvents() {
  $("unlockBtn").addEventListener("click", unlock);
  $("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
  document.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.nav)));
  $("lockBtn").addEventListener("click", () => { clearSession(); state.data = null; window.location.reload(); });
  $("logoutBtn").addEventListener("click", () => { clearSession(); state.data = null; window.location.reload(); });
  $("themeToggle").addEventListener("click", toggleTheme);
  $("privacyToggle").addEventListener("click", togglePrivacy);
  $("dailyRefreshBtn")?.addEventListener("click", refreshDailyReport);
  $("healthCheckBtn")?.addEventListener("click", checkHealth);
  $("privacySettingsBtn").addEventListener("click", togglePrivacy);
  $("navDockToggle")?.addEventListener("click", toggleNavDock);
  $("dailyHistoryTabs")?.addEventListener("click", (e) => {
    const button = e.target.closest("[data-history-index]");
    if (!button) return;
    state.dailyHistoryIndex = Number(button.dataset.historyIndex) || 0;
    const rows = Array.isArray(state.data?.recommendations) ? state.data.recommendations.slice(1) : [];
    renderDailyHistory(rows);
  });
  document.querySelectorAll(".settings-accordion").forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      document.querySelectorAll(".settings-accordion").forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });
  $("privacyUnlockForm").addEventListener("submit", (e) => { e.preventDefault(); unlockPrivacy(); });
  $("closePrivacyUnlockDialog").addEventListener("click", () => $("privacyUnlockDialog").close());
  $("cancelPrivacyUnlock").addEventListener("click", () => $("privacyUnlockDialog").close());
  $("resetPrivacyFromUnlock").addEventListener("click", () => {
    $("privacyUnlockDialog").close();
    state.pendingPrivacyReveal = true;
    openPrivacyPinDialog(false);
  });
  $("privacyPinSettingsBtn").addEventListener("click", () => {
    state.pendingPrivacyReveal = false;
    openPrivacyPinDialog(false);
  });
  $("privacyPinForm").addEventListener("submit", (e) => { e.preventDefault(); savePrivacyPin(); });
  $("closePrivacyPinDialog").addEventListener("click", () => { state.pendingPrivacyHide = false; state.pendingPrivacyReveal = false; $("privacyPinDialog").close(); });
  $("cancelPrivacyPin").addEventListener("click", () => { state.pendingPrivacyHide = false; state.pendingPrivacyReveal = false; $("privacyPinDialog").close(); });
  document.querySelectorAll(".info-button").forEach((el) => el.addEventListener("click", () => openInfo(el.dataset.info)));
  $("closeInfoDialog").addEventListener("click", () => $("infoDialog").close());
  $("closeLearningDialog")?.addEventListener("click", () => $("learningDialog").close());
  $("learningDialogPrivacy")?.addEventListener("click", togglePrivacy);
  $("learningDialog")?.addEventListener("close", () => { state.currentLearningLesson = null; });
  document.addEventListener("click", (e) => {
    const button = e.target.closest(".learn-this-btn");
    if (!button?.dataset.learn) return;
    try { openLearningDialog(JSON.parse(button.dataset.learn)); } catch (err) { console.error("Invalid learning module", err); }
  });
  $("stockSearch").addEventListener("input", renderStocks);
  $("stockSort").addEventListener("change", (e) => setHoldingSort("stocks", e.target.value, e.target.value === "name" ? "asc" : "desc"));
  $("fundSearch").addEventListener("input", renderFunds);
  $("fundSort").addEventListener("change", (e) => setHoldingSort("funds", e.target.value, e.target.value === "name" ? "asc" : "desc"));
  document.querySelectorAll(".sort-header").forEach((button) => {
    button.addEventListener("click", () => setHoldingSort(button.dataset.sortTable, button.dataset.sortKey));
  });
  enhanceToolbarSelects();
  $("changePasswordBtn").addEventListener("click", () => {
    $("dialogPasswordStatus").classList.add("hidden");
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    $("passwordDialog").showModal();
    $("newPassword").focus();
  });
  $("passwordForm").addEventListener("submit", (e) => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    changePassword();
  });
  window.addEventListener("resize", () => {
    clearTimeout(window.__moneyResize);
    window.__moneyResize = setTimeout(drawChart, 120);
  });
}

async function init() {
  applyTheme(preferredTheme(), false);
  localStorage.setItem(PRIVACY_KEY, "1");
  state.masked = true;
  bindEvents();
  applyNavDock();
  updatePrivacyControls();
  $("rememberDevice").checked = localStorage.getItem(REMEMBER_KEY) !== "0";

  let session = getSession();
  if (!session) {
    const migrated = await tryLegacyMigration();
    if (migrated) session = getSession();
  }

  if (session) {
    try {
      if (await loadSummary()) return;
    } catch (e) {
      console.error("Money OS load failed", e);
      showToast("Could not load portfolio.");
    }
  }
  showLocked();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

init();
