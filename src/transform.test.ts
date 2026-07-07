import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { transform } from "./transform";
import type { AddonSettings, TrRow } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG: AddonSettings = {
  cashAccountId: "cash",
  portfolioAccountId: "portfolio",
  transferPatterns: [],
};

function row(overrides: Partial<TrRow>): TrRow {
  return {
    datetime: "2024-01-15T10:00:00.000Z",
    date: "2024-01-15",
    account_type: "",
    type: "",
    category: "",
    currency: "EUR",
    amount: "0",
    fee: "",
    tax: "",
    description: "desc",
    counterparty_name: "",
    counterparty_iban: "",
    symbol: "",
    name: "",
    shares: "",
    price: "",
    asset_class: "STOCK",
    transaction_id: "txn-001",
    original_amount: "",
    original_currency: "",
    fx_rate: "",
    mcc_code: "",
    ...overrides,
  };
}

describe("BUY", () => {
  it("produces TRANSFER_OUT cash, TRANSFER_IN portfolio, BUY", () => {
    const { activities, skipped } = transform(
      [
        row({
          category: "TRADING",
          type: "BUY",
          symbol: "AAPL",
          name: "Apple",
          shares: "2",
          price: "150",
          amount: "-300",
          fee: "-1",
        }),
      ],
      CONFIG,
    );

    expect(skipped).toHaveLength(0);
    expect(activities).toHaveLength(3);

    const [transferOut, transferIn, buy] = activities;
    expect(transferOut.activityType).toBe("TRANSFER_OUT");
    expect(transferOut.accountId).toBe("cash");
    expect(transferOut.amount).toBe("301"); // 300 + 1 fee

    expect(transferIn.activityType).toBe("TRANSFER_IN");
    expect(transferIn.accountId).toBe("portfolio");

    expect(buy.activityType).toBe("BUY");
    expect(buy.accountId).toBe("portfolio");
    expect(buy.symbol).toBe("AAPL");
    expect(buy.fee).toBe("1");
    expect(buy.isDraft).toBe(false);
  });

  it("stockperk-funded BUY produces CREDIT + BUY without cash transfer", () => {
    const { activities, skipped } = transform(
      [
        row({
          category: "CASH",
          type: "STOCKPERK",
          symbol: "NVDA",
          amount: "-50",
          date: "2024-01-15",
          transaction_id: "stockperk-1",
        }),
        row({
          category: "TRADING",
          type: "BUY",
          symbol: "NVDA",
          name: "Nvidia",
          shares: "0.5",
          price: "100",
          amount: "-50",
          date: "2024-01-15",
          transaction_id: "buy-1",
        }),
      ],
      CONFIG,
    );

    expect(skipped).toHaveLength(0);
    expect(activities).toHaveLength(2);
    expect(activities.find((a) => a.activityType === "CREDIT")).toBeTruthy();
    expect(activities.find((a) => a.activityType === "BUY")).toBeTruthy();
    // No cash TRANSFER_OUT
    expect(activities.find((a) => a.activityType === "TRANSFER_OUT")).toBeUndefined();
  });
});

describe("SELL", () => {
  it("produces SELL, TRANSFER_OUT portfolio, TRANSFER_IN cash", () => {
    const { activities, skipped } = transform(
      [
        row({
          category: "TRADING",
          type: "SELL",
          symbol: "AAPL",
          name: "Apple",
          shares: "2",
          price: "160",
          amount: "320",
          fee: "-2",
        }),
      ],
      CONFIG,
    );

    expect(skipped).toHaveLength(0);
    expect(activities).toHaveLength(3);

    const sell = activities.find((a) => a.activityType === "SELL")!;
    expect(sell.accountId).toBe("portfolio");
    expect(sell.fee).toBe("2");
    expect(sell.isDraft).toBe(false);

    const out = activities.find((a) => a.activityType === "TRANSFER_OUT")!;
    expect(out.accountId).toBe("portfolio");
    expect(out.amount).toBe("318"); // 320 - 2 fee

    const cashIn = activities.find((a) => a.activityType === "TRANSFER_IN")!;
    expect(cashIn.accountId).toBe("cash");
  });
});

