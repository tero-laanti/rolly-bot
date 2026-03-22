import type { DiceEconomyRepository } from "../ports";

type QueryDiceBalanceDependencies = {
  economy: Pick<DiceEconomyRepository, "getEconomySnapshot">;
};

export const createQueryDiceBalanceUseCase = ({ economy }: QueryDiceBalanceDependencies) => {
  const createDiceBalanceReply = (userId: string): string => {
    const balance = economy.getEconomySnapshot(userId);
    return `Your fame is at ${balance.fame}. You have ${balance.pips} pip${balance.pips === 1 ? "" : "s"}.`;
  };

  return {
    createDiceBalanceReply,
  };
};
