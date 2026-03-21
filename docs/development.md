# Development

Read [README.md](../README.md) for the product overview and [architecture.md](architecture.md) for the codemap. This guide is the practical workflow for running, validating, and updating Rolly locally.

## Prerequisites

- Node.js `24.14.0` from [.nvmrc](../.nvmrc)
- A Discord application with a bot token and application ID
- An owner Discord user ID for `/dice-admin` and `/self-update`
- Optional: a private `rolly-data` checkout for real gameplay content

## Local Setup

```bash
nvm use
npm install
cp .env.example .env
```

Then set at least these values in `.env`:

- `DISCORD_TOKEN`
- `DISCORD_OWNER_ID`
- `DISCORD_CLIENT_ID` before running `npm run deploy:commands`
- `DISCORD_GUILD_ID` if you want fast guild-scoped command deployment during development

If you have a private `rolly-data` checkout, either place it in `./rolly-data` or point `ROLLY_DATA_DIR` at it. If you do neither, Rolly falls back to the public examples in [example-data/rolly-data/](../example-data/rolly-data/) and prints a startup warning.

## Configuration Reference

[`.env.example`](../.env.example) is the source of truth for placeholders and naming. This section is the human-readable reference.

### Core Discord configuration

- `DISCORD_TOKEN`: Required. Bot token from the Discord Developer Portal.
- `DISCORD_OWNER_ID`: Required. Discord user ID allowed to run owner-only commands such as `/self-update` and `/dice-admin`.
- `DISCORD_CLIENT_ID`: Required for `npm run deploy:commands`. Discord application ID used when registering slash commands.
- `DISCORD_GUILD_ID`: Optional. Development guild/server ID for fast command deployment. If omitted, commands are deployed globally.

### Gameplay data

- `ROLLY_DATA_DIR`: Optional. Absolute or repo-relative path to a private `rolly-data` checkout. If omitted, Rolly tries `./rolly-data` and then [example-data/rolly-data/](../example-data/rolly-data/). The data directory is expected to include `achievements.json`, `casino.v1.json`, `dice-balance.json`, `items.v1.json`, `pvp.json`, `raids.json`, `random-events-balance.json`, and `random-events.v1.json`.

### Random events

- `RANDOM_EVENTS_CHANNEL_ID`: Optional. Channel ID where random events are posted. Random events stay inactive until this is set.
- `RANDOM_EVENTS_TARGET_PER_DAY`: Optional. Target number of random events per day. Default: `10`.
- `RANDOM_EVENTS_MIN_GAP_MINUTES`: Optional. Minimum time between random-event opportunities. Units: minutes. Default: `45`.
- `RANDOM_EVENTS_MAX_ACTIVE`: Optional. Maximum number of active random events at once. Default: `1`.
- `RANDOM_EVENTS_RETRY_DELAY_SECONDS`: Optional. Retry delay after a failed or skipped trigger. Units: seconds. Default: `300`.
- `RANDOM_EVENTS_JITTER_RATIO`: Optional. Scheduler jitter ratio. Default: `0.35`.
- `RANDOM_EVENTS_QUIET_HOURS_START`: Optional. Quiet-hours start in `HH:MM` 24-hour format. Default: `23:00`.
- `RANDOM_EVENTS_QUIET_HOURS_END`: Optional. Quiet-hours end in `HH:MM` 24-hour format. Default: `08:00`.
- `RANDOM_EVENTS_QUIET_HOURS_TIMEZONE`: Optional. IANA timezone for quiet hours. Default: `Europe/Helsinki`.

### Raids

- `RAIDS_CHANNEL_ID`: Optional. Channel ID for raid announcements and active raid posts. Raids stay inactive until this is set.
- `RAIDS_JOIN_LEAD_MINUTES`: Optional. Lead time between announcement and raid start. Units: minutes. Default: `30`.
- `RAIDS_ACTIVE_DURATION_MINUTES`: Optional. Active raid duration after the boss arrives. Units: minutes. Default: `12`.
- `RAIDS_TARGET_PER_DAY`: Optional. Target number of randomly scheduled raids per day. Set `0` to disable random scheduling while keeping owner-triggered raids available. Default: `0`.
- `RAIDS_MIN_GAP_MINUTES`: Optional. Minimum gap between raid announcements. Units: minutes. Default: `180`.
- `RAIDS_RETRY_DELAY_SECONDS`: Optional. Retry delay after a skipped or failed random raid trigger. Units: seconds. Default: `600`.
- `RAIDS_JITTER_RATIO`: Optional. Scheduler jitter ratio. Default: `0.35`.
- `RAIDS_QUIET_HOURS_START`: Optional. Quiet-hours start in `HH:MM` 24-hour format for random raids. Default: `23:00`.
- `RAIDS_QUIET_HOURS_END`: Optional. Quiet-hours end in `HH:MM` 24-hour format for random raids. Default: `08:00`.
- `RAIDS_QUIET_HOURS_TIMEZONE`: Optional. IANA timezone for raid quiet hours. Default: `Europe/Helsinki`.

## Start the Bot

```bash
npm run deploy:commands
npm run dev
```

Useful variants:

- `npm run start`: run the already-built bot without TypeScript watch mode
- `npm run build`: compile `src/` into `dist/`

When command names, descriptions, or options change, run `npm run deploy:commands` again. The registry is explicit, so changes are only live after the deploy step succeeds.

## Data and Runtime Notes

- Runtime state is stored in `./data/rolly-bot.sqlite`.
- Gameplay data loads in this order: `ROLLY_DATA_DIR`, `./rolly-data`, then [example-data/rolly-data/](../example-data/rolly-data/).
- The expected data files are `achievements.json`, `casino.v1.json`, `dice-balance.json`, `items.v1.json`, `pvp.json`, `raids.json`, `random-events-balance.json`, and `random-events.v1.json`.
- Public contract docs live in [example-data/rolly-data/README.md](../example-data/rolly-data/README.md) and [example-data/rolly-data/AUTHORING.md](../example-data/rolly-data/AUTHORING.md).
- Random events are inactive until `RANDOM_EVENTS_CHANNEL_ID` is set.
- Raids are inactive until `RAIDS_CHANNEL_ID` is set.
- `dist/` is generated output. Do not edit it directly.

If `./rolly-data` or `ROLLY_DATA_DIR` points to a git checkout, `/self-update` refreshes that repo before rebuilding and redeploying commands.

## Day-to-Day Commands

```bash
npm run dev
npm run build
npm test
npm run typecheck
npm run lint
npm run format
npm run format:check
npm run validate
```

Notes:

- `npm run validate` is the local equivalent of the main CI checks.
- `npm run hooks:install` installs the repo-managed git hook if you want checks before pushes.
- For code changes, the default verification bar is `npm run build`, `npm run typecheck`, and `npm run format:check`.
- Run `npm run lint` when you touch broader TypeScript structure or config.
- Behavior-heavy features such as progression, PvP, random events, raids, admin panels, and self-update benefit from manual Discord validation.

## Documentation Checklist

- If you add or change an environment variable, update [README.md](../README.md), [.env.example](../.env.example), and this guide in the same change.
- If you change the `rolly-data` contract or loader behavior, update [src/rolly-data/](../src/rolly-data/), [example-data/rolly-data/](../example-data/rolly-data/), [README.md](../README.md), this guide, and [.env.example](../.env.example) together.
- If command names, descriptions, or options change, remind maintainers to run `npm run deploy:commands`.
