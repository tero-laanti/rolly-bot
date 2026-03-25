# `dice-balance.json`

This file controls core dice progression, bans, charge behavior, and the global `/roll` roll-pass cap.

Prestige progression:

```json
{
  "prestigeSides": [6, 8, 12, 20],
  "lowerPrestigeBaseDiceCount": 5
}
```

- `prestigeSides[0]` is prestige `0`, `prestigeSides[1]` is prestige `1`, and so on.
- Max prestige is `prestigeSides.length - 1`.
- Within a prestige, dice count is the player's current number of dice. Dice count `1` means rolling `1` die, dice count `2` means rolling `2` dice, and so on.
- `lowerPrestigeBaseDiceCount` is used when a player switches down to a previously unlocked lower prestige. Those lower prestiges start at this base dice count instead of `1`.

Fame and bans:

```json
{
  "banStep": 4
}
```

- Ban slots are calculated as `floor(fame / banStep)`.
- Higher fame unlocks more ban slots.
- Dice count and die size are not part of the unlock formula.

Dice-count and roll-pass tuning:

- `diceCountIncreaseReward`: Fame granted when the player gains another die.
- `firstDailyRollPipReward`: Pips granted by the first manual `/roll` of the UTC day.
- `maxRollPassCount`: hard cap for total roll passes after charge or other roll-pass modifiers are applied.

```json
{
  "diceCountIncreaseReward": 1,
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
- When charge is active, `/roll` uses the charge roll instead of other roll-pass modifiers.
