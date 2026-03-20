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

test("achievement browser unlocked rows show only titles", () => {
  const [firstAchievement] = diceAchievements;
  assert.ok(firstAchievement);

  const useCase = createQueryDiceAchievementsUseCase({
    progression: {
      getUserDiceAchievements: () => [firstAchievement.id],
    },
  });

  const result = useCase.createDiceAchievementsReply("user-1");

  assert.equal(result.kind, "reply");
  assert.equal(result.payload.type, "view");
  assert.match(result.payload.view.content, new RegExp(`\\[Unlocked\\] ${firstAchievement.name}`));
  assert.equal(result.payload.view.content.includes(firstAchievement.description), false);
});

test("achievement browser pages stay under Discord's message limit with all achievements unlocked", () => {
  const useCase = createQueryDiceAchievementsUseCase({
    progression: {
      getUserDiceAchievements: () => diceAchievements.map((achievement) => achievement.id),
    },
  });
  const totalPages = Math.ceil(diceAchievements.length / 15);

  for (let page = 0; page < totalPages; page += 1) {
    const result =
      page === 0
        ? useCase.createDiceAchievementsReply("user-1")
        : useCase.handleDiceAchievementsAction("user-1", {
            type: "page",
            ownerId: "user-1",
            filter: "all",
            page,
          });

    assert.equal(result.payload.type, "view");
    assert.ok(result.payload.view.content.length < 2_000);
  }
});
