# `items.v1.json`

Each entry defines a shop item and its effect. Consumables are used from inventory. Passive permanent upgrades activate automatically from ownership.

Minimal shape:

```json
{
  "id": "dice-revolver",
  "name": "Dice Revolver",
  "description": "Your next 6 /dice uses roll twice.",
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
- Passive permanent upgrades are clamped to one owned copy.
- Time-based units are explicit in field names such as `minutes`, `durationSeconds`, and `intervalSeconds`.

Effect types:

- `negative-effect-shield`: grants charges that block the next matching hostile effect. Current item behavior covers PvP and random events that consume the same shield effect.
- `double-roll-uses`: the next `uses` `/dice` actions roll twice.
- `double-roll-duration`: `/dice` rolls twice for the next `minutes`.
- `trigger-random-group-event`: tries to spawn a random event immediately. If the runtime is disabled, unavailable, or already busy, the item is refunded.
- `auto-roll-session`: reserves an automated rolling session. Only one active auto-roll session per user is allowed.
- `cleanse-all-negative-effects`: clears negative temporary effects and any active PvP lockout. If nothing negative is active, use fails and the item is not consumed.
- `passive-extra-shield-on-umbrella`: adds `extraCharges` to each Bad Luck Umbrella use while owned.
- `passive-pvp-loser-lockout-reduction`: reduces PvP loser lockout by `reductionPercent`, with a final floor of `minimumMinutes`.
- `passive-cleanse-grants-negative-effect-shield`: grants `charges` shield charge(s) whenever Cleanse Salt is used.

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
