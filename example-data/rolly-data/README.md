# Example Rolly Data

This directory contains safe example data for the public `rolly-bot` repository.

- The real private game data should live in a separate `rolly-data` repository.
- The app looks for data in this order:
  1. `ROLLY_DATA_DIR`
  2. `./rolly-data`
  3. `./example-data/rolly-data`
- Files expected in a data directory:
  - `achievements.json`
  - `casino.v1.json`
  - `contracts.v2.json`
  - `dice-balance.json`
  - `intro-posts.v1.json`
  - `items.v1.json`
  - `pvp.json`
  - `raids.json`
  - `world-boss.v1.json`
  - `random-events-balance.json`
  - `random-events.v1.json`

These example values are safe to expose and do not need to match the private game data used outside this public repo.

`achievements.json` can include roll-based achievements, analytics milestones, and optional role reward ids for private server setup.
`contracts.v2.json` defines the Contract Master panel metadata plus Daily and Weekly difficulty pools for contracts gameplay.
`raids.json` defines ordered raid tiers, static raid bosses, shared player-facing copy for raids gameplay, and optional per-tier Discord role rewards for first clears.

For the `rolly-data` authoring docs, start at [AUTHORING.md](AUTHORING.md).
