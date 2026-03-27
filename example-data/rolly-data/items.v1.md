# `items.v1.json`

Each entry defines a shop item and its effect. Consumables are used from inventory. Passive permanent upgrades activate automatically from ownership.

Minimal shape:

```json
{
  "id": "dice-revolver",
  "name": "Dice Revolver",
  "description": "Your next 6 /roll uses roll twice.",
  "pricePips": 6,
  "consumable": true,
  "effect": {
    "type": "double-roll-uses",
    "uses": 6
  }
}
```

Shared notes:

- `pricePips` is the shop cost.
- `consumable: true` means the item can be used from inventory.
- `consumable: false` is used for passive permanent upgrades that work automatically while owned.
- Passive permanent upgrades default to a single owned copy unless `repeatablePricing` is present.
- `repeatablePricing.priceIncreasePipsPerOwned` makes a passive upgrade stack and raises its shop price after each owned copy.
- `requiresItemId` gates a shop item behind ownership of another item id in the same file.
- Time-based units are explicit in field names such as `minutes`, `durationSeconds`, and `intervalSeconds`.
- Startup validation rejects item names or descriptions that are too long to fit the live shop or single-item inventory surfaces.

Effect types:

- `negative-effect-shield`: grants charges that block the next matching hostile effect. Current item behavior covers PvP and random events that consume the same shield effect.
- `double-roll-uses`: the next `uses` `/roll` actions roll twice.
- `double-roll-duration`: `/roll` rolls twice for the next `minutes`.
- `trigger-random-group-event`: tries to spawn a random event immediately. If the runtime is disabled, unavailable, or already busy, the item is refunded.
- `auto-roll-session`: reserves an automated rolling session. Only one active auto-roll session per user is allowed.
- `cleanse-all-negative-effects`: clears negative temporary effects and any active PvP lockout. If nothing negative is active, use fails and the item is not consumed.
- `passive-extra-shield-on-umbrella`: adds `extraCharges` to each Bad Luck Umbrella use while owned.
- `passive-pvp-loser-lockout-reduction`: reduces PvP loser lockout by `reductionPercent`, with a final floor of `minimumMinutes`.
- `passive-cleanse-grants-negative-effect-shield`: grants `charges` shield charge(s) whenever Cleanse Salt is used.
- `passive-extra-ban-slot`: grants `extraSlots` additional ban slots per owned copy.
- `passive-pip-reward-bonus`: grants `bonusPercent` additional pip rewards per owned copy.
- `passive-personal-charge-unlock`: unlocks personal Dice charge with `minutesPerMultiplier` and `maxMultiplier`.
- `passive-personal-charge-speed-bonus`: makes personal Dice charge build faster by `fasterPercent` per owned copy.
- `passive-personal-charge-cap-bonus`: raises the personal Dice charge cap by `extraMaxMultiplier` per owned copy.

Auto-roll example:

```json
{
  "type": "auto-roll-session",
  "durationSeconds": 300,
  "intervalSeconds": 5
}
```

- `durationSeconds` must be at least `intervalSeconds`.
- Shorter intervals produce more roll activity.
- Longer durations keep the session alive longer.

Passive upgrade example:

```json
{
  "id": "umbrella-harness",
  "name": "Umbrella Harness",
  "description": "Passive upgrade: Bad Luck Umbrella grants +1 extra shield charge when used.",
  "pricePips": 250,
  "consumable": false,
  "effect": {
    "type": "passive-extra-shield-on-umbrella",
    "extraCharges": 1
  }
}
```

Repeatable passive upgrade example:

```json
{
  "id": "pip-magnet",
  "name": "Pip Magnet",
  "description": "Passive upgrade: each copy adds +10% pip rewards.",
  "pricePips": 250,
  "consumable": false,
  "repeatablePricing": {
    "priceIncreasePipsPerOwned": 250
  },
  "effect": {
    "type": "passive-pip-reward-bonus",
    "bonusPercent": 10
  }
}
```

Passive upgrade with prerequisite example:

```json
{
  "id": "starter-coil",
  "name": "Starter Coil",
  "description": "Passive upgrade: each copy makes personal Dice charge build 25% faster.",
  "pricePips": 300,
  "consumable": false,
  "repeatablePricing": {
    "priceIncreasePipsPerOwned": 300
  },
  "requiresItemId": "idle-dynamo",
  "effect": {
    "type": "passive-personal-charge-speed-bonus",
    "fasterPercent": 0.25
  }
}
```
