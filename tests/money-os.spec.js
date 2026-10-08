const { test, expect } = require("@playwright/test");

const summary = {
  latest: {
    snapshot_date: "2026-10-07",
    total_value: 588905.9,
    total_cost: 623191.36,
    unrealized_pnl: -34285.46,
    realized_pnl: 0,
    day_change: -4277.23,
    day_change_pct: -0.72,
    updated_at: "2026-10-07T17:24:59Z"
  },
  history: [
    { snapshot_date: "2026-09-30", total_value: 600158.6, total_cost: 623191.36, unrealized_pnl: -23032.75, day_change: 24439.1, day_change_pct: 4.24 },
    { snapshot_date: "2026-10-06", total_value: 593183.13, total_cost: 623191.36, unrealized_pnl: -30008.23, day_change: 3134.44, day_change_pct: 0.53 },
    { snapshot_date: "2026-10-07", total_value: 588905.9, total_cost: 623191.36, unrealized_pnl: -34285.46, day_change: -4277.23, day_change_pct: -0.72 }
  ],
  positions: [
    {
      instrument_id: "11111111-1111-1111-1111-111111111111",
      quantity: 20,
      average_cost: 1300,
      close: 1350,
      market_value: 27000,
      unrealized_pnl: 1000,
      realized_pnl: 0,
      day_change: -220,
      day_change_pct: -0.81,
      return_pct: 3.85,
      price_date: "2026-10-07",
      price_source: "NSE",
      instruments: { asset_type: "EQUITY", exchange: "NSE", symbol: "ICICIBANK", name: "ICICI Bank Ltd", isin: "INE090A01021" }
    },
    {
      instrument_id: "22222222-2222-2222-2222-222222222222",
      quantity: 100,
      average_cost: 80,
      close: 84,
      market_value: 8400,
      unrealized_pnl: 400,
      realized_pnl: 0,
      day_change: null,
      day_change_pct: null,
      return_pct: 5,
      price_date: "2026-10-07",
      price_source: "AMFI",
      instruments: { asset_type: "MF", exchange: "AMFI", scheme_code: "12345", name: "Example Flexi Cap Direct Growth", isin: "INF000000001" }
    }
  ],
  metrics: {
    total_return_pct: -5.5,
    stocks: { value: 27000, cost: 26000, unrealized_pnl: 1000, realized_pnl: 0, count: 1 },
    mutual_funds: { value: 8400, cost: 8000, unrealized_pnl: 400, realized_pnl: 0, count: 1 },
    other: { value: 0, cost: 0, unrealized_pnl: 0, realized_pnl: 0, count: 0 },
    allocation: [
      { key: "stocks", label: "Stocks", value: 27000 },
      { key: "mutual_funds", label: "Mutual Funds", value: 8400 }
    ],
    best_mover: null,
    worst_mover: null,
    benchmark_day_pct: -0.76,
    benchmark_price_date: "2026-10-07"
  },
  activity: [
    { trade_date: "2026-09-15", side: "BUY", quantity: 20, price: 1300, fees: 20, broker: "Groww", source: "EMAIL", status: "confirmed", instruments: { asset_type: "EQUITY", exchange: "NSE", symbol: "ICICIBANK", name: "ICICI Bank Ltd" } }
  ],
  recommendations: [
    {
      recommendation_date: "2026-10-07",
      trading_day: true,
      title: "Daily Report",
      summary: "Portfolio moved broadly with the market. Avoid reacting to one session.",
      actions: [{ title: "Review concentration", detail: "Keep the next contribution allocation-aware." }],
      highlights: [{ title: "NIFTY moved lower", detail: "Portfolio move was similar." }],
      risks: [{ title: "Concentration", detail: "Largest positions deserve monitoring." }],
      learning: {},
      generated_at: "2026-10-07T17:30:00Z",
      updated_at: "2026-10-07T17:30:00Z"
    }
  ],
  sync: { last_ingestion_at: "2026-10-07T17:25:00Z", recent_processed: 5, recent_pending: 0, recent_failed: 0, health: "healthy" },
  basis: { type: "CDSL_BASELINE", as_of: "2026-08-31" },
  security: { mode: "password_session", session_expires_at: "2026-10-14T17:00:00Z", privacy_password_configured: true, legacy: false },
  analytics: {
    returns: { tracked_xirr_pct: 12.4, stocks_tracked_xirr_pct: 10.1, mutual_funds_tracked_xirr_pct: 14.2, lifetime_xirr_available: false, scope: "since_baseline", benchmark_tracked_return_pct: 3.1, benchmark_price_date: "2026-10-07" },
    concentration: { top_position_pct: 18.4, top3_pct: 41.2, hhi: 900, largest_position: null },
    risk: { alerts: [{ level: "medium", title: "Largest position", detail: "Largest position is 18.4% of tracked portfolio." }], stock_pct: 76.3, mutual_fund_pct: 23.7 },
    score: { overall: 78, dimensions: { diversification: 82, concentration: 70, cost: null, performance_vs_benchmark: 84, data_quality: 77 }, note: "Unavailable dimensions are excluded." },
    data_quality: { score: 77, identifiers_pct: 100, stale_positions: 0, transactions: 35, buys: 35, sells: 0, fee_coverage_pct: 0, complete_lifetime_ledger: false, latest_ingestion_at: "2026-10-07T17:25:00Z" },
    tax: { tracked_realized_pnl: 0, tracked_unrealized_pnl: -34285.46, tax_ready: false, reason: "Lifetime acquisition lots, charges and sale history are not complete enough for tax filing." },
    income: { verified_dividend_income: null, available: false, reason: "No structured dividend/corporate-action cash ledger is connected yet." },
    overlap: { available: false, reason: "Mutual-fund constituent holdings are not yet ingested, so stock + fund overlap cannot be verified." },
    day_explain: { snapshot_date: "2026-10-07", market_move: -4277.23, net_contribution: 0, value_delta: -4277.23, residual: -4277.23 },
    provenance: { market_date: "2026-10-07", portfolio_snapshot_date: "2026-10-07", price_sources: ["NSE","AMFI"], basis: "CDSL_BASELINE", scope: "Tracked portfolio only; not complete household net worth." }
  }
};

