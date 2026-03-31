import type { RaidDiceRollPort } from "../application/ports";
import type { RaidsLiveRuntime } from "./live-runtime";

type RegisteredRaidsController = {
  runtime: Pick<RaidsLiveRuntime, "applyDiceRoll"> | null;
};

let registeredController: RegisteredRaidsController | null = null;

export const registerRaidsController = (controller: RegisteredRaidsController): void => {
  registeredController = controller;
};

export const clearRaidsController = (): void => {
  registeredController = null;
};

const applyDiceRoll = (input: Parameters<RaidsLiveRuntime["applyDiceRoll"]>[0]) => {
  if (!registeredController?.runtime) {
    return {
      kind: "no-raid",
    } as const;
  }

  return registeredController.runtime.applyDiceRoll(input);
};

export const raidDiceRollPort: RaidDiceRollPort = {
  applyDiceRoll,
};
