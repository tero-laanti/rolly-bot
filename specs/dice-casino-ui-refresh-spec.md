# Dice Casino UI Refresh Spec

## Status

Draft

## Summary

Refresh the `/dice-casino` Discord UI so it reads like a small game hub instead of a debug panel. The current panel is functional, but it combines game selection, balance state, rule text, and live controls into one dense message. This spec introduces a lobby-first flow with separate setup, rules, active-round, and result states for all casino games.

The key product change is simple:

- Do not show full game rules while the player is actively making round decisions.
- Add a clear `Back to Lobby` path.
- Add a dedicated `Rules` entry point instead of always rendering rules inline.

This is a UI and flow spec. It does not change payouts, odds, persistence, analytics, or achievement behavior.

## Problem

The current casino message has these issues:

- Too much text appears before the actionable controls.
- Formula-style payout text looks internal rather than player-facing.
- Setup information and in-round information share the same visual weight.
- All games inherit the same top-heavy presentation even when their play loops differ.
- Exact Roll especially feels like a configuration panel, not a quick betting game.
- Multi-step games can shift key information between different vertical positions, which makes the message feel jumpy after a round resolves.

## Goals

- Make the first screen feel like a casino lobby, not a settings page.
- Keep actionable state visible and compress everything else.
- Use the same shell for all four games.
- Move rules into a dedicated view so setup and play stay focused.
- Preserve fast replay loops, especially for Exact Roll.
- Stay within Discord message and component constraints.
- Keep the main game-state block anchored in one consistent place before and after resolution.

## Non-Goals

- No new game modes.
- No payout tuning.
- No database or schema changes.
- No rework of command registration or analytics semantics.

## Design Principles

- One primary task per screen.
- Rules are secondary content, not default content.
- Current balance, bet, and game must always be visible.
- In-round screens should show only information needed for the next decision.
- Result copy should be short, readable, and replay-friendly.
- The main game-state block should not jump to a different part of the message when a round ends.

## Proposed Information Architecture

The casino flow should have five UI states:

1. `Lobby`
2. `Game Setup`
3. `Rules`
4. `Active Round`
5. `Round Result`

### 1. Lobby

The lobby is the default `/dice-casino` screen when there is no active round.

Purpose:

- Let the player choose a game.
- Show balance and current bet.
- Keep the screen visually light.

Content:

- Title: `Dice Casino`
- Status line: `19 pips • Bet 5`
- Short subtitle: `Choose a game`
- One button row for game selection.
- One button row for bet adjustment.
- One utility row with `Rules`, `Refresh`, and mode-specific CTA if needed.

Copy constraints:

- Do not show payout tables by default in the lobby.
- Do not show detailed rules in the lobby.

### 2. Game Setup

This is the pre-play view for a selected game.

Purpose:

- Show compact game-specific setup and payout summary.
- Let the player change the current bet and any mode-specific choices.
- Start the round or place the instant bet.

Common shell:

- Header: `Dice Casino • <Game Name>`
- Status line: `19 pips • **Bet 5**`
- Optional compact summary line:
  - Exact Roll: `Mode: Exact Face • Pick: 1`
  - Push Your Luck: `Cash out from 2 uniques`
  - Blackjack: `Beat the dealer to 21`
  - Dice Poker: `Roll, hold, reroll once`

Buttons:

- Row 1: `Back to Lobby`, game selector row or compact game switcher if row budget allows.
- Row 2: bet adjustment controls.
- Remaining rows: game-specific setup controls and primary CTA.

Rules handling:

- `Rules` is a secondary button from setup.
- Rules are not expanded inline by default.

### 3. Rules

This is a dedicated informational screen for the selected game.

Purpose:

- Explain how the selected game works.
- Show payout information in readable, player-facing language.

Content:

- Short rules overview.
- Payout table or payout summary.
- One example line if that materially helps.

Buttons:

- `Back`
- `Play`
- Optional game switch buttons if row budget allows.

Rules copy principles:

- Use outcome language, not formulas.
- Prefer `Pays 29 pips` over `floor(59 * bet / 10) = 29`.

### 4. Active Round

This is the in-progress play state for multi-step games.

Purpose:

- Focus entirely on current round state and next actions.

Content rules:

