import type { DiceAchievementId } from "../domain/achievements";

export type AchievementAnnouncement = {
  userId: string;
  achievementIds: DiceAchievementId[];
};

const toUniqueAchievementIds = (
  achievementIds: readonly DiceAchievementId[],
): DiceAchievementId[] => {
  return [...new Set(achievementIds)];
};

export const createAchievementAnnouncement = (
  userId: string,
  achievementIds: readonly DiceAchievementId[],
): AchievementAnnouncement | null => {
  const uniqueAchievementIds = toUniqueAchievementIds(achievementIds);
  if (userId.length < 1 || uniqueAchievementIds.length < 1) {
    return null;
  }

  return {
    userId,
    achievementIds: uniqueAchievementIds,
  };
};

export const mergeAchievementAnnouncements = (
  announcements: readonly AchievementAnnouncement[],
): AchievementAnnouncement[] => {
  const mergedByUserId = new Map<string, DiceAchievementId[]>();

  for (const announcement of announcements) {
    const existing = mergedByUserId.get(announcement.userId) ?? [];
    mergedByUserId.set(announcement.userId, [...existing, ...announcement.achievementIds]);
  }

  return Array.from(mergedByUserId.entries()).flatMap(([userId, achievementIds]) => {
    const merged = createAchievementAnnouncement(userId, achievementIds);
    return merged ? [merged] : [];
  });
};
