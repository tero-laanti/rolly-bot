import type { Client } from "discord.js";
import type { AchievementAnnouncement } from "../../dice/progression/application/achievement-announcements";
import { publishAchievementAnnouncements } from "./achievement-announcements";
import { publishAchievementRoleRewards } from "./achievement-role-rewards";

type AchievementEffectsLogger = {
  warn: (...args: unknown[]) => void;
};

export const publishAchievementEffects = async ({
  client,
  announcements,
  logger = console,
}: {
  client: Client;
  announcements: readonly AchievementAnnouncement[];
  logger?: AchievementEffectsLogger;
}): Promise<void> => {
  await publishAchievementAnnouncements({
    client,
    announcements,
    logger,
  });
  await publishAchievementRoleRewards({
    client,
    announcements,
    logger,
  });
};
