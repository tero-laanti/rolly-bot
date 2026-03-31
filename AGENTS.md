# Rolly Development Guidelines

Repo-specific guidance for working on Rolly.

## Product Scope

- Rolly is a Discord dice game with progression, random events, casino games, raids, and owner-only admin/update tools.
- User-facing commands are `/roll`, `/prestige`, `/bans`, `/casino`, `/shop`, `/inventory`, `/pvp`, `/achievements`, `/stats`, `/admin`, and `/self-update`.
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
- Discord message content must stay within the 2,000-character limit. When composing replies or summaries from variable-length gameplay data, budget for the full message and cap or compact unbounded sections before appending them.

## Project Structure

### Runtime and Entrypoints

- Source lives in `src/`; do not edit `dist/` directly.
- Commands must export `data` and `execute`.
- Discord command adapters live under `<context>/interfaces/discord/commands/`.
- `src/app/discord/command-registry.ts` lists the registered slash commands and button handlers. Command registration is explicit rather than filesystem-based.
- `src/index.ts` and `src/deploy-commands.ts` are thin wrappers around `src/app/bootstrap/`.
- `src/app/` contains the top-level bot bootstrap and shared Discord runtime wiring.

### Context-First Architecture

- `src/dice/<context>/` is the primary architecture. New feature work should land in the owning context.
- Inside a context, use `domain/` for rules and value types, `application/` for use cases and ports, `infrastructure/` for adapters, and `interfaces/discord/` for Discord-specific parsing and rendering when that split fits the context cleanly.
- `src/dice/economy/application/ports.ts` defines the Fame/Pips repository contract, `src/dice/economy/domain/balance.ts` holds shared economy value types, and `src/dice/economy/infrastructure/sqlite/balance-repository.ts` is the SQLite implementation.
- `src/dice/random-events/domain/` defines the random-event contracts used outside the runtime implementation, including `rolly-data` validation.
- `src/dice/random-events/application/ports.ts` defines the random-event admin contracts used by other contexts.
- `src/dice/random-events/infrastructure/` handles runtime wiring, admin control, and scheduler logic. Its `interfaces/discord/` folder is intentionally narrower and holds Discord-specific button-id, prompt-window, and interaction helpers rather than slash commands.
- `src/dice/raids/infrastructure/` likewise owns the live raid runtime and scheduler-oriented Discord orchestration, while `src/dice/raids/interfaces/discord/` holds prompt and button-id helpers.
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

### Shared Boundaries

- `src/shared-kernel/` contains stable shared types and architectural primitives.
- `src/shared/` contains shared infrastructure such as db, config, env, and remaining cross-cutting helpers.
- `src/rolly-data/` loads and validates gameplay data.
- `src/system/self-update/` follows the same application/infrastructure split, with its owner-only Discord command under `interfaces/discord/`.
- `src/types/` contains shared types and module augmentation.
- `src/dice/progression/application/manage-prestige/use-case.ts`, `src/dice/progression/application/manage-bans/use-case.ts`, `src/dice/progression/application/roll/use-case.ts`, `src/dice/inventory/application/manage-shop/use-case.ts`, `src/dice/inventory/application/manage-inventory/use-case.ts`, `src/dice/inventory/application/use-item/use-case.ts`, `src/dice/pvp/application/manage-challenge/use-case.ts`, and `src/dice/admin/application/manage-admin/use-case.ts` are the reference examples for the context-first use-case patterns.
- `eslint.config.js` contains architecture guardrails for the covered context-first modules. When you add new files under context `application/` or `domain/`, keep them free of Discord runtime imports, and keep new `application/` code free of direct `shared/db` imports.

## Feature Workflow

When implementing a new feature:

1. Pick the owning context under `src/dice/<context>/`.
2. Put core rules and value types in `domain/`.
3. Add use cases and ports in `application/`.
4. Add SQLite, scheduler, or other technical adapters in `infrastructure/`.
5. Keep Discord-specific parsing, presenters, prompt builders, and button ids in `interfaces/discord/` when that split fits the context. Keep long-lived runtimes and schedulers in `infrastructure/`.
6. Register slash commands and button handlers in `src/app/discord/command-registry.ts`.
7. If env vars, command contracts, or `rolly-data` contracts change, update the matching docs and deployment flow in the same change.

## Gameplay and Data

- Treat schema changes carefully. Prefer additive changes in [src/shared/db/schema.ts](src/shared/db/schema.ts) unless a broader storage change is explicitly approved.
- Changes to fame/pips, prestige, bans, PvP effects, analytics, temporary effects, or random-event state can affect progression and should be reviewed as game-state changes, not just refactors.
- Real gameplay content and tuning live outside the public app repo in the private `rolly-data` repository.
- If designers may want to tune a gameplay number or player-facing content pool, keep it in `rolly-data` with matching validation and docs.
- Data source resolution order is `ROLLY_DATA_DIR`, then `./rolly-data`, then `./example-data/rolly-data`.
- The `rolly-data` contract is `achievements.json`, `casino.v1.json`, `dice-balance.json`, `items.v1.json`, `pvp.json`, `raids.json`, `random-events-balance.json`, and `random-events.v1.json`.
- Keep public example data safe to expose. Do not copy private achievements, tuning, or random-event content back into tracked source files or `example-data/`.
- Do not publish exact private repository URLs, clone commands, or other private infrastructure identifiers in public docs.
- If the `rolly-data` schema or loader behavior changes, update `src/rolly-data/`, `rolly-data/`, `example-data/rolly-data/*.json`, the matching `example-data/rolly-data/*.md` authoring docs, `.env.example`, [README.md](README.md), and [docs/development.md](docs/development.md) together.
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

