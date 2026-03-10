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
  applyFameDelta: (change: EconomyChange) => number;
  applyPipsDelta: (change: EconomyChange) => number;
};
