# Spec: Full DDD Refactor for Rolly

## Status

Active migration plan. The phase-1 foundation was implemented on March 10, 2026:

- `src/app/bootstrap/` now owns startup and deploy entrypoints.
- `src/app/discord/command-registry.ts` is the explicit source of truth for slash commands and button handlers.
- Discord command adapters now live under context-first `interfaces/discord/commands/` folders.
- `src/shared-kernel/` now exists for stable shared architectural types.
- `src/dice/economy/domain/balance.ts` is now the economy source of truth, with `src/shared/economy.ts` kept as a compatibility re-export.
- `src/dice/random-events/domain/` now exposes random-event contracts for `rolly-data` and other external consumers.
- `eslint.config.js` now enforces basic architecture guardrails for the new context-first `application/` and `domain/` modules.
- Prestige and bans now use the target interaction pattern: interface button parsing, pure application view models, and Discord presenters.
- Shop and inventory now use the same interaction pattern, and the shared action-view contract now lives in `src/shared-kernel/application/action-view.ts`.
- PvP and admin now use the same interaction pattern, and shared Discord rendering now lives in `src/app/discord/render-action-result.ts`.
- `/dice` and usable inventory items now run from context-first application modules instead of `src/dice/core/application/`.
- Random-event runtime, admin control, and foundation scheduling now live under `src/dice/random-events/infrastructure/`, with the old feature entrypoints kept only as compatibility re-exports.
- Progression, inventory, PvP, analytics, and random-event source-of-truth modules now live under their owning `src/dice/<context>/` folders, with `src/dice/core/` and `src/dice/features/` reduced to compatibility shims for legacy imports.
- Progression, inventory, analytics, and PvP command flows now use explicit application ports plus SQLite adapter builders under `infrastructure/sqlite/services.ts`, instead of passing `SqliteDatabase` directly into application use cases.

The remaining phases in this spec still apply. This spec does not authorize gameplay changes or destructive schema changes by itself.

## Why This Exists

Rolly already has a partial layered design and now has a phase-1 context-first shell:

- Discord entrypoints live in `src/dice/*/interfaces/discord/commands/` and `src/app/`.
- Rules and state helpers now live under their owning context domains such as `src/dice/progression/domain/`, `src/dice/inventory/domain/`, `src/dice/pvp/domain/`, `src/dice/analytics/domain/`, and `src/dice/random-events/domain/`.
- Shared runtime concerns live in `src/shared/` and `src/rolly-data/`.

That is directionally correct, but it is not full DDD yet. The main leaks are:

- Some "domain" modules still execute SQL and depend on `SqliteDatabase`.
- Some application modules still need follow-up migration, but the main command flows now run through port-based application factories rather than direct DB handles.
- Cross-cutting concepts such as Fame, Pips, temporary effects, and analytics are still coordinated through shared helpers or direct module calls rather than explicit bounded-context contracts.
- Some runtime-heavy adapters still embed orchestration that should eventually move behind cleaner ports.

Representative examples in the current codebase:

- `src/dice/progression/domain/prestige.ts`
- `src/dice/pvp/domain/pvp.ts`
- `src/dice/random-events/domain/content.ts`
- `src/dice/random-events/infrastructure/state-store.ts`
- `src/dice/economy/domain/balance.ts`

The main remaining gap is now mostly inside the persistence-heavy domain modules and runtime services. The command/application layer has started moving to ports and unit-of-work boundaries, but several context domain files still need their SQL moved fully into infrastructure repositories.

## Goals

- Move Rolly to a strict DDD-oriented architecture without changing product behavior.
- Keep TypeScript implementation lightweight and functional. DDD here means explicit models and boundaries, not class-heavy enterprise code.
- Preserve SQLite compatibility unless a destructive migration is explicitly approved later.
- Keep current slash command names, button flows, and public behavior stable during the refactor.
- Make gameplay rules testable without Discord or SQLite.
- Make cross-feature interactions explicit through ports, application services, or domain events.

## Non-Goals

- No rebalance of dice rules, prestige curves, PvP tuning, or random-event content.
- No command UX redesign unless required by the refactor.
- No big-bang rewrite.
- No direct edits to `dist/`.
- No replacement of SQLite or Discord.js as part of this refactor.

