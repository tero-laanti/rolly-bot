export type DiceRaidAchievementStats = {
  joinedCount: number;
  hitCount: number;
  eligibleClearCount: number;
  topDamageClearCount: number;
  lifetimeDamage: number;
  highestClearedBossLevel: number;
  touristSuccessCount: number;
};

export const getDiceRaidAchievementIds = (stats: DiceRaidAchievementStats): string[] => {
  const achievementIds: string[] = [];

  if (stats.joinedCount >= 1) {
    achievementIds.push("raid-join");
  }
  if (stats.hitCount >= 1) {
    achievementIds.push("raid-first-hit");
  }
  if (stats.eligibleClearCount >= 1) {
    achievementIds.push("raid-first-clear");
  }
  if (stats.eligibleClearCount >= 10) {
    achievementIds.push("raid-clears-10");
  }
  if (stats.eligibleClearCount >= 100) {
    achievementIds.push("raid-clears-100");
  }
  if (stats.lifetimeDamage >= 1000) {
    achievementIds.push("raid-damage-1000");
  }
  if (stats.lifetimeDamage >= 10000) {
    achievementIds.push("raid-damage-10000");
  }
  if (stats.lifetimeDamage >= 100000) {
    achievementIds.push("raid-damage-100000");
  }
  if (stats.lifetimeDamage >= 1000000) {
    achievementIds.push("raid-damage-1000000");
  }
  if (stats.topDamageClearCount >= 1) {
    achievementIds.push("raid-top-damage-clear");
  }
  if (stats.highestClearedBossLevel >= 10) {
    achievementIds.push("raid-clear-level-10");
  }
  if (stats.highestClearedBossLevel >= 35) {
    achievementIds.push("raid-clear-level-35");
  }
  if (stats.touristSuccessCount >= 1) {
    achievementIds.push("raid-tourist");
  }

  return achievementIds;
};