let settings = {
  preferences: { target_stocks: 70, target_mutual_funds: 30, target_other: 0, updated_at: "2026-10-07T17:00:00Z" },
  net_worth_items: [],
  net_worth_sources: [
    {
      source_key: "gmail:nps:protean:tier1:xx2278",
      name: "NPS Tier I",
      kind: "asset",
      category: "nps",
      provider: "Protean CRA",
      masked_identifier: "PRAN ••2278",
      status: "active_needs_balance",
      observed_amount: null,
      counted: false,
      evidence_date: "2026-09-09",
      maturity_date: null,
      evidence_note: "Recurring contribution-credit emails found; current balance is not yet verified."
    },
    {
      source_key: "gmail:hdfc:fd:5371",
      name: "HDFC Fixed Deposit",
      kind: "asset",
      category: "fd",
      provider: "HDFC Bank",
      masked_identifier: "FD ••5371",
      status: "matured_unverified",
      observed_amount: 10000,
      counted: false,
      evidence_date: "2025-02-11",
      maturity_date: "2026-08-07",
      evidence_note: "Historical principal only; matured and excluded from net worth."
    }
,    {
      source_key: "gmail:hdfc:combined-statement",
      name: "HDFC Bank accounts",
      kind: "asset",
      category: "cash",
      provider: "HDFC Bank",
      masked_identifier: null,
      status: "current_verified",
      observed_amount: 50000,
      counted: false,
      evidence_date: "2026-09-30",
      maturity_date: null,
      evidence_note: "Statement parsed into account-level sources; this envelope is not counted separately."
    }
  ]
};

