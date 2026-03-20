export type RandomEventAchievementStats = {
  successCount: number;
  failureCount: number;
  multiUserSuccessCount: number;
  legendarySuccessCount: number;
  lockoutCount: number;
  keepOpenComebackCount: number;
};

export const getRandomEventAchievementIds = (
  stats: RandomEventAchievementStats,
  options: {
    cursedEvening: boolean;
  },
): string[] => {
  const achievementIds: string[] = [];

  if (stats.successCount >= 1) {
    achievementIds.push("random-event-first-success");
  }
  if (stats.failureCount >= 1) {
    achievementIds.push("random-event-first-failure");
  }
  if (stats.successCount >= 10) {
    achievementIds.push("random-event-success-10");
  }
  if (stats.successCount >= 100) {
    achievementIds.push("random-event-success-100");
  }
  if (stats.failureCount >= 10) {
    achievementIds.push("random-event-failure-10");
  }
  if (stats.failureCount >= 100) {
    achievementIds.push("random-event-failure-100");
  }
  if (stats.multiUserSuccessCount >= 1) {
    achievementIds.push("random-event-multi-user-success");
  }
  if (stats.legendarySuccessCount >= 1) {
    achievementIds.push("legendary-success");
  }
  if (stats.lockoutCount >= 1) {
    achievementIds.push("random-event-lockout");
  }
  if (stats.keepOpenComebackCount >= 1) {
    achievementIds.push("keep-open-comeback");
  }
  if (options.cursedEvening) {
    achievementIds.push("cursed-evening");
  }

  return achievementIds;
};
