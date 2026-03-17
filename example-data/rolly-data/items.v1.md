# `items.v1.json`

Each entry defines a shop item and its use effect.

Minimal shape:

```json
{
  "id": "dice-revolver",
  "name": "Dice Revolver",
  "description": "Your next 6 /dice uses roll twice.",
  "pricePips": 5,
  "consumable": true,
  "effect": {
    "type": "double-roll-uses",
    "uses": 6
  }
}
```

Shared notes:

- `pricePips` is the shop cost.
- `consumable` is currently expected to be `true` for usable items.
- Time-based units are explicit in field names such as `minutes`, `durationSeconds`, and `intervalSeconds`.

Effect types:

- `negative-effect-shield`: grants charges that block the next matching hostile effect. Current item behavior covers PvP, random events, and future hostile systems that consume the same shield effect.
- `double-roll-uses`: the next `uses` `/dice` actions roll twice.
- `double-roll-duration`: `/dice` rolls twice for the next `minutes`.
- `trigger-random-group-event`: tries to spawn a random event immediately. If the runtime is disabled, unavailable, or already busy, the item is refunded.
- `auto-roll-session`: reserves an automated rolling session. Only one active auto-roll session per user is allowed.
- `cleanse-all-negative-effects`: clears negative temporary effects and any active PvP lockout. If nothing negative is active, use fails and the item is not consumed.

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