- Every environment variable used by the app must be documented in `.env.example`, named in [README.md](README.md), and fully described in [docs/development.md](docs/development.md).
- For each env var, document whether it is required, what it controls, and any important defaults or units in `.env.example` and [docs/development.md](docs/development.md).
- Use safe placeholder values in tracked files. Never commit real secrets.
- Keep secrets in `.env` and keep large hidden gameplay data in `rolly-data`, not in environment variables.
- If a new env var is introduced, update `.env.example`, [README.md](README.md), and [docs/development.md](docs/development.md) in the same change.
- Owner-only behavior depends on `DISCORD_OWNER_ID`; document any new owner-only commands clearly.

## Testing and Validation

- Default verification for code changes: `npm run build`, `npm run typecheck`, and `npm run format:check`.
- Run `npm run lint` when touching broader TypeScript structure or configs.
- Prefer manual Discord validation for behavior-heavy changes such as dice progression, PvP flows, random events, admin panels, and self-update behavior.
- Unit tests are optional. Add them when logic is complex enough that tests improve clarity or confidence.

## Committing Guidelines

- Prefer small, reviewable commits with one clear purpose each.
- Split commits by concern when the changes are independently understandable. Do not split tightly coupled code and tests into separate commits unless they still make sense on their own.
- Write commit subjects that describe the actual change, not the workflow around it. Avoid subjects such as `Fix review issues`, `Address feedback`, or `Misc cleanup`.
- Use the imperative mood in commit subjects and focus on the behavioral change or constraint being introduced.
- Add a commit body when the subject alone does not explain the reason, the tradeoff, or the important behavior change.
- In commit bodies, explain why the change exists and what behavior changed. Do not restate the diff file by file.
- If a commit adds a fail-fast guard, pagination, validation, schema change, or gameplay behavior change, call that out directly in the subject or body.
- Follow-up commits from review should still describe the concrete fix they contain, not the fact that they came from review.

## Planning

- Use spec files only for non-trivial tasks: multi-file features, gameplay changes, schema changes, larger refactors, or work with unclear requirements.
- Skip specs for small, obvious, or single-file changes when the implementation path is straightforward.
- Put temporary spec files in `specs/` and delete them after implementation is complete.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd create --type=epic --title "..."         # Create a parent epic
bd create --type=task --parent <epic-id> --title "..."  # Create a task under an epic
bd create --type=task --parent <task-id> --title "..."  # Create a child task under a large task
bd children <id>      # View child tasks for an epic or task
bd epic status <id>   # Check epic completion status
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Structure work with hierarchy by default: use `epic` for larger initiatives, `task` for concrete deliverables, and child tasks/sub-tasks when a task is still too large to complete cleanly in one issue
- For non-trivial work, create the hierarchy before writing code: epic first, then child tasks, then deeper child tasks only when the direct task is still too large
- Use `--parent <id>` to attach a task to its epic or parent task, `bd children <id>` to inspect the tree, and `bd epic status <id>` to review epic progress
- Keep leaf issues actionable and independently completable; avoid extra nesting unless it improves execution or handoff clarity
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files
- Beads runs on Dolt server mode. Treat concurrency and lock incidents as server/recovery problems first.
- For Beads/Dolt recovery, prefer the supported sequence: `bd dolt killall`, `bd bootstrap` or `bd backup restore`, then `bd doctor`.
- If `bd` still fails after that and no live `dolt` process is holding `.beads/dolt`, removing stale Dolt lock files under `.beads/dolt/**/LOCK` is an acceptable fallback before retrying startup.
- If the local Dolt working copy is still broken after lock cleanup, move `.beads/dolt` aside into a timestamped `dolt-corrupt-*` directory and rerun `bd bootstrap` to rebuild from the configured remote or backup.
- If sandboxed `bd` commands cannot reach the local Dolt server on `127.0.0.1`, rerun the needed `bd` command with escalation instead of assuming the server is actually down.
- If `bd backup export-git --force` is needed for off-machine recovery, use it. The repo hook skips normal app validation on the `beads-backup` branch so backup pushes can succeed from the temporary worktree.
- If repeated per-repo Dolt startup churn causes problems, consider `bd init --shared-server` for future setups instead of inventing custom lockfile cleanup.

### Hierarchy Pattern

```bash
# 1. Create the parent epic for a larger feature or refactor
bd create --type=epic --title "Improve random event admin flow"

# 2. Create the main implementation tasks under the epic
bd create --type=task --parent <epic-id> --title "Refactor admin use case"
bd create --type=task --parent <epic-id> --title "Update Discord presenters"

# 3. If one task is still too large, split it into child tasks
bd create --type=task --parent <task-id> --title "Add repository port"
bd create --type=task --parent <task-id> --title "Wire SQLite adapter"

# 4. Inspect progress
bd children <epic-or-task-id>
bd epic status <epic-id>
```

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
