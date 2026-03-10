# Rolly

Discord bot focused on rolling dice. The project is mostly written by AI but reviewed by a human.

## What Rolly Is

Rolly is a Discord dice game built around repeated rolls, progression, and small moments of luck. Players roll their current dice set trying to hit matching combinations, unlock achievements, gain Fame, configure bans, prestige into stronger dice, challenge others in duels and so on.

## Screenshots

PvP duels can grant temporary roll buffs that feed back into the main `/dice` loop:

<img src="docs/images/pvp.png" alt="PvP duel and follow-up dice roll" width="480" />

Players can also inspect long-term progression with `/dice-analytics`:

<img src="docs/images/analytics.png" alt="Dice analytics command output" width="360" />

Random events appear as live interaction prompts in the server:

<img src="docs/images/event.png" alt="Random event prompt" width="480" />

And much more!

## Requirements

- Node.js 24.13.0 (see `.nvmrc`)

## Quick Start

```bash
nvm use
npm install
cp .env.example .env
# Optional but recommended for real gameplay data.
# Without private data, startup stays fail-closed unless
# ROLLY_ALLOW_EXAMPLE_DATA=true is set intentionally.
# git clone <your-private-rolly-data-url> ./rolly-data
npm run build
npm run deploy:commands
npm start
```

## Environment Variables

Rolly reads configuration from `.env`. The source of truth for available variables is [.env.example](/Users/tero/workspace/rolly/.env.example).

### Required

- `DISCORD_TOKEN`: Bot token from the Discord Developer Portal.
- `DISCORD_CLIENT_ID`: Application ID for the Discord bot.
- `DISCORD_OWNER_ID`: Your Discord user ID. Required for owner-only commands such as `/self-update` and `/dice-admin`.

### Optional

- `DISCORD_GUILD_ID`: Development guild/server ID for fast slash-command iteration. If omitted, commands are deployed globally.
- `ROLLY_DATA_DIR`: Absolute or repo-relative path to your private `rolly-data` checkout. If omitted, the app tries `./rolly-data` and only falls back to `./example-data/rolly-data` when `ROLLY_ALLOW_EXAMPLE_DATA=true`. Expected files include `achievements.json`, `dice-balance.json`, `items.v1.json`, and `random-events.v1.json`.
- `ROLLY_ALLOW_EXAMPLE_DATA`: Development-only flag. Set to `true` only if you intentionally want to run against the public example data. Default: disabled.
- `RANDOM_EVENTS_CHANNEL_ID`: Channel ID where random events are posted. If random events are enabled but this is unset, no event messages can be posted.
- `RANDOM_EVENTS_ENABLED`: Enables or disables the random-event scheduler. Default: `true`.
- `RANDOM_EVENTS_TARGET_PER_DAY`: Target number of random events per day. Default: `10`.
- `RANDOM_EVENTS_MIN_GAP_MINUTES`: Minimum time between random-event opportunities. Units: minutes. Default: `45`.
- `RANDOM_EVENTS_MAX_ACTIVE`: Maximum number of active random events at once. Default: `1`.
- `RANDOM_EVENTS_RETRY_DELAY_SECONDS`: Retry delay after a failed or skipped trigger. Units: seconds. Default: `300`.
- `RANDOM_EVENTS_JITTER_RATIO`: Random scheduling jitter ratio used by the scheduler. Default: `0.35`.
- `RANDOM_EVENTS_QUIET_HOURS_START`: Quiet-hours start time in `HH:MM` 24-hour format. Default: `23:00`.
- `RANDOM_EVENTS_QUIET_HOURS_END`: Quiet-hours end time in `HH:MM` 24-hour format. Default: `08:00`.
- `RANDOM_EVENTS_QUIET_HOURS_TIMEZONE`: IANA timezone used for quiet hours. Default: `Europe/Helsinki`.

Use placeholder values in `.env.example`, keep your real `.env` private, and do not commit real tokens or IDs you consider sensitive.

