import type { ButtonInteraction, Client, GuildMember } from "discord.js";
import { applyRenderedButtonResult } from "../../../app/discord/interaction-response";
import { renderActionResult } from "../../../app/discord/render-action-result";
import type { RaidsConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import { minuteMs } from "../../../shared/time";
import type { RecoverRaidRunsSummary } from "../application/recover-runs/use-case";
import {
  encodeRaidButtonAction,
  parseRaidButtonAction,
} from "../interfaces/discord/buttons/raid-buttons";
import {
  assertConfiguredRaidTierBindings,
  createRollyDataRaidCatalogReader,
} from "./catalog-reader";
import { createDiscordRaidInstanceProvisioner } from "./discord/discord-raid-instance-provisioner";
import { createDiscordRaidRecoveryInspector } from "./discord/discord-raid-recovery-inspector";
import { createDiscordRaidStatusPublisher } from "./discord/discord-raid-status-publisher";
import { getActiveRaidRunMembers } from "../domain/raid-run";
import { createSqliteRaidRunRepository } from "./sqlite/raid-run-repository";
import {
  createSqliteExpireRecruitingRaidRunsUseCase,
  createSqliteManageRaidLobbyUseCase,
  createSqliteRecoverRaidRunsUseCase,
} from "./sqlite/services";

type RaidsLiveRuntimeLogger = {
  log: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type RaidsLiveRuntime = {
  handleButtonInteraction: (interaction: ButtonInteraction) => Promise<void>;
  recoverRunsOnStartup: (input?: { now?: Date }) => Promise<RecoverRaidRunsSummary>;
  stop: () => Promise<void>;
};

const isGuildMemberWithRoles = (value: unknown): value is GuildMember => {
  if (typeof value !== "object" || value === null || !("roles" in value)) {
    return false;
  }

  const roles = (value as { roles?: unknown }).roles;
  return typeof roles === "object" && roles !== null && "cache" in roles;
};

const loadMemberForInteraction = async (
  interaction: ButtonInteraction,
): Promise<GuildMember | null> => {
  if (!interaction.guild) {
    return null;
  }

  if (isGuildMemberWithRoles(interaction.member)) {
    return interaction.member;
  }

  return interaction.guild.members.fetch(interaction.user.id);
};

const hasAccessRole = (member: GuildMember | null, accessRoleId: string): boolean => {
  return Boolean(member?.roles.cache.has(accessRoleId));
};

const replyEphemeral = async (interaction: ButtonInteraction, content: string): Promise<void> => {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({
      content,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content,
    ephemeral: true,
  });
};

export const createRaidsLiveRuntime = ({
  client,
  config,
  logger = console,
}: {
  client: Client;
  config: RaidsConfig;
  logger?: RaidsLiveRuntimeLogger;
}): RaidsLiveRuntime => {
  const db = getDatabase();
  const catalogReader = createRollyDataRaidCatalogReader();
  assertConfiguredRaidTierBindings(catalogReader, config.tierBindings);

  const repository = createSqliteRaidRunRepository(db);
  const statusPublisher = createDiscordRaidStatusPublisher(client);
  const inspector = createDiscordRaidRecoveryInspector(client);
  const provisioner = createDiscordRaidInstanceProvisioner({
    client,
    config,
  });

  const manageLobby = createSqliteManageRaidLobbyUseCase({
    db,
    catalogReader,
    provisioner,
  });
  const recoverRaidRuns = createSqliteRecoverRaidRunsUseCase({
    db,
    catalogReader,
    inspector,
    publishStatusMessage: statusPublisher.publishStatusMessage,
    updateStatusMessage: statusPublisher.updateStatusMessage,
  });
  const expireRecruitingRuns = createSqliteExpireRecruitingRaidRunsUseCase({
    db,
    catalogReader,
    updateStatusMessage: statusPublisher.updateStatusMessage,
  });

  let stopped = false;
  let expirySweepTimer: ReturnType<typeof setTimeout> | null = null;

  const clearExpirySweepTimer = (): void => {
    if (!expirySweepTimer) {
      return;
    }

    clearTimeout(expirySweepTimer);
    expirySweepTimer = null;
  };

  const scheduleExpirySweep = (): void => {
    if (stopped) {
      clearExpirySweepTimer();
      return;
    }

    if (expirySweepTimer) {
      return;
    }

    expirySweepTimer = setTimeout(() => {
      expirySweepTimer = null;
      void runExpirySweep();
    }, minuteMs);
  };

  const runExpirySweep = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    try {
      const summary = await expireRecruitingRuns();
      if (summary.expiredCount > 0 || summary.updatedMessageCount > 0) {
        logger.log(
          `[raids] Recruitment expiry sweep finished. expired=${summary.expiredCount} updated=${summary.updatedMessageCount} updateFailures=${summary.updateFailureCount}`,
        );
      }
    } catch (error) {
      logger.error?.("[raids] Recruitment expiry sweep failed:", error);
    } finally {
      scheduleExpirySweep();
    }
  };

  const requireTierAccess = async ({
    interaction,
    tierId,
    failureMessage,
  }: {
    interaction: ButtonInteraction;
    tierId: string;
    failureMessage: string;
  }): Promise<boolean> => {
    const binding = config.tierBindings[tierId];
    if (!binding) {
      await replyEphemeral(interaction, "This raid tier is not configured on this server.");
      return false;
    }

    const member = await loadMemberForInteraction(interaction);
    if (!hasAccessRole(member, binding.accessRoleId)) {
      await replyEphemeral(interaction, failureMessage);
      return false;
    }

    return true;
  };

  const requireRunAccess = async (
    interaction: ButtonInteraction,
    runId: string,
  ): Promise<{ tierId: string; accessRoleId: string } | null> => {
    const raidRun = repository.getRaidRun(runId);
    if (!raidRun) {
      await replyEphemeral(interaction, "This raid run is no longer available.");
      return null;
    }

    const binding = config.tierBindings[raidRun.run.tierId];
    if (!binding) {
      await replyEphemeral(interaction, "This raid tier is not configured on this server.");
      return null;
    }

    return {
      tierId: raidRun.run.tierId,
      accessRoleId: binding.accessRoleId,
    };
  };

  const ensurePartyStillHasTierAccess = async (
    interaction: ButtonInteraction,
    runId: string,
    accessRoleId: string,
  ): Promise<boolean> => {
    const raidRun = repository.getRaidRun(runId);
    if (!raidRun) {
      await replyEphemeral(interaction, "This raid run is no longer available.");
      return false;
    }

    for (const memberRecord of getActiveRaidRunMembers(raidRun)) {
      try {
        const member = await interaction.guild!.members.fetch(memberRecord.userId);
        if (!member.roles.cache.has(accessRoleId)) {
          await replyEphemeral(
            interaction,
            "Everyone in this raid party must still have access to this tier before the run can start.",
          );
          return false;
        }
      } catch {
        await replyEphemeral(
          interaction,
          "Everyone in this raid party must still have access to this tier before the run can start.",
        );
        return false;
      }
    }

    return true;
  };

  return {
    handleButtonInteraction: async (interaction) => {
      const action = parseRaidButtonAction(interaction.customId);
      if (!action) {
        return;
      }

      if (!config.enabled) {
        await replyEphemeral(interaction, "Raids are currently unavailable.");
        return;
      }

      if (!interaction.guild) {
        await replyEphemeral(interaction, "Raids can only be used inside a server channel.");
        return;
      }

      if (action.kind === "panel-open-boss-chooser" || action.kind === "choose-boss") {
        const hasTierAccess = await requireTierAccess({
          interaction,
          tierId: action.tierId,
          failureMessage: "You do not have access to this raid tier.",
        });
        if (!hasTierAccess) {
          return;
        }
      }

      if (action.kind === "join-run" || action.kind === "start-run") {
        const runAccess = await requireRunAccess(interaction, action.runId);
        if (!runAccess) {
          return;
        }

        const member = await loadMemberForInteraction(interaction);
        if (!hasAccessRole(member, runAccess.accessRoleId)) {
          await replyEphemeral(interaction, "You do not have access to this raid tier.");
          return;
        }

        if (
          action.kind === "start-run" &&
          !(await ensurePartyStillHasTierAccess(interaction, action.runId, runAccess.accessRoleId))
        ) {
          return;
        }
      }

      const result = await manageLobby.handleRaidAction({
        actorId: interaction.user.id,
        action,
        channelId: interaction.channelId,
        messageId: interaction.message.id,
        publishRecruitment:
          action.kind === "choose-boss"
            ? async (view) =>
                statusPublisher.publishRecruitment({
                  channelId: interaction.channelId,
                  view,
                })
            : null,
      });

      await applyRenderedButtonResult(
        interaction,
        renderActionResult(result, encodeRaidButtonAction),
      );
      scheduleExpirySweep();
    },
    recoverRunsOnStartup: async ({ now = new Date() }: { now?: Date } = {}) => {
      const summary = await recoverRaidRuns({ now });
      logger.log(
        `[raids] Startup recovery finished. resumed=${summary.resumedCount} republished=${summary.republishedCount} expired=${summary.expiredCount} interrupted=${summary.interruptedCount}`,
      );
      scheduleExpirySweep();
      return summary;
    },
    stop: async () => {
      stopped = true;
      clearExpirySweepTimer();
    },
  };
};