async function mockAuthenticatedApp(page) {
  await page.addInitScript(() => {
    localStorage.setItem("moneyos.session", "playwright-test-session");
    localStorage.setItem("moneyos.remember", "1");
  });

  await page.route("**/functions/v1/summary", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route("**/functions/v1/daily-refresh-status", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    date: "2026-10-08", applicable: false, report_available_today: false, refresh_requested: false, refresh_completed: false,
    refresh_needed: false, status: "waiting_for_session", latest_report_date: "2026-10-07", expected_market_date: "2026-10-07", market_seen_today: false
  }) }));
  await page.route("**/functions/v1/health", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    overall: "healthy", counts: { healthy: 8, degraded: 0, down: 0, unknown: 0 }, checked_at: "2026-10-08T00:00:00Z",
    date: "2026-10-08", expected_market_date: "2026-10-07",
    services: [{ service_key: "database", display_name: "Supabase database", status: "healthy", detail: "Database is reachable.", checked_at: "2026-10-08T00:00:00Z" }]
  }) }));
  await page.route("**/functions/v1/portfolio-settings", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(settings) });
    const body = route.request().postDataJSON();
    if (body.action === "save_targets") {
      settings = { ...settings, preferences: { target_stocks: body.target_stocks, target_mutual_funds: body.target_mutual_funds, target_other: body.target_other } };
    } else if (body.action === "add_net_worth_item") {
      settings = { ...settings, net_worth_items: [...settings.net_worth_items, { id: "33333333-3333-3333-3333-333333333333", name: body.name, kind: body.kind, category: body.category, amount: body.amount }] };
    } else if (body.action === "delete_net_worth_item") {
      settings = { ...settings, net_worth_items: settings.net_worth_items.filter(x => x.id !== body.id) };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...settings }) });
  });
  await page.route("**/functions/v1/auth", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
}

test("locked shell stays private before authentication", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Money OS").first()).toBeVisible();
  await expect(page.locator("#loginPassword")).toHaveAttribute("type", "password");
  await expect(page.getByText(/Portfolio data is not embedded/i)).toBeVisible();
});

test("authenticated portfolio intelligence and interactions work", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop interaction coverage");
  await mockAuthenticatedApp(page);
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#view-daily")).toHaveClass(/active/);
  await expect(page.locator("#dailyRefreshLabel")).toHaveText("Waiting for market");

  await page.locator('.tabs [data-nav="overview"]').click();
  await expect(page.getByText("Portfolio intelligence")).toBeVisible();
  await expect(page.locator("#portfolioScore")).toContainText("••••");
  await expect(page.getByRole("heading", { name: "Risk radar", exact: true })).toBeVisible();

  await page.locator('.tabs [data-nav="stocks"]').click();
  await expect(page.locator("#stockList .asset-row")).toHaveCount(1);
  await page.locator('.sort-header[data-sort-table="stocks"][data-sort-key="name"]').click();
  await expect(page.locator('.sort-header[data-sort-table="stocks"][data-sort-key="name"]')).toHaveAttribute("aria-pressed", "true");

  await page.locator(".stock-action-btn").first().click();
  await expect(page.locator(".stock-action-menu").first()).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".stock-action-menu").first()).toBeHidden();

  await page.locator('.tabs [data-nav="overview"]').click();
  await page.locator("#nextContribution").fill("20000");
  await expect(page.locator("#rebalanceSuggestion")).toContainText("Contribution-first suggestion");

  await page.locator("#netWorthForm").evaluate(form => form.closest("details").open = true);
  await expect(page.locator("#netWorthSourceCount")).toHaveText("3 found · 0 counted");
  await expect(page.locator("#netWorthSources")).toContainText("NPS Tier I");
  await expect(page.locator("#netWorthSources")).toContainText("Needs balance");
  await expect(page.locator("#netWorthSources")).toContainText("Matured");
  await expect(page.locator("#netWorthSources")).toContainText("Verified source");
  await page.locator("#netWorthName").fill("EPF");
  await page.locator("#netWorthAmount").fill("250000");
  await page.locator("#netWorthForm").dispatchEvent("submit");
  await expect(page.locator("#netWorthList")).toContainText("EPF");
});

