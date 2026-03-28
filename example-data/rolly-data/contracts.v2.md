# `contracts.v2.json`

This file defines the authored data for the Contract Master surface.

- `panel` defines the persistent Contract Master panel copy and image.
- `daily` and `weekly` each define three difficulty tiers:
  - `simple`
  - `serious`
  - `brutal`
- Each difficulty tier carries one Pip reward value plus two offer pools:
  - `initialOffers` for the global first offer in that tier
  - `refillOffers` for same-difficulty follow-up offers after a completion

Contract catalog shape:

```json
{
  "panel": {},
  "daily": {},
  "weekly": {}
}
```

- Contract `id` values must be unique across all cadences, difficulties, and offer pools.
- Each difficulty must include at least one `initialOffers` entry and one `refillOffers` entry.
- Pip rewards must increase strictly from `simple` to `serious` to `brutal` within each cadence.

Panel shape:

```json
{
  "title": "Contract Master",
  "npcName": "Contract Master",
  "imageUrl": "https://example.com/rolly/contract-master.png",
  "description": "Take on Daily or Weekly contracts. Each difficulty offers a stronger pip payout.",
  "helperText": "Finish your first contract in a cadence to unlock one more offer from the same difficulty.",
  "dailyButtonLabel": "Daily Contracts",
  "weeklyButtonLabel": "Weekly Contracts",
  "askForContractButtonLabel": "Ask for a new contract"
}
```

Cadence shape:

```json
{
  "label": "Daily",
  "chooserTitle": "Daily Contracts",
  "chooserDescription": "Choose a Daily contract from one of three difficulties.",
  "difficulties": {
    "simple": {},
    "serious": {},
    "brutal": {}
  }
}
```

Difficulty shape:

```json
{
  "label": "Simple",
  "rewardPips": 12,
  "initialOffers": [],
  "refillOffers": []
}
```

Offer shape:

```json
{
  "id": "daily-simple-roll-routine",
  "title": "Roll Routine",
  "description": "Use /roll 12 times.",
  "objective": {
    "type": "roll_count",
    "requiredCount": 12
  }
}
```

Objective rules:

- Only counter objectives are supported in the current format.
- Supported objective types:
  - `roll_count`
  - `pvp_win_count`
  - `casino_game_count`
  - `world_boss_join_count`
- `requiredCount` must be an integer >= 1.

Reward rules:

- Only Pip rewards are supported in the current format.
- Offers do not define a `reward` object directly.
- Set `rewardPips` on the difficulty instead.
- Higher difficulties must pay more Pips than easier ones in the same cadence.

Discord text safety:

- Panel titles, helper text, button labels, chooser copy, and contract titles/descriptions are validated against the Discord payload limits used by the contracts surfaces.
- Each authored offer must fit within a single contract summary entry as rendered by the bot.
