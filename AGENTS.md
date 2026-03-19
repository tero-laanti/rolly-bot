# Rolly Development Guidelines

This file contains repository-specific guidance for future implementers working on Rolly.

## Product Scope

- Rolly is a Discord dice game with supporting random events, progression systems, and an owner-only self-update command.
- Current user-facing commands are `/dice`, `/dice-prestige`, `/dice-bans`, `/dice-shop`, `/dice-inventory`, `/dice-pvp`, `/dice-achievements`, `/dice-analytics`, `/dice-admin`, and `/self-update`.
- Random events are part of the core product, not side infrastructure.
- Fame and pips are part of the live game model. They are stored in the `balances` table and are used by gameplay systems.
- Use `Rolly` for human-facing product copy and `rolly-bot` for package, repo, and filesystem identifiers when appropriate.

## Coding Style

- Write self-documenting code with clear variable and function names.
- Prefer extracting complex logic into well-named functions over adding comments.
- Follow existing patterns before introducing new abstractions.
- Prefer plain functions and objects over classes.
- Use composition and modules over inheritance-heavy designs.
- Keep Discord command files focused on Discord interaction flow; move reusable game logic into context `application/`, `domain/`, and `infrastructure/` modules.

## Project Structure

### Runtime and Entrypoints

- Source lives in `src/`; do not edit `dist/` directly.
- Commands must export `data` and `execute`.
- Discord command adapters live under `<context>/interfaces/discord/commands/`.
- `src/app/discord/command-registry.ts` is the source of truth for registered slash commands and button handlers. Do not reintroduce filesystem-based command scanning.
- `src/index.ts` and `src/deploy-commands.ts` are thin wrappers around `src/app/bootstrap/`.
- `src/app/` contains the composition root and Discord runtime wiring.

### Context-First Architecture

- `src/dice/<context>/` is the primary architecture. New feature work should land in the owning context.
- Inside a context, use `domain/` for rules and value types, `application/` for use cases and ports, `infrastructure/` for adapters, and `interfaces/discord/` for Discord-specific parsing and rendering.
- `src/dice/economy/application/ports.ts` defines the Fame/Pips repository contract, `src/dice/economy/domain/balance.ts` holds shared economy value types, and `src/dice/economy/infrastructure/sqlite/balance-repository.ts` is the current SQLite implementation.
- `src/dice/random-events/domain/` is the source of truth for random-event contracts consumed outside the runtime implementation, including `rolly-data` validation.
- `src/dice/random-events/application/ports.ts` owns the random-event admin contracts consumed by other contexts.
- `src/dice/random-events/infrastructure/` is the source of truth for random-event runtime wiring, admin control, and scheduler logic.
- `src/dice/progression/domain/`, `src/dice/inventory/domain/`, `src/dice/pvp/domain/`, and `src/dice/analytics/domain/` are the source-of-truth gameplay domains.
- For SQLite-backed command flows, prefer the `infrastructure/sqlite/services.ts` builders for each context. Command adapters should build use cases there instead of passing `getDatabase()` into application modules.
- New application code should depend on context ports plus `UnitOfWork`, not `shared/db`.
- Keep context `application/` and `domain/` code free of `infrastructure/` and `interfaces/` imports. Wire adapters in `infrastructure/` or `app/`.
- For interactive Discord flows, prefer this split:
  `interfaces/discord/buttons/` parses and encodes button ids,
  `application/` returns pure view models,
  `interfaces/discord/presenters/` renders `discord.js` components.
- `src/shared-kernel/application/action-view.ts` is the shared model for button-driven application view results, including reply, update, and edit flows.
- `src/app/discord/render-action-result.ts` is the shared Discord renderer for action-view results.
- `src/app/discord/render-action-button-rows.ts` is the shared Discord renderer for button-row specs.

### Shared and Compatibility Boundaries

