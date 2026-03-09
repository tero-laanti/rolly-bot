# Rolly Development Guidelines

This file contains repository-specific guidance for future implementers working on Rolly.

## Product Scope

- Rolly is a Discord dice game with supporting random events, progression systems, and an owner-only self-update command.
- Current user-facing commands are `/dice`, `/dice-prestige`, `/dice-bans`, `/dice-pvp`, `/dice-achievements`, `/dice-analytics`, `/dice-admin`, and `/self-update`.
- Random events are part of the core product, not side infrastructure.
- Fame and pips are part of the live game model. They are stored in the `balances` table and are used by gameplay systems.
- Use `Rolly` for human-facing product copy and `rolly-bot` for package, repo, and filesystem identifiers when appropriate.

## Coding Style

- Write self-documenting code with clear variable and function names.
- Prefer extracting complex logic into well-named functions over adding comments.
- Follow existing patterns before introducing new abstractions.
- Prefer plain functions and objects over classes.
- Use composition and modules over inheritance-heavy designs.
- Keep command files focused on Discord interaction flow; move reusable game logic and formatting helpers into `src/lib`.

## Project Structure

- Source lives in `src/`; do not edit `dist/` directly.
- Commands must export `data` (`SlashCommandBuilder`) and `execute`.
- `src/index.ts` loads commands, registers button handlers, and starts background runtime features.
- `src/deploy-commands.ts` registers slash commands.
- `src/lib/` contains shared runtime, database, config, and dice-system helpers.
- `src/types/` contains shared types and module augmentation.
- The `minigames` folder name is historical. In this repository it currently means dice-game domain code, not a grab bag of unrelated games.

## Gameplay and Data

- Treat schema changes carefully. Existing SQLite data should remain compatible unless a destructive change is explicitly approved.
- Prefer additive migrations in `src/lib/db/migrations.ts`.
- Changes to fame/pips, prestige, bans, PvP effects, analytics, temporary effects, or random-event state can affect progression and should be reviewed as game-state changes, not just refactors.
- Real gameplay content and tuning live outside the public app repo in the private `rolly-data` repository.
- Data source resolution order is `ROLLY_DATA_DIR`, then `./rolly-data`, then `./example-data/rolly-data` only when `ROLLY_ALLOW_EXAMPLE_DATA=true`.
- The current `rolly-data` contract is `achievements.json`, `dice-balance.json`, and `random-events.v1.json`.
- Keep public example data safe to expose. Do not copy production achievements, tuning, or random-event content back into tracked source files or `example-data/`.
- Do not publish exact private repository URLs, clone commands, or other private infrastructure identifiers in public docs.
- If the `rolly-data` schema or loader behavior changes, update `src/lib/rolly-data/`, `example-data/rolly-data/`, `.env.example`, and `README.md` together.
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
