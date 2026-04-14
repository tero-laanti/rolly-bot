# Development

Read [README.md](../README.md) for the product overview and [architecture.md](architecture.md) for the codemap. This guide is the practical workflow for running, validating, and updating Rolly locally.

## Prerequisites

- Node.js `24.14.0` from [.nvmrc](../.nvmrc)
- A Discord application with a bot token and application ID
- An owner Discord user ID for `/admin` and `/self-update`
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
- `DISCORD_OWNER_ID`: Required. Discord user ID allowed to run owner-only commands such as `/self-update` and `/admin`.
- `DISCORD_CLIENT_ID`: Required for `npm run deploy:commands`. Discord application ID used when registering slash commands.
- `DISCORD_GUILD_ID`: Optional. Development guild/server ID for fast command deployment. If omitted, commands are deployed globally.

### Gameplay data

- `ROLLY_DATA_DIR`: Optional. Absolute or repo-relative path to a private `rolly-data` checkout. If omitted, Rolly tries `./rolly-data` and then [example-data/rolly-data/](../example-data/rolly-data/). The data directory is expected to include `achievements.json`, `casino.v1.json`, `contracts.v2.json`, `dice-balance.json`, `intro-posts.v1.json`, `items.v1.json`, `pvp.json`, `raids.json`, `world-boss.v1.json`, `random-events-balance.json`, and `random-events.v1.json`.
- `random-events.v1.json` can reference consumable rewards from `items.v1.json`; startup validation rejects missing or non-consumable item ids.
- Startup validation also rejects authored gameplay text that would overflow the Discord surfaces used by shop, raids, random events, or World Boss fights. Runtime-only overflow from live World Boss or raid state is trimmed when the message is rendered.
- `achievements.json` can include analytics-based milestones and optional role reward ids in private data. Those ids are safe placeholders in public examples and are useful when a server wants achievements to unlock roles or channels progressively.
- `achievements.json` can also include optional role reward unlock copy so the achievement announcement flow can tell players when newly granted roles may have opened gated channels or access.
- `contracts.v2.json` defines the Contract Master panel metadata plus Daily and Weekly difficulty pools. If it is missing from local `./rolly-data`, gameplay contracts hooks are disabled and `/contracts` shows an unavailable message instead of crashing the rest of the bot.
- `raids.json` defines authored raid tiers, static raid bosses, shared player-facing copy for the player-started raids flow, and optional per-tier Discord role rewards plus achievements-channel unlock text.

### Intro posts

- `INTRO_POST_CHANNEL_ID`: Optional. Channel ID where the bot manages startup-synced intro posts from `intro-posts.v1.json`. The feature stays inactive until this is set.

### Player-started raids

- `RAIDS_INSTANCE_CATEGORY_ID`: Optional. Discord category ID where the bot creates private raid instance channels. Player-started raids stay inactive until this and `RAIDS_TIER_BINDINGS_JSON` are set.
- `RAIDS_TIER_BINDINGS_JSON`: Optional. JSON object keyed by authored `raids.json` `tierId` values. Each entry must include a `panelChannelId` for the public tier panel and an `accessRoleId` for the Discord role allowed to start or join that tier. Example: `{"bronze":{"panelChannelId":"123","accessRoleId":"456"},"silver":{"panelChannelId":"789","accessRoleId":"012"}}`.

### Achievement posts

- `ACHIEVEMENTS_CHANNEL_ID`: Optional. Channel ID where the bot posts batched achievement unlock announcements. Achievements are still awarded when this is unset; only the announcement posts are skipped.

### Random events

- `RANDOM_EVENTS_CHANNEL_ID`: Optional. Channel ID where random events are posted. Random events stay inactive until this is set.
- `RANDOM_EVENTS_TARGET_PER_DAY`: Optional. Scheduler target for random-event opportunities across active (non-quiet) hours in a typical day. Default: `15`.
  Minimum-gap enforcement and max-active gating can still reduce the number of events that actually appear.
- `RANDOM_EVENTS_MIN_GAP_MINUTES`: Optional. Minimum time between random-event opportunities. Units: minutes. Default: `30`.
- `RANDOM_EVENTS_MAX_ACTIVE`: Optional. Maximum number of active random events at once. Default: `1`.
- `RANDOM_EVENTS_RETRY_DELAY_SECONDS`: Optional. Retry delay after a failed or skipped trigger. Units: seconds. Default: `300`.
- `RANDOM_EVENTS_JITTER_RATIO`: Optional. Scheduler jitter ratio. Default: `0.35`.
- `RANDOM_EVENTS_QUIET_HOURS_START`: Optional. Quiet-hours start in `HH:MM` 24-hour format. Default: `23:00`.
- `RANDOM_EVENTS_QUIET_HOURS_END`: Optional. Quiet-hours end in `HH:MM` 24-hour format. Default: `08:00`.
- `RANDOM_EVENTS_QUIET_HOURS_TIMEZONE`: Optional. IANA timezone for quiet hours. Default: `Europe/Helsinki`.