## DDD Summary

DDD is a way to organize software around the business domain instead of around frameworks or storage details.

The core ideas that matter for Rolly:

- Model the game as explicit domain concepts with consistent names.
- Define bounded contexts so different parts of the game own their own rules and data contracts.
- Keep business rules inside domain code, not inside Discord handlers or SQL helpers.
- Let application services orchestrate use cases, transactions, and cross-context coordination.
- Push Discord, SQLite, environment variables, and file loading to outer adapters.

For this repository, "full DDD" should mean:

- Domain code is pure or nearly pure and has no `discord.js`, no SQL, no `process.env`, and no `fs`.
- Application code depends on domain ports and returns DTOs or view models, not Discord payload types.
- Infrastructure code implements repositories and external adapters.
- Interface code handles Discord commands, buttons, permissions, and response mapping.

## Target Layers

### 1. Domain

What belongs here:

- Aggregates, entities, value objects, policies, invariants, domain services, and domain events.
- Repository interfaces and ports required by the domain or application.
- Pure gameplay logic such as roll resolution, prestige rules, PvP duel resolution, temporary-effect stacking, and random-event outcome rules.

What does not belong here:

- `discord.js`
- `better-sqlite3`
- direct SQL
- filesystem access
- environment access
- command parsing
- message formatting tied to Discord payload types

### 2. Application

What belongs here:

- Use cases and workflows such as `RollDice`, `PrestigeUp`, `CreatePvpChallenge`, `ResolveRandomEvent`, `BuyShopItem`.
- Transaction boundaries and unit-of-work coordination.
- Authorization decisions passed in from the interface layer.
- Cross-context orchestration.
- DTOs or view models returned to presenters.

What does not belong here:

- Raw SQL
- `discord.js` builders
- slash-command definitions
- `getDatabase()` globals

### 3. Infrastructure

What belongs here:

- SQLite repository implementations.
- `rolly-data` loaders and parsers.
- clock, UUID, scheduler, and persistence adapters.
- integration with git/self-update shell execution.

What does not belong here:

- core gameplay rules
- command-specific Discord response text

### 4. Interface / Presentation

What belongs here:

- Slash command builders, button handlers, permission gates, and interaction parsing.
- Discord presenters that map application DTOs to `interaction.reply`, button components, embeds, and message edits.
- Runtime subscribers that translate external triggers into application use cases.

What does not belong here:

- gameplay rule decisions
- direct table mutations outside application services

### 5. Composition Root

What belongs here:

- Startup wiring.
- Dependency assembly.
- Repository and service registration.
- Scheduler/bootstrap setup.

This is where `src/index.ts`, bot startup, and command deployment should converge.

## Target Bounded Contexts

Use lightweight bounded contexts inside the dice product. The proposal is:

- `dice/progression`
  Owns rolling, level progression, prestige progression, charge logic, bans, achievement evaluation tied to rolls, and temporary roll effects applied to the core `/dice` loop.

- `dice/economy`
  Owns Fame and Pips balance semantics. It exposes application ports for awarding or spending currency instead of acting as a generic shared SQL helper.

- `dice/inventory`
  Owns shop catalog access, purchases, inventory state, item consumption, and item-driven effects.

- `dice/pvp`
  Owns duel challenge lifecycle, duel resolution, lockouts, and PvP rewards.

- `dice/random-events`
  Owns event scheduling decisions, claim windows, participant tracking, outcome selection, and publishing of event-side effects through ports into other contexts.

- `dice/analytics`
  Owns reporting-oriented read models and analytics writes. It should consume domain events or application results rather than being entangled in core rule evaluation.

- `system/self-update`
  Stays outside the gameplay domain. It is an application/infrastructure concern, not a core bounded context.

## Shared Kernel

Keep the shared kernel small. It should only include concepts that are truly common and stable:

- `UserId`, `GuildId`, strongly named IDs where useful
- time and clock interfaces
- UUID generator interface
- domain event base types
- result/error types

Do not let the shared kernel become a dumping ground for gameplay helpers.

## Dependency Rules

These rules define "full DDD" for this repo:

1. Domain may depend only on:
   - same-context domain
   - shared-kernel domain

