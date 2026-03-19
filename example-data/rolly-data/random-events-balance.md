# `random-events-balance.json`

This file controls global claim-window scaling and variety-selection tuning for random events.

```json
{
  "claimWindowDurationMultiplier": 1.5,
  "variety": {
    "antiRepeatCooldownTriggers": 2
  }
}
```

- `claimWindowDurationMultiplier` multiplies each scenario's `claimWindowSeconds` from `random-events.v1.json`.
- `antiRepeatCooldownTriggers` makes a just-used scenario temporarily ineligible when alternatives exist.
- `rarityChances` sets base rarity-bucket weights.

Pity:

```json
{
  "pity": {
    "enabled": true,
    "startAfterNonRareTriggers": 5,
    "rareWeightStep": 0.1,
    "epicWeightStep": 0.15,
    "legendaryWeightStep": 0.2,
    "maxBonusMultiplier": 2
  }
}
```

- A non-rare streak means consecutive `common` or `uncommon` selections.
- Once the streak reaches `startAfterNonRareTriggers`, the runtime boosts `rare`, `epic`, and `legendary` bucket weights.
- Each additional non-rare trigger adds the matching step until `maxBonusMultiplier` is reached.
