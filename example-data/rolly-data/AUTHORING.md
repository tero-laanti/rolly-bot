# Rolly Data Authoring Guide

This directory documents the current `rolly-data` contract without changing the runtime format.
All data files remain plain JSON.

Use the file-specific guides when authoring or reviewing private `rolly-data`:

- [achievements.md](achievements.md): achievement rules, ordered vs unordered matching, manual prestige awards.
- [dice-balance.md](dice-balance.md): prestige, bans, charge, PvP timing, random-event variety tuning.
- [casino.v1.md](casino.v1.md): payout math, bet settings, and game-specific tuning rules.
- [items.v1.md](items.v1.md): item effect behavior and time-based units.
- [random-events.v1.md](random-events.v1.md): scenario structure, weighting, challenges, text variables, and effect stacking.

General rules:

- Keep `id` values stable.
- Treat the validators as the structural source of truth and these docs as the human explanation layer.
- Documented behavior here should match the current runtime, not aspirational future behavior.
