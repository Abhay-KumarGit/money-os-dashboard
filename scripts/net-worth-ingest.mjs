import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  ageDays,
  isoDateFromEmail,
  maskedTail,
  parseBankAccountBalances,
  parseCardDue,
  parseNpsHoldingValue,
  parsePaymentDueDate,
  statementEndFromSubject,
} from "./net-worth-parsers.mjs";

const INGEST_URL = process.env.MONEY_OS_INGEST_URL || "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/net-worth-ingest";
const AUDIENCE = "money-os-ingestion";
const MAX_FRESH_DAYS = 62;

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || "";
const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN || "";

function b64urlBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized + "=".repeat((4 - normalized.length % 4) % 4), "base64");
}

function htmlToText(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function header(message, name) {
  return (message?.payload?.headers || []).find((h) => String(h?.name).toLowerCase() === name.toLowerCase())?.value || "";
}

function walkParts(part, out = []) {
  if (!part) return out;
  out.push(part);
  for (const child of part.parts || []) walkParts(child, out);
  return out;
}

function messageText(message) {
  const chunks = [message?.snippet || ""];
  for (const part of walkParts(message?.payload)) {
    const data = part?.body?.data;
    if (!data) continue;
    const decoded = b64urlBytes(data).toString("utf8");
    if (String(part.mimeType).includes("html")) chunks.push(htmlToText(decoded));
    else if (String(part.mimeType).startsWith("text/")) chunks.push(decoded);
  }
  return chunks.filter(Boolean).join("\n");
}

function attachments(message) {
  return walkParts(message?.payload)
    .filter((part) => part?.filename && part?.body?.attachmentId)
    .map((part) => ({
      filename: String(part.filename),
      mimeType: String(part.mimeType || ""),
      attachmentId: String(part.body.attachmentId),
    }));
}

async function getGithubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error("github_oidc_unavailable");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", AUDIENCE);
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!resp.ok) throw new Error(`github_oidc_http_${resp.status}`);
  const payload = await resp.json();
  if (!payload?.value) throw new Error("github_oidc_missing_value");
  return payload.value;
}

