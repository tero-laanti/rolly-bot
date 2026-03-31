# `raids.json`

This file defines authored player-started raid tiers, static raid bosses, and shared panel copy.

Top-level shape:

```json
{
  "tiers": [],
  "bosses": [],
  "copy": {}
}
```

Tier shape:

```json
{
  "tierId": "bronze",
  "name": "Bronze Raids",
  "order": 1,
  "summary": "Entry raids for small parties learning the flow.",
  "bossIds": ["bone-drake", "iron-mimic"],
  "roleReward": {
    "roleRewardId": "example-bronze-raider-role",
    "unlockAnnouncementText": "Congratulations on clearing your first Bronze raid. You have now unlocked the next raid tier!"
  }
}
```

- `tierId` must be unique.
- `order` must be unique and controls display order.
- `bossIds` must contain at least one boss id.
- Every boss id in `bossIds` must exist and belong to the same tier.
- `roleReward` is optional. When present, successful active raiders who do not already have the role are granted it on a successful clear.
- `roleReward.unlockAnnouncementText` is posted to the achievements channel for newly granted raid-tier roles.

Boss shape:

```json
{
  "bossId": "bone-drake",
  "tierId": "bronze",
  "name": "Bone Drake",
  "level": 8,
  "maxHp": 160,
  "reward": {
    "pips": 6,
    "rollPassBuff": {
      "multiplierPerBossLevel": 1,
      "minimumMultiplier": 2,
      "maximumMultiplier": 10,
      "rollsPerBossLevelDivisor": 5,
      "minimumRolls": 1,
      "maximumRolls": 3
    }
  },
  "copy": {
    "recruitmentSummary": "A brittle drake circles the ruined tower.",
    "encounterTitle": "Bone Drake",
    "successSummary": "The Bone Drake collapses into splinters.",
    "failureSummary": "The Bone Drake escapes the tower ruins."
  }
}
```

- `bossId` must be unique.
- `tierId` must reference a defined tier.
- `level` and `maxHp` are static authored values. Raids do not roll random boss levels.
- `reward.pips` is the clear payout for a successful raid.
- `reward.rollPassBuff` uses the same roll-pass reward fields as World Boss rewards.

Shared copy shape:

```json
{
  "panelTitle": "Rolly Raids",
  "panelDescription": "Pick a tier, gather a party, and take down a raid boss.",
  "startRaidButtonLabel": "Start Raid",
  "joinRaidButtonLabel": "Join Raid",
  "leaveRaidButtonLabel": "Leave Raid",
  "startEncounterButtonLabel": "Start Encounter",
  "cancelRaidButtonLabel": "Cancel Raid"
}
```

Discord text safety:

- Panel titles, button labels, tier names, tier summaries, and authored boss copy are validated against the Discord limits used by the current raids surfaces.
- If startup rejects the file, trim the authored strings instead of relying on Discord to accept them.

Operational notes:

- Player-started raids use startup-synced tier panels rather than a `/raids` slash command.
- Every authored `tierId` that should be live in Discord must have a matching `RAIDS_TIER_BINDINGS_JSON` entry with a panel channel id and access role id.
- Changes to `raids.json` take effect after the bot restarts and re-syncs the raid tier panels. They do not require `npm run deploy:commands` unless you also changed slash command metadata elsewhere.
