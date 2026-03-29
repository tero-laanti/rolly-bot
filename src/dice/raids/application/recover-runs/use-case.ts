import type { ActionView } from "../../../../shared-kernel/application/action-view";
import type { RaidButtonAction } from "../manage-lobby/actions";
import type {
  PublishRaidStatusMessage,
  RaidCatalogReader,
  RaidRecoveryInspector,
  RaidRunRepository,
} from "../ports";
import { hasRaidRunExpired, type RaidRunAggregate } from "../../domain/raid-run";

export type RecoverRaidRunsDependencies = {
  catalogReader: RaidCatalogReader;
  repository: RaidRunRepository;
  inspector: RaidRecoveryInspector;
  publishStatusMessage: PublishRaidStatusMessage;
  buildRecruitmentView: (raidRun: RaidRunAggregate) => ActionView<RaidButtonAction>;
};

export type RecoverRaidRunsSummary = {
  resumedCount: number;
  republishedCount: number;
  expiredCount: number;
  interruptedCount: number;
};

export const createRecoverRaidRunsUseCase = ({
  repository,
  inspector,
  publishStatusMessage,
  buildRecruitmentView,
}: RecoverRaidRunsDependencies) => {
  return async ({ now = new Date() }: { now?: Date } = {}): Promise<RecoverRaidRunsSummary> => {
    const summary: RecoverRaidRunsSummary = {
      resumedCount: 0,
      republishedCount: 0,
      expiredCount: 0,
      interruptedCount: 0,
    };

    const recoverableRuns = repository.listRaidRunsByStatuses([
      "recruiting",
      "provisioning",
      "provisioned",
      "active",
      "cancelled",
      "expired",
      "interrupted",
      "provision-failed",
    ]);

    for (const raidRun of recoverableRuns) {
      if (hasRaidRunExpired(raidRun, now.getTime())) {
        const expired = repository.closeRaidRun({
          runId: raidRun.run.runId,
          expectedVersion: raidRun.run.version,
          status: "expired",
          now,
        });
        if (expired.ok) {
          summary.expiredCount += 1;
        }
        continue;
      }

      let currentRun = raidRun;

      const shouldCheckPublicMessage = currentRun.run.status === "recruiting";
      let shouldRepublish = shouldCheckPublicMessage && currentRun.run.publicMessageId === null;

      if (shouldCheckPublicMessage && currentRun.run.publicMessageId) {
        let hasPublicMessage = false;
        try {
          hasPublicMessage = await inspector.hasPublicStatusMessage({
            channelId: currentRun.run.publicChannelId,
            messageId: currentRun.run.publicMessageId,
          });
        } catch {
          continue;
        }

        shouldRepublish = !hasPublicMessage;
      }

      if (shouldRepublish) {
        let republished: Awaited<ReturnType<PublishRaidStatusMessage>>;
        try {
          republished = await publishStatusMessage({
            channelId: currentRun.run.publicChannelId,
            view: buildRecruitmentView(currentRun),
          });
        } catch {
          continue;
        }

        const attached = repository.updateRaidRun({
          runId: currentRun.run.runId,
          expectedVersion: currentRun.run.version,
          now,
          publicMessageId: republished.messageId,
        });
        if (!attached.ok) {
          let deletedPublishedMessage = false;
          try {
            await republished.deletePublishedMessage();
            deletedPublishedMessage = true;
          } catch {
            // Recovery should continue even if the compensating delete fails.
          }

          if (!deletedPublishedMessage) {
            repository.updateRaidRunStoredReferences({
              runId: currentRun.run.runId,
              now,
              publicMessageId: republished.messageId,
              closeOpenRunAsInterrupted: true,
            });
          }
          continue;
        }

        currentRun = attached.raidRun;
        summary.republishedCount += 1;
      }

      if (
        !currentRun.run.isOpen &&
        (currentRun.run.publicMessageId ||
          currentRun.run.privateChannelId ||
          currentRun.run.participantRoleId)
      ) {
        let clearedPublicMessageId = false;
        if (currentRun.run.publicMessageId) {
          try {
            await inspector.deletePublicStatusMessage({
              channelId: currentRun.run.publicChannelId,
              messageId: currentRun.run.publicMessageId,
            });
            clearedPublicMessageId = true;
          } catch {
            // Cleanup failures should not block recovery of unrelated raid runs.
          }
        }

        let clearedProvisionedResources = false;
        try {
          await inspector.cleanupProvisionedRunResources({
            privateChannelId: currentRun.run.privateChannelId,
            participantRoleId: currentRun.run.participantRoleId,
          });
          clearedProvisionedResources = Boolean(
            currentRun.run.privateChannelId || currentRun.run.participantRoleId,
          );
        } catch {
          // Cleanup failures should not block recovery of unrelated raid runs.
        }

        if (clearedPublicMessageId || clearedProvisionedResources) {
          repository.updateRaidRunStoredReferences({
            runId: currentRun.run.runId,
            now,
            publicMessageId: clearedPublicMessageId ? null : undefined,
            privateChannelId: clearedProvisionedResources ? null : undefined,
            participantRoleId: clearedProvisionedResources ? null : undefined,
          });
        }
        continue;
      }

      if (
        currentRun.run.status === "provisioning" ||
        currentRun.run.status === "provisioned" ||
        currentRun.run.status === "active"
      ) {
        const members = currentRun.members
          .filter((member) => member.active)
          .map((member) => member.userId);
        let inspection;
        try {
          inspection = await inspector.inspectProvisionedRunResources({
            privateChannelId: currentRun.run.privateChannelId,
            participantRoleId: currentRun.run.participantRoleId,
            participantUserIds: members,
          });
        } catch {
          continue;
        }

        if (
          !inspection.privateChannelExists ||
          !inspection.participantRoleExists ||
          !inspection.participantAssignmentsValid
        ) {
          let cleanupFailed = false;
          try {
            await inspector.cleanupProvisionedRunResources({
              privateChannelId: currentRun.run.privateChannelId,
              participantRoleId: currentRun.run.participantRoleId,
            });
          } catch {
            cleanupFailed = true;
          }

          const interrupted = repository.closeRaidRun({
            runId: currentRun.run.runId,
            expectedVersion: currentRun.run.version,
            status: "interrupted",
            now,
            privateChannelId: cleanupFailed ? currentRun.run.privateChannelId : null,
            participantRoleId: cleanupFailed ? currentRun.run.participantRoleId : null,
          });
          if (interrupted.ok) {
            summary.interruptedCount += 1;
          }
          continue;
        }
      }

      summary.resumedCount += 1;
    }

    return summary;
  };
};
