# `random-events.v1.json`

This file contains the random-event content pack. Each scenario is a claimable prompt plus one or more possible outcomes.

Minimal shape:

```json
{
  "id": "lantern-cache",
  "rarity": "common",
  "title": "Lantern Cache",
  "prompt": "A supply crate of travel lanterns has been left unlocked. Check it?",
  "claimLabel": "Open crate",
  "claimPolicy": "first-click",
  "claimWindowSeconds": 75,
  "outcomes": [
    {
      "id": "steady-light",
      "message": "The crate holds a steady-burning lantern.",
      "effects": []
    }
  ]
}
```

Scenario-level fields:

- `rarity`: places the scenario into a variety-selection bucket.
- `claimPolicy`:
  - `first-click`: one participant resolves the event.
  - `multi-user`: multiple users can join during the same event window.
- `claimWindowSeconds`: base window before the global multiplier from `random-events-balance.json` is applied. Minimum is `10`.
- `weight`: relative selection weight inside the scenario's rarity bucket. Omit it for the default weight `1`.

Text variables:

```json
{
  "textVariables": {
    "itemName": ["lantern", "flare", "torch"]
  }
}
```

- Use them in text as `${itemName}`.
- Scenario-level and outcome-level variables are merged.
- Outcome-level variables override scenario-level variables with the same key.
- One value is picked randomly per key when the event is rendered.

Outcome weighting:

- Outcomes use relative `weight`.
- Omitted `weight` behaves like `1`.
- A weight of `0` effectively drops that candidate when any positive-weight candidates exist.

Roll challenges:

```json
{
  "rollChallenge": {
    "id": "ferryman-check",
    "mode": "single-step",
    "steps": [
      {
        "id": "wager-roll",
        "label": "Roll 5+ with your current die",
        "source": {
          "type": "player-die"
        },
        "target": 5,
        "comparator": "gte"
      }
    ],
    "failOnFirstMiss": true
  }
}
```

- `mode` is `single-step` or `sequence`.
- `single-step` must contain exactly one step.
- `failOnFirstMiss` defaults to `true` if omitted.
- `comparator` can be `gte`, `lte`, or `eq`.
- `source.type = "player-die"` rolls the user's current die.
- `source.dieIndex` defaults to `1` when bans are consulted.
- `source.useBans` defaults to `false`.
- `source.type = "static-die"` rolls an independent die with the given `sides`.

Challenge outcomes:

```json
{
  "challengeOutcomeIds": {
    "success": ["swift-crossing"],
    "failure": ["cold-river"]
  }
}
```

- These ids must reference outcomes already defined in `outcomes`.
- When a challenge result exists, the runtime filters to the matching ids first.
- If the filtered set is empty, resolution falls back to the full `outcomes` list.

Activity templates:

- `accepted`: status lines used when the interaction is accepted.
- `alreadyReady`: status lines used when the user already joined or already claimed.
- Each list must contain at least one non-empty string.

Effect types:

- `currency`: grants a random amount between `minAmount` and `maxAmount`.
- `temporary-roll-multiplier`: multiplies future roll value for a number of rolls.
- `temporary-roll-penalty`: divides future roll value for a number of rolls.
- `temporary-lockout`: blocks rolling for `durationMinutes`.

`stackMode` for multiplier and penalty effects:

- `stack`: keep multiple effects active together.
- `refresh`: refresh an existing compatible effect instead of adding another stack.
- `replace`: replace the existing compatible effect.
- `no-stack`: do not add another copy if one is already active.

Prefer `refresh`, `replace`, or `no-stack` unless you intentionally want effects to pile up.
