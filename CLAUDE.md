# Trade Republic Importer Addon

Wealthfolio addon that maps Trade Republic CSV exports to Wealthfolio activities. The core logic lives entirely in `src/transform.ts`; the React pages are thin wrappers that call the SDK.

## Quick Start (Claude Code Contributors)

```bash
pnpm install              # Install dependencies
pnpm test:watch           # Run tests in watch mode while developing
pnpm type-check           # Check TypeScript types
pnpm build                # Build to dist/addon.js
pnpm bundle               # Build + create ZIP for local Wealthfolio installation testing
```

All business logic is in `src/transform.ts` — tests live in `src/transform.test.ts` with CSV fixtures in `src/__fixtures__/`. Start there to understand how transactions are mapped.

## Stack

- **Runtime / package manager**: Node 24, pnpm 10 (versions pinned in `.tool-versions`)
- **Build**: Vite 7 — outputs a single `dist/addon.js` (ES module, no zip)
- **Tests**: Vitest 4 — unit tests in `src/transform.test.ts` + CSV fixture in `src/__fixtures__/`
- **Type checking**: `tsc --noEmit`

## Key files

| File | Purpose |
|---|---|
| `src/transform.ts` | Pure CSV-row → ActivityImport mapping; all business logic |
| `src/transform.test.ts` | Full test suite for transform (unit + fixture integration) |
| `src/__fixtures__/tr-sample.csv` | 14-row fixture covering every supported transaction type |
| `manifest.json` | Addon metadata; `version` here drives the release tag |
| `src/addon.tsx` | Entry point — registers pages and sidebar item via addon-sdk |

## Commands

```bash
pnpm install          # install deps
pnpm type-check       # tsc --noEmit
pnpm test             # vitest run (once)
pnpm test:watch       # vitest (watch mode)
pnpm build            # vite build → dist/addon.js
pnpm bundle           # build + zip → dist/trade-republic-importer-addon.zip (for local install testing)
pnpm dev              # vite build --watch
```

## Releasing

Bump the `version` field in **both** `manifest.json` and `package.json`, update `CHANGELOG.md`, then push/merge to `main`. The release workflow will:

1. Run type-check, tests, and build
2. Detect the new version tag doesn't exist yet
3. Create a GitHub release `v{version}` with the changelog section and `dist/addon.js` attached

The wealthfolio-addons community registry JSON should reference the `dist/addon.js` asset URL from the GitHub release.

## Two-account model

Trade Republic uses:
- **Cash account** — deposits, withdrawals, dividends, fees, card transactions
- **Portfolio account** — security positions

Buying a stock moves funds Cash → Portfolio (TRANSFER_OUT / TRANSFER_IN pair) then records the BUY. Selling is the reverse. This pairing is required by Wealthfolio to keep account balances consistent.
