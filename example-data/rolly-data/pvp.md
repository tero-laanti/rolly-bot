# `pvp.json`

This file controls PvP duel timing and the base durations for winner and loser effects.

```json
{
  "challengeExpireMinutes": 3,
  "loserLockoutBaseMinutes": 30,
  "winnerBuffBaseMinutes": 3
}
```

- Max PvP tier is capped at `5`, even if prestige progression continues beyond that.
- `challengeExpireMinutes` is the lifetime of an unanswered challenge.
- `loserLockoutBaseMinutes` and `winnerBuffBaseMinutes` are tier-1 base values.
- The runtime scales both with `2 ** (tier - 1)`, so higher tiers ramp quickly.
