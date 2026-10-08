function amount(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
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

    const start = i;
    let end = Math.min(lines.length, i + 25);
    for (let j = i + 1; j < end; j++) {
      if (/(?:account|a\/c).{0,20}(?:no|number|#)/i.test(lines[j])) {
        end = j;
        break;
      }
    }
    const windowLines = lines.slice(start, end);
    const contextLines = lines.slice(Math.max(0, i - 4), end);
    const window = contextLines.join("\n");
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


function parseDmy(value) {
  const match = String(value || "").match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseEpfPassbook(text) {
  const source = String(text || "").replace(/\u00a0/g, " ");
  if (!/Member\s+Passbook/i.test(source) || !/EPF\s+Passbook/i.test(source)) return null;

  const financialYear = source.match(/Financial\s+Year\s*-\s*(\d{4}-\d{4})/i)?.[1] || null;
  const memberId = source.match(/Member\s+ID\/Name[^\n]*?([A-Z]{2,}\d{10,})\s*\//i)?.[1] || null;
  const uan = source.match(/\|\s*UAN\s+(\d{8,})/i)?.[1] || null;
  const establishment = source.match(/Establishment\s+ID\/Name[^\n]*?([A-Z]{2,}\d{6,})\s*\/\s*([^\n]+)/i);

  const opening = source.match(
    /OB\s+Int\.\s+Updated\s+upto\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i,
  );
  const closing = source.match(
    /Closing\s+Balance\s+as\s+on\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i,
  );
  if (!financialYear || !closing) return null;

  const contribution = source.match(
    /Total\s+Contributions\s+for\s+the\s+year\s*\[\s*\d{4}\s*\]\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i,
  );
  const transfers = source.match(
    /Total\s+Transfer-Ins\/VDRs\s+for\s+the\s+year\s*\[\s*\d{4}\s*\]\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i,
  );
  const withdrawals = source.match(
    /Total\s+Withdrawals\s+for\s+the\s+year\s*\[\s*\d{4}\s*\]\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i,
  );
  const interest = source.match(
    /Int\.\s+Updated\s+upto\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i,
  );
  const interestUnavailable = /Interest\s+details\s+N\/A/i.test(source);
  const printed = source.match(/Printed\s+On\s*:\s*(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}:\d{2})/i);

  const transactionRows = [...source.matchAll(
    /^\s*([A-Z][a-z]{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+CR\s+Cont\.\s+for\s+Due-Month\s+(\d{6})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/gm,
  )].map((match) => ({
    wage_month: match[1],
    posting_date: parseDmy(match[2]),
    due_month: match[3],
    epf_wage: amount(match[4]),
    eps_wage: amount(match[5]),
    employee_contribution: amount(match[6]),
    employer_epf_contribution: amount(match[7]),
    pension_contribution: amount(match[8]),
  }));

  const closingEmployee = amount(closing[2]);
  const closingEmployer = amount(closing[3]);
  const closingPension = amount(closing[4]);
  const latestPostingDate = transactionRows
    .map((row) => row.posting_date)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    financial_year: financialYear,
    establishment_id: establishment?.[1] || null,
    establishment_name: establishment?.[2]?.trim() || null,
    member_tail: memberId ? memberId.slice(-4) : null,
    uan_tail: uan ? uan.slice(-4) : null,
    opening: opening ? {
      as_of: opening[1].split("/").reverse().join("-"),
      employee: amount(opening[2]),
      employer: amount(opening[3]),
      pension: amount(opening[4]),
    } : null,
    closing: {
      label_as_of: closing[1].split("/").reverse().join("-"),
      employee: closingEmployee,
      employer: closingEmployer,
      pension: closingPension,
      epf_total: closingEmployee + closingEmployer,
    },
    contributions: contribution ? {
      employee: amount(contribution[1]),
      employer: amount(contribution[2]),
      pension: amount(contribution[3]),
    } : null,
    transfers_in: transfers ? {
      employee: amount(transfers[1]),
      employer: amount(transfers[2]),
      pension: amount(transfers[3]),
    } : null,
    withdrawals: withdrawals ? {
      employee: amount(withdrawals[1]),
      employer: amount(withdrawals[2]),
      pension: amount(withdrawals[3]),
    } : null,
    interest: interest ? {
      updated_upto: interest[1].split("/").reverse().join("-"),
      employee: amount(interest[2]),
      employer: amount(interest[3]),
      pension: amount(interest[4]),
    } : null,
    interest_available: !interestUnavailable && Boolean(interest),
    printed_at: printed ? `${parseDmy(printed[1])}T${printed[2]}+05:30` : null,
    latest_posting_date: latestPostingDate,
    latest_wage_month: transactionRows.at(-1)?.wage_month || null,
    transaction_count: transactionRows.length,
  };
}

export function validateEpfPassbookChain(passbooks) {
  const rows = (Array.isArray(passbooks) ? passbooks : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => String(a.financial_year).localeCompare(String(b.financial_year)));

  if (!rows.length) return { ok: false, reason: "no_passbooks" };

  const identity = rows[0];
  for (const row of rows) {
    if (
      row.establishment_id !== identity.establishment_id ||
      row.member_tail !== identity.member_tail ||
      row.uan_tail !== identity.uan_tail
    ) return { ok: false, reason: "account_mismatch" };
  }

  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1];
    const current = rows[i];
    if (!previous.closing || !current.opening) return { ok: false, reason: "missing_balance_boundary" };
    if (
      previous.closing.employee !== current.opening.employee ||
      previous.closing.employer !== current.opening.employer ||
      previous.closing.pension !== current.opening.pension
    ) return { ok: false, reason: "balance_chain_mismatch" };
  }

  return {
    ok: true,
    financial_years: rows.map((row) => row.financial_year),
    latest: rows.at(-1),
  };
}

export function ageDays(date, now = new Date()) {
  if (!date) return Infinity;
  const t = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86400000) : Infinity;
}
