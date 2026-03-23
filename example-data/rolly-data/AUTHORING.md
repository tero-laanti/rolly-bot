# Rolly Data Authoring Guide

This directory explains the `rolly-data` JSON contract used by the bot.
All data files are plain JSON.

Use the file-specific guides when authoring or reviewing private `rolly-data`:

- [achievements.md](achievements.md): achievement rules, ordered vs unordered matching, manual prestige awards.
- [dice-balance.md](dice-balance.md): prestige, bans, charge, and core `/dice` progression tuning.
- [casino.v1.md](casino.v1.md): payout math, bet settings, and game-specific tuning rules.
- [intro-posts.v1.md](intro-posts.v1.md): startup-synced channel intro messages managed by the bot.
- [items.v1.md](items.v1.md): item effect behavior and time-based units.
- [pvp.md](pvp.md): duel timing and base PvP effect durations.
- [raids.md](raids.md): raid rewards, boss naming, and boss-balance tuning.
- [random-events-balance.md](random-events-balance.md): claim-window scaling and event variety tuning.
- [random-events.v1.md](random-events.v1.md): scenario structure, weighting, challenges, text variables, and effect stacking.

General rules:

- Keep `id` values stable.
- Treat the validators as the exact structural contract. These docs explain what the fields mean when you are editing data.