2. Application may depend only on:
   - same-context domain
   - same-context application ports
   - shared-kernel

3. Infrastructure may depend on:
   - its context's application and domain contracts
   - external libraries such as SQLite, fs, process env

4. Interface may depend on:
   - application use cases
   - presenters
   - Discord.js

5. Cross-context access must go through:
   - application ports
   - explicit domain events
   - read-model queries

6. The following are banned below the outer layers:
   - `discord.js` below `interfaces`
   - `better-sqlite3` below `infrastructure`
   - `getDatabase()` outside composition/infrastructure
   - `process.env` outside configuration/bootstrap

## Proposed Folder Layout

The current repo can move to a context-first layout without changing the product shape:

```text
src/
  app/
    bootstrap/
    bot/
    deploy/
  shared-kernel/
    domain/
    application/
  dice/
    progression/
      domain/
      application/
      infrastructure/
      interfaces/discord/
    economy/
      domain/
      application/
      infrastructure/
    inventory/
      domain/
      application/
      infrastructure/
      interfaces/discord/
    pvp/
      domain/
      application/
      infrastructure/
      interfaces/discord/
    random-events/
      domain/
      application/
      infrastructure/
      interfaces/discord/
    analytics/
      domain/
      application/
      infrastructure/
      interfaces/discord/
  system/
    self-update/
      application/
      infrastructure/
      interfaces/discord/
```

Migration notes:

- Slash command adapters have already moved from `src/commands/` into `interfaces/discord/commands/` inside their contexts.
- `src/dice/core/` and `src/dice/features/` now act as compatibility shims for legacy import paths, not as the source of truth for new work.
- Database access should continue moving toward bootstrap plus repository wiring, not general-purpose access from anywhere.
- `src/rolly-data/` should become infrastructure for the contexts that consume private game data.

## Current Architecture vs Target DDD

### Current architecture strengths

- The repo is already modular and not framework-first.
- Use cases are partially separated from command handlers.
- Business logic is not all embedded in Discord command files.
- `rolly-data` is already isolated behind a dedicated loader boundary.
- The codebase is still practical for a solo or very small team.

### Current architecture weaknesses

- Domain code is persistence-aware, which makes rule testing and reuse harder.
- Application code is often Discord-aware, which makes boundaries blurry.
- Some modules combine orchestration, state mutation, and presentation in one file.
- Cross-feature rules are coupled through direct helper calls and shared tables.
- Random events currently behave as a mixed runtime module rather than a clean bounded context.

### Full DDD advantages over the current design

- Gameplay rules become deterministic and easy to test with in-memory fixtures.
- Bounded contexts make fame, pips, effects, PvP, and random events safer to evolve.
- Discord and SQLite stop driving the model shape.
- Cross-context dependencies become visible instead of accidental.
- New features can plug into domain events and ports instead of reaching across tables.

### Full DDD disadvantages over the current design

- More files, more indirection, and more up-front modeling.
- Small features take longer to land at first.
- The migration adds temporary duplication while old and new structures coexist.
- Over-modeling is a real risk if simple flows are split too aggressively.

## Refactor Strategy

Use a staged strangler approach. Do not stop feature development for a big-bang rewrite.

### Phase 1: Guardrails and Composition Root

Deliverables:

- Create architecture rules and import boundaries.
- Introduce explicit ports for clock, UUID generation, repositories, and unit of work.
- Move startup wiring into a clear composition root.
- Stop new use cases from importing `discord.js` directly.

Acceptance criteria:

- New and migrated application modules return DTOs or view models, not `InteractionResult`.
- Boundary checks exist via ESLint rules, a simple architecture test, or both.

### Phase 2: Discord Presentation Split

Deliverables:

- Create Discord presenters for replies, buttons, and embeds.
- Move button ID parsing and response mapping into interface modules.
- Replace `InteractionResult`-centric application APIs with application result DTOs.

Acceptance criteria:

- Use cases are callable without Discord types.
- Command files are thin adapters that call application services and presenters.

### Phase 3: Economy Ports and Shared Kernel Extraction

Deliverables:

- Keep `src/dice/economy/domain/balance.ts` as the economy source of truth and retire remaining compatibility-path imports over time.
- Define stable money-related ports and semantics for Fame and Pips.
- Move generic helpers out of `src/shared/` when they actually belong to a domain.