### World Boss (`WORLD_BOSS_*`)

- Player-facing copy uses `World Boss`, while internal identifiers remain `world-boss` (`WORLD_BOSS_*`, `world-boss.v1.json`, and runtime IDs).
- `WORLD_BOSS_CHANNEL_ID`: Optional. Channel ID for World Boss announcements and active World Boss posts. The World Boss runtime stays inactive until this is set.
- Successful World Boss clears also try to open a 15-minute Double Roll Rush thread from the resolved World Boss announcement. The bot needs permission to create public threads in `WORLD_BOSS_CHANNEL_ID`, send the kickoff message in that thread, and archive or lock it after expiry. If cleanup permissions are partial, the stored rush window still closes on time and stops granting gameplay effects.
- `WORLD_BOSS_JOIN_LEAD_MINUTES`: Optional. Lead time between announcement and World Boss start. Units: minutes. Default: `30`.
- `WORLD_BOSS_ACTIVE_DURATION_MINUTES`: Optional. Active World Boss duration after the boss arrives. Units: minutes. Default: `12`.
- `WORLD_BOSS_TARGET_PER_DAY`: Optional. Target number of randomly scheduled World Boss fights per day. Set `0` to disable random scheduling while keeping owner-triggered World Boss runs available. Default: `0`.
- `WORLD_BOSS_MIN_GAP_MINUTES`: Optional. Minimum gap between World Boss announcements. Units: minutes. Default: `180`.
- `WORLD_BOSS_RETRY_DELAY_SECONDS`: Optional. Retry delay after a skipped or failed random World Boss trigger. Units: seconds. Default: `600`.
- `WORLD_BOSS_JITTER_RATIO`: Optional. Scheduler jitter ratio. Default: `0.35`.
- `WORLD_BOSS_QUIET_HOURS_START`: Optional. Quiet-hours start in `HH:MM` 24-hour format for random World Boss scheduling. Default: `23:00`.
- `WORLD_BOSS_QUIET_HOURS_END`: Optional. Quiet-hours end in `HH:MM` 24-hour format for random World Boss scheduling. Default: `08:00`.
- `WORLD_BOSS_QUIET_HOURS_TIMEZONE`: Optional. IANA timezone for World Boss quiet hours. Default: `Europe/Helsinki`.

## Start the Bot

```bash
npm run deploy:commands
npm run dev
```

Useful variants:

- `npm run start`: run the already-built bot without TypeScript watch mode
- `npm run build`: compile the runtime bot into `dist/`

When command names, descriptions, or options change, run `npm run deploy:commands` again. The registry is explicit, so changes are only live after the deploy step succeeds.
Raid tier panels are not part of the slash-command registry. `raids.json`, `RAIDS_TIER_BINDINGS_JSON`, and raid panel copy changes go live after the bot restarts and the startup sync runs again.

## Data and Runtime Notes

- Runtime state is stored in `./data/rolly-bot.sqlite`.
- Gameplay data loads in this order: `ROLLY_DATA_DIR`, `./rolly-data`, then [example-data/rolly-data/](../example-data/rolly-data/).
- The expected data files are `achievements.json`, `casino.v1.json`, `contracts.v2.json`, `dice-balance.json`, `intro-posts.v1.json`, `items.v1.json`, `pvp.json`, `raids.json`, `world-boss.v1.json`, `random-events-balance.json`, and `random-events.v1.json`.
- World Boss balance is defined in `world-boss.v1.json` using a weighted random boss-level roll, per-level HP scaling, and a configurable prestige multiplier for joined-player strength locked at fight start. The public contract lives in [example-data/rolly-data/world-boss.v1.md](../example-data/rolly-data/world-boss.v1.md).
- A successful World Boss clear grants the normal clear reward and opens a temporary Double Roll Rush thread in the same channel. `/roll` only gets the rush double-roll buff inside that thread, and the rush uses the existing normal double-roll semantics rather than stacking past `×2`.
- Contracts are defined in `contracts.v2.json`. The authored contract includes Contract Master panel copy, cadence-specific difficulty pools, initial offers, refill offers, and Pip-only reward ladders. The public contract lives in [example-data/rolly-data/contracts.v2.md](../example-data/rolly-data/contracts.v2.md).
- Raids are defined in `raids.json`. The authored contract includes ordered tiers, static bosses, raid rewards, and shared panel or recruitment copy. The public contract lives in [example-data/rolly-data/raids.md](../example-data/rolly-data/raids.md).
- Public contract docs live in [example-data/rolly-data/README.md](../example-data/rolly-data/README.md) and [example-data/rolly-data/AUTHORING.md](../example-data/rolly-data/AUTHORING.md).
- Shop, raids, World Boss, and random-event payloads now fail fast on authored text that exceeds the Discord limits used by their live prompts.
- Managed intro posts are inactive until `INTRO_POST_CHANNEL_ID` is set.
- Player-started raids are inactive until both `RAIDS_INSTANCE_CATEGORY_ID` and `RAIDS_TIER_BINDINGS_JSON` are set.
- Achievement posts are inactive until `ACHIEVEMENTS_CHANNEL_ID` is set.
- Random events are inactive until `RANDOM_EVENTS_CHANNEL_ID` is set.
- World Boss runtime is inactive until `WORLD_BOSS_CHANNEL_ID` is set.
- `dist/` is generated output. Do not edit it directly.

