export type EconomyChange = {
  userId: string;
  amount: number;
};

export type EconomySnapshot = {
  fame: number;
  pips: number;
};

export type DailyPipGrantResult = {
  awarded: boolean;
  pips: number;
  lastDailyPipRewardAt: string | null;
};
