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
- `src/dice/<context>/` contains the source-of-truth gameplay code. Main contexts are progression, economy, inventory, PvP, analytics, admin, and random-events.
- Each context follows the same basic split:
  `domain/` for rules and value types,
  `application/` for use cases and ports,
  `infrastructure/` for SQLite and runtime adapters,
  `interfaces/discord/` for slash commands, buttons, and presenters.
- `src/dice/economy/application/ports.ts` defines the Fame/Pips repository contract. `src/dice/economy/domain/balance.ts` holds shared economy value types, and `src/dice/economy/infrastructure/sqlite/balance-repository.ts` is the current SQLite implementation.
- `src/dice/random-events/domain/` exposes random-event contract types for external consumers such as `rolly-data`, while `src/dice/random-events/infrastructure/` owns runtime wiring, scheduling, and admin control.
- `src/shared-kernel/` contains small, stable shared architecture primitives such as action-view models.
- `src/shared/` contains shared infrastructure such as db, env, config, and cross-cutting helpers.

Important rules:

- New feature work should start in the owning `src/dice/<context>/` folder.
- Slash commands and button handlers are registered explicitly in [src/app/discord/command-registry.ts](/Users/tero/workspace/rolly/src/app/discord/command-registry.ts). Command discovery is not filesystem-based.
- For SQLite-backed flows, build use cases from `src/dice/*/infrastructure/sqlite/services.ts`. Keep `application/` code on ports and `UnitOfWork`, not `shared/db`.
- Keep `application/` and `domain/` code free of `infrastructure/` and `interfaces/` imports. Wire concrete adapters in `infrastructure/` or `app/`.
- For interactive Discord flows, prefer button id parsing in `interfaces/discord/buttons/`, pure application output models, and Discord rendering in `interfaces/discord/presenters/`.
- Legacy compatibility shims under `src/dice/core/` and `src/dice/features/` were removed. Do not reintroduce them.

## Project Layout

- [src/app/bootstrap/](/Users/tero/workspace/rolly/src/app/bootstrap/) contains the startup entrypoints used by [src/index.ts](/Users/tero/workspace/rolly/src/index.ts) and [src/deploy-commands.ts](/Users/tero/workspace/rolly/src/deploy-commands.ts).
- [src/app/discord/](/Users/tero/workspace/rolly/src/app/discord/) contains the Discord runtime, interaction helpers, button router, and explicit command registry.
- [src/dice/progression/](/Users/tero/workspace/rolly/src/dice/progression/), [src/dice/inventory/](/Users/tero/workspace/rolly/src/dice/inventory/), [src/dice/pvp/](/Users/tero/workspace/rolly/src/dice/pvp/), [src/dice/analytics/](/Users/tero/workspace/rolly/src/dice/analytics/), [src/dice/admin/](/Users/tero/workspace/rolly/src/dice/admin/), and [src/dice/random-events/](/Users/tero/workspace/rolly/src/dice/random-events/) are the main gameplay contexts.
- [src/dice/\*/infrastructure/sqlite/services.ts](/Users/tero/workspace/rolly/src/dice/progression/infrastructure/sqlite/services.ts) files are the adapter entrypoints that build use cases from SQLite repositories and shared unit-of-work wiring.
- [src/system/self-update/](/Users/tero/workspace/rolly/src/system/self-update/) contains the self-update application use case, infrastructure command runner, and owner-only Discord command.
- [src/shared/](/Users/tero/workspace/rolly/src/shared/) contains shared infrastructure such as db, config, env, and cross-cutting helpers.
- [src/shared-kernel/](/Users/tero/workspace/rolly/src/shared-kernel/) contains shared architecture primitives and types.
- [src/rolly-data/](/Users/tero/workspace/rolly/src/rolly-data/) is the boundary for hidden gameplay data loading and validation.
- [src/bot/](/Users/tero/workspace/rolly/src/bot/) still contains a few compatibility wrappers for top-level runtime imports.
- [eslint.config.js](/Users/tero/workspace/rolly/eslint.config.js) enforces the current architecture guardrails.

## Adding Features

When adding a new feature, the shortest path is usually:

1. Pick the owning context under `src/dice/<context>/`.
2. Put rules and domain types in `domain/`, orchestration in `application/`, adapters in `infrastructure/`, and Discord-specific parsing and rendering in `interfaces/discord/`.
3. For SQLite-backed flows, add or extend a repository/service under `infrastructure/sqlite/` and wire the use case through that context's `services.ts`.
4. Register new slash commands or button handlers in [src/app/discord/command-registry.ts](/Users/tero/workspace/rolly/src/app/discord/command-registry.ts).
5. If you change env vars, command shapes, or `rolly-data` contracts, update the related docs and deployment flow in the same change.

## Development

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run format
npm run format:check
```

`dist/` is generated by `npm run build`. Do not edit generated files directly.

When you add or change environment variables or the `rolly-data` file contract, update `.env.example`, `README.md`, and `example-data/rolly-data` in the same change.