describe("DELIVERY", () => {
  it("FREE_RECEIPT produces a TRANSFER_IN to portfolio", () => {
    const { activities, skipped } = transform(
      [
        row({
          category: "DELIVERY",
          type: "FREE_RECEIPT",
          symbol: "AAPL",
          name: "Apple",
          shares: "5",
          price: "0",
        }),
      ],
      CONFIG,
    );

    expect(skipped).toHaveLength(0);
    expect(activities).toHaveLength(1);
    expect(activities[0].activityType).toBe("TRANSFER_IN");
    expect(activities[0].accountId).toBe("portfolio");
    expect(activities[0].isDraft).toBe(false);
  });

  it("MIGRATION is skipped", () => {
    const { activities, skipped } = transform(
      [row({ category: "DELIVERY", type: "MIGRATION", symbol: "OLD", name: "Old ISIN" })],
      CONFIG,
    );

    expect(activities).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].type).toBe("MIGRATION");
  });
});

describe("CASH deposits and withdrawals", () => {
  it("CUSTOMER_INBOUND → DEPOSIT", () => {
    const { activities } = transform(
      [
        row({
          category: "CASH",
          type: "CUSTOMER_INBOUND",
          amount: "500",
          counterparty_name: "Bank",
        }),
      ],
      CONFIG,
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].activityType).toBe("DEPOSIT");
    expect(activities[0].amount).toBe("500");
    expect(activities[0].accountId).toBe("cash");
  });

  it("CUSTOMER_OUTBOUND_REQUEST → WITHDRAWAL", () => {
    const { activities } = transform(
      [row({ category: "CASH", type: "CUSTOMER_OUTBOUND_REQUEST", amount: "-200" })],
      CONFIG,
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].activityType).toBe("WITHDRAWAL");
    expect(activities[0].amount).toBe("200");
  });

  it("CARD_TRANSACTION → WITHDRAWAL", () => {
    const { activities } = transform(
      [row({ category: "CASH", type: "CARD_TRANSACTION", amount: "-30", name: "Supermarket" })],
      CONFIG,
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].activityType).toBe("WITHDRAWAL");
    expect(activities[0].amount).toBe("30");
  });

  it("CARD_TRANSACTION with positive amount → DEPOSIT (refund)", () => {
    const { activities } = transform(
      [row({ category: "CASH", type: "CARD_TRANSACTION", amount: "15", name: "Refund" })],
      CONFIG,
    );
    expect(activities[0].activityType).toBe("DEPOSIT");
  });
});

describe("DIVIDEND", () => {
  it("EUR dividend produces DIVIDEND + TRANSFER_OUT portfolio + TRANSFER_IN cash", () => {
    const { activities } = transform(
      [
        row({
          category: "CASH",
          type: "DIVIDEND",
          symbol: "AAPL",
          name: "Apple",
          shares: "10",
          amount: "9",
          tax: "-1",
          currency: "EUR",
        }),
      ],
      CONFIG,
    );

    expect(activities).toHaveLength(4);

    const div = activities.find((a) => a.activityType === "DIVIDEND")!;
    expect(div.accountId).toBe("portfolio");
    expect(div.comment).toContain("Dividend Apple");

    const taxAct = activities.find((a) => a.activityType === "TAX")!;
    expect(taxAct.accountId).toBe("portfolio");
    expect(taxAct.amount).toBe("1");

    const out = activities.find((a) => a.activityType === "TRANSFER_OUT")!;
    expect(out.accountId).toBe("portfolio");
    expect(out.amount).toBe("8"); // netEur = absAmt(9) + taxAmt(-1)

    const cashIn = activities.find((a) => a.activityType === "TRANSFER_IN")!;
    expect(cashIn.accountId).toBe("cash");
  });

  it("foreign-currency dividend includes fxRate and converts tax", () => {
    const { activities } = transform(
      [
        row({
          category: "CASH",
          type: "DIVIDEND",
          symbol: "AAPL",
          name: "Apple",
          shares: "10",
          amount: "9", // EUR received
          tax: "-1", // EUR withheld
          currency: "EUR",
          original_amount: "10",
          original_currency: "USD",
          fx_rate: "0.9", // TR rate: 1 USD = 0.9 EUR → wf rate = 1/0.9
        }),
      ],
      CONFIG,
    );

    const div = activities.find((a) => a.activityType === "DIVIDEND")!;
    expect(div.currency).toBe("USD");
    expect(div.fxRate).toBeDefined();
    expect(div.comment).toContain("10 USD");
  });
});

