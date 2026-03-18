# `dice-balance.json`

This file controls progression, bans, charge behavior, PvP timing, and random-event variety tuning.

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

- `levelUpReward`: pips granted on level-up.
- `maxRollPassCount`: hard cap for total roll passes after charge or other roll-pass modifiers are applied.

```json
{
  "levelUpReward": 1,
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

PvP:

```json
{
  "pvp": {
    "challengeExpireMinutes": 3,
    "loserLockoutBaseMinutes": 30,
    "winnerBuffBaseMinutes": 3
  }
}
```

- Max PvP tier is derived from `prestigeSides`, so adding a new prestige level also extends the PvP tier ceiling.
- `challengeExpireMinutes` is the lifetime of an unanswered challenge.
- `loserLockoutBaseMinutes` and `winnerBuffBaseMinutes` are tier-1 base values.
- The runtime scales both with `2 ** (tier - 1)`, so higher tiers ramp quickly.

Random-event timing and variety:

```json
{
  "randomEvents": {
    "claimWindowDurationMultiplier": 1.5,
    "variety": {
      "antiRepeatCooldownTriggers": 2
    }
  }
}
```

- `claimWindowDurationMultiplier` multiplies each scenario's `claimWindowSeconds`.
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
