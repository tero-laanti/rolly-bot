import assert from "node:assert/strict";
import test from "node:test";
import { createQueryDiceAchievementsUseCase } from "./use-case";
import { diceAchievements } from "../../domain/achievements";

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
  const expectedLastPage = Math.ceil(diceAchievements.length / 15);
  assert.match(
    result.payload.view.content,
    new RegExp(`Page: ${expectedLastPage}/${expectedLastPage}`),
  );
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
  assert.match(pageResult.payload.view.content, /Filter: All \| Page: 3\//);

  const filterResult = useCase.handleDiceAchievementsAction("user-1", {
    type: "filter-locked",
    ownerId: "user-1",
  });
  assert.equal(filterResult.kind, "update");
  assert.equal(filterResult.payload.type, "view");
  assert.match(filterResult.payload.view.content, /Filter: Locked \| Page: 1\//);
});
