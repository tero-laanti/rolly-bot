# `achievements.json`

Each entry defines one achievement and the rule that unlocks it.

Minimal shape:

```json
{
  "id": "pair",
  "name": "Pair",
  "description": "Roll at least one pair.",
  "rule": {
    "type": "at-least-of-a-kind",
    "count": 2
  }
}
```

Rule semantics:

- `ordered-sequence`: looks for the exact `pattern` as a contiguous slice. Order matters.
- `contains-all-values`: every listed value must appear somewhere in the roll. Order does not matter.
- `at-least-of-a-kind`: any face appearing at least `count` times.
- `count-at-least-of-a-kind`: number of distinct faces that appear at least `count` times must be at least `groups`.
- `count-exact-of-a-kind`: number of distinct faces that appear exactly `count` times must be at least `groups`.
- `ordered-two-pairs`: a contiguous `A, A, B, B` window where `A != B`.
- `ordered-full-house`: a contiguous `A, A, A, B, B` window where `A != B`.
- `contains-value`: the rolled set contains `value`.
- `exact-time`: compares the roll timestamp against `hour`, `minute`, and `timezone`.
- `all-of`: all nested rules must pass.
- `manual`: never triggers from a roll. It must be granted by application logic.

Ordered vs unordered example:

```json
{
  "type": "ordered-sequence",
  "pattern": [1, 2, 3]
}
```

This requires a literal contiguous `1, 2, 3`.

```json
{
  "type": "contains-all-values",
  "values": [1, 2, 3]
}
```

This accepts any roll containing `1`, `2`, and `3` in any order.

`exact-time` notes:

- `hour` uses 24-hour time.
- `timezone` should be an IANA timezone name such as `Europe/Helsinki`.
- The runtime checks the time of the roll itself.

Manual prestige awards:

```json
{
  "rule": { "type": "manual" },
  "manualAward": {
    "type": "prestige",
    "prestige": 3
  }
}
```

- `manualAward.prestige` maps a prestige level to one achievement id.
- Each prestige number must be unique across the file.
- Omit `manualAward` for achievements that should only come from roll evaluation.
