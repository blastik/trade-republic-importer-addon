import type { ActivityImport, SymbolSearchResult } from "@wealthfolio/addon-sdk";

export interface TrRow {
  datetime: string;
  date: string;
  account_type: string;
  type: string;
  category: string;
  currency: string;
  amount: string;
  fee: string;
  tax: string;
  description: string;
  counterparty_name: string;
  counterparty_iban: string;
  symbol: string;
  name: string;
  shares: string;
  price: string;
  asset_class: string;
  transaction_id: string;
  original_amount: string;
  original_currency: string;
  fx_rate: string;
  mcc_code: string;
  [key: string]: string;
}

export interface TransferPattern {
  iban?: string;
  keyword?: string;
  label: string;
  destinationAccountId?: string;
}

// Resolution for one Trade Republic ISIN: either a chosen ticker (from
// ctx.api.market.searchTicker) or "custom" to keep the ISIN as the symbol.
export type SecurityMapping = SymbolSearchResult | "custom";

export interface AddonSettings {
  cashAccountId: string;
  cashCurrency: string;
  portfolioAccountId: string;
  transferPatterns: TransferPattern[];
  // ISIN -> resolved mapping, persisted so recurring imports of the same
  // security don't require re-mapping every time.
  securityMappings: Record<string, SecurityMapping>;
}

export interface SkippedRow {
  datetime: string;
  type: string;
  category: string;
  description: string;
  reason: string;
}

// ActivityImport (the CSV-import-shaped SDK type) has no sourceGroupId field —
// only Activity/ActivityCreate/ActivityUpdate do. We carry our own
// transferGroupId through transform() and translate it to sourceGroupId when
// building the ActivityCreate/ActivityUpdate payloads in ImportPage.
export type ActivityImportEx = ActivityImport & { transferGroupId?: string };

export interface TransformResult {
  activities: ActivityImportEx[];
  skipped: SkippedRow[];
}
