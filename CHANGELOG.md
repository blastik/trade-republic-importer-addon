# Changelog

## [1.1.1] - 2026-07-09

### Fixed

- Internal transfers (BUY funding, SELL/DIVIDEND cash sweeps, and matched Transfer Pattern pairs) no longer inflate Wealthfolio's spending totals. Each `TRANSFER_OUT`/`TRANSFER_IN` pair is now tagged with a shared `sourceGroupId`, which Wealthfolio's spending calculator uses to recognise the pair as an internal transfer rather than an expense.
- `CUSTOMER_OUTBOUND_REQUEST` (withdrawal requests to your linked bank account) now checks Transfer Patterns like `TRANSFER_OUTBOUND` already did — previously it was unconditionally recorded as a `WITHDRAWAL` even when a matching pattern with a destination account was configured, always counting it as spending.

## [1.1.0] - 2026-07-07

### Added

- Settings: account dropdowns now filter by type — cash selector shows only CASH accounts, securities selector shows only SECURITIES accounts
- Settings: account names in dropdowns now display their currency for easier identification
- Multi-currency support: cash account currency is captured from the selected account and used throughout the transform (symbol `$CASH-{CURRENCY}`, activity `currency` field) — no longer hardcoded to EUR

## [1.0.0] - 2026-07-07

### Added

- Import Trade Republic CSV exports (cash and portfolio activities)
- Two-account model: separate cash and portfolio accounts
- Automatic detection and mapping of internal fund transfers
- Security mapping step for unrecognised TR symbols
- Settings page for account selection and transfer pattern management
- Support for dividends, withholding tax, buy/sell, deposits, withdrawals, card transactions, interest, and Saveback

### Fixed

- All BUY, SELL, and TRANSFER_IN (broker transfer) activities imported as committed, not as drafts
- Activity deduplication: appends microsecond-precision time tag to every activity comment so that same-merchant/same-amount transactions (e.g. recurring card charges, ETF plan buys at the same price) are no longer collapsed into a single entry by Wealthfolio's idempotency key
