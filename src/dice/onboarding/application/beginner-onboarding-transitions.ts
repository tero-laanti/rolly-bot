export type BeginnerMemberJoinTransition =
  | { kind: "noop" }
  | { kind: "publish-welcome" }
  | { kind: "graduate-in-guild" };

export const decideBeginnerMemberJoinTransition = ({
  hasOnboardingConfig,
  hasReachedBeginnerMilestone,
  hasGraduatedInGuild,
}: {
  hasOnboardingConfig: boolean;
  hasReachedBeginnerMilestone: boolean;
  hasGraduatedInGuild: boolean;
}): BeginnerMemberJoinTransition => {
  if (!hasOnboardingConfig) {
    return { kind: "noop" };
  }

  if (!hasReachedBeginnerMilestone && !hasGraduatedInGuild) {
    return { kind: "publish-welcome" };
  }

  if (hasReachedBeginnerMilestone && !hasGraduatedInGuild) {
    return { kind: "graduate-in-guild" };
  }

  return { kind: "noop" };
};

export type BeginnerRollCompletedTransition =
  | { kind: "noop" }
  | { kind: "publish-legacy-handoff" }
  | { kind: "graduate-in-guild" };

export const decideBeginnerRollCompletedTransition = ({
  hasOnboardingConfig,
  guildId,
  didReachBeginnerMilestoneOnThisRoll,
  hasReachedBeginnerMilestone,
  hasGraduatedInGuild,
}: {
  hasOnboardingConfig: boolean;
  guildId: string | null;
  didReachBeginnerMilestoneOnThisRoll: boolean;
  hasReachedBeginnerMilestone: boolean;
  hasGraduatedInGuild: boolean;
}): BeginnerRollCompletedTransition => {
  if (!hasOnboardingConfig || !guildId) {
    return didReachBeginnerMilestoneOnThisRoll
      ? { kind: "publish-legacy-handoff" }
      : { kind: "noop" };
  }

  if (!hasReachedBeginnerMilestone || hasGraduatedInGuild) {
    return { kind: "noop" };
  }

  return { kind: "graduate-in-guild" };
};
