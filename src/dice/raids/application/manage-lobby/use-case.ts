import { randomUUID } from "node:crypto";
import type { ActionResult, ActionView } from "../../../../shared-kernel/application/action-view";
import { chunkActionButtons } from "../../../../shared-kernel/application/action-view";
import { formatDiscordRelativeTime } from "../../../../shared/discord";
import type {
  PublishRaidRecruitment,
  RaidCatalogReader,
  RaidInstanceProvisioner,
  RaidRunRepository,
} from "../ports";
import type { RaidButtonAction } from "./actions";
import {
  getActiveRaidRunMembers,
  getRaidRunPartySize,
  hasRaidRunExpired,
  type RaidRunAggregate,
} from "../../domain/raid-run";
import {
  raidEncounterDurationMs,
  raidPartySizeLimit,
  raidRecruitmentDurationMs,
} from "../defaults";

const raidPartySizeMinimum = 2;

export type ManageRaidLobbyDependencies = {
  catalogReader: RaidCatalogReader;
  repository: RaidRunRepository;
  provisioner: RaidInstanceProvisioner;
  randomId?: () => string;
};

export type RaidLobbyResult = ActionResult<RaidButtonAction>;

type HandleRaidActionInput = {
  actorId: string;
  action: RaidButtonAction;
  channelId: string;
  messageId?: string | null;
  now?: Date;
  publishRecruitment?: PublishRaidRecruitment | null;
};

const replyView = (view: ActionView<RaidButtonAction>, ephemeral = true): RaidLobbyResult => ({
  kind: "reply",
  payload: {
    type: "view",
    view,
    ephemeral,
  },
});

const replyMessage = (content: string, ephemeral = true): RaidLobbyResult => ({
  kind: "reply",
  payload: {
    type: "message",
    content,
    ephemeral,
  },
});

const updateView = (view: ActionView<RaidButtonAction>): RaidLobbyResult => ({
  kind: "update",
  payload: {
    type: "view",
    view,
  },
});

const updateMessage = (content: string, clearComponents = false): RaidLobbyResult => ({
  kind: "update",
  payload: {
    type: "message",
    content,
    clearComponents,
  },
});

const findTierOrThrow = (catalogReader: RaidCatalogReader, tierId: string) => {
  return catalogReader.getRaidTier(tierId);
};

export const buildRaidTierPanelView = (
  catalogReader: RaidCatalogReader,
  tierId: string,
): ActionView<RaidButtonAction> => {
  const tier = findTierOrThrow(catalogReader, tierId);
  const copy = catalogReader.getRaidCopy();
  if (!tier) {
    return {
      content: `Unknown raid tier: ${tierId}.`,
      components: [],
    };
  }

  return {
    content: [
      `**${copy.panelTitle}**`,
      `**${tier.name}**`,
      copy.panelDescription,
      tier.summary,
    ].join("\n\n"),
    components: [
      [
        {
          action: {
            kind: "panel-open-boss-chooser",
            tierId,
          },
          label: copy.startRaidButtonLabel,
          style: "primary",
        },
      ],
    ],
  };
};

export const buildRaidBossChooserView = (
  catalogReader: RaidCatalogReader,
  tierId: string,
): ActionView<RaidButtonAction> => {
  const tier = findTierOrThrow(catalogReader, tierId);
  const copy = catalogReader.getRaidCopy();
  if (!tier) {
    return {
      content: `Unknown raid tier: ${tierId}.`,
      components: [],
    };
  }

  return {
    content: [
      `**${copy.panelTitle}**`,
      `**${tier.name}**`,
      tier.summary,
      "Pick the boss for this run.",
    ].join("\n\n"),
    components: chunkActionButtons(
      tier.bosses.map((boss) => ({
        action: {
          kind: "choose-boss",
          tierId,
          bossId: boss.bossId,
        } as const,
        label: `${boss.name} Lv.${boss.level}`,
        style: "primary" as const,
      })),
      2,
    ),
  };
};

const buildPartyLine = (raidRun: RaidRunAggregate): string => {
  const members = getActiveRaidRunMembers(raidRun);
  const partyText =
    members.length > 0 ? members.map((member) => `<@${member.userId}>`).join(", ") : "No party.";

  return `Party (${members.length}/${raidPartySizeLimit}): ${partyText}`;
};

