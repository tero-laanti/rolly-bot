# `casino.v1.json`

This file defines casino bet ranges, payout math, and per-game tuning.

Payout ratios:

```json
{
  "numerator": 59,
  "denominator": 10
}
```

The runtime computes total payout as `floor(bet * numerator / denominator)`.
This is total returned pips, not profit-only.

Bet config:

```json
{
  "bet": {
    "min": 1,
    "max": 50,
    "default": 5,
    "sessionTimeoutMinutes": 5
  }
}
```

- `min <= default <= max` must hold.
- Casino analytics now group by the actual clamped bet amount, so there is no separate `rolly-data` field for analytics tiers.

Exact Roll:

```json
{
  "exactRoll": {
    "dieSides": 6,
    "highLowLowMaxFace": 3
  }
}
```

- `highLowLowMaxFace` is the inclusive top end of the `low` bucket.
- Values above that boundary count as `high`.
- It must be between `1` and `dieSides - 1`.

Push Your Luck:

```json
{
  "pushYourLuck": {
    "dieSides": 6,
    "cashoutStartsAtUniqueFaces": 2,
    "autoCashoutAtUniqueFaces": 6,
    "payouts": [{ "uniqueFaces": 2, "numerator": 59, "denominator": 50 }]
  }
}
```

- Cashout becomes available once the round reaches `cashoutStartsAtUniqueFaces` distinct faces.
- `autoCashoutAtUniqueFaces` forces payout at that threshold.
- `payouts` must cover every integer value from `cashoutStartsAtUniqueFaces` through `autoCashoutAtUniqueFaces`, in sorted order, with no gaps or duplicates.

Blackjack:

```json
{
  "blackjack": {
    "dieSides": 10,
    "initialCardsPerHand": 2,
    "dealerStandOnTotal": 17,
    "naturalPayout": {
      "numerator": 11,
      "denominator": 5
    },
    "winPayoutMultiplier": 2
  }
}
```

- `1` behaves like an ace and can count as `1` or `11`.
- A natural is an opening hand of exactly `initialCardsPerHand` cards totaling `21`.
- `naturalPayout` is used only for a natural 21.
- `winPayoutMultiplier` is used for normal wins after play continues.
- Dealer draws until reaching at least `dealerStandOnTotal`.

Dice Poker:

```json
{
  "dicePoker": {
    "payoutMultipliers": {
      "fiveOfAKind": 20,
      "fourOfAKind": 10,
      "fullHouse": 3,
      "straight": 3
    }
  }
}
```

- Dice Poker always uses a five-die `d8` hand in the current implementation.
- Payout multipliers are total payout multipliers applied to the bet.
- Only the listed hand kinds are paid in the current implementation.
