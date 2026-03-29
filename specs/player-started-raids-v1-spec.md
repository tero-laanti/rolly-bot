# Player-Started Raids V1 Spec

## Status

Draft

## Summary

This spec defines the shipped v1 shape for player-started raids under `rolly-van`. It is a product and contract design only. It does not implement runtime code, data loading, validation, env parsing, or docs changes.

V1 raids are distinct from the scheduled World Boss:

- World Boss remains the shared scheduled server event.
- Raids are player-started, tier-gated, small-party encounters.
- Raids use authored static boss definitions rather than the World Boss weighted random level model.
- Raids reuse the current World Boss-style `/roll` damage loop instead of introducing a new combat system.
- Raids use the existing reward primitives of `pips` and roll-pass buffs, authored per boss.

This spec is the design anchor for:

- `rolly-van.2` boss selection and party formation
- `rolly-van.6` persistence and recovery
- `rolly-van.7` Discord runtime entry points and panel sync

## Product Decisions

The following decisions are locked for v1:

- The primary player-facing raid entry point is a startup-synced bot panel in each configured public raid tier channel.
- V1 does not require a `/raids` slash command. If a minimal helper command is later added, it is secondary to the tier-panel flow.
- Tier access is gated by pre-existing Discord roles managed outside the raids feature.
- Raids do not auto-award tier access roles in v1.
- Each raid tier has its own authored `tierId`, public panel channel, and access role.
- Boss choice happens inside the selected tier and is limited to bosses authored for that tier.
- Raid party size is `1-4` players, including the leader.
- A player may lead at most one active recruitment or encounter at a time across all tiers.
- Bot-managed stale recruitment and status messages are deleted when superseded, cancelled, resolved, or reconciled during restart recovery.
- Combat uses the existing World Boss-like active timer and `/roll` damage model, including highest-roll-set damage semantics.
- Rewards use authored `pips` and roll-pass buffs only. No raid-only reward primitives ship in v1.
- Recruitment timeout is a fixed v1 code default of `15` minutes.
- Raid combat duration is a fixed v1 code default of `12` minutes.
- Each raid lifecycle is keyed by one stable `raidRunId` created when recruitment begins and preserved through recruitment, provisioning, combat, resolution, and cleanup.
- Each `raidRunId` owns one canonical public status message. That message is edited across lifecycle states instead of replaced during normal operation.
- Create, join, leave, start, cancel, and resolve transitions must be serialized behind persisted state checks so concurrent button presses or restart replay cannot fork one `raidRunId` into multiple valid states.

## Discord Surface And Lifecycle

### Tier channels

Each authored raid tier is mapped to one public Discord text channel. That channel hosts one startup-synced canonical bot panel for the tier.

The tier panel is the start surface for that tier and must:

- identify the tier
- present the authored tier summary
- offer a button to start a recruitment flow
- reject start attempts from users who do not hold the configured tier access role

The bot keeps exactly one canonical panel per configured tier channel, following the same startup-sync principle as the Contract Master panel.

### Recruitment flow

The recruitment lifecycle is:

1. Player presses the tier panel button in the public tier channel.
2. Bot verifies the user has the configured access role and is not already leading another active raid.
3. Bot shows boss choices authored for that tier.
4. Leader selects a boss.
5. Bot creates or refreshes a public recruitment post in that same tier channel.
6. Other eligible users join or leave through buttons on the recruitment post.
7. The leader starts the raid once the desired party is formed, up to four total players.

Recruitment rules:

- The leader must remain in the party.
- The party may start with one to four players.
- Join attempts from users without the tier access role are rejected.
- A user may not join if doing so would exceed party size.
- A user may not join multiple active raid parties at once.
- The leader may cancel recruitment before combat starts.
- Recruitment expires after `15` minutes, and expiry cleanup is required.
- The `raidRunId` public status message is canonical. Old superseded bot messages for the same leader or run must be disabled and deleted.
- Button handlers must reject actions coming from non-canonical or stale public messages even if Discord still delivers the interaction.

### Private raid instance

Starting combat creates a private raid instance made of:

- one dedicated raid text channel under a configured raid instance category
- one temporary raid participant role for that instance

The temporary role is granted to the leader and joined party members only. The instance channel permissions are set so the raid participant role can access the channel and non-participants cannot.

The instance channel is the only place where raid combat is active.

Provisioning rules:

- The bot must not transition a run into active combat until the private channel, temporary role, and participant role assignments are all confirmed.
- If provisioning fails partway through, the run stays non-active and recovery prefers cleanup over trying to continue from a half-provisioned encounter.

### Encounter flow

Once the private instance is ready:

1. The bot posts the active boss prompt in the private raid channel.
2. The authored static boss enters with its configured HP, level, and reward data.
3. Joined party members attack with `/roll`.
4. Raid damage resolves using the same highest-roll-set rule used by World Boss.
5. The encounter ends in success if the boss HP reaches zero before the active timer expires.
6. The encounter ends in failure if the timer expires first.
7. The bot posts the resolved result, applies rewards on success, and begins cleanup.

Combat rules:

- `/roll` damage only applies inside the active raid instance channel.
- Rolls from non-party users do not affect the boss.
- Rolls outside the raid instance do not affect the raid.
- V1 does not add boss mechanics, phase systems, or alternate combat verbs.
- Combat lasts `12` minutes from the active encounter start time.

### `/roll` integration contract

V1 raids must not bolt raid-specific logic directly into the existing World Boss-only roll seam.

Downstream implementation should replace the current World Boss-specific roll routing with one shared live-encounter roll contract that:

- accepts the roll channel id, user id, user mention, damage, best roll set, and timestamp
- returns either no active encounter, ignored roll, or applied encounter result
- allows both World Boss and raids to resolve through the same `/roll` application boundary

The `/roll` use case should remain unaware of raid-specific Discord orchestration. Runtime routing belongs behind the new encounter port, not inside the progression use case.

### Cleanup

After cancellation, expiry, success, or failure, cleanup must:

- remove temporary raid participant roles from members
- delete the temporary raid role
- delete or archive the private raid channel according to implementation choice, with deletion preferred for v1
- delete or mark stale public recruitment/status messages so only the latest canonical messages remain
- release leader and party participation locks

## Data Contract To Add Later

V1 requires a new public `rolly-data` file named `raids.json`.

The contract must be authored around stable identifiers and authored text, not Discord IDs. Discord infrastructure stays in app config.

### Top-level shape

`raids.json` should define:

- `tiers`: ordered authored raid tiers
- `bosses`: static authored raid bosses
- `copy`: shared authored panel and flow copy if later implementation prefers centralized text

### Tier definition

Each tier should include:

- `tierId`: stable string identifier
- `name`: player-facing tier name
- `order`: numeric display order
- `summary`: short player-facing description for the public tier panel
- `bossIds`: ordered list of boss ids available in the tier

Tier data must not include Discord channel ids or role ids.

### Boss definition

Each boss should include:

- `bossId`: stable string identifier
- `tierId`: owning tier
- `name`: player-facing boss name
- `level`: static displayed boss level
- `maxHp`: static HP for the authored encounter
- `reward`:
  - `pips`
  - roll-pass buff shape matching the existing World Boss reward primitive
- `copy`:
  - recruitment summary text
  - active encounter title or summary text
  - success result text
  - failure result text

Boss data is static. V1 does not roll random levels, random names, or random reward tiers.

### Validation expectations

Later implementation should validate:

- `tierId` and `bossId` uniqueness
- every `boss.tierId` references a defined tier
- every tier `bossIds` entry references a defined boss in that tier
- tiers have a stable deterministic order
- authored copy stays within Discord transport limits for the surfaces where it will render

## Deployment Config To Add Later

V1 requires app config, but this task does not implement it.

The future config contract is:

- `RAIDS_INSTANCE_CATEGORY_ID`
- `RAIDS_TIER_BINDINGS_JSON`

`RAIDS_TIER_BINDINGS_JSON` maps authored `tierId` values to Discord infrastructure:

```json
{
  "bronze": {
    "panelChannelId": "123",
    "accessRoleId": "456"
  },
  "silver": {
    "panelChannelId": "789",
    "accessRoleId": "012"
  }
}
```

Config rules:

- every configured binding key must correspond to an authored `tierId`
- every authored tier used in production must have both a `panelChannelId` and `accessRoleId`
- Discord ids stay out of `raids.json`
- `RAIDS_INSTANCE_CATEGORY_ID` is global for v1 and holds all created raid instance channels

V1 does not add public timing env vars. Recruitment timeout and combat duration stay fixed code defaults unless a later tuning task explicitly externalizes them.

## Permission Requirements

The v1 raids runtime requires Discord permissions sufficient to:

- read and send messages in each tier panel channel
- manage the canonical panel message in each tier panel channel
- create private raid instance channels under the configured category
- create, assign, and delete temporary raid participant roles
- manage channel permission overwrites for the created instance channels
- clean up instance channels and stale bot-managed raid messages

If the bot lacks required permissions, the runtime must fail that specific raid action cleanly without corrupting persisted state.

## Persistence And Recovery Rules

Persistence and recovery are part of the shipped raids slice and are not optional follow-up polish.

### Persisted state