If `./rolly-data` or `ROLLY_DATA_DIR` points to a git checkout, `/self-update` refreshes that repo before rebuilding and redeploying commands.

## Raid Setup And Validation

Use this checklist when shipping or validating player-started raid changes:

1. Set `RAIDS_INSTANCE_CATEGORY_ID`.
2. Set `RAIDS_TIER_BINDINGS_JSON` so every authored `raids.json` tier id has a public panel channel and access role.
3. Start the bot and confirm the startup logs report the raids runtime and tier panel sync instead of an inactive reason.
4. Check each configured raid panel channel in Discord and confirm the synced panel copy matches the authored tier and shared `raids.json` copy.
5. Start a raid from a public panel, choose a boss, and confirm the bot creates the private raid instance channel in the configured category.
6. Join and leave with a second eligible member to verify the recruitment prompt, party updates, and readiness gating.
7. Start the encounter and verify the fight prompt, resolution copy, and reward payout match the authored boss definition.
8. Restart the bot with an active recruiting run or encounter and confirm recovery republishes or resolves the raid cleanly.

Manual Discord validation is the expected bar for raid behavior changes because the shipped flow depends on Discord channels, buttons, roles, and restart recovery.
Run `npm run deploy:commands` only when slash command names, descriptions, or options change. Raid panel-only changes do not require command redeployment.

## World Boss Validation

Use this checklist when shipping or validating World Boss lifecycle changes:

1. Set `WORLD_BOSS_CHANNEL_ID` and confirm the bot can send messages plus create public threads in that channel.
2. Trigger a World Boss, join it, clear it, and confirm the resolved prompt links to a new Double Roll Rush thread.
3. Open the rush thread and confirm its kickoff message explains that `/roll` only gets the normal double-roll buff in that thread and shows when the rush ends.
4. Use `/roll` inside and outside the rush thread to confirm the buff only applies inside the rush space.
5. Restart the bot while the rush is still active and confirm the thread still grants the buff until expiry.
6. Let the rush expire and confirm the stored reward window stops applying even if Discord thread cleanup is partial or missing permissions.

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
- `npm test` compiles the full source tree into `dist-test/` before running the compiled Node test suite.
- `npm run typecheck` checks the full source tree without emitting JS.
- `npm run hooks:install` installs the repo-managed git hook if you want checks before pushes.
- For code changes, the default verification bar is `npm run build`, `npm run typecheck`, and `npm run format:check`.
- Run `npm run lint` when you touch broader TypeScript structure or config.
- Behavior-heavy features such as progression, PvP, random events, World Boss fights, admin panels, and self-update benefit from manual Discord validation.

## Documentation Checklist

- If you add or change an environment variable, update [README.md](../README.md), [.env.example](../.env.example), and this guide in the same change.
- If you change the `rolly-data` contract or loader behavior, update [src/rolly-data/](../src/rolly-data/), [example-data/rolly-data/](../example-data/rolly-data/), [README.md](../README.md), this guide, and [.env.example](../.env.example) together.
- If command names, descriptions, or options change, remind maintainers to run `npm run deploy:commands`.
- `/contracts` is part of the slash-command surface. After adding or changing it, run `npm run deploy:commands`.
- Player-started raids use startup-synced tier panels instead of a slash command. Update the raid setup and validation notes here when the panel flow, runtime wiring, or recovery expectations change.
