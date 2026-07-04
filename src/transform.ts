import type { ActivityImport } from "@wealthfolio/addon-sdk";
import type { AddonSettings, SkippedRow, TransformResult, TransferPattern, TrRow } from "./types";

function addSec(isoDate: string, seconds: number): string {
  return new Date(new Date(isoDate).getTime() + seconds * 1000).toISOString();
}

function num(s: string | undefined | null): number {
  if (!s || s.trim() === "") return 0;
  return parseFloat(s);
}

function fmtAmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toFixed(6);
  return str.replace(/\.?0+$/, "") || "0";
}

// Try in order: IBAN exact on counterparty_iban → IBAN substring in description → keyword in description
function matchPattern(
  cpiban: string,
  desc: string,
  patterns: TransferPattern[],
): TransferPattern | undefined {
  const upper = desc.toUpperCase();
  return (
    patterns.find((p) => p.iban && p.iban === cpiban) ??
    patterns.find((p) => p.iban && upper.includes(p.iban.toUpperCase())) ??
    patterns.find((p) => p.keyword && upper.includes(p.keyword.toUpperCase()))
  );
}

function cashAct(
  accountId: string,
  activityType: string,
  date: string,
  amount: number,
  comment: string,
  subtype?: string,
): ActivityImport {
  return {
    accountId,
    activityType: activityType as ActivityImport["activityType"],
    subtype: subtype ?? undefined,
    date,
    symbol: "$CASH-EUR",
    quantity: "1",
    unitPrice: "1",
    amount: fmtAmt(amount),
    currency: "EUR",
    comment,
    isValid: true,
    isDraft: false,
  };
}