Acceptance criteria:

- Fame/Pips reads and writes happen through economy repositories/application services.
- Other contexts no longer manipulate balances through raw shared SQL helpers.

### Phase 4: Progression Core

Deliverables:

- Refactor `/dice`, prestige, bans, charge, and roll achievements into a pure progression domain.
- Introduce repositories for player progression state, achievements, effects, and analytics writes.
- Convert roll resolution into pure domain logic operating on loaded state objects.

Acceptance criteria:

- `RollDice` can be tested with fake repositories and deterministic clocks.
- No direct SQL remains in progression domain modules.

### Phase 5: Inventory and Item Effects

Deliverables:

- Separate shop catalog, purchases, inventory ownership, and item consumption.
- Treat item effects as domain outputs or explicit commands to progression/effects services.
- Keep `rolly-data` item definitions as infrastructure inputs, not domain globals.

Acceptance criteria:

- Buying and using items do not require Discord types.
- Inventory use cases express effects via ports or domain events.

### Phase 6: PvP Context

Deliverables:

- Isolate challenge lifecycle and duel resolution into a PvP domain.
- Replace direct writes into roll buffs and lockouts with explicit contracts to progression/effects.
- Move challenge publication and button presentation into Discord adapters.

Acceptance criteria:

- PvP resolution logic is domain-testable without Discord or SQLite.
- Application layer owns challenge creation/resolution transactions.

### Phase 7: Random Events Context

Deliverables:

- Split scheduler/runtime, event selection logic, and event-side effects.
- Treat Discord message publishing as an adapter.
- Route rewards and penalties through economy, progression, or inventory application ports instead of direct table mutations.

Acceptance criteria:

- Random-event selection and resolution run without Discord types.
- Scheduler triggers application services rather than mutating game state directly.

### Phase 8: Analytics, Admin, and Cleanup

Deliverables:

- Convert analytics to read-model and event-consumer style patterns where practical.
- Refactor admin flows to call application services from each bounded context.
- Delete deprecated core/shared modules once migrated.

Acceptance criteria:

- No gameplay module under `domain` imports SQLite or Discord.
- No gameplay module under `application` imports Discord builders.
- Old compatibility facades are removed.

## Domain Events to Introduce

Use plain TypeScript event objects, not framework-specific buses.

Suggested events:

- `DiceRolled`
- `DiceLevelIncreased`
- `DicePrestiged`
- `InventoryItemPurchased`
- `InventoryItemConsumed`
- `PvpChallengeCreated`
- `PvpChallengeResolved`
- `RandomEventTriggered`
- `RandomEventResolved`

Likely consumers:

- analytics updates
- achievement evaluation
- event side effects
- admin or audit read models

## Rules for Cross-Context Interactions

- `random-events` must not write progression or economy tables directly.
- `pvp` must not reach into progression persistence directly for lockouts or buffs.
- `inventory` must not mutate temporary-effects tables except through explicit ports.
- `analytics` should observe application results or domain events, not drive gameplay.

## Migration Risks

- Hidden invariants currently enforced by SQL helpers may be lost during extraction if not captured as domain rules.
- Temporary hybrid code will increase complexity during the transition.
- Random-events and item effects currently touch several subsystems and are the most likely place for regressions.
- AI-assisted development will need stricter architectural guardrails or it will naturally drift back toward convenience imports.

## Validation Plan

Required verification for each migration phase:

- `npm run build`
- `npm run typecheck`
- `npm run lint`

Manual validation remains required for:

- `/dice`
- `/dice-prestige`
- `/dice-shop`
- `/dice-inventory`
- `/dice-bans`
- `/dice-pvp`
- `/dice-admin`
- random-event trigger and claim flows
- `/self-update` only when system modules are touched

## Success Criteria

The refactor is complete when all of the following are true:

- Gameplay domain modules are framework-agnostic and persistence-agnostic.
- Application services orchestrate behavior through repositories, ports, and domain events.
- Discord commands and buttons are thin adapters.
- SQLite and `rolly-data` stay behind infrastructure implementations.
- Cross-context dependencies are explicit and reviewable.
- Existing user-facing behavior remains materially unchanged.
