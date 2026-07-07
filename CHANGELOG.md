# Changelog

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