test("mobile layout has no horizontal overflow and sorting remains available", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only assertion");
  await mockAuthenticatedApp(page);
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();

  await page.locator('.mobile-nav [data-nav="stocks"]').click();
  await expect(page.locator("#stockList .asset-row")).toHaveCount(1);
  await expect(page.locator("#stockSort")).toBeAttached();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  await page.locator('.mobile-nav [data-nav="overview"]').click();
  await expect(page.getByText("Portfolio intelligence")).toBeVisible();
  const overviewOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overviewOverflow).toBeLessThanOrEqual(2);
});


test("heritage orbit theme uses production assets and survives navigation", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("moneyos.theme", "dark"));
  await mockAuthenticatedApp(page);
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#boot")).toHaveClass(/hidden/);

  await page.screenshot({ path: testInfo.outputPath("heritage-dark.png"), fullPage: false });

  const darkArt = await page.evaluate(async () => {
    const pseudo = getComputedStyle(document.body, "::before");
    const response = await fetch("./assets/heritage-orbit-clean-dark.svg", { cache: "no-store" });
    const bytes = await response.arrayBuffer();
    return {
      image: pseudo.backgroundImage,
      display: pseudo.display,
      height: pseudo.height,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      bytes: bytes.byteLength
    };
  });
  expect(darkArt.image).toContain("heritage-orbit-clean-dark.svg");
  expect(darkArt.display).not.toBe("none");
  expect(darkArt.status).toBe(200);
  expect(darkArt.bytes).toBeGreaterThan(10000);

  if (!testInfo.project.name.includes("mobile")) {
    const activeStyle = await page.locator('.tabs [data-nav="daily"]').evaluate((el) => ({
      bg: getComputedStyle(el).backgroundImage,
      marker: getComputedStyle(el, "::before").backgroundImage,
      markerWidth: getComputedStyle(el, "::before").width
    }));
    expect(activeStyle.bg).toContain("linear-gradient");
    expect(activeStyle.marker).toContain("linear-gradient");
    expect(parseFloat(activeStyle.markerWidth)).toBeGreaterThanOrEqual(2);
  }

  const navRoot = testInfo.project.name.includes("mobile") ? ".mobile-nav" : ".tabs";
  for (const view of ["daily", "stocks", "funds", "activity", "overview"]) {
    await page.locator(`${navRoot} [data-nav="${view}"]`).click();
    await expect(page.locator(`#view-${view}`)).toHaveClass(/active/);
  }

  await page.locator("#settingsBtn").click();
  await expect(page.locator("#view-settings")).toHaveClass(/active/);

  await page.locator(`${navRoot} [data-nav="daily"]`).click();
  await expect(page.locator("#view-daily")).toHaveClass(/active/);

  await page.locator("#themeToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: testInfo.outputPath("heritage-light.png"), fullPage: false });

  const lightArt = await page.evaluate(async () => {
    const pseudo = getComputedStyle(document.body, "::before");
    const response = await fetch("./assets/heritage-orbit-clean-light.svg", { cache: "no-store" });
    const bytes = await response.arrayBuffer();
    return {
      image: pseudo.backgroundImage,
      display: pseudo.display,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      bytes: bytes.byteLength
    };
  });
  expect(lightArt.image).toContain("heritage-orbit-clean-light.svg");
  expect(lightArt.display).not.toBe("none");
  expect(lightArt.status).toBe(200);
  expect(lightArt.bytes).toBeGreaterThan(10000);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
