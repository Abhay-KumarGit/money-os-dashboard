function amount(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[₹Rs.INR\s,]/gi, "").replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function uniqueNumbers(values) {
  const out = [];
  for (const value of values) {
    const n = amount(value);
    if (n == null) continue;
    if (!out.some((x) => Math.abs(x - n) < 0.005)) out.push(n);
  }
  return out;
}

export function isoDateFromEmail(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function statementEndFromSubject(subject, fallbackDate = null) {
  const s = String(subject || "");
  const range = s.match(/(?:TO|to)\s+(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})/);
  if (range) {
    const d = new Date(`${range[1]} ${range[2]} ${range[3]} UTC`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const monthYear = s.match(/(?:for\s+)?([A-Za-z]{3,9})[-\s](\d{4})/i);
  if (monthYear) {
    const first = new Date(`1 ${monthYear[1]} ${monthYear[2]} UTC`);
    if (!Number.isNaN(first.getTime())) {
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      return last.toISOString().slice(0, 10);
    }
  }
  return fallbackDate;
}

export function maskedTail(text, digits = 4) {
  const matches = String(text || "").match(/(?:x+|\*+)?(\d{4,})/gi) || [];
  if (!matches.length) return null;
  const raw = matches[0].replace(/\D/g, "");
  return raw.length >= digits ? raw.slice(-digits) : raw;
}

export function parseCardDue(text) {
  const s = String(text || "").replace(/\u00a0/g, " ");
  const direct = [
    /Total\s+Amount\s+Due\s*[:₹Rs. ]+([0-9,]+(?:\.\d{1,2})?)/i,
    /Total\s+amount\s+due\s*\(Rs\.?\)\s*[:\s]+([0-9,]+(?:\.\d{1,2})?)/i,
    /Total\s+Amount\s+Due[\s\S]{0,120}?₹\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ];
  for (const rx of direct) {
    const m = s.match(rx);
    const n = amount(m?.[1]);
    if (n != null) return n;
  }

  const table = s.match(/Total\s+amount\s+due\s*\(Rs\.?\)[\s\S]{0,180}?Payment\s+due\s+date[\s\S]{0,80}?([0-9,]+(?:\.\d{2}))/i);
  return amount(table?.[1]);
}

export function parsePaymentDueDate(text) {
  const s = String(text || "");
  const m = s.match(/(?:Payment\s+due(?:\s+by|\s+date)?[^0-9]{0,20})(\d{1,2})[-\s/]([A-Za-z]{3,9}|\d{1,2})[-\s/](\d{2,4})/i);
  if (!m) return null;
  const [_, day, monthRaw, yearRaw] = m;
  let year = Number(yearRaw);
  if (year < 100) year += 2000;
  const monthNum = /^\d+$/.test(monthRaw)
    ? Number(monthRaw) - 1
    : new Date(`1 ${monthRaw} 2000 UTC`).getUTCMonth();
  if (!Number.isInteger(monthNum) || monthNum < 0 || monthNum > 11) return null;
  const d = new Date(Date.UTC(year, monthNum, Number(day)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseNpsHoldingValue(text) {
  const s = String(text || "").replace(/\u00a0/g, " ");
  const labels = [
    /Total\s+(?:Value\s+of\s+)?Holdings?\s*[:₹Rs.INR ]+([0-9,]+(?:\.\d{1,2})?)/ig,
    /Current\s+Value\s+of\s+Holdings?\s*[:₹Rs.INR ]+([0-9,]+(?:\.\d{1,2})?)/ig,
    /Total\s+Pension\s+Wealth\s*[:₹Rs.INR ]+([0-9,]+(?:\.\d{1,2})?)/ig,
    /Total\s+Corpus\s*[:₹Rs.INR ]+([0-9,]+(?:\.\d{1,2})?)/ig,
    /Total\s+Market\s+Value\s*[:₹Rs.INR ]+([0-9,]+(?:\.\d{1,2})?)/ig,
  ];
  const found = [];
  for (const rx of labels) {
    for (const match of s.matchAll(rx)) found.push(match[1]);
  }
  const values = uniqueNumbers(found).filter((x) => x > 0);
  return values.length === 1 ? values[0] : null;
}

function normalizeMaskedIdentifier(value) {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return "••" + digits.slice(-4);
}

function classifyWindow(text) {
  const s = text.toLowerCase();
  if (/recurring\s+deposit|\brd\b/.test(s)) return "fd";
  if (/fixed\s+deposit|term\s+deposit|\bfd\b/.test(s)) return "fd";
  if (/savings|current\s+account|account\s+statement/.test(s)) return "cash";
  return "cash";
}

export function parseBankAccountBalances(text) {
  const lines = String(text || "").replace(/\u00a0/g, " ").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/(?:account|a\/c).{0,20}(?:no|number|#)/i.test(line)) continue;

    const idMatch = line.match(/(?:account|a\/c).{0,20}(?:no|number|#)?\s*[:.-]?\s*([Xx*\d -]{4,30})/i);
    if (!idMatch) continue;
    const masked = normalizeMaskedIdentifier(idMatch[1]);
    if (!masked) continue;

    const start = Math.max(0, i - 5);
    let end = Math.min(lines.length, i + 25);
    for (let j = i + 1; j < end; j++) {
      if (/(?:account|a\\/c).{0,20}(?:no|number|#)/i.test(lines[j])) {
        end = j;
        break;
      }
    }
    const windowLines = lines.slice(start, end);
    const window = windowLines.join("\n");
    const category = classifyWindow(window);

    const balanceMatches = [];
    for (const candidate of windowLines) {
      const m = candidate.match(/(?:closing\s+balance|balance\s+as\s+(?:on|of)|available\s+balance|current\s+balance)\s*[:₹Rs.INR ]*([0-9,]+(?:\.\d{1,2})?)/i);
      if (m) balanceMatches.push(m[1]);
    }
    const balances = uniqueNumbers(balanceMatches);
    if (balances.length !== 1) continue;

    results.push({ masked_identifier: masked, category, amount: balances[0] });
  }

  const dedup = new Map();
  for (const row of results) {
    const key = row.category + ":" + row.masked_identifier;
    if (!dedup.has(key)) dedup.set(key, row);
    else if (Math.abs(dedup.get(key).amount - row.amount) > 0.005) dedup.set(key, null);
  }
  return [...dedup.values()].filter(Boolean);
}

export function parseSingleClosingBalance(text) {
  const s = String(text || "").replace(/\u00a0/g, " ");
  const values = [];
  const patterns = [
    /Closing\s+Balance\s*[:₹Rs.INR ]+([0-9,]+(?:\.\d{1,2})?)/ig,
    /Balance\s+as\s+(?:on|of)[^₹Rs.INR0-9]{0,30}[₹Rs.INR ]*([0-9,]+(?:\.\d{1,2})?)/ig,
  ];
  for (const rx of patterns) {
    for (const m of s.matchAll(rx)) values.push(m[1]);
  }
  const unique = uniqueNumbers(values);
  return unique.length === 1 ? unique[0] : null;
}

export function ageDays(date, now = new Date()) {
  if (!date) return Infinity;
  const t = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86400000) : Infinity;
}
