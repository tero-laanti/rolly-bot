type BuildRaidHitSummaryInput =
  | {
      damage: number;
      bossName: string;
      bestRollSet?: readonly number[] | null;
      defeated: false;
      currentHp: number;
      maxHp: number;
    }
  | {
      damage: number;
      bossName: string;
      bestRollSet?: readonly number[] | null;
      defeated: true;
      rewardSummary: string;
      eligibleParticipantCount: number;
    };

export const buildRaidHitSummary = (input: BuildRaidHitSummaryInput): string => {
  const lines: string[] = [];

  if (input.bestRollSet && input.bestRollSet.length > 0) {
    lines.push(`Best Roll: **${input.bestRollSet.join(" • ")}**`);
  }

  lines.push(`You dealt **${input.damage} raid damage.**`);

  const resolutionLine = input.defeated
    ? `**${input.bossName}** was defeated. ${input.eligibleParticipantCount} eligible raider${input.eligibleParticipantCount === 1 ? "" : "s"} earned ${input.rewardSummary}.`
    : `**${input.bossName}** has ${input.currentHp}/${input.maxHp} HP remaining.`;

  lines.push(resolutionLine);
  return lines.join("\n");
};
