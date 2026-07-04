# Changelog

## [1.0.1] - 2026-07-04

### Fixed

- ETFs and funds not appearing in investments after import — all BUY, SELL, and TRANSFER_IN (broker transfer) activities are now imported as committed, not as drafts

## [1.0.0] - 2026-07-04

### Added

- Initial release
- Import Trade Republic CSV exports (cash and portfolio activities)
- Two-account model: separate cash and portfolio accounts
- Automatic detection and mapping of internal fund transfers
- Security mapping step for unrecognised TR symbols
- Settings page for account selection and transfer pattern management
- Support for dividends, withholding tax, buy/sell, deposits, and withdrawals