- Show only the active-round state and the most recent outcome/update.
- Hide general rules and payout tables.
- Keep the selected game and bet visible.

Navigation:

- Show `Back to Lobby` if the round can be resumed safely from the lobby.
- If lobby access during a round is allowed, the lobby must show a `Resume Round` CTA.

Recommended behavior:

- Allow leaving to the lobby while the round is active.
- Persist the active round exactly as today.
- When a round exists, lobby shows a compact banner such as:
  - `Round in progress: Blackjack • Bet 5`
  - `Round in progress: Push Your Luck • 3 uniques`

### 5. Round Result

This is the post-resolution screen after a round ends.

Purpose:

- Show the result clearly.
- Encourage replay.

Content:

- Outcome headline.
- One or two lines of detail.
- Updated `pips` and `bet`.

Layout rule:

- The resolved outcome should occupy the same primary content slot that active-round state used just before the result.
- Do not move the key round summary into a generic top-level `Last outcome` block above the game panel.

Buttons:

- `Play Again`
- `Back to Lobby`
- `Rules`

## Common Copy Changes

Replace verbose current copy with compact player-facing copy.

Examples:

- Replace `Selected game: Exact Roll.` with `Game: Exact Roll`
- Replace `Current exact face: 1.` with `Pick: 1`
- Replace `Current High / Low pick: Low.` with `Pick: Low`
- Replace raw formulas with total payouts
- Remove `Use the buttons below to place the bet directly.`

Result copy should be short and direct.

Examples:

- `Hit. Picked 1, rolled 1. Paid 29 pips.`
- `Missed. Picked High, rolled 2.`
- `Bust. Repeated 4.`
- `Full House. Paid 20 pips.`

## Per-Game Specs

### Exact Roll

#### Setup

Show:

- Game name
- `pips`
- `bet`
- Selected mode
- Selected pick
- Compact payout summary

Recommended setup copy:

- `Exact Face pays 29 pips`
- `High / Low pays 9 pips`

Controls:

- `Back to Lobby`
- `Rules`
- Bet controls
- Mode toggle: `Exact Face`, `High / Low`
- Pick controls:
  - Exact Face: face buttons
  - High / Low: `Low`, `High`

Primary interaction:

- Exact Roll remains an instant-resolution game.
- Face and High/Low pick buttons both place the bet immediately.
- No separate `Play` button is required for Exact Roll.

#### Active Round

None. Exact Roll resolves immediately.

#### Result

Show only:

- Outcome
- Current balance
- Last pick summary
- Replay controls

### Push Your Luck

#### Setup

Show:

- One-line description:
  - `Roll new faces to build value. Repeat a face and bust.`
- Compact payout ladder:
  - `2 uniques -> 5 pips`
  - `3 uniques -> 8 pips`
  - `4 uniques -> 17 pips`
  - `5 uniques -> 53 pips`
  - `6 uniques -> 318 pips`

Controls:

- `Back to Lobby`
- `Rules`
- Bet controls
- `Play`

#### Active Round

Show:

- Rolls so far
- Unique count
- Current cash-out value if available

Do not show:

- Full rules paragraph
- Full payout explanation unless space allows a single reminder line

Recommended active copy:

- `Rolls: 2, 5, 1`
- `3 uniques • Cash out for 8`

Controls:

- `Back to Lobby`
- `Roll`
- `Cash Out`

#### Result

Show concise result:

- `Cashed out at 3 uniques for 8 pips.`
- `Bust. Repeated 5.`
- `Perfect run. Paid 318 pips.`

### Blackjack

#### Setup

Show:

- One-line description:
  - `Beat the dealer without going over 21.`
- Compact payout summary:
  - `Win pays 2x pips`
  - `Push returns your bet`
  - `Natural 21 pays <value> pips`

Controls:

- `Back to Lobby`
- `Rules`
- Bet controls
- `Play`

#### Active Round

Show:

- Dealer visible state
- Player hand
- Current totals

Do not show:

- Dealer-stand rule text
- Full opening rules block

Recommended active copy:

- `Dealer: [4] [?]`
- `You: [6] [5] = 11`

Controls:

- `Back to Lobby`
- `Hit`
- `Stand`

#### Result

Show:

- Resolution headline
- Final hands
- Payout summary

Layout requirement:

- Use the same game-state block position as the active hand view.
- Replace the active hand block contents with resolved hand contents in place.
- Achievement text, if present, should appear after the resolved hand summary, not before it.

Examples:

- `Dealer busts. You win 10 pips.`
- `Push. Bet returned.`
- `Natural 21. Paid 12 pips.`

### Dice Poker

#### Setup

Show:

- One-line description:
  - `Roll 5 dice, hold any, reroll the rest once.`
- Compact payout summary:
  - `Five of a Kind`
  - `Four of a Kind`
  - `Full House`
  - `Straight`

Controls:

- `Back to Lobby`
- `Rules`
- Bet controls
- `Play`

#### Active Round

Show:

- Current five dice
- Hold state for each die
- One-line instruction:
  - `Choose holds, then reroll once`

Controls:

- `Back to Lobby`
- Five hold/release buttons
- `Reroll`
- `Cancel`

Button-label improvement:

- Prefer compact labels that mirror state:
  - `Hold 1`
  - `Held 1`

Avoid using danger styling for a held die unless there is a strong semantic reason. A held die is a selection state, not a destructive action.

#### Result

Show:

- Final hand
- Hand type or loss
- Total payout

Examples:

- `Full House. Paid 15 pips.`
- `No winning hand.`

## Shared Button Layout Guidance

The refresh should respect Discord's component limits and keep rows predictable.

Recommended order:

1. Navigation row
2. Bet row
3. Game-specific setup or round controls
4. Additional game-specific controls

Priority rules:

- Keep the primary action on the last occupied row when possible.
- Do not mix bet controls with round decision controls.
- Avoid large rows with mixed meanings.
- Selected mode or selected die should use primary styling.
- Success styling is reserved for clear commit actions like `Play`, `Cash Out`, `Stand`, or `Reroll`.

## State Transitions

Default transitions:

- `/dice-casino` opens `Lobby`
- `Select Game` from lobby opens that game's `Game Setup`
- `Rules` opens `Rules`
- `Back` from rules returns to prior setup screen
- `Play` enters `Active Round` for multi-step games
- Instant actions in Exact Roll go straight to `Round Result`
- `Back to Lobby` from active play returns to `Lobby`
- Lobby with active round shows `Resume Round`
- Round resolution returns to `Round Result`
- `Play Again` returns to setup or immediately restarts the same game, depending on mode

## Implementation Notes

This refresh should fit the existing architecture without changing ownership boundaries.

Recommended approach:

- Keep the shared shell in `src/dice/casino/application/manage-casino/view.ts`
- Add an explicit casino UI view state to session state or derive it in application logic:
  - `lobby`
  - `setup`
  - `rules`
  - `active-round`
  - `result`
- Let each game module provide:
  - setup summary lines
  - rules lines
  - active-round lines
  - result summary lines
  - component rows per state
- Preserve existing domain logic in `game-rules.ts` and the individual game modules
- Preserve current persistence and analytics behavior

Action additions likely needed:

- `go-lobby`
- `show-rules`
- `resume-round`
- `back`

The goal is to stop overloading `buildDescriptionLines()` as the one content path for every state.

Rendering rule:

- The shared view builder should reserve a stable game-content region below the header and status block.
- Active-round content and resolved-result content should both render inside that region so the player does not need to re-scan the whole message after each action.

## Acceptance Criteria

- `/dice-casino` opens to a lobby-style screen instead of a game-detail wall of text.
- Rules are not shown inline during active play.
- Every game has a dedicated rules view.
- Every game has a dedicated setup view.
- Multi-step games can be resumed after returning to the lobby.
- Exact Roll remains a fast instant-bet flow.
- Payout copy is player-facing and does not expose raw formulas in the default UI.
- Result screens are shorter and more readable than the current `lastOutcome` wall.
- Active-round state and resolved result stay in the same visual region instead of jumping between the bottom game block and a top `Last outcome` block.
- The final layout stays within Discord component limits for every game state.

## Open Questions

- Should `Play Again` for Push Your Luck, Blackjack, and Dice Poker start immediately with the same bet, or return to setup first?
- Should `Back to Lobby` during an active round always be allowed, or should some rounds require explicit cancel/finish first?
- Should the lobby show all games at once every time, or remember the last selected game with a prominent `Resume` / `Play Again` CTA?