describe("INTEREST", () => {
  it("INTEREST_PAYMENT → INTEREST with optional tax", () => {
    const { activities } = transform(
      [row({ category: "CASH", type: "INTEREST_PAYMENT", amount: "5", tax: "-0.5" })],
      CONFIG,
    );
    expect(activities).toHaveLength(2);
    expect(activities[0].activityType).toBe("INTEREST");
    const taxAct = activities.find((a) => a.activityType === "TAX")!;
    expect(taxAct.amount).toBe("0.5");
  });
});

describe("Transfer patterns", () => {
  it("matched IBAN on TRANSFER_OUTBOUND produces TRANSFER_OUT (+ optional TRANSFER_IN)", () => {
    const config: AddonSettings = {
      ...CONFIG,
      transferPatterns: [
        { iban: "DE89370400440532013000", label: "Broker", destinationAccountId: "broker-acc" },
      ],
    };

    const { activities } = transform(
      [
        row({
          category: "CASH",
          type: "TRANSFER_OUTBOUND",
          amount: "-1000",
          counterparty_iban: "DE89370400440532013000",
        }),
      ],
      config,
    );

    expect(activities).toHaveLength(2);
    expect(activities[0].activityType).toBe("TRANSFER_OUT");
    expect(activities[0].accountId).toBe("cash");
    expect(activities[1].activityType).toBe("TRANSFER_IN");
    expect(activities[1].accountId).toBe("broker-acc");
  });

  it("unmatched TRANSFER_OUTBOUND → plain WITHDRAWAL", () => {
    const { activities } = transform(
      [row({ category: "CASH", type: "TRANSFER_OUTBOUND", amount: "-500" })],
      CONFIG,
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].activityType).toBe("WITHDRAWAL");
  });

  it("keyword match on TRANSFER_OUTBOUND", () => {
    const config: AddonSettings = {
      ...CONFIG,
      transferPatterns: [{ keyword: "SALARY", label: "Employer" }],
    };
    const { activities } = transform(
      [
        row({
          category: "CASH",
          type: "TRANSFER_OUTBOUND",
          amount: "-100",
          description: "Monthly salary payment",
        }),
      ],
      config,
    );
    expect(activities[0].activityType).toBe("TRANSFER_OUT");
    expect(activities[0].comment).toContain("Employer");
  });
});

describe("Unknown types", () => {
  it("unknown CASH type goes to skipped", () => {
    const { activities, skipped } = transform(
      [row({ category: "CASH", type: "UNKNOWN_FUTURE_TYPE" })],
      CONFIG,
    );
    expect(activities).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain("Unknown CASH type");
  });

  it("unknown category goes to skipped", () => {
    const { activities, skipped } = transform(
      [row({ category: "UNKNOWN_CATEGORY", type: "SOMETHING" })],
      CONFIG,
    );
    expect(activities).toHaveLength(0);
    expect(skipped[0].reason).toContain("Unknown category");
  });
});

describe("Output ordering", () => {
  it("activities are sorted by date ascending", () => {
    const { activities } = transform(
      [
        row({
          category: "CASH",
          type: "CUSTOMER_INBOUND",
          amount: "100",
          datetime: "2024-03-01T10:00:00.000Z",
        }),
        row({
          category: "CASH",
          type: "CUSTOMER_INBOUND",
          amount: "200",
          datetime: "2024-01-01T10:00:00.000Z",
        }),
      ],
      CONFIG,
    );
    const dates = activities.map((a) => new Date(a.date as string).getTime());
    expect(dates[0]).toBeLessThan(dates[1]);
  });
});

