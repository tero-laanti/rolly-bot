# Garden idle pips

## Product decisions
- Add a new permanent shop item: Seed Satchel, cost 10 pips.
- Add a new consumable shop item: Mysterious Die Seed, cost 5 pips.
- Seeds can be purchased only after the user owns Seed Satchel.
- Users may own multiple seeds in inventory.
- Users may have only one active planting at a time for now.
- Add a new `/garden` command.
- `/garden` should not reveal exact odds or payout tables.
- Planting reveals the die type immediately.
- Planting status copy:
  - `You planted a Mysterious Die Seed. You have x seeds left.`
  - `A dX sapling took root in your garden.`
- Harvest status copy:
  - `You harvested your dX sapling.`
  - `It burst into a <amount> pips.`
- Pip Magnet affects harvest rewards.
- Implement storage in a future-friendly way so more planting slots can be added later, but expose one slot now.
- Add five garden achievements in rolly-data.

## Technical shape
- Add inventory item support for garden unlock/seed gating.
- Add garden state persistence in SQLite.
- Add inventory-side achievement tracking for garden milestones.
- Add a new inventory/garden context command + buttons using existing action-view patterns.
- Use lazy ready-state evaluation, no scheduler.
- Use economy grantRewardPips for harvest rewards.
- Update rolly-data examples/docs/tests and private local rolly-data checkout if available.
