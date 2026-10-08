import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBankAccountBalances,
  parseCardDue,
  parseNpsHoldingValue,
  parseEpfPassbook,
  validateEpfPassbookChain,
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


const epf2024 = `
Member Passbook
Establishment ID/Name                                    TEST0001234000 / EXAMPLE INDIA PVT LTD
Member ID/Name                                           TEST00012340000001234 / SAMPLE MEMBER
| UAN                                                      999900001234

EPF Passbook [ Financial Year - 2024-2025 ]
OB Int. Updated upto 31/03/2024                              70,000  30,000  35,000
Mar-2024 01-04-2024 CR Cont. for Due-Month 042024 22,000 15,000 2,640 1,390 1,250
Apr-2024 01-05-2024 CR Cont. for Due-Month 052024 22,000 15,000 2,640 1,390 1,250
Total Contributions for the year [ 2024 ]                    5,280   2,780   2,500
Total Transfer-Ins/VDRs for the year [ 2024 ]                0       0       0
Total Withdrawals for the year [ 2024 ]                      0       0       0
Int. Updated upto 31/03/2025                                 4,720   2,220   0
Closing Balance as on 31/03/2025                             80,000  35,000  37,500
Printed On : 08-10-2026 15:36:16
`;

const epf2025 = `
Member Passbook
Establishment ID/Name                                    TEST0001234000 / EXAMPLE INDIA PVT LTD
Member ID/Name                                           TEST00012340000001234 / SAMPLE MEMBER
| UAN                                                      999900001234

EPF Passbook [ Financial Year - 2025-2026 ]
OB Int. Updated upto 31/03/2025                              80,000  35,000  37,500
Mar-2025 01-04-2025 CR Cont. for Due-Month 042025 24,000 15,000 2,880 1,630 1,250
Total Contributions for the year [ 2025 ]                    2,880   1,630   1,250
Total Transfer-Ins/VDRs for the year [ 2025 ]                0       0       0
Total Withdrawals for the year [ 2025 ]                      0       0       0
Int. Updated upto 31/03/2026                                 7,120   3,370   0
Closing Balance as on 31/03/2026                             90,000  40,000  38,750
Printed On : 08-10-2026 15:36:09
`;

const epf2026 = `
Member Passbook
Establishment ID/Name                                    TEST0001234000 / EXAMPLE INDIA PVT LTD
Member ID/Name                                           TEST00012340000001234 / SAMPLE MEMBER
| UAN                                                      999900001234

EPF Passbook [ Financial Year - 2026-2027 ]
OB Int. Updated upto 31/03/2026                              90,000  40,000  38,750
Mar-2026 01-04-2026 CR Cont. for Due-Month 042026 26,000 15,000 3,120 1,870 1,250
Apr-2026 15-05-2026 CR Cont. for Due-Month 052026 26,000 15,000 3,120 1,870 1,250
Total Contributions for the year [ 2026 ]                    6,240   3,740   2,500
Total Transfer-Ins/VDRs for the year [ 2026 ]                0       0       0
Total Withdrawals for the year [ 2026 ]                      0       0       0
Interest details N/A                                         0       0       0
Closing Balance as on 31/03/2027                             96,240  43,740  41,250
Printed On : 08-10-2026 15:36:00
`;

test("parses EPFO passbook balances without counting EPS as EPF", () => {
  const parsed = parseEpfPassbook(epf2026);
  assert.equal(parsed.financial_year, "2026-2027");
  assert.equal(parsed.member_tail, "1234");
  assert.equal(parsed.uan_tail, "1234");
  assert.equal(parsed.closing.employee, 96240);
  assert.equal(parsed.closing.employer, 43740);
  assert.equal(parsed.closing.pension, 41250);
  assert.equal(parsed.closing.epf_total, 139980);
  assert.equal(parsed.interest_available, false);
  assert.equal(parsed.latest_posting_date, "2026-05-15");
  assert.equal(parsed.latest_wage_month, "Apr-2026");
  assert.equal(parsed.transaction_count, 2);
});

test("validates a continuous EPFO passbook chain", () => {
  const chain = validateEpfPassbookChain([
    parseEpfPassbook(epf2026),
    parseEpfPassbook(epf2024),
    parseEpfPassbook(epf2025),
  ]);
  assert.equal(chain.ok, true);
  assert.deepEqual(chain.financial_years, ["2024-2025", "2025-2026", "2026-2027"]);
  assert.equal(chain.latest.closing.epf_total, 139980);
});

test("rejects an EPFO chain when balances do not carry forward", () => {
  const broken = epf2025.replace("80,000  35,000  37,500", "80,001  35,000  37,500");
  const chain = validateEpfPassbookChain([
    parseEpfPassbook(epf2024),
    parseEpfPassbook(broken),
  ]);
  assert.deepEqual(chain, { ok: false, reason: "balance_chain_mismatch" });
});
