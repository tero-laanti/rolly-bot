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

const maxBestRollPreviewDice = 12;

export const buildRaidHitSummary = (input: BuildRaidHitSummaryInput): string => {
  const lines: string[] = [];

  if (input.bestRollSet && input.bestRollSet.length > 0) {
    lines.push(`Best Roll: **${formatBestRollPreview(input.bestRollSet)}**`);
  }

  lines.push(`You dealt **${input.damage} World Boss damage.**`);

  const resolutionLine = input.defeated
    ? `**${input.bossName}** was defeated. ${input.eligibleParticipantCount} eligible player${input.eligibleParticipantCount === 1 ? "" : "s"} earned ${input.rewardSummary}.`
    : `**${input.bossName}** has ${input.currentHp}/${input.maxHp} HP remaining.`;

  lines.push(resolutionLine);
  return lines.join("\n");
};

const formatBestRollPreview = (bestRollSet: readonly number[]): string => {
  const preview = bestRollSet.slice(0, maxBestRollPreviewDice).join(" • ");
  const omittedDiceCount = bestRollSet.length - maxBestRollPreviewDice;

  if (omittedDiceCount <= 0) {
    return preview;
  }

  return `${preview} • ... (+${omittedDiceCount} more)`;
};
