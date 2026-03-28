import assert from "node:assert/strict";
import test from "node:test";

import {
  formatContractCompletionAnnouncementContent,
  publishContractCompletionAnnouncements,
} from "./contract-completion-announcements";

test("formatter includes cadence, title, reward, and mention", () => {
  const content = formatContractCompletionAnnouncementContent({
    userId: "user-1",
    cadence: "weekly",
    contractTitle: "Marathon",
    rewardPips: 70,
  });

  assert.equal(content, "<@user-1> completed a Weekly contract: Marathon (+70 Pips).");
});

test("publisher skips channel lookup cleanly when disabled", async () => {
  let fetchCalled = false;

  await publishContractCompletionAnnouncements({
    client: {
      channels: {
        fetch: async () => {
          fetchCalled = true;
          return null;
        },
      },
    } as never,
    announcements: [
      {
        userId: "user-1",
        cadence: "daily",
        contractTitle: "Roll Routine",
        rewardPips: 12,
      },
    ],
    config: {
      enabled: false,
      inactiveReason: "disabled for test",
      channelId: null,
    },
    logger: {
      warn: () => undefined,
    },
  });

  assert.equal(fetchCalled, false);
});
