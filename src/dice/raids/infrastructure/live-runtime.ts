import type { ButtonInteraction, Client, GuildMember } from "discord.js";
import { applyRenderedButtonResult } from "../../../app/discord/interaction-response";
import { renderActionResult } from "../../../app/discord/render-action-result";
import type { RaidsConfig } from "../../../shared/config";
import { getDatabase } from "../../../shared/db";
import { formatDiscordRelativeTime } from "../../../shared/discord";
import { createSqliteUnitOfWork } from "../../../shared/infrastructure/sqlite/unit-of-work";
import { minuteMs } from "../../../shared/time";
import { createSqliteEconomyRepository } from "../../economy/infrastructure/sqlite/balance-repository";
import { createSqliteProgressionRepository } from "../../progression/infrastructure/sqlite/progression-repository";
import type { RecoverRaidRunsSummary } from "../application/recover-runs/use-case";
import type { ApplyRaidDiceRollInput, ApplyRaidDiceRollResult } from "../application/ports";
import { buildRaidRecruitmentView } from "../application/manage-lobby/use-case";
import type { RaidBossDefinition, RaidTierDefinition } from "../domain/catalog";
import {
  encodeRaidButtonAction,
  parseRaidButtonAction,
} from "../interfaces/discord/buttons/raid-buttons";
import { buildRaidEncounterPrompt, buildRaidResolvedPrompt } from "../interfaces/discord/prompt";
import {
  assertConfiguredRaidTierBindings,
  createRollyDataRaidCatalogReader,
} from "./catalog-reader";
import { createDiscordRaidEncounterPublisher } from "./discord/discord-raid-encounter-publisher";
import { createDiscordRaidInstanceProvisioner } from "./discord/discord-raid-instance-provisioner";
import { createDiscordRaidRecoveryInspector } from "./discord/discord-raid-recovery-inspector";
import { createDiscordRaidStatusPublisher } from "./discord/discord-raid-status-publisher";
import { getActiveRaidRunMembers, type RaidRunAggregate } from "../domain/raid-run";
import { describeAppliedRaidReward, describeRaidReward } from "../domain/reward";
import { createSqliteRaidRunRepository } from "./sqlite/raid-run-repository";
import { grantRaidTierRoleRewards } from "./tier-role-rewards";
import {
  createSqliteExpireRecruitingRaidRunsUseCase,
  createSqliteManageRaidLobbyUseCase,
  createSqliteRecoverRaidRunsUseCase,
} from "./sqlite/services";

type RaidsLiveRuntimeLogger = {
  log: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export type RaidsLiveRuntime = {
  handleButtonInteraction: (interaction: ButtonInteraction) => Promise<void>;
  applyDiceRoll: (input: ApplyRaidDiceRollInput) => ApplyRaidDiceRollResult;
  recoverRunsOnStartup: (input?: { now?: Date }) => Promise<RecoverRaidRunsSummary>;
  stop: () => Promise<void>;
};

const closeDelayMs = 5 * minuteMs;
const unknownMessageErrorCode = 10008;

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

const isUnknownMessageError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === unknownMessageErrorCode
  );
};

const formatBestRollSet = (bestRollSet: readonly number[] | null): string => {
  if (!bestRollSet || bestRollSet.length < 1) {
    return "";
  }

  return ` Best set: **${bestRollSet.join(", ")}**.`;
};