describe("CSV fixture integration", () => {
  const csv = readFileSync(join(__dirname, "__fixtures__/tr-sample.csv"), "utf-8");
  const { data: rows } = Papa.parse<TrRow>(csv, { header: true, skipEmptyLines: true });

  const { activities, skipped } = transform(rows, CONFIG);

  it("parses 14 rows without errors", () => {
    expect(rows).toHaveLength(14);
  });

  it("produces 17 activities and 1 skipped (MIGRATION)", () => {
    expect(activities).toHaveLength(18);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].type).toBe("MIGRATION");
  });

  it("CUSTOMER_INBOUND → DEPOSIT of 1000 to cash", () => {
    const dep = activities.find(
      (a) => a.activityType === "DEPOSIT" && a.comment?.includes("No SEPA"),
    )!;
    expect(dep.accountId).toBe("cash");
    expect(dep.amount).toBe("1000");
  });

  it("regular BUY (FTSE) → 3 activities including TRANSFER_OUT cash of 201", () => {
    const fundBuys = activities.filter(
      (a) => a.activityType === "BUY" && a.symbol === "IE00BK5BQT80",
    );
    expect(fundBuys).toHaveLength(1);
    expect(fundBuys[0].accountId).toBe("portfolio");

    const fundTransferOut = activities.find(
      (a) =>
        a.activityType === "TRANSFER_OUT" &&
        a.accountId === "cash" &&
        a.comment?.includes("IE00BK5BQT80"),
    )!;
    expect(fundTransferOut.amount).toBe("201"); // 200 + 1 fee
  });

  it("STOCKPERK-funded BUY (Apple) → CREDIT + BUY, no cash TRANSFER_OUT", () => {
    const credit = activities.find((a) => a.activityType === "CREDIT")!;
    expect(credit.amount).toBe("16");

    const appleBuy = activities.find(
      (a) => a.activityType === "BUY" && a.symbol === "US0378331005",
    )!;
    expect(appleBuy.quantity).toBe("0.1000000000");

    // No cash TRANSFER_OUT for the stockperk-funded buy
    const cashTransfersOut = activities.filter(
      (a) =>
        a.activityType === "TRANSFER_OUT" &&
        a.accountId === "cash" &&
        a.comment?.includes("US0378331005"),
    );
    expect(cashTransfersOut).toHaveLength(0);
  });

  it("DIVIDEND (USD) → DIVIDEND with fxRate + TRANSFER_OUT portfolio + TRANSFER_IN cash", () => {
    const div = activities.find((a) => a.activityType === "DIVIDEND")!;
    expect(div.currency).toBe("USD");
    expect(div.fxRate).toBeDefined();
    expect(div.comment).toContain("Apple");

    const divOut = activities.find(
      (a) =>
        a.activityType === "TRANSFER_OUT" &&
        a.accountId === "portfolio" &&
        a.comment?.includes("Dividend"),
    )!;
    expect(divOut).toBeDefined();

    const divIn = activities.find(
      (a) => a.activityType === "TRANSFER_IN" && a.comment?.includes("Dividend"),
    )!;
    expect(divIn.accountId).toBe("cash");
  });

  it("INTEREST_PAYMENT → INTEREST to cash", () => {
    const interest = activities.find((a) => a.activityType === "INTEREST")!;
    expect(interest.accountId).toBe("cash");
    expect(interest.amount).toBe("4.5");
  });

  it("CUSTOMER_OUTBOUND_REQUEST → WITHDRAWAL of 500 from cash", () => {
    const w = activities.find(
      (a) => a.activityType === "WITHDRAWAL" && a.comment?.includes("20240401"),
    )!;
    expect(w.amount).toBe("500");
    expect(w.accountId).toBe("cash");
  });

  it("CARD_ORDERING_FEE → FEE of 5 from cash", () => {
    const fee = activities.find((a) => a.activityType === "FEE")!;
    expect(fee.amount).toBe("5");
    expect(fee.accountId).toBe("cash");
  });

  it("CARD_TRANSACTION → WITHDRAWAL of 60 from cash", () => {
    const card = activities.find(
      (a) => a.activityType === "WITHDRAWAL" && a.comment?.includes("SUPERMARKET"),
    )!;
    expect(card.amount).toBe("60");
  });

  it("BENEFITS_SAVEBACK → CREDIT with BONUS subtype to cash", () => {
    const saveback = activities.find(
      (a) => a.activityType === "CREDIT" && a.subtype === "BONUS" && a.accountId === "cash",
    )!;
    expect(saveback.amount).toBe("4");
  });

  it("TRANSFER_OUTBOUND (unmatched) → plain WITHDRAWAL from cash", () => {
    const w = activities.find(
      (a) => a.activityType === "WITHDRAWAL" && a.comment?.startsWith("Outgoing transfer for Jane Doe"),
    )!;
    expect(w.amount).toBe("300");
    expect(w.accountId).toBe("cash");
  });

  it("TRANSFER_INSTANT_INBOUND → DEPOSIT to cash", () => {
    const dep = activities.find(
      (a) => a.activityType === "DEPOSIT" && a.comment?.includes("Incoming transfer"),
    )!;
    expect(dep.amount).toBe("500");
    expect(dep.accountId).toBe("cash");
  });
});
