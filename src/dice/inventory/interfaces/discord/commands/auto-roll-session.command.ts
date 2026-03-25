import type { ButtonInteraction } from "discord.js";
import {
  applyButtonResult,
  createRenderedInteractionResult,
} from "../../../../../app/discord/interaction-response";
import { publishAchievementAnnouncements } from "../../../../../app/discord/achievement-announcements";
import type { SqliteDatabase } from "../../../../../shared/db";
import {
  buildAutoRollSessionStartingContent,
  cancelActiveAutoRollSession,
  releaseAutoRollSessionReservation,
  startReservedAutoRollSession,
} from "../../../infrastructure/auto-roller-runtime";
import type { AchievementAnnouncement } from "../../../../progression/application/achievement-announcements";
import type { AutoRollSessionReservation } from "../../../application/ports";

export const handleAutoRollSessionStart = async ({
  interaction,
  db,
  autoRollStart,
  achievementAnnouncements,
  finalizeAutoRollItemUse,
  refundInventoryItem,
}: {
  interaction: ButtonInteraction;
  db: SqliteDatabase;
  autoRollStart:
    | {
        reservation: AutoRollSessionReservation;
        itemId: string;
      }
    | undefined;
  achievementAnnouncements?: AchievementAnnouncement[];
  finalizeAutoRollItemUse: (input: { userId: string; itemId: string }) => {
    achievementAnnouncements?: AchievementAnnouncement[];
  };
  refundInventoryItem: (input: { userId: string; itemId: string; quantity?: number }) => number;
}): Promise<boolean> => {
  if (!autoRollStart) {
    return false;
  }

  const started = await startReservedAutoRollSession(autoRollStart.reservation, {
    db,
    message: interaction.message,
    userMention: interaction.user.toString(),
  });
  if (!started) {
    releaseAutoRollSessionReservation(autoRollStart.reservation);
    refundInventoryItem({
      userId: interaction.user.id,
      itemId: autoRollStart.itemId,
      quantity: 1,
    });
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Clockwork Croupier failed to start. The item was refunded.",
        ephemeral: true,
      },
    });
    return true;
  }

  let announcements = achievementAnnouncements ?? [];
  try {
    announcements = [
      ...announcements,
      ...(finalizeAutoRollItemUse({
        userId: interaction.user.id,
        itemId: autoRollStart.itemId,
      }).achievementAnnouncements ?? []),
    ];
  } catch (error) {
    cancelActiveAutoRollSession(interaction.user.id);
    refundInventoryItem({
      userId: interaction.user.id,
      itemId: autoRollStart.itemId,
      quantity: 1,
    });
    console.error("Failed to finalize auto-roll session startup:", error);
    await applyButtonResult(interaction, {
      kind: "reply",
      payload: {
        content: "Clockwork Croupier failed to start. The item was refunded.",
        ephemeral: true,
      },
    });
    return true;
  }

  await applyButtonResult(
    interaction,
    createRenderedInteractionResult(
      {
        kind: "update",
        payload: {
          content: buildAutoRollSessionStartingContent(autoRollStart.reservation),
          components: [],
        },
      },
      announcements,
    ).interactionResult,
  );
  await publishAchievementAnnouncements({
    client: interaction.client,
    announcements,
  });

  return true;
};