const buildRaidHitSummary = ({
  damage,
  bossName,
  bestRollSet,
  defeated,
  currentHp,
  maxHp,
  rewardSummary,
}: {
  damage: number;
  bossName: string;
  bestRollSet: readonly number[] | null;
  defeated: boolean;
  currentHp?: number;
  maxHp?: number;
  rewardSummary?: string | null;
}): string => {
  if (defeated) {
    const rewardLine = rewardSummary ? ` Rewards granted: **${rewardSummary}**.` : "";
    return `Raid hit: **${damage}** damage to **${bossName}**. The boss is down.${rewardLine}${formatBestRollSet(bestRollSet)}`;
  }

  return `Raid hit: **${damage}** damage to **${bossName}**. HP: **${currentHp}/${maxHp}**.${formatBestRollSet(bestRollSet)}`;
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
  const economy = createSqliteEconomyRepository(db);
  const progression = createSqliteProgressionRepository(db);
  const statusPublisher = createDiscordRaidStatusPublisher(client);
  const encounterPublisher = createDiscordRaidEncounterPublisher(client);
  const inspector = createDiscordRaidRecoveryInspector(client);
  const provisioner = createDiscordRaidInstanceProvisioner({
    client,
    config,
  });
  const unitOfWork = createSqliteUnitOfWork(db);

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

  const buildEncounterPromptForRun = (runId: string) => {
    const raidRun = repository.getRaidRun(runId);
    if (!raidRun || !raidRun.run.privateChannelId) {
      return null;
    }

    const boss = catalogReader.getRaidBoss(raidRun.run.bossId);
    if (!boss || raidRun.run.bossCurrentHp === null) {
      return null;
    }

    const participantIds = getActiveRaidRunMembers(raidRun).map((member) => member.userId);
    if (raidRun.run.status === "resolved") {
      const summary =
        raidRun.run.bossCurrentHp === 0 ? boss.copy.successSummary : boss.copy.failureSummary;
      return {
        raidRun,
        prompt: buildRaidResolvedPrompt({
          bossName: boss.name,
          bossLevel: boss.level,
          currentHp: raidRun.run.bossCurrentHp,
          maxHp: boss.maxHp,
          participantIds,
          rewardSummary:
            raidRun.run.bossCurrentHp === 0
              ? (raidRun.run.rewardSummary ?? describeRaidReward(boss.reward))
              : null,
          summary,
          resolvedAtMs: raidRun.run.updatedAt.getTime(),
          closeScheduledAtMs:
            raidRun.run.closeScheduledAt?.getTime() ??
            raidRun.run.updatedAt.getTime() + closeDelayMs,
        }),
      };
    }

    if (raidRun.run.status !== "provisioned" && raidRun.run.status !== "active") {
      return null;
    }

    return {
      raidRun,
      prompt: buildRaidEncounterPrompt({
        bossName: boss.name,
        bossLevel: boss.level,
        encounterTitle: boss.copy.encounterTitle,
        currentHp: raidRun.run.bossCurrentHp,
        maxHp: boss.maxHp,
        rewardSummary: describeRaidReward(boss.reward),
        participantIds,
        startsAtMs: raidRun.run.encounterStartsAt?.getTime() ?? raidRun.run.updatedAt.getTime(),
        endsAtMs: raidRun.run.encounterExpiresAt?.getTime() ?? raidRun.run.updatedAt.getTime(),
      }),
    };
  };

  const applyRaidRewards = (raidRun: RaidRunAggregate, boss: RaidBossDefinition): string => {
    const awardedPipAmounts: number[] = [];
    const participantIds = getActiveRaidRunMembers(raidRun).map((member) => member.userId);

    for (const participantId of participantIds) {
      const grantedReward = economy.grantRewardPips({
        userId: participantId,
        baseAmount: boss.reward.pips,
      });
      awardedPipAmounts.push(grantedReward.awardedAmount);
      progression.applyDiceTemporaryEffect({
        userId: participantId,
        effectCode: "roll-pass-multiplier",
        kind: "positive",
        source: `raid:${raidRun.run.runId}`,
        magnitude: boss.reward.rollPassMultiplier,
        remainingRolls: boss.reward.rollPassRolls,
        consumeOnCommand: "dice",
        stackGroup: "raid-reward-roll-pass-multiplier",
        stackMode: "refresh",
      });
    }

    return describeAppliedRaidReward(boss.reward, awardedPipAmounts);
  };

  const settleRaidRun = (
    runId: string,
    outcome: "success" | "failure",
    now = new Date(),
  ): {
    raidRun: RaidRunAggregate;
    closeScheduledAt: Date;
    rewardSummary: string | null;
    tier: RaidTierDefinition | null;
  } | null => {
    try {
      return unitOfWork.runInTransaction(() => {
        const raidRun = repository.getRaidRun(runId);
        if (!raidRun || !raidRun.run.isOpen) {
          return null;
        }

        const boss = catalogReader.getRaidBoss(raidRun.run.bossId);
        if (!boss) {
          return null;
        }
        const tier = catalogReader.getRaidTier(raidRun.run.tierId);
        if (!tier) {
          return null;
        }

        const closeScheduledAt = new Date(now.getTime() + closeDelayMs);
        let rewardGrantedAt = raidRun.run.rewardGrantedAt;
        let rewardSummary = raidRun.run.rewardSummary;

        if (outcome === "success" && !rewardGrantedAt) {
          rewardSummary = applyRaidRewards(raidRun, boss);
          rewardGrantedAt = now;
        }

        const resolved = repository.closeRaidRun({
          runId: raidRun.run.runId,
          expectedVersion: raidRun.run.version,
          status: "resolved",
          now,
          bossCurrentHp: outcome === "success" ? 0 : (raidRun.run.bossCurrentHp ?? boss.maxHp),
          rewardGrantedAt: outcome === "success" ? rewardGrantedAt : null,
          rewardSummary: outcome === "success" ? rewardSummary : null,
          closeScheduledAt,
        });
        if (!resolved.ok) {
          return null;
        }

        return {
          raidRun: resolved.raidRun,
          closeScheduledAt,
          rewardSummary: outcome === "success" ? rewardSummary : null,
          tier: outcome === "success" ? tier : null,
        };
      });
    } catch (error) {
      if (outcome === "success") {
        logger.error?.("[raids] Failed to durably settle raid rewards:", error);
      } else {
        logger.error?.("[raids] Failed to resolve raid run:", error);
      }
      return null;
    }
  };

  const refreshPublicRaidStatus = async (runId: string): Promise<void> => {
    const raidRun = repository.getRaidRun(runId);
    if (!raidRun?.run.publicMessageId) {
      return;
    }

    await statusPublisher.updateStatusMessage({
      channelId: raidRun.run.publicChannelId,
      messageId: raidRun.run.publicMessageId,
      view: buildRaidRecruitmentView(catalogReader, raidRun),
    });
  };

  const ensureEncounterPrompt = async (runId: string, now = new Date()): Promise<void> => {
    const rendered = buildEncounterPromptForRun(runId);
    if (!rendered || !rendered.raidRun.run.privateChannelId) {
      return;
    }

    const { raidRun, prompt } = rendered;
    const publishPrompt = async (): Promise<void> => {
      const published = await encounterPublisher.publishEncounterMessage({
        channelId: raidRun.run.privateChannelId!,
        prompt,
      });

      if (raidRun.run.isOpen) {
        repository.updateRaidRun({
          runId: raidRun.run.runId,
          expectedVersion: raidRun.run.version,
          now,
          status: raidRun.run.status === "provisioned" ? "active" : raidRun.run.status,
          encounterMessageId: published.messageId,
          versionDelta: 1,
        });
        return;
      }

      repository.updateRaidRunStoredReferences({
        runId: raidRun.run.runId,
        now,
        encounterMessageId: published.messageId,
      });
    };

    if (!raidRun.run.encounterMessageId) {
      await publishPrompt();
      return;
    }

    try {
      await encounterPublisher.updateEncounterMessage({
        channelId: raidRun.run.privateChannelId!,
        messageId: raidRun.run.encounterMessageId,
        prompt,
      });
      if (raidRun.run.isOpen && raidRun.run.status === "provisioned") {
        repository.updateRaidRun({
          runId: raidRun.run.runId,
          expectedVersion: raidRun.run.version,
          now,
          status: "active",
          versionDelta: 1,
        });
      }
    } catch (error) {
      if (!isUnknownMessageError(error)) {
        throw error;
      }

      if (raidRun.run.isOpen) {
        const cleared = repository.updateRaidRun({
          runId: raidRun.run.runId,
          expectedVersion: raidRun.run.version,
          now,
          encounterMessageId: null,
          versionDelta: 1,
        });
        if (cleared.ok) {
          await ensureEncounterPrompt(runId, now);
        }
        return;
      }

      repository.updateRaidRunStoredReferences({
        runId: raidRun.run.runId,
        now,
        encounterMessageId: null,
      });
      await ensureEncounterPrompt(runId, now);
    }
  };

  const cleanupResolvedRaid = async (runId: string, now = new Date()): Promise<void> => {
    const raidRun = repository.getRaidRun(runId);
    if (!raidRun || raidRun.run.status !== "resolved") {
      return;
    }

    if (raidRun.run.publicMessageId) {
      await inspector.deletePublicStatusMessage({
        channelId: raidRun.run.publicChannelId,
        messageId: raidRun.run.publicMessageId,
      });
    }

    await provisioner.cleanupRaidInstance({
      runId: raidRun.run.runId,
      privateChannelId: raidRun.run.privateChannelId,
      participantRoleId: raidRun.run.participantRoleId,
    });

    repository.updateRaidRunStoredReferences({
      runId: raidRun.run.runId,
      now,
      publicMessageId: null,
      privateChannelId: null,
      participantRoleId: null,
      encounterMessageId: null,
      closeScheduledAt: null,
    });
  };

  const finalizeResolvedRaidSideEffects = async (
    settled: {
      raidRun: RaidRunAggregate;
      closeScheduledAt: Date;
      tier: RaidTierDefinition | null;
    },
    now = new Date(),
  ): Promise<void> => {
    if (settled.tier) {
      try {
        await grantRaidTierRoleRewards({
          client,
          raidRun: settled.raidRun,
          tier: settled.tier,
          logger,
        });
      } catch (error) {
        logger.error?.("[raids] Failed to grant raid tier role rewards:", error);
      }
    }

    try {
      await refreshPublicRaidStatus(settled.raidRun.run.runId);
    } catch (error) {
      logger.error?.("[raids] Failed to refresh resolved public raid status:", error);
    }

    try {
      await ensureEncounterPrompt(settled.raidRun.run.runId, now);
    } catch (error) {
      logger.error?.("[raids] Failed to render resolved raid prompt:", error);
    }

    if (settled.raidRun.run.privateChannelId) {
      try {
        await encounterPublisher.sendChannelMessage({
          channelId: settled.raidRun.run.privateChannelId,
          content: `Raid instance closing in 5 minutes. It closes ${formatDiscordRelativeTime(settled.closeScheduledAt.getTime())}.`,
        });
      } catch (error) {
        logger.error?.("[raids] Failed to send raid closing notice:", error);
      }
    }
  };

  const resolveRaidRun = async (
    runId: string,
    outcome: "success" | "failure",
    now = new Date(),
  ): Promise<boolean> => {
    const settled = settleRaidRun(runId, outcome, now);
    if (!settled) {
      return false;
    }

    await finalizeResolvedRaidSideEffects(settled, now);

    return true;
  };

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

      const now = new Date();
      for (const raidRun of repository.listRaidRunsByStatuses(["provisioned", "active"])) {
        if (raidRun.run.bossCurrentHp !== null && raidRun.run.bossCurrentHp <= 0) {
          await resolveRaidRun(raidRun.run.runId, "success", now);
          continue;
        }

        if (
          raidRun.run.encounterExpiresAt &&
          raidRun.run.encounterExpiresAt.getTime() <= now.getTime()
        ) {
          await resolveRaidRun(raidRun.run.runId, "failure", now);
          continue;
        }

        if (raidRun.run.status === "provisioned" || !raidRun.run.encounterMessageId) {
          await ensureEncounterPrompt(raidRun.run.runId, now);
        }
      }

      for (const raidRun of repository.listRaidRunsByStatuses(["resolved"])) {
        if (
          raidRun.run.closeScheduledAt &&
          raidRun.run.closeScheduledAt.getTime() <= now.getTime() &&
          (raidRun.run.privateChannelId ||
            raidRun.run.participantRoleId ||
            raidRun.run.publicMessageId)
        ) {
          await cleanupResolvedRaid(raidRun.run.runId, now);
          continue;
        }

        if (
          raidRun.run.closeScheduledAt &&
          raidRun.run.closeScheduledAt.getTime() > now.getTime() &&
          !raidRun.run.encounterMessageId
        ) {
          await ensureEncounterPrompt(raidRun.run.runId, now);
        }
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

      if (action.kind === "start-run") {
        try {
          await ensureEncounterPrompt(action.runId, new Date());
        } catch (error) {
          logger.error?.("[raids] Failed to publish raid encounter prompt:", error);
        }
      }

      scheduleExpirySweep();
    },
    applyDiceRoll: ({
      channelId,
      userId,
      userMention,
      damage,
      bestRollSet = null,
      nowMs = Date.now(),
    }) => {
      if (!channelId || damage <= 0) {
        return {
          kind: "no-raid",
        };
      }

      const now = new Date(nowMs);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const raidRun = repository.getOpenRaidRunByPrivateChannelId(channelId);
        if (!raidRun) {
          return {
            kind: "no-raid",
          };
        }

        const boss = catalogReader.getRaidBoss(raidRun.run.bossId);
        if (
          !boss ||
          raidRun.run.bossCurrentHp === null ||
          (raidRun.run.status !== "provisioned" && raidRun.run.status !== "active")
        ) {
          return {
            kind: "ignored",
            reason: "inactive",
            summary: "Too late - this raid is no longer active.",
          };
        }

        if (raidRun.run.bossCurrentHp <= 0) {
          void resolveRaidRun(raidRun.run.runId, "success", now);
          return {
            kind: "ignored",
            reason: "inactive",
            summary: "Too late - this raid is already resolving.",
          };
        }

        if (raidRun.run.encounterExpiresAt && raidRun.run.encounterExpiresAt.getTime() <= nowMs) {
          void resolveRaidRun(raidRun.run.runId, "failure", now);
          return {
            kind: "ignored",
            reason: "inactive",
            summary: "Too late - the raid timer already ended.",
          };
        }

        const isMember = raidRun.members.some(
          (member) => member.active && member.userId === userId,
        );
        if (!isMember) {
          return {
            kind: "ignored",
            reason: "not-member",
            summary: `${userMention}, this roll did not hit the raid boss because you're not part of this raid party.`,
          };
        }

        const nextHp = Math.max(0, raidRun.run.bossCurrentHp - damage);
        const updated = repository.updateRaidRun({
          runId: raidRun.run.runId,
          expectedVersion: raidRun.run.version,
          now,
          status: "active",
          bossCurrentHp: nextHp,
          versionDelta: 1,
        });
        if (!updated.ok) {
          if (updated.reason === "stale") {
            continue;
          }

          return {
            kind: "ignored",
            reason: "inactive",
            summary: "Too late - this raid is no longer active.",
          };
        }

        if (nextHp <= 0) {
          const settled = settleRaidRun(updated.raidRun.run.runId, "success", now);
          if (!settled) {
            return {
              kind: "ignored",
              reason: "inactive",
              summary: "Too late - this raid is no longer active.",
            };
          }

          const rewardSummary = settled.rewardSummary ?? describeRaidReward(boss.reward);
          void finalizeResolvedRaidSideEffects(settled, now).catch((error) => {
            logger.error?.("[raids] Failed to finalize resolved raid after defeating hit:", error);
          });
          scheduleExpirySweep();
          return {
            kind: "applied",
            defeated: true,
            summary: buildRaidHitSummary({
              damage,
              bossName: boss.name,
              bestRollSet,
              defeated: true,
              rewardSummary,
            }),
          };
        }

        void ensureEncounterPrompt(updated.raidRun.run.runId, now).catch((error) => {
          logger.error?.("[raids] Failed to refresh raid encounter prompt:", error);
        });
        scheduleExpirySweep();
        return {
          kind: "applied",
          defeated: false,
          summary: buildRaidHitSummary({
            damage,
            bossName: boss.name,
            bestRollSet,
            defeated: false,
            currentHp: nextHp,
            maxHp: boss.maxHp,
          }),
        };
      }

      return {
        kind: "ignored",
        reason: "inactive",
        summary: "Too late - this raid is no longer active.",
      };
    },
    recoverRunsOnStartup: async ({ now = new Date() }: { now?: Date } = {}) => {
      const summary = await recoverRaidRuns({ now });
      for (const raidRun of repository.listRaidRunsByStatuses([
        "provisioned",
        "active",
        "resolved",
      ])) {
        try {
          if (
            (raidRun.run.status === "provisioned" || raidRun.run.status === "active") &&
            raidRun.run.bossCurrentHp !== null &&
            raidRun.run.bossCurrentHp <= 0
          ) {
            await resolveRaidRun(raidRun.run.runId, "success", now);
            continue;
          }

          if (
            raidRun.run.status === "resolved" &&
            raidRun.run.closeScheduledAt &&
            raidRun.run.closeScheduledAt.getTime() <= now.getTime()
          ) {
            await cleanupResolvedRaid(raidRun.run.runId, now);
            continue;
          }

          await ensureEncounterPrompt(raidRun.run.runId, now);
        } catch (error) {
          logger.error?.("[raids] Failed to recover raid encounter prompt:", error);
        }
      }
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