export const buildRaidRecruitmentView = (
  catalogReader: RaidCatalogReader,
  raidRun: RaidRunAggregate,
): ActionView<RaidButtonAction> => {
  const tier = catalogReader.getRaidTier(raidRun.run.tierId);
  const boss = catalogReader.getRaidBoss(raidRun.run.bossId);
  const copy = catalogReader.getRaidCopy();
  const titlePrefix = tier ? `**${tier.name}**` : `**${copy.panelTitle}**`;
  const bossLine = boss
    ? `Boss: **${boss.name}** Lv.${boss.level} | ${boss.maxHp} HP`
    : `Boss: ${raidRun.run.bossId}`;
  const summaryLine = boss?.copy.recruitmentSummary ?? null;
  const partySize = getRaidRunPartySize(raidRun);
  const expiresLine =
    raidRun.run.status === "recruiting"
      ? `Expires ${formatDiscordRelativeTime(raidRun.run.recruitmentExpiresAt.getTime())}.`
      : null;
  const recruitingHelpLine =
    raidRun.run.status === "recruiting"
      ? `Need ${raidPartySizeMinimum}-${raidPartySizeLimit} players. Eligible players can join or leave; the leader starts or cancels the raid.`
      : null;

  const lines = [
    titlePrefix,
    summaryLine,
    bossLine,
    `Leader: <@${raidRun.run.leaderUserId}>`,
    buildPartyLine(raidRun),
    expiresLine,
    recruitingHelpLine,
  ].filter((line): line is string => Boolean(line));

  if (raidRun.run.status === "provisioned") {
    if (raidRun.run.privateChannelId) {
      lines.push(
        `Party locked. Head to <#${raidRun.run.privateChannelId}> and attack with \`/roll\`.`,
      );
    } else {
      lines.push("Party locked. Your private raid channel is ready.");
    }
  } else if (raidRun.run.status === "cancelled") {
    lines.push("Recruitment was cancelled.");
  } else if (raidRun.run.status === "expired") {
    lines.push(
      "Recruitment expired before the party locked in. Start a new raid from the tier panel.",
    );
  } else if (raidRun.run.status === "provision-failed") {
    lines.push("Raid instance creation failed before combat started.");
  } else if (raidRun.run.status === "interrupted") {
    lines.push("Raid run was interrupted and needs operator recovery.");
  }

  const isInteractive = raidRun.run.status === "recruiting";

  return {
    content: lines.join("\n"),
    components: isInteractive
      ? [
          [
            {
              action: {
                kind: "join-run",
                runId: raidRun.run.runId,
                version: raidRun.run.version,
              },
              label: copy.joinRaidButtonLabel,
              style: "success",
            },
            {
              action: {
                kind: "leave-run",
                runId: raidRun.run.runId,
                version: raidRun.run.version,
              },
              label: copy.leaveRaidButtonLabel,
              style: "secondary",
            },
          ],
          [
            {
              action: {
                kind: "start-run",
                runId: raidRun.run.runId,
                version: raidRun.run.version,
              },
              label: `Leader: ${copy.startEncounterButtonLabel}`,
              style: "primary",
              disabled: partySize < raidPartySizeMinimum,
            },
            {
              action: {
                kind: "cancel-run",
                runId: raidRun.run.runId,
                version: raidRun.run.version,
              },
              label: `Leader: ${copy.cancelRaidButtonLabel}`,
              style: "danger",
            },
          ],
        ]
      : [],
  };
};

const expireRaidRunIfNeeded = (
  repository: RaidRunRepository,
  catalogReader: RaidCatalogReader,
  raidRun: RaidRunAggregate,
  now: Date,
): RaidLobbyResult | null => {
  if (!hasRaidRunExpired(raidRun, now.getTime())) {
    return null;
  }

  const expired = repository.closeRaidRun({
    runId: raidRun.run.runId,
    expectedVersion: raidRun.run.version,
    status: "expired",
    now,
  });
  if (!expired.ok) {
    return replyMessage("This raid run was already handled.", true);
  }

  return updateView(buildRaidRecruitmentView(catalogReader, expired.raidRun));
};

