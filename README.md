# Trade Republic Importer

A Wealthfolio addon that imports Trade Republic CSV exports into your portfolio.

## Overview

Trade Republic uses a two-account model: a **cash account** (where deposits,
withdrawals, dividends, and fees land) and a **portfolio account** (where
securities are held). This addon maps that model to two existing Wealthfolio
accounts you select in Settings.

## Setup

1. Install the addon in Wealthfolio from the community registry (or manually install from a GitHub release)
2. Go to **Trade Republic → Settings**
3. Select your **Cash account** and **Portfolio account**
4. Optionally add **Transfer Patterns** to categorise recurring bank transfers

## Importing

1. Export your transaction history from Trade Republic (app → Profile →
   Documents → Transaction history → Export as CSV)
2. Go to **Trade Republic → Import**
3. Drop or select the CSV file
4. Review the parsed activities — duplicates are detected automatically
5. Map any unrecognised securities to their correct ticker (Security Mapping
   step)
6. Click **Import**

## Supported Transaction Types

| TR type                                                 | Wealthfolio activity                                |
| ------------------------------------------------------- | --------------------------------------------------- |
| TRADING / BUY                                           | BUY + FEE (if any)                                  |
| TRADING / SELL                                          | SELL + FEE (if any)                                 |
| DELIVERY / FREE_RECEIPT                                 | BUY at cost zero (gifted shares)                    |
| DELIVERY / MIGRATION                                    | Skipped (technical ISIN change, no net effect)      |
| CASH / CUSTOMER_INBOUND, CUSTOMER_INPAYMENT             | DEPOSIT                                             |
| CASH / CUSTOMER_OUTBOUND_REQUEST                        | WITHDRAWAL                                          |
| CASH / CARD_TRANSACTION, CARD_TRANSACTION_INTERNATIONAL | WITHDRAWAL                                          |
| CASH / CARD_ORDERING_FEE                                | FEE                                                 |
| CASH / BENEFITS_SAVEBACK                                | DIVIDEND (Saveback cashback)                        |
| CASH / DIVIDEND                                         | DIVIDEND (+ tax withholding entry if present)       |
| CASH / INTEREST_PAYMENT, MANUAL_CASH_TRANSFER           | INTEREST                                            |
| CASH / TRANSFER_DIRECT_DEBIT_INBOUND                    | DEPOSIT or TRANSFER (via transfer patterns)         |
| CASH / TRANSFER_INBOUND, TRANSFER_INSTANT_INBOUND       | DEPOSIT or TRANSFER (via transfer patterns)         |
| CASH / TRANSFER_OUTBOUND, TRANSFER_INSTANT_OUTBOUND     | WITHDRAWAL or TRANSFER (via transfer patterns)      |
| CASH / STOCKPERK                                        | Skipped (the corresponding BUY is imported instead) |

## Transfer Patterns

Transfer patterns let you classify recurring bank transfers (e.g. salary, rent)
as Wealthfolio TRANSFER activities instead of plain deposits/withdrawals. Each
pattern matches by **IBAN** or **keyword** in the transaction description.

Example: an IBAN `DE89 3704 0044 0532 0130 00` with label `Investment` will mark all
inbound transfers from that IBAN as a TRANSFER linked to a destination account
of your choice.

## Notes

- Currency is driven by the CSV; the cash symbol `$CASH-EUR` is used for EUR
  cash entries.
- Settings (account selection, transfer patterns) are stored securely in
  Wealthfolio's secrets store and pre-filled on every import.
