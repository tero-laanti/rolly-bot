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
  - `dice-balance.json`
  - `items.v1.json`
  - `pvp.json`
  - `raids.json`
  - `random-events-balance.json`
  - `random-events.v1.json`

These example values are safe to expose and do not need to match the private game data used outside this public repo.

For the `rolly-data` authoring docs, start at [AUTHORING.md](AUTHORING.md).