export const createManageRaidLobbyUseCase = ({
  catalogReader,
  repository,
  provisioner,
  randomId = () => randomUUID(),
}: ManageRaidLobbyDependencies) => {
  const handleRaidAction = async ({
    actorId,
    action,
    channelId,
    messageId = null,
    now = new Date(),
    publishRecruitment = null,
  }: HandleRaidActionInput): Promise<RaidLobbyResult> => {
    if (action.kind === "panel-open-boss-chooser") {
      const tier = catalogReader.getRaidTier(action.tierId);
      if (!tier) {
        return replyMessage("Unknown raid tier.", true);
      }

      return replyView(buildRaidBossChooserView(catalogReader, tier.tierId), true);
    }

    if (action.kind === "choose-boss") {
      const tier = catalogReader.getRaidTier(action.tierId);
      const boss = catalogReader.getRaidBoss(action.bossId);
      if (!tier || !boss || boss.tierId !== tier.tierId) {
        return updateMessage("Unknown raid boss selection.", true);
      }

      if (!publishRecruitment) {
        return updateMessage("This channel cannot publish a raid recruitment right now.", true);
      }

      const created = repository.createRecruitingRaidRun({
        runId: randomId(),
        tierId: tier.tierId,
        bossId: boss.bossId,
        leaderUserId: actorId,
        publicChannelId: channelId,
        recruitmentExpiresAt: new Date(now.getTime() + raidRecruitmentDurationMs),
        now,
      });

      if (!created.ok) {
        return updateMessage("You are already assigned to an active raid run.", true);
      }

      const recruitmentView = buildRaidRecruitmentView(catalogReader, created.raidRun);

      try {
        const published = await publishRecruitment(recruitmentView);
        const attached = repository.updateRaidRun({
          runId: created.raidRun.run.runId,
          expectedVersion: created.raidRun.run.version,
          now,
          publicMessageId: published.messageId,
        });

        if (!attached.ok) {
          let deletedPublishedMessage = false;
          try {
            await published.deletePublishedMessage();
            deletedPublishedMessage = true;
          } catch {
            deletedPublishedMessage = false;
          }

          const closed = deletedPublishedMessage
            ? repository.closeRaidRun({
                runId: created.raidRun.run.runId,
                expectedVersion: created.raidRun.run.version,
                status: "cancelled",
                now,
              })
            : repository.updateRaidRunStoredReferences({
                runId: created.raidRun.run.runId,
                now,
                publicMessageId: published.messageId,
                closeOpenRunAsInterrupted: true,
              });
          if (closed.ok && deletedPublishedMessage) {
            return updateMessage(
              "Raid recruitment could not be finalized and was cancelled before players could join.",
              true,
            );
          }

          return updateMessage(
            "Raid recruitment could not be finalized and may need operator cleanup.",
            true,
          );
        }

        return updateMessage(`Raid recruitment posted: ${published.url}`, true);
      } catch {
        const closed = repository.closeRaidRun({
          runId: created.raidRun.run.runId,
          expectedVersion: created.raidRun.run.version,
          status: "cancelled",
          now,
        });
        if (!closed.ok) {
          return updateMessage(
            "Failed to publish the raid recruitment, and the draft run could not be cleaned up.",
            true,
          );
        }

        return updateMessage("Failed to publish the raid recruitment in this channel.", true);
      }
    }

    const raidRun = repository.getRaidRun(action.runId);
    if (!raidRun) {
      return replyMessage("Raid run not found.", true);
    }

    if (raidRun.run.publicMessageId && messageId && raidRun.run.publicMessageId !== messageId) {
      return replyMessage("This raid message is stale. Use the latest recruitment post.", true);
    }

    if (action.version !== raidRun.run.version) {
      return replyMessage("This raid view is stale. Use the latest buttons.", true);
    }

    const expired = expireRaidRunIfNeeded(repository, catalogReader, raidRun, now);
    if (expired) {
      return expired;
    }

    if (action.kind === "join-run") {
      const result = repository.addRaidRunMember({
        runId: raidRun.run.runId,
        userId: actorId,
        expectedVersion: action.version,
        now,
        partySizeLimit: raidPartySizeLimit,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "already-member":
            return replyMessage("You are already in this raid party.", true);
          case "user-active-run":
            return replyMessage("You are already assigned to another active raid run.", true);
          case "party-full":
            return replyMessage("This raid party is already full.", true);
          case "not-recruiting":
            return replyMessage("This raid is no longer recruiting.", true);
          default:
            return replyMessage("This raid view is stale. Use the latest recruitment post.", true);
        }
      }

      return updateView(buildRaidRecruitmentView(catalogReader, result.raidRun));
    }

    if (action.kind === "leave-run") {
      const result = repository.removeRaidRunMember({
        runId: raidRun.run.runId,
        userId: actorId,
        expectedVersion: action.version,
        now,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "leader-cannot-leave":
            return replyMessage("The raid leader must cancel instead of leaving.", true);
          case "not-member":
            return replyMessage("You are not in this raid party.", true);
          case "not-recruiting":
            return replyMessage("This raid is no longer recruiting.", true);
          default:
            return replyMessage("This raid view is stale. Use the latest recruitment post.", true);
        }
      }

      return updateView(buildRaidRecruitmentView(catalogReader, result.raidRun));
    }

    if (actorId !== raidRun.run.leaderUserId) {
      return replyMessage("Only the raid leader can do that.", true);
    }

    if (action.kind === "cancel-run") {
      const cancelled = repository.closeRaidRun({
        runId: raidRun.run.runId,
        expectedVersion: action.version,
        status: "cancelled",
        now,
      });

      if (!cancelled.ok) {
        return replyMessage("This raid was already handled.", true);
      }

      return updateView(buildRaidRecruitmentView(catalogReader, cancelled.raidRun));
    }

    if (raidRun.run.status !== "recruiting") {
      return replyMessage("This raid is no longer recruiting.", true);
    }

    const partySize = getRaidRunPartySize(raidRun);
    if (partySize < raidPartySizeMinimum) {
      return replyMessage(
        `You need at least ${raidPartySizeMinimum} players to start a raid.`,
        true,
      );
    }

    if (partySize > raidPartySizeLimit) {
      return replyMessage("This raid party is in an invalid state.", true);
    }

    const provisioning = repository.updateRaidRun({
      runId: raidRun.run.runId,
      expectedVersion: action.version,
      now,
      status: "provisioning",
      versionDelta: 1,
    });
    if (!provisioning.ok) {
      return replyMessage("This raid view is stale. Use the latest recruitment post.", true);
    }

    const tier = catalogReader.getRaidTier(provisioning.raidRun.run.tierId);
    const boss = catalogReader.getRaidBoss(provisioning.raidRun.run.bossId);
    if (!tier || !boss) {
      const interrupted = repository.closeRaidRun({
        runId: provisioning.raidRun.run.runId,
        expectedVersion: provisioning.raidRun.run.version,
        status: "interrupted",
        now,
      });
      if (!interrupted.ok) {
        return replyMessage("This raid could not be prepared.", true);
      }
      return updateView(buildRaidRecruitmentView(catalogReader, interrupted.raidRun));
    }

    const provisionedMembers = getActiveRaidRunMembers(provisioning.raidRun).map(
      (member) => member.userId,
    );
    const provisioned = await provisioner.provisionRaidInstance({
      runId: provisioning.raidRun.run.runId,
      publicChannelId: provisioning.raidRun.run.publicChannelId,
      leaderUserId: provisioning.raidRun.run.leaderUserId,
      participantUserIds: provisionedMembers,
      tierName: tier.name,
      bossName: boss.name,
    });

    if (!provisioned.ok) {
      let cleanupFailed = false;
      if (provisioned.privateChannelId || provisioned.participantRoleId) {
        try {
          await provisioner.cleanupRaidInstance({
            runId: provisioning.raidRun.run.runId,
            privateChannelId: provisioned.privateChannelId ?? null,
            participantRoleId: provisioned.participantRoleId ?? null,
          });
        } catch {
          cleanupFailed = true;
        }
      }

      const failed = repository.closeRaidRun({
        runId: provisioning.raidRun.run.runId,
        expectedVersion: provisioning.raidRun.run.version,
        status: cleanupFailed ? "interrupted" : "provision-failed",
        now,
        privateChannelId: cleanupFailed ? (provisioned.privateChannelId ?? null) : null,
        participantRoleId: cleanupFailed ? (provisioned.participantRoleId ?? null) : null,
      });
      if (!failed.ok) {
        return replyMessage("Raid instance creation failed.", true);
      }

      return updateView(buildRaidRecruitmentView(catalogReader, failed.raidRun));
    }

    const encounterStartsAt = now;
    const encounterExpiresAt = new Date(now.getTime() + raidEncounterDurationMs);
    const ready = repository.updateRaidRun({
      runId: provisioning.raidRun.run.runId,
      expectedVersion: provisioning.raidRun.run.version,
      now,
      status: "provisioned",
      privateChannelId: provisioned.privateChannelId,
      participantRoleId: provisioned.participantRoleId,
      encounterStartsAt,
      encounterExpiresAt,
      versionDelta: 1,
    });
    if (!ready.ok) {
      let cleanupFailed = false;
      try {
        await provisioner.cleanupRaidInstance({
          runId: provisioning.raidRun.run.runId,
          privateChannelId: provisioned.privateChannelId,
          participantRoleId: provisioned.participantRoleId,
        });
      } catch {
        cleanupFailed = true;
      }

      const interrupted = repository.closeRaidRun({
        runId: provisioning.raidRun.run.runId,
        expectedVersion: provisioning.raidRun.run.version,
        status: "interrupted",
        now,
        privateChannelId: cleanupFailed ? provisioned.privateChannelId : null,
        participantRoleId: cleanupFailed ? provisioned.participantRoleId : null,
      });
      if (interrupted.ok) {
        return updateView(buildRaidRecruitmentView(catalogReader, interrupted.raidRun));
      }

      return replyMessage(
        "Raid instance creation finished, but state tracking needs recovery.",
        true,
      );
    }

    return updateView(buildRaidRecruitmentView(catalogReader, ready.raidRun));
  };

  return {
    buildTierPanelView: (tierId: string) => buildRaidTierPanelView(catalogReader, tierId),
    handleRaidAction,
  };
};