- `src/shared-kernel/` contains stable shared types and architectural primitives.
- `src/shared/` contains shared infrastructure such as db, config, env, and remaining cross-cutting helpers.
- `src/rolly-data/` is the boundary for hidden gameplay data loading and validation.
- `src/system/self-update/` follows the same application/infrastructure/interfaces split as the dice contexts.
- `src/types/` contains shared types and module augmentation.
- `src/dice/progression/application/manage-prestige/use-case.ts`, `src/dice/progression/application/manage-bans/use-case.ts`, `src/dice/progression/application/roll-dice/use-case.ts`, `src/dice/inventory/application/manage-shop/use-case.ts`, `src/dice/inventory/application/manage-inventory/use-case.ts`, `src/dice/inventory/application/use-item/use-case.ts`, `src/dice/pvp/application/manage-challenge/use-case.ts`, and `src/dice/admin/application/manage-admin/use-case.ts` are the reference examples for the current context-first use-case patterns.
- `eslint.config.js` contains architecture guardrails for context-first modules. When you add new files under context `application/` or `domain/`, keep them free of Discord runtime imports, and keep new `application/` code free of direct `shared/db` imports.

## Feature Workflow

When implementing a new feature:

1. Pick the owning context under `src/dice/<context>/`.
2. Put core rules and value types in `domain/`.
3. Add use cases and ports in `application/`.
4. Add SQLite, scheduler, or other technical adapters in `infrastructure/`.
5. Keep Discord parsing and rendering in `interfaces/discord/`.
6. Register slash commands and button handlers in `src/app/discord/command-registry.ts`.
7. If env vars, command contracts, or `rolly-data` contracts change, update the matching docs and deployment flow in the same change.

## Gameplay and Data

- Treat schema changes carefully. Existing SQLite data should remain compatible unless a destructive change is explicitly approved.
- Prefer additive schema changes in [src/shared/db/schema.ts](src/shared/db/schema.ts).
- Changes to fame/pips, prestige, bans, PvP effects, analytics, temporary effects, or random-event state can affect progression and should be reviewed as game-state changes, not just refactors.
- Real gameplay content and tuning live outside the public app repo in the private `rolly-data` repository.
- Do not hide tunable gameplay numbers or player-facing generated content pools in source files. If designers may want to tune it, or if it affects live gameplay feel, put it in `rolly-data` with matching validation and docs.
- Data source resolution order is `ROLLY_DATA_DIR`, then `./rolly-data`, then `./example-data/rolly-data` only when `ROLLY_ALLOW_EXAMPLE_DATA=true`.
- The current `rolly-data` contract is `achievements.json`, `casino.v1.json`, `dice-balance.json`, `items.v1.json`, `pvp.json`, `raids.json`, `random-events-balance.json`, and `random-events.v1.json`.
- Keep public example data safe to expose. Do not copy production achievements, tuning, or random-event content back into tracked source files or `example-data/`.
- Do not publish exact private repository URLs, clone commands, or other private infrastructure identifiers in public docs.
- If the `rolly-data` schema or loader behavior changes, update `src/rolly-data/`, `rolly-data/`, `example-data/rolly-data/*.json`, the matching `example-data/rolly-data/*.md` authoring docs, `.env.example`, and `README.md` together.
- If a command name, description, or options change, update the command deployment flow and remind the user to run `npm run deploy:commands`.

## TypeScript

- Prefer `type` for new shapes.
- Use `interface` only for module augmentation or when required by an external API.
- Use `import type` for type-only imports.
- Prefer `const` function expressions for new code unless an API requires a declaration.

## Comments

- Only add comments for non-obvious, complex, or surprising code.
- Before adding a comment, ask whether a developer would actually be confused without it.

## Environment and Public Repo Hygiene

- Every environment variable used by the app must be documented in both `.env.example` and `README.md`.
- For each env var, document whether it is required, what it controls, and any important defaults or units.
- Use safe placeholder values in tracked files. Never commit real secrets.
- Keep secrets in `.env` and keep large hidden gameplay data in `rolly-data`, not in environment variables.
- If a new env var is introduced, update `.env.example` and `README.md` in the same change.
- Owner-only behavior depends on `DISCORD_OWNER_ID`; document any new owner-only commands clearly.

## Testing and Validation

- Default verification for code changes: `npm run build`, `npm run typecheck`, and `npm run format:check`.
- Run `npm run lint` when touching broader TypeScript structure or configs.
- Prefer manual Discord validation for behavior-heavy changes such as dice progression, PvP flows, random events, admin panels, and self-update behavior.
- Unit tests are optional. Add them when logic is complex enough that tests improve clarity or confidence.

## Planning

- Use spec files only for non-trivial tasks: multi-file features, gameplay changes, schema changes, larger refactors, or work with unclear requirements.
- Skip specs for small, obvious, or single-file changes when the implementation path is straightforward.
- Put temporary spec files in `specs/` and delete them after implementation is complete.
