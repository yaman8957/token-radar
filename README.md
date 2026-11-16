# Token Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01) [![rank](https://make.fun/badge/token-radar-01/yaman8957/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard) [![reward](https://make.fun/badge/token-radar-01/yaman8957/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for the sealed DefiLlama snapshot. It finds the protocols that record no
token yet, ranks them by an implied launch value, and gives every one a concrete farm plan.

The dashboard is a static page with no framework and no network. `main.ts` reads the snapshot, scores
every protocol with `lib/model.ts`, writes `board.json` and the page's `data.js`, copies
`dashboard/` and `screenshots/`, and writes `dossier.json` with the vendored make.fun library.

## Model

`radar-2-momentum` scores every protocol with the same function of the snapshot's own figures:

```
implied = round(
  tvl_usd x 0.32
  x (1 + growth/100 x 0.75)                          growth >= 0
  x (1 + growth/100 x 0.75 x 1.25)                    growth < 0
  x (0.42 + sqrt(min(age_days, 1460) / 1460) x 0.58)
  x confidence
)
```

- Growth is clamped to -60% … +150%; negative growth is penalised 1.25x.
- Maturity uses a square-root curve, so a protocol's first year without a token matters more than its fifth.
- A missing seven-day reading keeps the row but applies a 0.92 confidence multiplier.
- The 0.32x base multiple sits inside the live market's own range: the snapshot's median live
  market-cap/TVL multiple is 0.31x, printed in the page.
- No protocol name is special-cased.

## Board and page

- 226 pre-token rows: all 40 watchlist protocols plus 186 early protocols below the floor.
- Seven farm steps per row, derived from category, chains, TVL, age and momentum, each with a cost and a time.
- Sortable table, search, category filter, momentum filter and a detail drawer per protocol.
- A live-token view shows market caps and market-cap/TVL multiples beside the pre-token model.

## Run

Node.js 22.18 or later, standard library only, offline:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /tmp/makefun2/token-radar-01-kit/input/snapshot.json
```

The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.
