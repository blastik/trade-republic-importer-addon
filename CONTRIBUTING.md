# Contributing

Thanks for considering a contribution! A few things that make review faster:

## Adding support for a new transaction type

If your change teaches `transform.ts` to handle a new Trade Republic `type`/`subType`, please also add a row for it to the fixture:

- `src/__fixtures__/tr-sample.csv`
- exercised end-to-end by `src/transform.test.ts`

Fabricate the ISINs/amounts/descriptions (no personal data), but keep the real column layout and formatting quirks of an actual export — see the existing rows for the shape. This keeps the fixture-based suite in sync with what the addon actually supports, instead of relying on isolated unit tests alone.

## Versioning

Changes touching `src/`, `manifest.json` permissions/metadata, or transaction-mapping behavior should bump the version in both `manifest.json` and `package.json`, with a matching `CHANGELOG.md` entry — the release workflow only cuts a GitHub release when `manifest.json`'s version has no matching git tag yet. Docs-only or CI-only changes don't need a bump.

If a commit shouldn't trigger the release workflow at all (e.g. a docs/CI change landing straight on `main`), include `[skip-release]` in the commit message. To skip CI checks on a PR (rare — e.g. a pure docs PR), apply the `skip-ci` label instead.

## Running things locally

```bash
pnpm install
pnpm test:watch
pnpm type-check
pnpm build
```

CI runs `pnpm type-check`, `pnpm test`, and `pnpm build` on every PR — make sure those pass locally first.

### Node/pnpm versions

Runtime versions are pinned in `.tool-versions` (Node 24, pnpm 11) for anyone using [asdf](https://asdf-vm.com/) — install the `nodejs` and `pnpm` plugins and asdf will pick them up automatically. This is entirely optional: any Node 24 / pnpm 11 toolchain works fine, `.tool-versions` is just there for convenience.

## Testing against a real Wealthfolio instance

`pnpm dev:server` runs `wealthfolio dev`, which serves the addon for live reload against a running Wealthfolio app. For a one-off manual install test, `pnpm bundle` builds and zips `dist/trade-republic-importer-addon.zip` the same way the release workflow does — install it via **Settings → Add-ons → Install from File**.

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, …) — see `git log` for examples.