export function transform(rows: TrRow[], config: AddonSettings): TransformResult {
  const { cashAccountId, portfolioAccountId, transferPatterns } = config;

  const activities: ActivityImport[] = [];
  const skipped: SkippedRow[] = [];

  // Pre-build set of BUY transaction_ids funded by a STOCKPERK gift
  const stockperkFundedBuyIds = new Set<string>();
  const stockperkRows = rows.filter((r) => r.type === "STOCKPERK");
  for (const s of stockperkRows) {
    for (const b of rows) {
      if (
        b.type === "BUY" &&
        b.symbol === s.symbol &&
        b.date === s.date &&
        Math.round(Math.abs(num(b.amount)) * 100) === Math.round(Math.abs(num(s.amount)) * 100)
      ) {
        stockperkFundedBuyIds.add(b.transaction_id);
        break;
      }
    }
  }

  for (const r of rows) {
    const { category, type: typ, datetime: dt, amount, fee, tax, description: desc } = r;
    const cpiban = r.counterparty_iban ?? "";
    const cpname = r.counterparty_name ?? "";

    // ── TRADING / BUY ───────────────────────────────────────────────────────
    if (category === "TRADING" && typ === "BUY") {
      const buyFee = Math.abs(num(fee));
      const buyTax = Math.abs(num(tax));
      const buyFeeTotal = buyFee + buyTax;
      const totalCash = Math.abs(num(amount)) + buyFeeTotal;
      const instrType = r.asset_class === "STOCK" ? "EQUITY" : "FUND";
      const quoteCcy = r.currency || "EUR";

      if (stockperkFundedBuyIds.has(r.transaction_id)) {
        activities.push(
          cashAct(
            portfolioAccountId,
            "CREDIT",
            addSec(dt, -1),
            totalCash,
            `Stockperk TR gift: ${r.name} (${r.symbol})`,
            "BONUS",
          ),
        );
        activities.push({
          accountId: portfolioAccountId,
          activityType: "BUY",
          date: dt,
          symbol: r.symbol,
          symbolName: r.name,
          instrumentType: instrType,
          quoteCcy,
          quantity: r.shares,
          unitPrice: r.price,
          fee: buyFeeTotal ? fmtAmt(buyFeeTotal) : "0",
          currency: quoteCcy,
          comment: `${r.name} - Stockperk gift buy (funded by TR, not own funds)`,
          isValid: true,
          isDraft: false,
        });
        continue;
      }

      // Regular BUY: fund from Efectivo via internal transfer
      activities.push(
        cashAct(
          cashAccountId,
          "TRANSFER_OUT",
          addSec(dt, -2),
          totalCash,
          `Funds for ${r.symbol} (${r.name}) buy -> Portfolio`,
        ),
      );
      activities.push(
        cashAct(
          portfolioAccountId,
          "TRANSFER_IN",
          addSec(dt, -1),
          totalCash,
          `Funds from Cash for ${r.symbol} buy`,
        ),
      );
      activities.push({
        accountId: portfolioAccountId,
        activityType: "BUY",
        date: dt,
        symbol: r.symbol,
        symbolName: r.name,
        instrumentType: instrType,
        quoteCcy,
        quantity: r.shares,
        unitPrice: r.price,
        fee: buyFeeTotal ? fmtAmt(buyFeeTotal) : "0",
        currency: quoteCcy,
        comment: desc ? `${r.name} - ${desc}` : r.name,
        isValid: true,
        isDraft: false,
      });
      continue;
    }

    // ── TRADING / SELL ──────────────────────────────────────────────────────
    if (category === "TRADING" && typ === "SELL") {
      const sellFee = Math.abs(num(fee));
      const sellTax = Math.abs(num(tax));
      const sellFeeTotal = sellFee + sellTax;
      const proceeds = Math.abs(num(amount)) - sellFeeTotal;
      const instrType = r.asset_class === "STOCK" ? "EQUITY" : "FUND";
      const quoteCcy = r.currency || "EUR";

      activities.push({
        accountId: portfolioAccountId,
        activityType: "SELL",
        date: dt,
        symbol: r.symbol,
        symbolName: r.name,
        instrumentType: instrType,
        quoteCcy,
        quantity: r.shares,
        unitPrice: r.price,
        fee: sellFeeTotal ? fmtAmt(sellFeeTotal) : "0",
        currency: quoteCcy,
        comment: desc ? `${r.name} - ${desc}` : r.name,
        isValid: true,
        isDraft: false,
      });
      activities.push(
        cashAct(
          portfolioAccountId,
          "TRANSFER_OUT",
          addSec(dt, 1),
          proceeds,
          `${r.symbol} (${r.name}) sale -> Cash`,
        ),
      );
      activities.push(
        cashAct(
          cashAccountId,
          "TRANSFER_IN",
          addSec(dt, 2),
          proceeds,
          `${r.symbol} sale from Portfolio`,
        ),
      );
      continue;
    }

    // ── DELIVERY / MIGRATION ────────────────────────────────────────────────
    if (category === "DELIVERY" && typ === "MIGRATION") {
      skipped.push({
        datetime: dt,
        type: typ,
        category,
        description: desc,
        reason: "MIGRATION: technical ISIN change, no net portfolio effect",
      });
      continue;
    }

    // ── DELIVERY / FREE_RECEIPT ─────────────────────────────────────────────
    if (category === "DELIVERY" && typ === "FREE_RECEIPT") {
      const instrType = r.asset_class === "STOCK" ? "EQUITY" : "FUND";
      const quoteCcy = r.currency || "EUR";
      activities.push({
        accountId: portfolioAccountId,
        activityType: "TRANSFER_IN",
        date: dt,
        symbol: r.symbol,
        symbolName: r.name,
        instrumentType: instrType,
        quoteCcy,
        quantity: r.shares,
        unitPrice: r.price || undefined,
        currency: quoteCcy,
        comment: `${r.name} transfer from another broker`,
        isValid: true,
        isDraft: false,
      });
      continue;
    }

    // ── CASH ────────────────────────────────────────────────────────────────
    if (category === "CASH") {
      const amt = num(amount);
      const absAmt = Math.abs(amt);

      if (typ === "STOCKPERK") {
        continue;
      }

      if (typ === "CUSTOMER_INBOUND" || typ === "CUSTOMER_INPAYMENT") {
        activities.push(
          cashAct(cashAccountId, "DEPOSIT", dt, absAmt, cpname ? `${desc} (${cpname})` : desc),
        );
        continue;
      }

      if (typ === "CUSTOMER_OUTBOUND_REQUEST") {
        activities.push(
          cashAct(cashAccountId, "WITHDRAWAL", dt, absAmt, cpname ? `${desc} (${cpname})` : desc),
        );
        continue;
      }

      if (typ === "CARD_TRANSACTION" || typ === "CARD_TRANSACTION_INTERNATIONAL") {
        const cardFee = num(fee);
        const netAmt = amt + cardFee;
        const mccPart = r.mcc_code ? ` (MCC ${r.mcc_code})` : "";
        const feePart = cardFee ? ` [+ fee ${Math.abs(cardFee).toFixed(2)}]` : "";
        const merchant = r.name || desc;
        const c = `${merchant}${mccPart}${feePart}`;
        activities.push(
          cashAct(
            cashAccountId,
            netAmt >= 0 ? "DEPOSIT" : "WITHDRAWAL",
            dt,
            Math.abs(netAmt),
            netAmt >= 0 ? `Card refund: ${c}` : c,
          ),
        );
        continue;
      }

      if (typ === "CARD_ORDERING_FEE") {
        const feeAmt = fee ? Math.abs(num(fee)) : absAmt;
        activities.push(cashAct(cashAccountId, "FEE", dt, feeAmt, desc));
        continue;
      }

      if (typ === "BENEFITS_SAVEBACK") {
        const taxAmt = num(tax);
        const net = absAmt + taxAmt;
        activities.push(
          cashAct(
            cashAccountId,
            "CREDIT",
            dt,
            net,
            `Saveback - ${r.name}` +
              (taxAmt ? ` (withholding tax ${Math.abs(taxAmt).toFixed(2)} EUR)` : ""),
            "BONUS",
          ),
        );
        continue;
      }

      if (typ === "DIVIDEND") {
        const taxAmt = num(tax);
        const netEur = absAmt + taxAmt;
        const sharesVal = r.shares || "1";
        const quoteCcy = r.original_currency || r.currency || "EUR";

        const tOut = addSec(dt, 1);
        const tIn = addSec(dt, 2);

        if (r.original_currency) {
          const trFx = num(r.fx_rate);
          const wfFx = trFx !== 0 ? parseFloat((1.0 / trFx).toFixed(6)) : 1;
          // Tax is withheld in EUR; convert to the dividend's original currency for the tax field
          const taxInOrigCcy = taxAmt ? fmtAmt(Math.abs(taxAmt) * trFx) : undefined;
          activities.push({
            accountId: portfolioAccountId,
            activityType: "DIVIDEND",
            date: dt,
            symbol: r.symbol,
            symbolName: r.name,
            quoteCcy,
            quantity: sharesVal,
            currency: r.original_currency,
            amount: r.original_amount,
            fxRate: String(wfFx),
            tax: taxInOrigCcy,
            comment: `Dividend ${r.name} (${r.original_amount} ${r.original_currency})`,
            isValid: true,
            isDraft: false,
          });
        } else {
          activities.push({
            accountId: portfolioAccountId,
            activityType: "DIVIDEND",
            date: dt,
            symbol: r.symbol,
            symbolName: r.name,
            quoteCcy,
            quantity: sharesVal,
            currency: r.currency || "EUR",
            amount: fmtAmt(absAmt),
            tax: taxAmt ? fmtAmt(Math.abs(taxAmt)) : undefined,
            comment: `Dividend ${r.name}`,
            isValid: true,
            isDraft: false,
          });
        }

        activities.push(
          cashAct(portfolioAccountId, "TRANSFER_OUT", tOut, netEur, `Dividend ${r.name} -> Cash`),
        );
        activities.push(
          cashAct(cashAccountId, "TRANSFER_IN", tIn, netEur, `Dividend ${r.name} from Portfolio`),
        );
        continue;
      }

      if (typ === "INTEREST_PAYMENT" || typ === "MANUAL_CASH_TRANSFER") {
        const taxAmt = num(tax);
        activities.push({
          ...cashAct(cashAccountId, "INTEREST", dt, absAmt, desc),
          tax: taxAmt ? fmtAmt(Math.abs(taxAmt)) : undefined,
        });
        continue;
      }

      if (typ === "TRANSFER_DIRECT_DEBIT_INBOUND") {
        const match = matchPattern(cpiban, desc, transferPatterns);
        if (match) {
          activities.push(
            cashAct(cashAccountId, "TRANSFER_OUT", dt, absAmt, `-> ${match.label}: ${desc}`),
          );
          if (match.destinationAccountId) {
            activities.push(
              cashAct(match.destinationAccountId, "TRANSFER_IN", dt, absAmt, `<- TR: ${desc}`),
            );
          }
        } else {
          activities.push(cashAct(cashAccountId, "WITHDRAWAL", dt, absAmt, desc));
        }
        continue;
      }

      if (typ === "TRANSFER_INBOUND" || typ === "TRANSFER_INSTANT_INBOUND") {
        activities.push(
          cashAct(
            cashAccountId,
            amt >= 0 ? "DEPOSIT" : "WITHDRAWAL",
            dt,
            absAmt,
            cpname ? `${desc} (${cpname})` : desc,
          ),
        );
        continue;
      }

      if (typ === "TRANSFER_OUTBOUND" || typ === "TRANSFER_INSTANT_OUTBOUND") {
        const match = matchPattern(cpiban, desc, transferPatterns);

        if (match) {
          activities.push(
            cashAct(
              cashAccountId,
              "TRANSFER_OUT",
              dt,
              absAmt,
              `-> ${match.label}: ${desc}` + (cpname ? ` (${cpname})` : ""),
            ),
          );
          if (match.destinationAccountId) {
            activities.push(
              cashAct(match.destinationAccountId, "TRANSFER_IN", dt, absAmt, `<- TR: ${desc}`),
            );
          }
        } else {
          activities.push(
            cashAct(cashAccountId, "WITHDRAWAL", dt, absAmt, cpname ? `${desc} (${cpname})` : desc),
          );
        }
        continue;
      }

      skipped.push({
        datetime: dt,
        type: typ,
        category,
        description: desc,
        reason: `Unknown CASH type: ${typ}`,
      });
      continue;
    }

    skipped.push({
      datetime: dt,
      type: typ,
      category,
      description: desc,
      reason: `Unknown category: ${category}`,
    });
  }

  // Sort by date and assign line numbers
  activities.sort((a, b) => {
    const da = new Date(a.date as string).getTime();
    const db = new Date(b.date as string).getTime();
    return da - db;
  });
  activities.forEach((a, i) => {
    a.lineNumber = i + 1;
  });

  return { activities, skipped };
}
