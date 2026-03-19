# `random-events.v1.json`

This file contains the random-event content pack. Each scenario is a claimable prompt plus one or more possible outcomes.

Minimal shape:

```json
{
  "id": "example-basic-event",
  "rarity": "common",
  "title": "Example Basic Event",
  "prompt": "An example crate is sitting in the open. Check it?",
  "claimLabel": "Check crate",
  "claimPolicy": "first-click",
  "claimWindowSeconds": 75,
  "outcomes": [
    {
      "id": "example-success",
      "resolution": "resolve-success",
      "message": "Example success outcome.",
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
- `requiredReadyCount`: optional multi-user ready threshold. Valid values are `2` through `5`. When set, the event resolves immediately once that many players are ready; if the window expires first, the event expires instead of resolving with a smaller group.
- `claimWindowSeconds`: base window before the global multiplier from `random-events-balance.json` is applied. Minimum is `10`.
- `weight`: relative selection weight inside the scenario's rarity bucket. Omit it for the default weight `1`.
- `retryPolicy`: only used on first-click events that can stay open after a failed attempt.
  - `once-per-user`: a user gets one failed attempt, then someone else has to try.
  - `allow-retry`: the same user can keep trying while the event remains open.

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

Outcome resolution:

- Every outcome must declare `resolution`.
- `resolve-success`: the event ends as a success.
- `resolve-failure`: the event ends as a failure.
- `keep-open-failure`: apply the failure effects, log the failed attempt publicly, and keep the event open until it expires or someone else succeeds.
- `keep-open-failure` is only valid on first-click events with a `rollChallenge`.

Roll challenges:

```json
{
  "rollChallenge": {
    "id": "example-check",
    "mode": "single-step",
    "steps": [
      {
        "id": "example-step",
        "label": "Roll 5+ on your die",
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
    "success": ["example-success"],
    "failure": ["example-failure"]
  }
}
```

- These ids must reference outcomes already defined in `outcomes`.
- `challengeOutcomeIds.success` must point only to `resolve-success` outcomes.
- `challengeOutcomeIds.failure` must point only to failure outcomes (`resolve-failure` or `keep-open-failure`).
- When a challenge result exists, the runtime filters to the matching ids first.
- If the filtered set is empty, resolution falls back to the full `outcomes` list.

Example keep-open challenge:

```json
{
  "claimPolicy": "first-click",
  "retryPolicy": "once-per-user",
  "rollChallenge": {
    "id": "example-sequence-check",
    "mode": "sequence",
    "steps": [
      {
        "id": "step-one",
        "label": "Step 1: roll 5+ on your die",
        "source": { "type": "player-die" },
        "target": 5,
        "comparator": "gte"
      },
      {
        "id": "step-two",
        "label": "Step 2: roll 3+ on your die",
        "source": { "type": "player-die" },
        "target": 3,
        "comparator": "gte"
      }
    ]
  },
  "challengeOutcomeIds": {
    "success": ["example-challenge-success"],
    "failure": ["example-keep-open-failure"]
  },
  "outcomes": [
    {
      "id": "example-challenge-success",
      "resolution": "resolve-success",
      "message": "Example success outcome.",
      "effects": []
    },
    {
      "id": "example-keep-open-failure",
      "resolution": "keep-open-failure",
      "message": "Example keep-open failure outcome.",
      "effects": []
    }
  ]
}
```

Example threshold-based multi-user event:

```json
{
  "claimPolicy": "multi-user",
  "requiredReadyCount": 3,
  "outcomes": [
    {
      "id": "example-group-open",
      "resolution": "resolve-success",
      "message": "The vault opens the moment the third hand lands on it.",
      "effects": []
    }
  ]
}
```

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
