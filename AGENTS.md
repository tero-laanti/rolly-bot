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

- Source lives in `src/`; do not edit `dist/` directly.
- Commands must export `data` and `execute`.
- Discord command adapters live under `<context>/interfaces/discord/commands/`.
- `src/app/discord/command-registry.ts` is the source of truth for registered slash commands and button handlers. Do not reintroduce filesystem-based command scanning.
- `src/index.ts` and `src/deploy-commands.ts` are thin wrappers around `src/app/bootstrap/`.
- `src/app/` contains the composition root and Discord runtime wiring.
- `src/shared-kernel/` contains stable shared types and architectural primitives.
- `src/dice/<context>/` is the primary architecture. New feature work should land in the owning context.
- `src/dice/economy/domain/balance.ts` is the source of truth for Fame/Pips balance helpers. Do not add new imports from `src/shared/economy.ts`; that file is compatibility-only.
- `src/dice/random-events/domain/` is the source of truth for random-event contracts consumed outside the runtime implementation, including `rolly-data` validation.
- For interactive Discord flows, prefer this split:
  context `interfaces/discord/buttons/` parses and encodes button ids,
  context `application/` returns pure view models,
  context `interfaces/discord/presenters/` renders `discord.js` components.
- `src/shared-kernel/application/action-view.ts` is the shared model for button-driven application view results, including reply, update, and edit flows.
- `src/app/discord/render-action-result.ts` is the shared Discord renderer for action-view results.
- `src/app/discord/render-action-button-rows.ts` is the shared Discord renderer for button-row specs.
- `src/dice/progression/application/manage-prestige/use-case.ts`, `src/dice/progression/application/manage-bans/use-case.ts`, `src/dice/inventory/application/manage-shop/use-case.ts`, `src/dice/inventory/application/manage-inventory/use-case.ts`, `src/dice/pvp/application/manage-challenge/use-case.ts`, and `src/dice/admin/application/manage-admin/use-case.ts` are the reference examples for this pattern.
- `src/dice/core/` and `src/dice/features/` are legacy internals that still back some context modules during the migration. Prefer new code in the context-first paths unless you are extending existing legacy logic.
- `src/shared/` contains shared infrastructure such as db, config, env, and remaining cross-cutting helpers.
- `src/rolly-data/` is the boundary for hidden gameplay data loading and validation.
- `src/types/` contains shared types and module augmentation.
- `eslint.config.js` contains architecture guardrails for context-first modules. When you add new files under context `application/` or `domain/`, keep them free of Discord runtime imports.

## Gameplay and Data

- Treat schema changes carefully. Existing SQLite data should remain compatible unless a destructive change is explicitly approved.
- Prefer additive schema changes in [src/shared/db/schema.ts](src/shared/db/schema.ts).
- Changes to fame/pips, prestige, bans, PvP effects, analytics, temporary effects, or random-event state can affect progression and should be reviewed as game-state changes, not just refactors.
- Real gameplay content and tuning live outside the public app repo in the private `rolly-data` repository.
- Data source resolution order is `ROLLY_DATA_DIR`, then `./rolly-data`, then `./example-data/rolly-data` only when `ROLLY_ALLOW_EXAMPLE_DATA=true`.
- The current `rolly-data` contract is `achievements.json`, `dice-balance.json`, `items.v1.json`, and `random-events.v1.json`.
- Keep public example data safe to expose. Do not copy production achievements, tuning, or random-event content back into tracked source files or `example-data/`.
- Do not publish exact private repository URLs, clone commands, or other private infrastructure identifiers in public docs.
- If the `rolly-data` schema or loader behavior changes, update `src/rolly-data/`, `example-data/rolly-data/`, `.env.example`, and `README.md` together.
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

- Default verification for code changes: `npm run build` and `npm run typecheck`.
- Run `npm run lint` when touching broader TypeScript structure, configs, or formatting-sensitive areas.
- Prefer manual Discord validation for behavior-heavy changes such as dice progression, PvP flows, random events, admin panels, and self-update behavior.
- Unit tests are optional. Add them when logic is complex enough that tests improve clarity or confidence.

## Planning

- Use spec files only for non-trivial tasks: multi-file features, gameplay changes, schema changes, larger refactors, or work with unclear requirements.
- Skip specs for small, obvious, or single-file changes when the implementation path is straightforward.
- Put temporary spec files in `specs/` and delete them after implementation is complete.
