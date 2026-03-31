export type RaidRunStatus =
  | "recruiting"
  | "provisioning"
  | "provisioned"
  | "active"
  | "resolved"
  | "cancelled"
  | "expired"
  | "interrupted"
  | "provision-failed";

export type RaidRunRecord = {
  runId: string;
  tierId: string;
  bossId: string;
  leaderUserId: string;
  status: RaidRunStatus;
  isOpen: boolean;
  publicChannelId: string;
  publicMessageId: string | null;
  privateChannelId: string | null;
  participantRoleId: string | null;
  encounterMessageId: string | null;
  recruitmentExpiresAt: Date;
  encounterStartsAt: Date | null;
  encounterExpiresAt: Date | null;
  bossCurrentHp: number | null;
  rewardGrantedAt: Date | null;
  rewardSummary: string | null;
  closeScheduledAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RaidRunMemberRecord = {
  runId: string;
  userId: string;
  isLeader: boolean;
  active: boolean;
  joinedAt: Date;
  updatedAt: Date;
};

export type RaidRunAggregate = {
  run: RaidRunRecord;
  members: RaidRunMemberRecord[];
};

export const isRaidRunStatusOpen = (status: RaidRunStatus): boolean => {
  return (
    status === "recruiting" ||
    status === "provisioning" ||
    status === "provisioned" ||
    status === "active"
  );
};

export const getActiveRaidRunMembers = (
  run: Pick<RaidRunAggregate, "members">,
): RaidRunMemberRecord[] => {
  return run.members.filter((member) => member.active);
};

export const getRaidRunPartySize = (run: Pick<RaidRunAggregate, "members">): number => {
  return getActiveRaidRunMembers(run).length;
};

export const hasRaidRunExpired = (run: Pick<RaidRunAggregate, "run">, nowMs: number): boolean => {
  return run.run.status === "recruiting" && run.run.recruitmentExpiresAt.getTime() <= nowMs;
};
