# Rolly

Discord dice game bot built around repeated rolls, progression, and server events.

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

- Node.js 24.14.0 (see `.nvmrc`)

## Quick Start

### Local setup

```bash
nvm use
npm install
cp .env.example .env
# fill in DISCORD_TOKEN and DISCORD_OWNER_ID
# also set DISCORD_CLIENT_ID before running deploy:commands
# optional: set DISCORD_GUILD_ID for faster command updates
npm run deploy:commands
npm run dev
```

#### To add your own custom gameplay data

```bash
git clone <your-private-rolly-data-url> ./rolly-data
```

If you do not have a private `rolly-data` checkout, the app falls back to the public example data automatically and prints a warning at startup.

## Environment Variables

Set these before running `npm run deploy:commands` or starting the bot:

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_OWNER_ID=your_discord_user_id
```

Also set this before running `npm run deploy:commands`:

```bash
DISCORD_CLIENT_ID=your_application_id
```

For local development, you will usually also want:

```bash
DISCORD_GUILD_ID=your_dev_server_id
```

Rolly reads configuration from `.env`. See [.env.example](.env.example) for the full reference.

### Required

- `DISCORD_TOKEN`: Bot token from the Discord Developer Portal.
- `DISCORD_OWNER_ID`: Your Discord user ID. Required for owner-only commands such as `/self-update` and `/dice-admin`.

### Optional

- `DISCORD_CLIENT_ID`: Application ID for the Discord bot. Required for `npm run deploy:commands`, but not for normal bot startup.
- `DISCORD_GUILD_ID`: Development guild/server ID for fast slash-command iteration. If omitted, commands are deployed globally.
- `ROLLY_DATA_DIR`: Absolute or repo-relative path to your private `rolly-data` checkout. If omitted, the app tries `./rolly-data` and then falls back to `./example-data/rolly-data`. Expected files include `achievements.json`, `casino.v1.json`, `dice-balance.json`, `items.v1.json`, `pvp.json`, `raids.json`, `random-events-balance.json`, and `random-events.v1.json`.
- `RANDOM_EVENTS_CHANNEL_ID`: Channel ID where random events are posted. Random events are inactive by default and start only when this is set.
- `RANDOM_EVENTS_TARGET_PER_DAY`: Target number of random events per day. Default: `10`.
- `RANDOM_EVENTS_MIN_GAP_MINUTES`: Minimum time between random-event opportunities. Units: minutes. Default: `45`.
- `RANDOM_EVENTS_MAX_ACTIVE`: Maximum number of active random events at once. Default: `1`.
- `RANDOM_EVENTS_RETRY_DELAY_SECONDS`: Retry delay after a failed or skipped trigger. Units: seconds. Default: `300`.
- `RANDOM_EVENTS_JITTER_RATIO`: Random scheduling jitter ratio used by the scheduler. Default: `0.35`.
- `RANDOM_EVENTS_QUIET_HOURS_START`: Quiet-hours start time in `HH:MM` 24-hour format. Default: `23:00`.
- `RANDOM_EVENTS_QUIET_HOURS_END`: Quiet-hours end time in `HH:MM` 24-hour format. Default: `08:00`.
- `RANDOM_EVENTS_QUIET_HOURS_TIMEZONE`: IANA timezone used for quiet hours. Default: `Europe/Helsinki`.
- `RAIDS_CHANNEL_ID`: Channel ID where raid announcements and active raid posts are sent. Raids stay inactive until this is set.
- `RAIDS_JOIN_LEAD_MINUTES`: Lead time between a raid announcement and the active raid start. Units: minutes. Default: `30`.
- `RAIDS_ACTIVE_DURATION_MINUTES`: How long the active raid window remains open after the boss arrives. Units: minutes. Default: `12`.
- `RAIDS_TARGET_PER_DAY`: Target number of randomly scheduled raids per day. Set to `0` to disable random raid scheduling while still allowing owner-triggered raids. Default: `0`.
- `RAIDS_MIN_GAP_MINUTES`: Minimum gap between raid announcements. Units: minutes. Default: `180`.
- `RAIDS_RETRY_DELAY_SECONDS`: Retry delay after a skipped or failed random raid trigger. Units: seconds. Default: `600`.
- `RAIDS_JITTER_RATIO`: Random scheduling jitter ratio used by the raid scheduler. Default: `0.35`.
- `RAIDS_QUIET_HOURS_START`: Quiet-hours start time in `HH:MM` 24-hour format for random raids. Default: `23:00`.
- `RAIDS_QUIET_HOURS_END`: Quiet-hours end time in `HH:MM` 24-hour format for random raids. Default: `08:00`.
- `RAIDS_QUIET_HOURS_TIMEZONE`: IANA timezone used for raid quiet hours. Default: `Europe/Helsinki`.

Use placeholder values in `.env.example`, keep your real `.env` private, and do not commit real tokens or IDs you consider sensitive.

## Data Storage

The bot stores game data in `./data/rolly-bot.sqlite`.

## Game Data

Rolly keeps the real spoilery game data outside the public app repository.

- Public repo: `rolly-bot`
- Private companion repo: `rolly-data`

At startup, the bot loads gameplay data in this order:

1. `ROLLY_DATA_DIR`
2. `./rolly-data`
3. `./example-data/rolly-data`

A valid data directory is expected to contain these files:

- `achievements.json`
- `casino.v1.json`
- `dice-balance.json`
- `items.v1.json`
- `pvp.json`
- `raids.json`
- `random-events-balance.json`
- `random-events.v1.json`

The committed files under [example-data/rolly-data/](example-data/rolly-data/) are safe public examples only. They keep the repo understandable, document the current data shape, and let the bot run locally when you intentionally use example data, but they are not meant to mirror production values.

This README only covers how gameplay data is discovered and used at runtime. For the file-by-file data contract and authoring details, start here instead:

- [example-data/rolly-data/README.md](example-data/rolly-data/README.md) for the high-level layout
- [example-data/rolly-data/AUTHORING.md](example-data/rolly-data/AUTHORING.md) for the authoring guide
- `example-data/rolly-data/*.md` for per-file docs

If the app falls back to `example-data`, it starts normally and prints a warning so you can tell you are not using private gameplay data.

Random events and raids are inactive by default. Each feature starts only after its channel ID is configured.

If `./rolly-data` or `ROLLY_DATA_DIR` points to a git checkout, `/self-update` will pull that repo too before rebuilding.

## Commands

- `/dice` rolls your current dice set, handles level-ups, rewards, charge rolls, temporary effects, and achievements. If you use it inside an active raid thread after joining the raid, the same roll also deals raid damage equal to the total pips rolled.
- `/dice-prestige` manages prestige progression and active prestige selection.
- `/dice-casino` opens the casino panel for Exact Roll, Push Your Luck, Blackjack, and Dice Poker.
- `/dice-shop` lets players spend Pips on shop items and build an inventory.
- `/dice-inventory` shows owned items and lets players use them.
- `/dice-bans` configures banned values on your current dice setup.
- `/dice-pvp` creates and resolves PvP dice duels.
- `/dice-achievements` lists unlocked dice achievements.
- `/dice-analytics` shows progression and PvP stats.
- `/dice-admin` exposes owner-only dice admin tools, including random-event controls, raid lifecycle controls, and effect cleanup. It is Discord admin-gated and guild-only so regular users should not see it in the command picker.
- `/self-update` pulls the latest code, optionally runs `npm install`, refreshes `rolly-data` when configured as a git checkout, rebuilds, and redeploys commands. It is Discord admin-gated and guild-only so regular users should not see it in the command picker.

## Raids

Raids are timed co-op server events with a signup phase and a separate combat phase.

- A raid is announced in the configured raid channel before it starts.
- Players opt in with the join button during the signup window.
- When the timer hits zero, Rolly posts a fresh boss message and opens a thread from it.
- Joined players attack by using normal `/dice` rolls inside that raid thread.
- The boss HP is updated on the thread starter message, and the fight ends on kill or timeout.
- On success, each joined raider who landed at least one hit earns the full pip payout for that boss level plus a normal `/dice` roll-pass buff whose magnitude and duration scale from boss level. Joined raiders who never hit do not get the clear reward.

## Architecture

Rolly is a pragmatic domain-driven modular monolith.

- `src/app/` contains the composition root and Discord runtime wiring.
- `src/dice/<context>/` contains the source-of-truth gameplay code. Main contexts are progression, economy, inventory, casino, PvP, analytics, admin, random-events, and raids.
- Each context follows the same basic split:
  `domain/` for rules and value types,
  `application/` for use cases and ports,
  `infrastructure/` for SQLite and runtime adapters,
  `interfaces/discord/` for slash commands, buttons, and presenters.
- `src/system/self-update/` follows the same application/infrastructure/interfaces split as the dice contexts.
- `src/shared-kernel/` contains small, stable shared architecture primitives such as action-view models.
- `src/shared/` contains shared infrastructure such as db, env, config, and cross-cutting helpers.
- `src/rolly-data/` loads and validates gameplay data.

Important rules:

- New feature work should start in the owning `src/dice/<context>/` folder.
- Slash commands and button handlers are registered explicitly in [src/app/discord/command-registry.ts](src/app/discord/command-registry.ts). Command discovery is not filesystem-based.
- Keep `application/` and `domain/` code free of Discord runtime and infrastructure dependencies. Wire concrete adapters in `infrastructure/` or `app/`.
- Contributor-specific implementation guardrails live in [AGENTS.md](AGENTS.md).

## Project Layout

- [src/app/bootstrap/](src/app/bootstrap/) contains the startup entrypoints used by [src/index.ts](src/index.ts) and [src/deploy-commands.ts](src/deploy-commands.ts).
- [src/app/discord/](src/app/discord/) contains the Discord runtime, interaction helpers, button router, and explicit command registry.
- [src/dice/progression/](src/dice/progression/), [src/dice/economy/](src/dice/economy/), [src/dice/inventory/](src/dice/inventory/), [src/dice/casino/](src/dice/casino/), [src/dice/pvp/](src/dice/pvp/), [src/dice/analytics/](src/dice/analytics/), [src/dice/admin/](src/dice/admin/), [src/dice/random-events/](src/dice/random-events/), and [src/dice/raids/](src/dice/raids/) are the main gameplay contexts.
- [src/dice/\*/infrastructure/sqlite/services.ts](src/dice/progression/infrastructure/sqlite/services.ts) files are the adapter entrypoints that build use cases from SQLite repositories and shared unit-of-work wiring.
- [src/system/self-update/](src/system/self-update/) contains the self-update application use case, infrastructure command runner, and owner-only Discord command.
- [src/shared/](src/shared/) contains shared infrastructure such as db, config, env, and cross-cutting helpers.
- [src/shared-kernel/](src/shared-kernel/) contains shared architecture primitives and types.
- [src/rolly-data/](src/rolly-data/) loads and validates gameplay data.
- [eslint.config.js](eslint.config.js) enforces the current architecture guardrails.

## Adding Features

When adding a new feature, the shortest path is usually:

1. Pick the owning context under `src/dice/<context>/`.
2. Put rules and domain types in `domain/`, orchestration in `application/`, adapters in `infrastructure/`, and Discord-specific parsing and rendering in `interfaces/discord/`.
3. For SQLite-backed flows, add or extend a repository/service under `infrastructure/sqlite/` and wire the use case through that context's `services.ts`.
4. Register new slash commands or button handlers in [src/app/discord/command-registry.ts](src/app/discord/command-registry.ts).
5. If you change env vars, command shapes, or `rolly-data` contracts, update the related docs and deployment flow in the same change.

## Development

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run format
npm run format:check
npm run validate
```

`dist/` is generated by `npm run build`. Do not edit generated files directly.

CI runs `npm run format:check`, `npm run lint`, and `npm run typecheck` on every push and pull request. `npm run validate` is the local equivalent.

If you want the same checks to run automatically before each push, install the repo-managed git hook once:

```bash
npm run hooks:install
```

When you add or change environment variables or the `rolly-data` file contract, update `.env.example`, `README.md`, `example-data/rolly-data/*.json`, and the matching `example-data/rolly-data/*.md` authoring docs in the same change.
