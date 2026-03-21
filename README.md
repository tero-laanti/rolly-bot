# Rolly

Rolly is a Discord dice game bot built around a persistent loop: roll, grow your dice, prestige, pick up items, duel other players, and react to live server events without leaving Discord.

## Why Rolly

- `/dice` is the core loop: matching rolls drive progression, achievements, Fame, Pips, bans, and temporary effects.
- The surrounding systems keep the server busy: PvP, casino games, raids, random events, inventory, and analytics all feed back into the next roll.

## In Action

PvP duels can grant temporary roll buffs that feed back into the main `/dice` loop:

<img src="docs/images/pvp.png" alt="PvP duel and follow-up dice roll" width="480" />

Players can inspect long-term progression with `/dice-analytics`:

<img src="docs/images/analytics.png" alt="Dice analytics command output" width="360" />

Random events arrive as live interaction prompts inside the server:

<img src="docs/images/event.png" alt="Random event prompt" width="480" />

## Command Surface

- Player commands: `/dice`, `/dice-prestige`, `/dice-bans`, `/dice-casino`, `/dice-shop`, `/dice-inventory`, `/dice-pvp`, `/dice-achievements`, and `/dice-analytics`
- Owner/admin commands: `/dice-admin` and `/self-update`

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

If you have a private `rolly-data` checkout, place it in `./rolly-data` or point `ROLLY_DATA_DIR` at it. Otherwise Rolly falls back to the public examples in [example-data/rolly-data/](example-data/rolly-data/).

For the fuller local workflow, validation commands, and deployment notes, use [docs/development.md](docs/development.md).

## Configuration

Rolly reads runtime configuration from `.env`.

- Required: `DISCORD_TOKEN`, `DISCORD_OWNER_ID`
- Needed for command deployment: `DISCORD_CLIENT_ID`
- Useful for local iteration: `DISCORD_GUILD_ID`
- Gameplay data: `ROLLY_DATA_DIR`
- Random events: `RANDOM_EVENTS_CHANNEL_ID`, `RANDOM_EVENTS_TARGET_PER_DAY`, `RANDOM_EVENTS_MIN_GAP_MINUTES`, `RANDOM_EVENTS_MAX_ACTIVE`, `RANDOM_EVENTS_RETRY_DELAY_SECONDS`, `RANDOM_EVENTS_JITTER_RATIO`, `RANDOM_EVENTS_QUIET_HOURS_START`, `RANDOM_EVENTS_QUIET_HOURS_END`, `RANDOM_EVENTS_QUIET_HOURS_TIMEZONE`
- Raids: `RAIDS_CHANNEL_ID`, `RAIDS_JOIN_LEAD_MINUTES`, `RAIDS_ACTIVE_DURATION_MINUTES`, `RAIDS_TARGET_PER_DAY`, `RAIDS_MIN_GAP_MINUTES`, `RAIDS_RETRY_DELAY_SECONDS`, `RAIDS_JITTER_RATIO`, `RAIDS_QUIET_HOURS_START`, `RAIDS_QUIET_HOURS_END`, `RAIDS_QUIET_HOURS_TIMEZONE`

Use [`.env.example`](.env.example) for the exact variable list and [docs/development.md](docs/development.md) for defaults, units, and setup notes.

## Data and Storage

- Runtime state is stored in `./data/rolly-bot.sqlite`.
- Gameplay data is loaded from `ROLLY_DATA_DIR`, then `./rolly-data`, then [example-data/rolly-data/](example-data/rolly-data/).
- The public files under [example-data/rolly-data/](example-data/rolly-data/) are safe examples only. They document the contract and let the bot boot locally, but they are not intended to mirror private balance or spoiler-heavy content.
- Random events and raids are both inactive until their channel IDs are configured.
- If `./rolly-data` or `ROLLY_DATA_DIR` points at a git checkout, `/self-update` refreshes that repo before rebuilding and redeploying commands.

## Further Reading

- [docs/development.md](docs/development.md) for local setup, validation, and day-to-day workflow
- [docs/architecture.md](docs/architecture.md) for the high-level codemap, boundaries, and invariants
- [example-data/rolly-data/README.md](example-data/rolly-data/README.md) for the public gameplay-data layout
- [example-data/rolly-data/AUTHORING.md](example-data/rolly-data/AUTHORING.md) for data authoring notes
- [AGENTS.md](AGENTS.md) for repo-specific contributor guardrails
