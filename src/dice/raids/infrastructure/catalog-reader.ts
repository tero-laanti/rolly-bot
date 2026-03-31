import { getDiceRaidsData } from "../../../rolly-data/load";
import type { RaidTierBindingConfig } from "../../../shared/config";
import type { RaidCatalogReader } from "../application/ports";
import type {
  RaidBossDefinition,
  RaidCatalogCopyDefinition,
  RaidTierDefinition,
} from "../domain/catalog";

const toRollPassReward = (reward: {
  pips: number;
  rollPassBuff: {
    minimumMultiplier: number;
    minimumRolls: number;
  };
}) => ({
  pips: reward.pips,
  rollPassMultiplier: reward.rollPassBuff.minimumMultiplier,
  rollPassRolls: reward.rollPassBuff.minimumRolls,
});

export const createRollyDataRaidCatalogReader = (): RaidCatalogReader => {
  const raids = getDiceRaidsData();
  const bossesById = new Map<string, RaidBossDefinition>(
    raids.bosses.map((boss) => [
      boss.bossId,
      {
        bossId: boss.bossId,
        tierId: boss.tierId,
        name: boss.name,
        level: boss.level,
        maxHp: boss.maxHp,
        reward: toRollPassReward(boss.reward),
        copy: {
          recruitmentSummary: boss.copy.recruitmentSummary,
          encounterTitle: boss.copy.encounterTitle,
          successSummary: boss.copy.successSummary,
          failureSummary: boss.copy.failureSummary,
        },
      },
    ]),
  );

  const tiers = raids.tiers.map<RaidTierDefinition>((tier) => ({
    tierId: tier.tierId,
    name: tier.name,
    summary: tier.summary,
    roleReward: tier.roleReward
      ? {
          roleRewardId: tier.roleReward.roleRewardId,
          unlockAnnouncementText: tier.roleReward.unlockAnnouncementText,
        }
      : undefined,
    bosses: tier.bossIds.flatMap((bossId) => {
      const boss = bossesById.get(bossId);
      return boss ? [boss] : [];
    }),
  }));

  const copy: RaidCatalogCopyDefinition = {
    panelTitle: raids.copy.panelTitle,
    panelDescription: raids.copy.panelDescription,
    startRaidButtonLabel: raids.copy.startRaidButtonLabel,
    joinRaidButtonLabel: raids.copy.joinRaidButtonLabel,
    leaveRaidButtonLabel: raids.copy.leaveRaidButtonLabel,
    startEncounterButtonLabel: raids.copy.startEncounterButtonLabel,
    cancelRaidButtonLabel: raids.copy.cancelRaidButtonLabel,
  };

  return {
    listRaidTiers: () => tiers,
    getRaidTier: (tierId) => tiers.find((tier) => tier.tierId === tierId) ?? null,
    getRaidBoss: (bossId) => bossesById.get(bossId) ?? null,
    getRaidCopy: () => copy,
  };
};

export const assertConfiguredRaidTierBindings = (
  catalogReader: RaidCatalogReader,
  tierBindings: Record<string, RaidTierBindingConfig>,
): void => {
  const knownTierIds = new Set(catalogReader.listRaidTiers().map((tier) => tier.tierId));
  const panelChannelIds = new Map<string, string>();

  for (const [tierId, binding] of Object.entries(tierBindings)) {
    if (!knownTierIds.has(tierId)) {
      throw new Error(`RAIDS_TIER_BINDINGS_JSON references unknown raids.json tierId "${tierId}".`);
    }

    const existingTierId = panelChannelIds.get(binding.panelChannelId);
    if (existingTierId) {
      throw new Error(
        `RAIDS_TIER_BINDINGS_JSON maps panel channel ${binding.panelChannelId} to both "${existingTierId}" and "${tierId}".`,
      );
    }

    panelChannelIds.set(binding.panelChannelId, tierId);
  }
};
