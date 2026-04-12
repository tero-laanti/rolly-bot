import assert from "node:assert/strict";
import test from "node:test";
import {
  decideBeginnerMemberJoinTransition,
  decideBeginnerRollCompletedTransition,
} from "./beginner-onboarding-transitions";

test("member join publishes a welcome only for configured guilds where the user is still a beginner", () => {
  assert.deepEqual(
    decideBeginnerMemberJoinTransition({
      hasOnboardingConfig: true,
      hasReachedBeginnerMilestone: false,
      hasGraduatedInGuild: false,
    }),
    { kind: "publish-welcome" },
  );

  assert.deepEqual(
    decideBeginnerMemberJoinTransition({
      hasOnboardingConfig: false,
      hasReachedBeginnerMilestone: false,
      hasGraduatedInGuild: false,
    }),
    { kind: "noop" },
  );
});

test("member join graduates milestone-complete users once per guild", () => {
  assert.deepEqual(
    decideBeginnerMemberJoinTransition({
      hasOnboardingConfig: true,
      hasReachedBeginnerMilestone: true,
      hasGraduatedInGuild: false,
    }),
    { kind: "graduate-in-guild" },
  );

  assert.deepEqual(
    decideBeginnerMemberJoinTransition({
      hasOnboardingConfig: true,
      hasReachedBeginnerMilestone: true,
      hasGraduatedInGuild: true,
    }),
    { kind: "noop" },
  );
});

test("roll completion preserves the legacy handoff only when the milestone was newly reached outside onboarding guilds", () => {
  assert.deepEqual(
    decideBeginnerRollCompletedTransition({
      hasOnboardingConfig: false,
      guildId: null,
      didReachBeginnerMilestoneOnThisRoll: true,
      hasReachedBeginnerMilestone: false,
      hasGraduatedInGuild: false,
    }),
    { kind: "publish-legacy-handoff" },
  );

  assert.deepEqual(
    decideBeginnerRollCompletedTransition({
      hasOnboardingConfig: false,
      guildId: null,
      didReachBeginnerMilestoneOnThisRoll: false,
      hasReachedBeginnerMilestone: false,
      hasGraduatedInGuild: false,
    }),
    { kind: "noop" },
  );
});

test("roll completion graduates onboarding guild users only when globally eligible and not already graduated", () => {
  assert.deepEqual(
    decideBeginnerRollCompletedTransition({
      hasOnboardingConfig: true,
      guildId: "guild-1",
      didReachBeginnerMilestoneOnThisRoll: true,
      hasReachedBeginnerMilestone: true,
      hasGraduatedInGuild: false,
    }),
    { kind: "graduate-in-guild" },
  );

  assert.deepEqual(
    decideBeginnerRollCompletedTransition({
      hasOnboardingConfig: true,
      guildId: "guild-1",
      didReachBeginnerMilestoneOnThisRoll: true,
      hasReachedBeginnerMilestone: true,
      hasGraduatedInGuild: true,
    }),
    { kind: "noop" },
  );

  assert.deepEqual(
    decideBeginnerRollCompletedTransition({
      hasOnboardingConfig: true,
      guildId: "guild-1",
      didReachBeginnerMilestoneOnThisRoll: true,
      hasReachedBeginnerMilestone: false,
      hasGraduatedInGuild: false,
    }),
    { kind: "noop" },
  );
});
