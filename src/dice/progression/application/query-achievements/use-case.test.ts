import assert from "node:assert/strict";
import test from "node:test";
import { createQueryDiceAchievementsUseCase } from "./use-case";

test("achievement browser clamps invalid page actions to the last page", () => {
  const useCase = createQueryDiceAchievementsUseCase({
    progression: {
      getUserDiceAchievements: () => [],
    },
  });

  const result = useCase.handleDiceAchievementsAction("user-1", {
    type: "page",
    ownerId: "user-1",
    filter: "all",
    page: 999,
  });

  assert.equal(result.kind, "update");
  assert.equal(result.payload.type, "view");
  assert.equal(result.payload.view.content.includes("Page: 1/1"), true);
});

test("achievement browser filter actions reset paging back to page 1", () => {
  const useCase = createQueryDiceAchievementsUseCase({
    progression: {
      getUserDiceAchievements: () => [],
    },
  });

  const pageResult = useCase.handleDiceAchievementsAction("user-1", {
    type: "page",
    ownerId: "user-1",
    filter: "all",
    page: 2,
  });
  assert.equal(pageResult.kind, "update");
  assert.equal(pageResult.payload.type, "view");
  assert.equal(pageResult.payload.view.content.includes("Filter: All | Page: 1/1"), true);

  const filterResult = useCase.handleDiceAchievementsAction("user-1", {
    type: "filter-locked",
    ownerId: "user-1",
  });
  assert.equal(filterResult.kind, "update");
  assert.equal(filterResult.payload.type, "view");
  assert.equal(filterResult.payload.view.content.includes("Filter: Locked | Page: 1/1"), true);
});

test("achievement browser unlocked rows show only titles", () => {
  const useCase = createQueryDiceAchievementsUseCase({
    progression: {
      getUserDiceAchievements: () => ["example-ordered-sequence"],
    },
  });

  const result = useCase.createDiceAchievementsReply("user-1");

  assert.equal(result.kind, "reply");
  assert.equal(result.payload.type, "view");
  assert.equal(result.payload.view.content.includes("[Unlocked] Example Ordered Sequence"), true);
  assert.equal(
    result.payload.view.content.includes("Example achievement: roll 1, 1 in order."),
    false,
  );
});
