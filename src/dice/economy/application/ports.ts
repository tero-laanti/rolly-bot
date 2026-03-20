export type EconomySnapshot = {
  fame: number;
  pips: number;
};

export type EconomyChange = {
  userId: string;
  amount: number;
};

export type DiceEconomyRepository = {
  getEconomySnapshot: (userId: string) => EconomySnapshot;
  getFame: (userId: string) => number;
  getPips: (userId: string) => number;
  getLastDailyPipRewardAt: (userId: string) => string | null;
  applyFameDelta: (change: EconomyChange) => number;
  applyPipsDelta: (change: EconomyChange) => number;
  grantDailyPipsIfEligible: (input: { userId: string; amount: number; nowMs?: number }) => {
    awarded: boolean;
    pips: number;
    lastDailyPipRewardAt: string | null;
  };
};