Example:

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_dev_server_id
DISCORD_OWNER_ID=your_discord_user_id
RANDOM_EVENTS_CHANNEL_ID=channel_for_random_events
```

## Data Storage

The bot stores game data in `./data/rolly-bot.sqlite`.

## Game Data

Rolly keeps the real spoilery game data outside the public app repository.

- Public repo: `rolly-bot`
- Private companion repo: `rolly-data`

At startup, the bot loads gameplay data in this order:

1. `ROLLY_DATA_DIR`
2. `./rolly-data`
3. `./example-data/rolly-data` only when `ROLLY_ALLOW_EXAMPLE_DATA=true`

Expected files in a data directory:

- `achievements.json`
- `dice-balance.json`
- `items.v1.json`
- `random-events.v1.json`

The committed files under `example-data/rolly-data` are safe examples only. They document the schema and can keep the public repo runnable when explicitly enabled, but they are not intended to match production values.

By default, the app refuses to start on `example-data`. If you intentionally want to run the public sample data for local development, set `ROLLY_ALLOW_EXAMPLE_DATA=true`.

Recommended setup for a real deployment:

```bash
git clone https://github.com/tero-laanti/rolly-bot.git
cd rolly-bot
git clone <your-private-rolly-data-url> ./rolly-data
cp .env.example .env
```

If `./rolly-data` or `ROLLY_DATA_DIR` points to a git checkout, `/self-update` will pull that repo too before rebuilding.

## Commands

- `/dice` rolls your current dice set, handles level-ups, rewards, charge rolls, temporary effects, and achievements.
- `/dice-prestige` manages prestige progression and active prestige selection.
- `/dice-shop` lets players spend Pips on shop items and build an inventory.
- `/dice-inventory` shows owned items and lets players use them.
- `/dice-bans` configures banned values on your current dice setup.
- `/dice-pvp` creates and resolves PvP dice duels.
- `/dice-achievements` lists unlocked dice achievements.
- `/dice-analytics` shows progression and PvP stats.
- `/dice-admin` exposes owner-only dice admin tools, including random-event status and effect cleanup. It is Discord admin-gated and guild-only so regular users should not see it in the command picker.
- `/self-update` pulls the latest code, optionally runs `npm install`, refreshes `rolly-data` when configured as a git checkout, rebuilds, and redeploys commands. It is Discord admin-gated and guild-only so regular users should not see it in the command picker.

## Architecture

Rolly is a pragmatic domain-driven modular monolith.

- `src/app/` contains the composition root and Discord runtime wiring.
- `src/dice/<context>/` contains context-first modules such as progression, inventory, PvP, analytics, admin, and random-events.
- `src/dice/economy/domain/balance.ts` is now the source of truth for Fame/Pips balance operations.
- `src/dice/random-events/domain/` now exposes random-event contract types for external consumers such as `rolly-data`.
- `interfaces/discord/` contains Discord command adapters, button handlers, and presentation wiring.
- `application/` contains use cases and orchestration.
- `infrastructure/` contains adapters such as SQLite-backed or runtime-backed integrations.
- `src/shared-kernel/` contains small, stable shared types and architectural primitives.

Current migration note:

- `src/dice/core/` and `src/dice/features/` still contain legacy internal implementations used by some of the new context-first modules.
- New feature work should start in the context-first folders.
- Slash commands and button handlers are registered explicitly in [src/app/discord/command-registry.ts](/Users/tero/workspace/rolly/src/app/discord/command-registry.ts). Command discovery is no longer filesystem-based.
- Interactive button-driven flows now use a cleaner split: button parsing in `interfaces/discord/buttons/`, pure use cases in `application/`, and Discord rendering in `interfaces/discord/presenters/`.
- The shared action-view contract for button-driven use cases now lives in [action-view.ts](/Users/tero/workspace/rolly/src/shared-kernel/application/action-view.ts), with shared Discord rendering in [render-action-result.ts](/Users/tero/workspace/rolly/src/app/discord/render-action-result.ts) and [render-action-button-rows.ts](/Users/tero/workspace/rolly/src/app/discord/render-action-button-rows.ts).
- `/dice` now runs through the progression context, and usable inventory items now run through the inventory context instead of legacy `src/dice/core/application/` entrypoints.

## Project Layout

- `src/app/bootstrap/` contains the startup entrypoints used by [src/index.ts](/Users/tero/workspace/rolly/src/index.ts) and [src/deploy-commands.ts](/Users/tero/workspace/rolly/src/deploy-commands.ts).
- `src/app/discord/` contains the Discord bot runtime, button router, interaction helpers, and explicit command registry.
- `eslint.config.js` enforces basic architecture guardrails for the new context-first `application/` and `domain/` folders.
- `src/dice/progression/interfaces/discord/commands/` contains progression-facing Discord commands such as `/dice`, `/dice-prestige`, `/dice-bans`, and `/dice-achievements`.
- `src/dice/progression/application/roll-dice/` contains the migrated `/dice` use case and reply-content builder.
- `src/dice/progression/interfaces/discord/buttons/` and `src/dice/progression/interfaces/discord/presenters/` contain the migrated progression Discord adapters.
- `src/dice/inventory/interfaces/discord/buttons/` and `src/dice/inventory/interfaces/discord/presenters/` contain the migrated shop and inventory Discord adapters.
- `src/dice/inventory/application/use-item/` contains the migrated item-consumption use case used by `/dice-inventory`.
- `src/dice/economy/domain/` contains the current economy source of truth for Fame/Pips access and updates.
- `src/dice/inventory/interfaces/discord/commands/` contains `/dice-shop` and `/dice-inventory`.
- `src/dice/pvp/interfaces/discord/commands/`, `src/dice/pvp/interfaces/discord/buttons/`, and `src/dice/pvp/interfaces/discord/presenters/` contain the migrated PvP Discord adapters.
- `src/dice/analytics/interfaces/discord/commands/` contains `/dice-analytics`.
- `src/dice/admin/interfaces/discord/commands/`, `src/dice/admin/interfaces/discord/buttons/`, and `src/dice/admin/interfaces/discord/presenters/` contain the migrated admin Discord adapters.
- `src/dice/random-events/domain/` contains random-event contract types; `src/dice/random-events/infrastructure/` contains runtime and scheduler adapters.
- `src/system/self-update/interfaces/discord/commands/` contains the owner-only `/self-update` command.
- `src/dice/core/` and `src/dice/features/` remain as legacy internals while the context-first migration continues.
- `src/shared/` contains shared infrastructure such as db, config, env, and remaining compatibility helpers.
- `src/shared-kernel/` contains small shared architecture primitives and types.
- `src/rolly-data/` is the boundary for hidden gameplay data loading and validation.
- `src/bot/` remains as compatibility wrappers so existing imports keep working during the migration.

## Development

```bash
npm run dev
npm run lint
npm run format
npm run format:check
```

`dist/` is generated by `npm run build`. Do not edit generated files directly.

When you add or change environment variables or the `rolly-data` file contract, update `.env.example`, `README.md`, and `example-data/rolly-data` in the same change.
