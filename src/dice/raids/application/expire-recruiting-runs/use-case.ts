import type { ActionView } from "../../../../shared-kernel/application/action-view";
import type { RaidButtonAction } from "../manage-lobby/actions";
import type { RaidRunAggregate } from "../../domain/raid-run";
import { hasRaidRunExpired } from "../../domain/raid-run";
import type { RaidRunRepository, UpdateRaidStatusMessage } from "../ports";

export type ExpireRecruitingRaidRunsDependencies = {
  repository: RaidRunRepository;
  updateStatusMessage: UpdateRaidStatusMessage;
  buildRecruitmentView: (raidRun: RaidRunAggregate) => ActionView<RaidButtonAction>;
};

export type ExpireRecruitingRaidRunsSummary = {
  expiredCount: number;
  updatedMessageCount: number;
  updateFailureCount: number;
};

export const createExpireRecruitingRaidRunsUseCase = ({
  repository,
  updateStatusMessage,
  buildRecruitmentView,
}: ExpireRecruitingRaidRunsDependencies) => {
  return async ({
    now = new Date(),
  }: {
    now?: Date;
  } = {}): Promise<ExpireRecruitingRaidRunsSummary> => {
    const summary: ExpireRecruitingRaidRunsSummary = {
      expiredCount: 0,
      updatedMessageCount: 0,
      updateFailureCount: 0,
    };

    const recruitingRuns = repository.listRaidRunsByStatuses(["recruiting"]);
    for (const raidRun of recruitingRuns) {
      if (!hasRaidRunExpired(raidRun, now.getTime())) {
        continue;
      }

      const expired = repository.closeRaidRun({
        runId: raidRun.run.runId,
        expectedVersion: raidRun.run.version,
        status: "expired",
        now,
      });
      if (!expired.ok) {
        continue;
      }

      summary.expiredCount += 1;

      if (!expired.raidRun.run.publicMessageId) {
        continue;
      }

      try {
        await updateStatusMessage({
          channelId: expired.raidRun.run.publicChannelId,
          messageId: expired.raidRun.run.publicMessageId,
          view: buildRecruitmentView(expired.raidRun),
        });
        summary.updatedMessageCount += 1;
      } catch {
        summary.updateFailureCount += 1;
      }
    }

    return summary;
  };
};