async function postIngestion(oidc, payload) {
  const resp = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${oidc}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ingest_http_${resp.status}_${body.slice(0, 120)}`);
  }
  return resp.json();
}

async function gmailAccessToken() {
  if (!googleClientId || !googleClientSecret || !googleRefreshToken) throw new Error("gmail_oauth_secrets_missing");
  const form = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: googleRefreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!resp.ok) {
    const payload = await resp.json().catch(() => ({}));
    const code = payload?.error === "invalid_grant" ? "gmail_refresh_token_expired_or_revoked" : `gmail_token_http_${resp.status}`;
    throw new Error(code);
  }
  const payload = await resp.json();
  if (!payload?.access_token) throw new Error("gmail_access_token_missing");
  return payload.access_token;
}

async function gmailJson(accessToken, url) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`gmail_http_${resp.status}`);
  return resp.json();
}

async function listMessages(accessToken, query, maxResults = 10) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  const data = await gmailJson(accessToken, url);
  return Array.isArray(data?.messages) ? data.messages : [];
}

async function getMessage(accessToken, id) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "full");
  return gmailJson(accessToken, url);
}

async function newestMessage(accessToken, query, maxResults = 10) {
  const refs = await listMessages(accessToken, query, maxResults);
  const messages = [];
  for (const ref of refs) messages.push(await getMessage(accessToken, ref.id));
  return messages.sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0))[0] || null;
}

async function messageSet(accessToken, query, maxResults = 20) {
  const refs = await listMessages(accessToken, query, maxResults);
  const messages = [];
  for (const ref of refs) messages.push(await getMessage(accessToken, ref.id));
  return messages.sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0));
}

async function attachmentBytes(accessToken, messageId, attachmentId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const payload = await gmailJson(accessToken, url);
  if (!payload?.data) throw new Error("gmail_attachment_missing_data");
  return b64urlBytes(payload.data);
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

async function extractPdfText(accessToken, message, attachment, password) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "money-os-statement-"));
  const input = path.join(dir, "statement.pdf");
  const plain = path.join(dir, "plain.pdf");
  const output = path.join(dir, "statement.txt");
  const passFile = path.join(dir, "password.txt");
  try {
    fs.writeFileSync(input, await attachmentBytes(accessToken, message.id, attachment.attachmentId), { mode: 0o600 });

    let result = run("pdftotext", ["-layout", input, output]);
    if (result.status !== 0) {
      if (!password) return { text: null, error: "password_required_or_pdf_unreadable" };
      fs.writeFileSync(passFile, password, { mode: 0o600 });
      result = run("qpdf", [`--password-file=${passFile}`, "--decrypt", input, plain]);
      if (result.status !== 0) return { text: null, error: "statement_password_invalid_or_pdf_unreadable" };
      result = run("pdftotext", ["-layout", plain, output]);
      if (result.status !== 0) return { text: null, error: "pdf_text_extraction_failed" };
    }
    const text = fs.readFileSync(output, "utf8");
    return { text, error: null };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function msgDate(message) {
  return isoDateFromEmail(header(message, "Date")) || (message?.internalDate ? new Date(Number(message.internalDate)).toISOString().slice(0, 10) : null);
}

function freshness(evidenceDate, amount) {
  const fresh = evidenceDate && ageDays(evidenceDate) <= MAX_FRESH_DAYS;
  return {
    status: fresh && amount != null ? "current_verified" : "stale",
    counted: Boolean(fresh && amount != null),
  };
}

function safeHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function event(message, status, kind, extra = {}) {
  return {
    source_ref: `gmail:${message.id}`,
    status,
    details: {
      kind,
      evidence_date: msgDate(message),
      ...extra,
    },
  };
}

async function processNps(accessToken, records, events, failures) {
  const message = await newestMessage(
    accessToken,
    'from:nps-statements@mailer.proteantech.in subject:"Transaction Statement of your NPS account" newer_than:400d',
    12,
  );
  if (!message) return;
  const subject = header(message, "Subject");
  const evidenceDate = statementEndFromSubject(subject, msgDate(message));
  const attachment = attachments(message).find((a) => /\.pdf$/i.test(a.filename));
  const tail = maskedTail(attachment?.filename || subject, 4) || "unknown";
  const sourceKey = `gmail:nps:protean:tier1:${tail}`;

  if (!attachment) {
    records.push({
      source_key: sourceKey, name: "NPS Tier I", kind: "asset", category: "nps", provider: "Protean CRA",
      masked_identifier: tail === "unknown" ? null : `PRAN ••${tail}`,
      status: "active_needs_balance", observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "Latest Protean NPS statement email was found, but no PDF attachment was available.",
    });
    events.push(event(message, "failed", "NPS_STATEMENT", { parser_status: "attachment_missing" }));
    failures.push("nps_attachment_missing");
    return;
  }

  const parsedPdf = await extractPdfText(accessToken, message, attachment, process.env.NPS_STATEMENT_PASSWORD || "");
  if (!parsedPdf.text) {
    records.push({
      source_key: sourceKey, name: "NPS Tier I", kind: "asset", category: "nps", provider: "Protean CRA",
      masked_identifier: tail === "unknown" ? null : `PRAN ••${tail}`,
      status: "current_locked", observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "Latest NPS statement was found but could not be opened with the configured statement password.",
    });
    events.push(event(message, "failed", "NPS_STATEMENT", { parser_status: parsedPdf.error }));
    failures.push("nps_pdf_locked");
    return;
  }

  const value = parseNpsHoldingValue(parsedPdf.text);
  if (value == null) {
    records.push({
      source_key: sourceKey, name: "NPS Tier I", kind: "asset", category: "nps", provider: "Protean CRA",
      masked_identifier: tail === "unknown" ? null : `PRAN ••${tail}`,
      status: "active_needs_balance", observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "Latest NPS statement opened successfully, but the current total could not be identified unambiguously; it is not counted.",
    });
    events.push(event(message, "failed", "NPS_STATEMENT", { parser_status: "balance_ambiguous" }));
    failures.push("nps_balance_ambiguous");
    return;
  }

  const current = freshness(evidenceDate, value);
  records.push({
    source_key: sourceKey, name: "NPS Tier I", kind: "asset", category: "nps", provider: "Protean CRA",
    masked_identifier: tail === "unknown" ? null : `PRAN ••${tail}`,
    status: current.status, observed_amount: value, counted: current.counted, evidence_date: evidenceDate,
    evidence_note: "Current NPS value extracted from the latest Protean transaction statement.",
  });
  events.push(event(message, "processed", "NPS_STATEMENT", { parser_status: "verified" }));
}

async function processBankStatement(accessToken, config, records, events, failures) {
  const message = await newestMessage(accessToken, config.query, 8);
  if (!message) return;
  const subject = header(message, "Subject");
  const evidenceDate = statementEndFromSubject(subject, msgDate(message));
  const attachment = attachments(message).find((a) => /\.pdf$/i.test(a.filename));
  if (!attachment) {
    records.push({
      source_key: config.envelopeKey, name: config.envelopeName, kind: "asset", category: "cash", provider: config.provider,
      masked_identifier: null, status: "active_needs_balance", observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "Latest statement email was found, but its PDF attachment was unavailable.",
    });
    events.push(event(message, "failed", config.kind, { parser_status: "attachment_missing" }));
    failures.push(config.failurePrefix + "_attachment_missing");
    return;
  }

  const parsedPdf = await extractPdfText(accessToken, message, attachment, config.password);
  if (!parsedPdf.text) {
    records.push({
      source_key: config.envelopeKey, name: config.envelopeName, kind: "asset", category: "cash", provider: config.provider,
      masked_identifier: null, status: "current_locked", observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "Latest statement was found but could not be opened with the configured statement password.",
    });
    events.push(event(message, "failed", config.kind, { parser_status: parsedPdf.error }));
    failures.push(config.failurePrefix + "_pdf_locked");
    return;
  }

  const balances = parseBankAccountBalances(parsedPdf.text);
  if (!balances.length) {
    records.push({
      source_key: config.envelopeKey, name: config.envelopeName, kind: "asset", category: "cash", provider: config.provider,
      masked_identifier: null, status: "active_needs_balance", observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "Latest statement opened successfully, but account-level closing balances were not unambiguous; nothing is counted.",
    });
    events.push(event(message, "failed", config.kind, { parser_status: "balance_ambiguous" }));
    failures.push(config.failurePrefix + "_balance_ambiguous");
    return;
  }

  let total = 0;
  for (const row of balances) {
    const current = freshness(evidenceDate, row.amount);
    total += row.amount;
    const tail = row.masked_identifier.replace(/\D/g, "").slice(-4) || safeHash(row.masked_identifier);
    records.push({
      source_key: `gmail:${config.slug}:${row.category}:${tail}`,
      name: row.category === "fd" ? `${config.provider} deposit` : `${config.provider} account`,
      kind: "asset", category: row.category, provider: config.provider,
      masked_identifier: row.masked_identifier,
      status: current.status, observed_amount: row.amount, counted: current.counted, evidence_date: evidenceDate,
      evidence_note: "Closing balance extracted from the latest bank statement.",
    });
  }
  records.push({
    source_key: config.envelopeKey, name: config.envelopeName, kind: "asset", category: "cash", provider: config.provider,
    masked_identifier: null, status: "current_verified", observed_amount: total, counted: false, evidence_date: evidenceDate,
    evidence_note: `Statement parsed into ${balances.length} account-level source${balances.length === 1 ? "" : "s"}; this envelope is not counted separately.`,
  });
  events.push(event(message, "processed", config.kind, { parser_status: "verified", accounts_found: balances.length }));
}

async function processHdfcCard(accessToken, records, events, failures) {
  const message = await newestMessage(
    accessToken,
    'from:Emailstatements.cards@hdfcbank.bank.in subject:"Millennia Credit Card Statement" newer_than:180d',
    8,
  );
  if (!message) return;
  const subject = header(message, "Subject");
  const evidenceDate = statementEndFromSubject(subject, msgDate(message));
  const tail = maskedTail(subject + "\n" + messageText(message), 4) || "0712";
  let due = parseCardDue(messageText(message));
  let parserStatus = due == null ? "email_amount_missing" : "verified_email";

  if (due == null) {
    const attachment = attachments(message).find((a) => /\.pdf$/i.test(a.filename));
    if (attachment) {
      const password = process.env.HDFC_CREDIT_CARD_STATEMENT_PASSWORD || process.env.HDFC_CREDIT_CARD_STATEMENT || "";
      const parsedPdf = await extractPdfText(accessToken, message, attachment, password);
      if (parsedPdf.text) {
        due = parseCardDue(parsedPdf.text);
        parserStatus = due == null ? "pdf_amount_ambiguous" : "verified_pdf";
      } else {
        parserStatus = parsedPdf.error;
      }
    }
  }

  if (due == null) {
    records.push({
      source_key: `gmail:hdfc:card:${tail}`, name: "HDFC Millennia credit card", kind: "liability", category: "credit", provider: "HDFC Bank",
      masked_identifier: `Card ••${tail}`, status: parserStatus.includes("password") ? "current_locked" : "active_needs_balance",
      observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "Latest HDFC card statement was found, but Total Amount Due could not be verified unambiguously; it is not counted.",
    });
    events.push(event(message, "failed", "HDFC_CREDIT_CARD_STATEMENT", { parser_status: parserStatus }));
    failures.push("hdfc_card_amount_unverified");
    return;
  }

  const current = freshness(evidenceDate, due);
  records.push({
    source_key: `gmail:hdfc:card:${tail}`, name: "HDFC Millennia credit card", kind: "liability", category: "credit", provider: "HDFC Bank",
    masked_identifier: `Card ••${tail}`, status: current.status, observed_amount: due, counted: current.counted, evidence_date: evidenceDate,
    evidence_note: "Statement liability extracted from the latest HDFC credit-card statement.",
  });
  events.push(event(message, "processed", "HDFC_CREDIT_CARD_STATEMENT", { parser_status: parserStatus, payment_due_date: parsePaymentDueDate(messageText(message)) }));
}

async function processIciciCard(accessToken, records, events) {
  const message = await newestMessage(
    accessToken,
    'from:credit_cards@icicibank.com subject:"Amazon Pay ICICI Bank Credit Card Statement" newer_than:500d',
    10,
  );
  if (!message) return;
  const text = messageText(message);
  const due = parseCardDue(text);
  const evidenceDate = statementEndFromSubject(header(message, "Subject"), msgDate(message));
  const tail = maskedTail(text, 4) || "9002";

  if (due == null) {
    records.push({
      source_key: `gmail:icici:card:${tail}`, name: "Amazon Pay ICICI credit card", kind: "liability", category: "credit", provider: "ICICI Bank",
      masked_identifier: `Card ••${tail}`, status: "stale", observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "ICICI card statement source exists, but the latest message did not yield a verified amount.",
    });
    events.push(event(message, "failed", "ICICI_CREDIT_CARD_STATEMENT", { parser_status: "amount_ambiguous" }));
    return;
  }

  const current = freshness(evidenceDate, due);
  records.push({
    source_key: `gmail:icici:card:${tail}`, name: "Amazon Pay ICICI credit card", kind: "liability", category: "credit", provider: "ICICI Bank",
    masked_identifier: `Card ••${tail}`, status: current.status, observed_amount: due, counted: current.counted, evidence_date: evidenceDate,
    evidence_note: current.counted
      ? "Total Amount Due extracted from the latest ICICI card statement email."
      : "Latest ICICI statement amount was verified but is too old to represent a current liability.",
  });
  events.push(event(message, "processed", "ICICI_CREDIT_CARD_STATEMENT", { parser_status: "verified_email", payment_due_date: parsePaymentDueDate(text) }));
}

async function discoverSmartEmi(accessToken, records, events) {
  const messages = await messageSet(
    accessToken,
    'subject:"SMARTEMI LOAN AMORTIZATION SCHEDULE" newer_than:800d',
    30,
  );
  const seen = new Set();
  for (const message of messages) {
    const subject = header(message, "Subject");
    const ids = subject.match(/\b\d{10,}\b/g) || [];
    const loanId = ids.at(-1);
    if (!loanId || seen.has(loanId)) continue;
    seen.add(loanId);
    const evidenceDate = msgDate(message);
    const tail = loanId.slice(-4);
    records.push({
      source_key: `gmail:hdfc:smartemi:${safeHash(loanId)}`,
      name: `HDFC SmartEMI loan ••${tail}`,
      kind: "liability", category: "loan", provider: "HDFC Bank",
      masked_identifier: `Loan ••${tail}`,
      status: ageDays(evidenceDate) <= MAX_FRESH_DAYS ? "active_needs_balance" : "stale",
      observed_amount: null, counted: false, evidence_date: evidenceDate,
      evidence_note: "SmartEMI amortization schedule found. Remaining principal is deliberately not counted until schedule parsing can be verified without double-counting the card statement.",
    });
    events.push(event(message, "ignored", "HDFC_SMARTEMI_SCHEDULE", { reason: "discovered_not_counted_to_avoid_double_count" }));
  }
}

async function run() {
  const oidc = await getGithubOidcToken();
  const records = [];
  const events = [];
  const failures = [];

  let accessToken;
  try {
    accessToken = await gmailAccessToken();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "gmail_auth_failed";
    await postIngestion(oidc, {
      records: [],
      events: [],
      health: {
        status: "degraded",
        detail: reason === "gmail_refresh_token_expired_or_revoked"
          ? "Gmail OAuth refresh token is expired or revoked; statement ingestion is paused."
          : "Gmail OAuth credentials are missing or unusable; statement ingestion is paused.",
        meta: { reason },
      },
    });
    throw error;
  }

  const jobs = [
    () => processNps(accessToken, records, events, failures),
    () => processBankStatement(accessToken, {
      query: 'from:hdfcbanksmartstatement@hdfcbank.bank.in subject:"Combined Email Statement" newer_than:180d',
      envelopeKey: "gmail:hdfc:combined-statement",
      envelopeName: "HDFC Bank accounts",
      provider: "HDFC Bank",
      slug: "hdfc",
      kind: "HDFC_COMBINED_STATEMENT",
      failurePrefix: "hdfc",
      password: process.env.HDFC_STATEMENT_PASSWORD || "",
    }, records, events, failures),
    () => processBankStatement(accessToken, {
      query: 'from:cbssbi.cas@alerts.sbi.bank.in subject:"E-account statement" newer_than:180d',
      envelopeKey: "gmail:sbi:monthly-statement",
      envelopeName: "SBI account",
      provider: "State Bank of India",
      slug: "sbi",
      kind: "SBI_ACCOUNT_STATEMENT",
      failurePrefix: "sbi",
      password: process.env.SBI_STATEMENT_PASSWORD || "",
    }, records, events, failures),
    () => processHdfcCard(accessToken, records, events, failures),
    () => processIciciCard(accessToken, records, events),
    () => discoverSmartEmi(accessToken, records, events),
  ];

  for (const job of jobs) {
    try {
      await job();
    } catch (error) {
      failures.push("source_processing_error");
      // Never log statement contents, credentials, amounts, or raw API payloads in this public repository.
      console.error("A source processor failed:", error instanceof Error ? error.message : "unknown_error");
    }
  }

  const result = await postIngestion(oidc, {
    records,
    events,
    health: {
      status: failures.length ? "degraded" : "healthy",
      detail: failures.length
        ? `Statement ingestion completed with ${failures.length} source issue${failures.length === 1 ? "" : "s"}; unverified values were not counted.`
        : "Financial statement emails were checked and verified sources were reconciled.",
      meta: {
        failures: [...new Set(failures)].slice(0, 20),
        source_records: records.length,
      },
    },
  });

  console.log(`Money OS statement ingestion completed: ${result.records} source records, ${result.events} evidence events, health=${result.health}.`);
}

run().catch((error) => {
  console.error("Money OS statement ingestion failed:", error instanceof Error ? error.message : "unknown_error");
  process.exitCode = 1;
});
