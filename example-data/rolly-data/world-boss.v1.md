# `world-boss.v1.json`

This file controls World Boss rewards, boss naming, and World Boss balance tuning.
Player-facing copy uses `World Boss`, while internal identifiers remain `world-boss` and `world-boss.v1.json`.

`reward` supports two pip payout shapes:

- `pipsFormula`: flat payout through a cutoff boss level, then payout equals boss level.
- `pipsByBossLevel`: explicit tier rows keyed by `bossLevelAtLeast`.

`reward.rollPassBuff` supports two duration shapes:

- formula-based duration via `rollsPerBossLevelDivisor` + `minimumRolls` + `maximumRolls`
- tiered duration via `rollsByBossLevel`

```json
{
  "reward": {
    "pipsFormula": {
      "flatPips": 5,
      "flatPipsThroughBossLevel": 5
    },
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
    "prefixes": ["Example"],
    "suffixes": ["Boss"]
  },
  "bossBalance": {
    "baseHp": 120,
    "hpIncreasePerBossLevelPercent": 3,
    "levelHalfLifeLevels": 10,
    "maxBossLevel": 50
  },
  "participantStrength": {
    "prestigeMultiplier": 1.5
  }
}
```

- `reward.pipsFormula.flatPips` is the clear payout for boss levels up to and including `reward.pipsFormula.flatPipsThroughBossLevel`.
- Boss levels above `reward.pipsFormula.flatPipsThroughBossLevel` pay pips equal to the boss level itself.

Tiered reward alternative:

```json
{
  "reward": {
    "pipsByBossLevel": [
      { "bossLevelAtLeast": 1, "pips": 5 },
      { "bossLevelAtLeast": 6, "pips": 8 },
      { "bossLevelAtLeast": 10, "pips": 12 }
    ],
    "rollPassBuff": {
      "multiplierPerBossLevel": 2,
      "minimumMultiplier": 4,
      "maximumMultiplier": 100,
      "rollsByBossLevel": [
        { "bossLevelAtLeast": 1, "rolls": 2 },
        { "bossLevelAtLeast": 11, "rolls": 4 },
        { "bossLevelAtLeast": 21, "rolls": 6 }
      ]
    }
  }
}
```

- `reward.pipsByBossLevel` must contain at least one row.
- The first row must start at `bossLevelAtLeast = 1`.
- Rows must be sorted by ascending `bossLevelAtLeast` with no duplicates.
- `reward.rollPassBuff.multiplierPerBossLevel` scales the normal `/roll` roll-pass buff from boss level before clamping.
- `reward.rollPassBuff.minimumMultiplier` and `reward.rollPassBuff.maximumMultiplier` clamp that buff magnitude.
- Formula duration mode uses `reward.rollPassBuff.rollsPerBossLevelDivisor`, `reward.rollPassBuff.minimumRolls`, and `reward.rollPassBuff.maximumRolls` to calculate `ceil(bossLevel / divisor)` and clamp the result.
- Tiered duration mode uses `reward.rollPassBuff.rollsByBossLevel`, which must start at `bossLevelAtLeast = 1` and be sorted ascending with no duplicates.
- `bossNames.prefixes` and `bossNames.suffixes` are combined at runtime to generate boss names.
- Startup validation rejects prefix/suffix combinations that would overflow the live World Boss embed titles once the boss name and level are composed.
- `baseHp` is the level 1 boss HP before level scaling.
- `hpIncreasePerBossLevelPercent` is the compound HP increase applied for each boss level above 1.
- Boss HP is calculated from boss level first, then multiplied by the joined-player strength total when the World Boss starts.
- `participantStrength.prestigeMultiplier` scales each joined player by `multiplier ^ prestige`, using the player's active prestige when the World Boss starts.
- With the default `1.5`, prestige strengths are `1`, `1.5`, `2.25`, `3.375`, and so on.
- With the default values, level 50 lands at roughly `4.26x` the HP of level 1.
- `levelHalfLifeLevels` controls the low-heavy level roll. With the default `10`, a level 50 boss is half as likely as a level 40 boss, which is half as likely as a level 30 boss.
- `maxBossLevel` caps the random boss level roll. With the default `50`, bosses roll from level 1 through level 50.
