# `contracts.v1.json`

This file defines daily and weekly contracts.

- Daily contracts rotate globally at `00:00 UTC`.
- Weekly contracts rotate globally at `Monday 00:00 UTC`.
- `/contracts` shows the same active rotations for every player, while progress is tracked per player.

Contract catalog shape:

```json
{
  "daily": [],
  "weekly": []
}
```

- `daily` must include at least 3 entries.
- `weekly` must include at least 2 entries.
- Contract `id` values must be unique across both arrays.

Contract entry shape:

```json
{
  "id": "daily-roll-sprint",
  "title": "Daily Roll Sprint",
  "description": "Use /roll 12 times.",
  "objective": {
    "type": "roll_count",
    "requiredCount": 12
  },
  "reward": {
    "pips": 18
  }
}
```

Objective rules:

- Only counter objectives are supported in v1.
- Supported objective types:
  - `roll_count`
  - `pvp_win_count`
  - `casino_game_count`
  - `world_boss_join_count`
- `requiredCount` must be an integer >= 1.

Reward rules:

- Only `pips` and `fame` rewards are supported in v1.
- At least one of `reward.pips` or `reward.fame` must be present.
- Reward values must be integers >= 1.
- Rewards are auto-claimed on completion in the runtime.

Discord text safety:

- Contract titles and descriptions are validated for Discord payload limits.
- Each authored contract must fit within a single `/contracts` message preview entry.
- `/contracts` trims very long live output to stay under Discord's 2,000-character message limit, so keep titles and descriptions concise even when they pass validation.
