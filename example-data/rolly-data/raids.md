# `raids.json`

This file controls raid rewards, boss naming, and raid boss-balance tuning.

```json
{
  "reward": {
    "pipsByBossLevel": [
      { "bossLevelAtLeast": 1, "pips": 4 },
      { "bossLevelAtLeast": 5, "pips": 6 },
      { "bossLevelAtLeast": 10, "pips": 8 },
      { "bossLevelAtLeast": 20, "pips": 12 },
      { "bossLevelAtLeast": 35, "pips": 16 }
    ],
    "rollPassBuff": {
      "multiplierPerBossLevel": 1,
      "minimumMultiplier": 2,
      "maximumMultiplier": 20,
      "rollsPerBossLevelDivisor": 10,
      "minimumRolls": 1,
      "maximumRolls": 5
    }
  },
  "bossNames": {
    "prefixes": ["Ashen"],
    "suffixes": ["Hydra"]
  },
  "bossBalance": {
    "expectedRollIntervalSeconds": 10,
    "minimumHitsPerParticipant": 12,
    "minimumBossHp": 120,
    "damageBudgetRatio": 0.7,
    "baseHp": 80,
    "hpPerBossLevel": 28,
    "timeBudgetFlatHpPerMinute": 6,
    "participantPrestigeWeight": 2,
    "participantExtraSidesDivisor": 2,
    "baselineDieSides": 6,
    "maxBossLevel": 999
  }
}
```

- `reward.pipsByBossLevel` is an ascending floor table. Each raider who landed at least one hit gets the full matching pip payout on a successful clear.
- `reward.pipsByBossLevel[0].bossLevelAtLeast` must start at `1`.
- `reward.rollPassBuff.multiplierPerBossLevel` scales the normal `/dice` roll-pass buff from boss level before clamping.
- `reward.rollPassBuff.minimumMultiplier` and `reward.rollPassBuff.maximumMultiplier` clamp that buff magnitude.
- `reward.rollPassBuff.rollsPerBossLevelDivisor` controls the clear-buff duration using `ceil(bossLevel / divisor)`.
- `reward.rollPassBuff.minimumRolls` and `reward.rollPassBuff.maximumRolls` clamp the rewarded roll count.
- `bossNames.prefixes` and `bossNames.suffixes` are combined at runtime to generate boss names.
- `expectedRollIntervalSeconds` is the raid HP model's expected per-player `/dice` cadence.
- `minimumHitsPerParticipant` keeps raids from collapsing to trivially low HP in short windows.
- `minimumBossHp` is a flat floor for the final generated HP pool.
- `damageBudgetRatio` controls how much of the estimated total player damage budget becomes boss HP.
- `baseHp`, `hpPerBossLevel`, and `timeBudgetFlatHpPerMinute` shape the readable HP formula.
- `participantPrestigeWeight`, `participantExtraSidesDivisor`, and `baselineDieSides` control how player stats influence generated boss level.
- `maxBossLevel` is a guardrail clamp, not a progression system by itself.
