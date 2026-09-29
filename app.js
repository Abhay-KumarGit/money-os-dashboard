const SUMMARY_URL = "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/summary";
const AUTH_URL = "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/auth";
const SESSION_KEY = "moneyos.session";
const LEGACY_KEY = "moneyos.apiToken";
const REMEMBER_KEY = "moneyos.remember";
const PRIVACY_KEY = "moneyos.privacyMask";
const MASK_TEXT = "••••••";

const $ = (id) => document.getElementById(id);
const money0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number4 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

let state = {
  data: null,
  view: "overview",
  masked: localStorage.getItem(PRIVACY_KEY) === "1"
};

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
  if (settingsButton) settingsButton.textContent = masked ? "Show financial values" : "Hide financial values";
  if (status) {
    status.textContent = masked ? "Values hidden" : "Values visible";
    status.classList.toggle("active", masked);
  }
}

function togglePrivacy() {
  state.masked = !state.masked;
  localStorage.setItem(PRIVACY_KEY, state.masked ? "1" : "0");
  updatePrivacyControls();
  if (state.data) renderAll();
  showToast(state.masked ? "Financial values hidden" : "Financial values visible");
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
  $("boot").classList.add("hidden");
  $("locked").classList.add("hidden");
  $("app").classList.remove("hidden");
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

function navigate(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "view-" + view));
  document.querySelectorAll("[data-nav]").forEach((el) => el.classList.toggle("active", el.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "overview") setTimeout(drawChart, 50);
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
  $("unrealizedPct").textContent = pct(metrics.total_return_pct) + " on tracked basis";
  $("realized").textContent = signedMoney(latest.realized_pnl);
  $("realized").className = tone(latest.realized_pnl);

  const day = latest.day_change;
  const dayPct = latest.day_change_pct;
  const dayChip = $("dayChange");
  if (day === null || day === undefined || dayPct === null || dayPct === undefined) {
    dayChip.textContent = "— today";
    dayChip.className = "chip neutral";
  } else {
    dayChip.textContent = signedMoney(day) + "  " + pct(dayPct);
    dayChip.className = "chip " + tone(day);
  }

  $("totalReturn").textContent = pct(metrics.total_return_pct) + " tracked return";
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
  renderBasis();
  renderStocks();
  renderFunds();
  renderActivity();
  renderSettings();
  drawChart();

  const sync = d.sync || {};
  const healthy = sync.health === "healthy";
  $("syncPill").classList.toggle("attention", !healthy);
  $("syncPill").querySelector("span:last-child").textContent = healthy ? "Synced" : "Attention";
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

function basisHtml() {
  const b = state.data?.basis || {};
  return '<p><strong>Opening baseline:</strong> ' + escapeHtml(b.as_of || "—") + ' from CDSL CAS.</p><p>Equity P&amp;L is measured from the baseline market value where original acquisition cost is unavailable. Mutual-fund cost uses CDSL invested amount when reported; demat-held fund units without original cost use the baseline NAV.</p>';
}

function renderBasis() {
  $("basisText").innerHTML = basisHtml();
  $("settingsBasis").innerHTML = basisHtml();
}

function sortedFiltered(items, search, sort) {
  const q = search.trim().toLowerCase();
  const filtered = items.filter((p) => {
    if (!q) return true;
    const i = p.instruments || {};
    return [i.symbol, i.name, i.exchange, i.scheme_code].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  return filtered.sort((a, b) => {
    if (sort === "name") return assetName(a).localeCompare(assetName(b));
    if (sort === "pnl") return num(b.unrealized_pnl) - num(a.unrealized_pnl);
    if (sort === "day") return num(b.day_change_pct) - num(a.day_change_pct);
    return num(b.market_value) - num(a.market_value);
  });
}

function stockRow(p) {
  const i = p.instruments || {};
  return '<div class="asset-row stock-grid">' +
    '<div class="holding-name" data-label="Holding"><strong>' + escapeHtml(i.symbol || i.name || "—") + '</strong><small>' + escapeHtml([i.name, i.exchange, p.price_source].filter(Boolean).join(" · ")) + '</small></div>' +
    '<div data-label="Qty">' + escapeHtml(privateNumber(p.quantity)) + '</div>' +
    '<div data-label="Avg / LTP"><strong>' + escapeHtml(money(p.close, true)) + '</strong><small>avg ' + escapeHtml(money(p.average_cost, true)) + '</small></div>' +
    '<div data-label="Value"><strong>' + escapeHtml(money(p.market_value)) + '</strong><small>' + escapeHtml(dateLabel(p.price_date)) + '</small></div>' +
    '<div data-label="Today" class="' + tone(p.day_change_pct) + '"><strong>' + escapeHtml(pct(p.day_change_pct)) + '</strong><small>' + (p.day_change == null ? "—" : escapeHtml(signedMoney(p.day_change))) + '</small></div>' +
    '<div data-label="P&L" class="' + tone(p.unrealized_pnl) + '"><strong>' + escapeHtml(signedMoney(p.unrealized_pnl)) + '</strong><small>' + escapeHtml(pct(p.return_pct)) + '</small></div>' +
  '</div>';
}

function renderStocks() {
  const d = state.data;
  const items = (d.positions || []).filter((p) => ["EQUITY", "ETF"].includes(p.instruments?.asset_type));
  const m = d.metrics?.stocks || {};
  $("stocksPageValue").textContent = money(m.value);
  $("stocksSubtitle").textContent = (m.count || 0) + " holdings · " + pct(m.cost ? num(m.unrealized_pnl) / num(m.cost) * 100 : null) + " tracked return";
  $("stocksCost").textContent = money(m.cost);
  $("stocksUnrealized").textContent = signedMoney(m.unrealized_pnl);
  $("stocksUnrealized").className = tone(m.unrealized_pnl);
  $("stocksRealized").textContent = signedMoney(m.realized_pnl);
  $("stocksRealized").className = tone(m.realized_pnl);

  const rows = sortedFiltered(items, $("stockSearch").value, $("stockSort").value);
  $("stockList").innerHTML = rows.length ? rows.map(stockRow).join("") : '<div class="empty-inline">No matching stocks.</div>';
}

function fundRow(p) {
  const i = p.instruments || {};
  return '<div class="asset-row fund-grid">' +
    '<div class="holding-name" data-label="Fund"><strong>' + escapeHtml(i.name || i.scheme_code || "Mutual fund") + '</strong><small>' + escapeHtml(["AMFI " + (i.scheme_code || ""), p.price_source].filter(Boolean).join(" · ")) + '</small></div>' +
    '<div data-label="Units">' + escapeHtml(privateNumber(p.quantity)) + '</div>' +
    '<div data-label="Avg / NAV"><strong>' + escapeHtml(money(p.close, true)) + '</strong><small>avg ' + escapeHtml(money(p.average_cost, true)) + '</small></div>' +
    '<div data-label="Value"><strong>' + escapeHtml(money(p.market_value)) + '</strong><small>NAV ' + escapeHtml(dateLabel(p.price_date)) + '</small></div>' +
    '<div data-label="P&L" class="' + tone(p.unrealized_pnl) + '"><strong>' + escapeHtml(signedMoney(p.unrealized_pnl)) + '</strong><small>' + escapeHtml(pct(p.return_pct)) + '</small></div>' +
  '</div>';
}

function renderFunds() {
  const d = state.data;
  const items = (d.positions || []).filter((p) => p.instruments?.asset_type === "MF");
  const m = d.metrics?.mutual_funds || {};
  $("fundsPageValue").textContent = money(m.value);
  $("fundsSubtitle").textContent = (m.count || 0) + " funds · " + pct(m.cost ? num(m.unrealized_pnl) / num(m.cost) * 100 : null) + " tracked return";
  $("fundsCost").textContent = money(m.cost);
  $("fundsUnrealized").textContent = signedMoney(m.unrealized_pnl);
  $("fundsUnrealized").className = tone(m.unrealized_pnl);
  $("fundsRealized").textContent = signedMoney(m.realized_pnl);
  $("fundsRealized").className = tone(m.realized_pnl);

  const rows = sortedFiltered(items, $("fundSearch").value, $("fundSort").value);
  $("fundList").innerHTML = rows.length ? rows.map(fundRow).join("") : '<div class="empty-inline">No matching mutual funds.</div>';
}

function transactionRow(t) {
  const i = t.instruments || {};
  const title = i.symbol || i.name || "Instrument";
  const label = t.side === "BUY" ? "Bought" : "Sold";
  return '<div class="activity-row"><div class="activity-icon ' + (t.side === "BUY" ? "buy" : "sell") + '">' + (t.side === "BUY" ? "B" : "S") + '</div><div class="activity-main"><strong>' + escapeHtml(label + " " + title) + '</strong><small>' + escapeHtml(privateNumber(t.quantity)) + " units @ " + escapeHtml(money(t.price, true)) + ' · ' + escapeHtml(t.broker || t.source) + '</small></div><time>' + escapeHtml(dateLabel(t.trade_date)) + '</time></div>';
}

function renderActivity() {
  const d = state.data;
  const sync = d.sync || {};
  $("syncHealth").textContent = sync.health === "healthy" ? "Healthy" : "Needs attention";
  $("syncHealth").className = sync.health === "healthy" ? "positive" : "warning";
  $("lastIngestion").textContent = "Last event " + dateTimeLabel(sync.last_ingestion_at);
  $("processedCount").textContent = sync.recent_processed ?? "—";
  $("pendingCount").textContent = sync.recent_pending ?? "—";
  $("failedCount").textContent = sync.recent_failed ?? "—";

  const all = d.activity || [];
  const baselineCount = all.filter((t) => t.source === "CDSL_BASELINE").length;
  const regular = all.filter((t) => t.source !== "CDSL_BASELINE").slice(0, 20);
  let html = regular.map(transactionRow).join("");
  if (baselineCount) {
    html += '<div class="activity-row"><div class="activity-icon baseline">C</div><div class="activity-main"><strong>CDSL opening baseline</strong><small>' + baselineCount + ' opening positions established</small></div><time>31 Aug 2026</time></div>';
  }
  $("activityList").innerHTML = html || '<div class="empty-inline">No recent transactions.</div>';
}

function renderSettings() {
  const s = state.data?.security || {};
  $("sessionExpiry").textContent = s.session_expires_at ? dateTimeLabel(s.session_expires_at) : "Legacy session";
  $("rememberState").textContent = isRemembered() ? "On · 7 days" : "Off · this tab";
  updatePrivacyControls();
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

  if (state.masked) {
    ctx.fillStyle = "#11161d";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#202936";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = 24 + i * (height - 48) / 3;
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(width - 16, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#8b96a5";
    ctx.font = "600 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Portfolio values hidden", width / 2, height / 2);
    ctx.textAlign = "start";
    $("historyRange").textContent = "Hidden";
    return;
  }

  if (history.length < 2) {
    ctx.fillStyle = "#7f8996";
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

  ctx.strokeStyle = "#202731";
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
  $("privacyToggle").addEventListener("click", togglePrivacy);
  $("privacySettingsBtn").addEventListener("click", togglePrivacy);
  $("stockSearch").addEventListener("input", renderStocks);
  $("stockSort").addEventListener("change", renderStocks);
  $("fundSearch").addEventListener("input", renderFunds);
  $("fundSort").addEventListener("change", renderFunds);
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
  bindEvents();
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