Later implementation should persist enough state to recover:

- one stable `raidRunId` created at recruitment start
- active recruitment keyed by `raidRunId`
- leader id and joined participant ids
- selected `tierId` and `bossId`
- canonical public status message id and channel id
- private instance channel id, if created
- temporary participant role id, if created
- encounter status and timestamps
- reward settlement state
- last completed lifecycle transition or version marker

Persisted state is the source of truth. Discord resources are reconciled against persisted state, not the other way around.

### Recovery expectations

On bot restart, recovery must reconcile persisted raid state into one of these outcomes:

- pending recruitment resumes if its canonical public message still exists, or recreates that message if it is missing and the run is still valid
- pending recruitment expires and cleans up if it is past the `15` minute timeout
- active encounter resumes only if the private channel, temporary role, and participant assignments all reconcile with persisted party state
- active encounter resolves safely as failed or interrupted if required Discord resources are missing or unrecoverable
- partial resource creation during provisioning is cleaned up rather than resumed into active combat

### Idempotency and safety

Recovery and resolution must be idempotent:

- reward grants and settlement markers must be committed atomically in one database transaction keyed by `raidRunId` so recovery cannot double-pay or silently drop success rewards
- stale public status or recruitment messages created before restart should be disabled and deleted if they are no longer canonical
- role removal and channel cleanup must tolerate already-deleted resources
- an interrupted encounter must not leave participants with permanent access to a private raid channel
- repeated create, join, leave, start, cancel, and resolve interactions must re-check persisted run state and no-op safely if the requested transition is no longer valid

## Failure Handling

The implementation must treat these as first-class v1 scenarios:

- leader lacks access role
- joining user lacks access role
- leader is already leading another active raid
- joining user is already in another active raid
- recruitment times out
- leader cancels before start
- bot fails to create the temporary role
- bot fails to create the private channel
- bot fails to assign the temporary role to one or more participants
- bot restarts during recruitment
- bot restarts during combat
- cleanup encounters already-deleted channels, messages, or roles

Preferred failure behavior:

- fail before combat if the private channel and temporary role cannot be created coherently
- avoid starting the encounter with a partially provisioned party
- leave the public tier channel in a coherent state with one canonical visible outcome message
- prefer cleanup over resuming a half-provisioned active encounter

## Boundaries For Downstream Tasks

### `rolly-van.2`

Owns:

- boss selection UI within a tier
- public recruitment post flow
- join, leave, start, cancel, timeout, and invalid-state handling
- private instance channel and temporary role creation semantics
- enforcing serialized state transitions around recruitment and provisioning actions

Does not own:

- slash command registration as a primary entry surface
- deep restart recovery behavior beyond the contract it must satisfy

### `rolly-van.6`

Owns:

- persisted raid state for recruitment and encounter lifecycles
- restart reconciliation and recovery rules
- stale-message cleanup after restart
- reward idempotency markers
- tolerant cleanup of missing Discord resources
- the canonical `raidRunId` lifecycle record and version or transition fencing needed for safe retries

### `rolly-van.7`

Owns:

- startup sync for one canonical panel per configured tier channel
- runtime boot wiring for raid panel handlers and raid lifecycle entry points
- any minimal “/raids or equivalent” interpretation needed to satisfy command-surface acceptance, with the tier-panel system considered the primary equivalent

## Test Scenarios For Implementation

The downstream implementation should cover at least these scenarios:

- user without the configured tier access role cannot start a recruitment
- tier panel sync keeps one canonical panel per configured tier channel
- boss choices are limited to the selected tier's authored bosses
- recruitment supports join, leave, cancel, timeout, and start transitions
- party size cannot exceed four players
- a leader cannot maintain multiple active raids
- the private instance channel and temporary role are created once and only grant access to the current party
- `/roll` damage only applies in the active raid instance channel
- raid damage uses the current World Boss-style highest-roll-set semantics
- restart recovery resumes or safely resolves pending recruitment and active combat
- reward settlement remains idempotent through restart or duplicate resolution attempts
- stale bot-managed messages are deleted when they are no longer canonical

## Non-Goals

V1 raids do not include:

- automatic tier unlock progression
- a new combat engine
- boss phase mechanics or custom combat verbs
- random boss level rolling
- random boss name generation
- raid-only reward currencies
- public `raids.json` Discord ids

## Follow-Up Issue Check

This spec does not reveal missing top-level implementation work beyond the existing child tasks:

- `rolly-van.2`
- `rolly-van.3`
- `rolly-van.4`
- `rolly-van.5`
- `rolly-van.6`
- `rolly-van.7`

No additional Beads child issue is required to close `rolly-van.1`.
