import type { ActivityImport } from "@wealthfolio/addon-sdk";

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

export interface AddonSettings {
  cashAccountId: string;
  cashCurrency: string;
  portfolioAccountId: string;
  transferPatterns: TransferPattern[];
}

export interface SkippedRow {
  datetime: string;
  type: string;
  category: string;
  description: string;
  reason: string;
}

export interface TransformResult {
  activities: ActivityImport[];
  skipped: SkippedRow[];
}
