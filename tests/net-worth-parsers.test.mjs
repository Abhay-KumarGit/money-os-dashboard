import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBankAccountBalances,
  parseCardDue,
  parseNpsHoldingValue,
  statementEndFromSubject,
} from "../scripts/net-worth-parsers.mjs";

test("parses explicit credit-card total due", () => {
  assert.equal(parseCardDue("Minimum Amount Due: ₹730.00\nTotal Amount Due ₹800.42"), 800.42);
});

test("parses HDFC table-style total due", () => {
  const text = "Total amount due (Rs.) Minimum amountdue (Rs.) Payment due date (DD-MM-YYYY) 10043.00 510.00 12-03-2026";
  assert.equal(parseCardDue(text), 10043);
});

test("extracts statement range end", () => {
  assert.equal(
    statementEndFromSubject("Monthly Transaction Statement of your NPS account for the period 01-Aug-2026 TO 31-Aug-2026"),
    "2026-08-31",
  );
});

test("parses a uniquely labelled NPS total", () => {
  assert.equal(parseNpsHoldingValue("Current Value of Holdings : Rs. 1,23,456.78"), 123456.78);
});

test("rejects ambiguous NPS totals", () => {
  assert.equal(
    parseNpsHoldingValue("Total Value of Holdings: 100000.00\nTotal Pension Wealth: 110000.00"),
    null,
  );
});

test("parses account-level closing balances conservatively", () => {
  const text = [
    "Savings Account",
    "Account Number : XXXXX0051",
    "Statement period",
    "Closing Balance : INR 45,678.90",
    "",
    "Savings Account",
    "Account Number : XXXXX7357",
    "Closing Balance : INR 1,234.00",
  ].join("\n");
  assert.deepEqual(parseBankAccountBalances(text), [
    { masked_identifier: "••0051", category: "cash", amount: 45678.9 },
    { masked_identifier: "••7357", category: "cash", amount: 1234 },
  ]);
});

test("does not emit an account when multiple conflicting closing balances are nearby", () => {
  const text = [
    "Savings Account",
    "Account Number : XXXXX0051",
    "Closing Balance : INR 45,678.90",
    "Closing Balance : INR 46,000.00",
  ].join("\n");
  assert.deepEqual(parseBankAccountBalances(text), []);
});
