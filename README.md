# Rolly

Rolly is a Discord dice game bot built around a persistent loop: roll, grow your dice, prestige, pick up items, duel other players, and react to live server events without leaving Discord.

## Why Rolly

- `/roll` is the core loop: matching rolls drive progression, achievements, Fame, Pips, bans, and temporary effects.
- The surrounding systems keep the server busy: PvP, casino games, World Boss fights, random events, inventory, and progression systems all feed back into the next roll, including random-event payouts that can grant consumable items.

## In Action

PvP duels can grant temporary roll buffs that feed back into the main `/roll` loop:

<img src="docs/images/pvp.png" alt="PvP duel and follow-up dice roll" width="480" />

Players can inspect their current Rolly status with `/stats`:

<img src="docs/images/analytics.png" alt="Player stats command output" width="360" />

Random events arrive as live interaction prompts inside the server:

<img src="docs/images/event.png" alt="Random event prompt" width="480" />

## Command Surface

- Player commands: `/roll`, `/balance`, `/leaderboards`, `/prestige`, `/bans`, `/casino`, `/shop`, `/inventory`, `/pvp`, `/achievements`, `/contracts`, and `/stats`
- Owner/admin commands: `/admin` and `/self-update`

## Quick Start

Requirements:

- Node.js `24.14.0` (see [.nvmrc](.nvmrc))

Local setup:

```bash
nvm use
npm install
cp .env.example .env
# fill in DISCORD_TOKEN and DISCORD_OWNER_ID
# set DISCORD_CLIENT_ID before npm run deploy:commands
# set DISCORD_GUILD_ID for faster local iteration
npm run deploy:commands
npm run dev
```

If you have a private `rolly-data` checkout, place it in `./rolly-data` or point `ROLLY_DATA_DIR` at it. Otherwise Rolly falls back to the public examples in [example-data/rolly-data/](example-data/rolly-data/). See [docs/development.md](docs/development.md) for more information.

Private `rolly-data` is validated against the Discord transport limits used by the live bot surfaces at startup, so authored text that would overflow shop, random-event, or World Boss payloads is rejected before the bot comes online.
Contracts authored in `contracts.v1.json` are also validated against the `/contracts` surface, and the command shows the shared daily/weekly rotations with auto-claimed reward progress.

## Further Reading

- [docs/development.md](docs/development.md) for local setup, validation, and day-to-day workflow
- [docs/architecture.md](docs/architecture.md) for the high-level codemap, boundaries, and invariants
- [example-data/rolly-data/README.md](example-data/rolly-data/README.md) for the public gameplay-data layout
- [example-data/rolly-data/AUTHORING.md](example-data/rolly-data/AUTHORING.md) for data authoring notes
- [AGENTS.md](AGENTS.md) for repo-specific contributor guardrails
