# `dice-balance.json`

This file controls core dice progression, bans, charge behavior, and the global `/dice` roll-pass cap.

Prestige progression:

```json
{
  "prestigeSides": [6, 8, 12, 20],
  "lowerPrestigeBaseLevel": 5
}
```

- `prestigeSides[0]` is prestige `0`, `prestigeSides[1]` is prestige `1`, and so on.
- Max prestige is `prestigeSides.length - 1`.
- `lowerPrestigeBaseLevel` is used when a player switches down to a previously unlocked lower prestige. Those older prestiges start at this base level instead of level `1`.

Fame and bans:

```json
{
  "banStep": 4
}
```

- Current runtime behavior is `floor(fame / banStep)`.
- Higher fame unlocks more ban slots.
- Level and die size are not currently part of the unlock formula.

Level-up and roll-pass tuning:

- `levelUpReward`: Fame granted on level-up.
- `firstDailyRollPipReward`: Pips granted by the first manual `/dice` roll of the UTC day.
- `maxRollPassCount`: hard cap for total roll passes after charge or other roll-pass modifiers are applied.

```json
{
  "levelUpReward": 1,
  "firstDailyRollPipReward": 5,
  "maxRollPassCount": 500
}
```

Charge:

```json
{
  "charge": {
    "startAfterMinutes": 10,
    "maxMultiplier": 100
  }
}
```

- Charge only starts after this many idle minutes.
- Once active, the multiplier grows with elapsed charged minutes.
- The runtime clamps the final value to `maxMultiplier`.
- When charge is active, `/dice` uses the charge roll instead of other roll-pass modifiers.
