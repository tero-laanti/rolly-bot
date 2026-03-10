# Example Rolly Data

This directory contains example-only data for the public `rolly-bot` repository.

- The real private game data should live in a separate `rolly-data` repository.
- The app looks for data in this order:
  1. `ROLLY_DATA_DIR`
  2. `./rolly-data`
  3. `./example-data/rolly-data` only when `ROLLY_ALLOW_EXAMPLE_DATA=true`
- Files expected in a data directory:
  - `achievements.json`
  - `dice-balance.json`
  - `items.v1.json`
  - `random-events.v1.json`

These example values are intentionally safe to expose and do not need to match production.
They are for local development only.
