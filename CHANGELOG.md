# Changelog

## [1.3.0] - 2026-07-10

### Added

- Security mappings (ISIN → ticker or "custom") are now persisted across imports. Once a security is resolved, future imports of the same ISIN skip the mapping step entirely. Settings gained a "Security mappings" section to review or clear saved mappings.

### Fixed

- Uploading a non-CSV file (e.g. a zip) is now rejected before parsing, instead of producing confusing results from misread binary content.

## [1.2.0] - 2026-07-09

### Changed

- Migrated to Wealthfolio Addon SDK 3.6.1. Wealthfolio 3.6 runs addons in an isolated sandbox iframe — routes now render via `ctx.router.add({ render })` into a host-provided DOM node instead of the old `component: React.lazy(...)` pattern, and React/ReactDOM are imported directly (`react`, `react-dom/client`) instead of via SDK re-exports. The sidebar icon is now a host-drawn icon name (`bank`) instead of a custom SVG. No user-facing behavior changes.
- `manifest.json` now declares `minWealthfolioVersion` (3.6.0) and `hostDependencies`; the build externalizes `react`, `react-dom`, `@wealthfolio/addon-sdk`, and `@wealthfolio/ui` as ESM imports instead of bundling them with global-variable mapping.

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
