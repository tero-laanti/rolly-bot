import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceCasinoAnalyticsRepository, DiceCasinoSessionRepository } from "../ports";
import {
  adjustSessionBet,
  createSessionRecord,
  invalidCasinoAction,
  normalizeSessionBet,
  refreshSession,
  replyMessage,
  replyMutation,
  resolveInitialBet,
  viewMutation,
} from "./helpers";
import { getDiceCasinoGameModule, handleDiceCasinoGameAction } from "./games";
export type { DiceCasinoAction, DiceCasinoResult } from "./types";
import type { DiceCasinoAction, DiceCasinoResult, MutateSessionResult } from "./types";
import { buildCasinoView } from "./view";

type ManageCasinoDependencies = {
  analytics: DiceCasinoAnalyticsRepository;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getPips">;
  sessions: DiceCasinoSessionRepository;
  unitOfWork: UnitOfWork;
};

export const createDiceCasinoUseCase = ({
  analytics,
  economy,
  sessions,
  unitOfWork,
}: ManageCasinoDependencies) => {
  const createDiceCasinoReply = (
    userId: string,
    requestedBet: number | null,
    nowMs: number = Date.now(),
  ): DiceCasinoResult => {
    const pips = economy.getPips(userId);
    const initialBet = resolveInitialBet(requestedBet, pips);
    if (!initialBet.ok) {
      return replyMessage(initialBet.message, true);
    }

    const session = unitOfWork.runInTransaction(() => {
      if (sessions.getActiveSession(userId, nowMs)) {
        sessions.expireSession(userId);
      }

      const nextSession = createSessionRecord(userId, initialBet.bet, nowMs);
      sessions.saveSession(nextSession);
      return nextSession;
    });

    return {
      kind: "reply",
      payload: {
        type: "view",
        view: buildCasinoView(session, pips),
        ephemeral: false,
      },
    };
  };

  const handleDiceCasinoAction = (
    actorId: string,
    action: DiceCasinoAction,
    nowMs: number = Date.now(),
  ): DiceCasinoResult => {
    if (actorId !== action.ownerId) {
      return replyMessage("This casino session is not assigned to you.", true);
    }

    const mutation = unitOfWork.runInTransaction(() =>
      mutateCasinoSession({ action, analytics, economy, nowMs, sessions }),
    );

    if (mutation.kind === "reply") {
      return replyMessage(mutation.content, mutation.ephemeral);
    }

    if (mutation.kind === "expired") {
      return {
        kind: "edit",
        payload: {
          type: "message",
          content: "This casino session has expired. Start `/dice-casino` again.",
          clearComponents: true,
        },
      };
    }

    return {
      kind: "update",
      payload: {
        type: "view",
        view: buildCasinoView(mutation.session, mutation.pips),
      },
    };
  };

  return {
    createDiceCasinoReply,
    handleDiceCasinoAction,
  };
};

const mutateCasinoSession = ({
  action,
  analytics,
  economy,
  nowMs,
  sessions,
}: {
  action: DiceCasinoAction;
  analytics: DiceCasinoAnalyticsRepository;
  economy: Pick<DiceEconomyRepository, "applyPipsDelta" | "getPips">;
  nowMs: number;
  sessions: DiceCasinoSessionRepository;
}): MutateSessionResult => {
  const session = sessions.getActiveSession(action.ownerId, nowMs);
  if (!session) {
    return {
      kind: "expired",
    };
  }

  const initialPips = economy.getPips(action.ownerId);
  let nextSession = refreshSession(session, nowMs);
  let nextPips = initialPips;

  if (action.type === "refresh") {
    return persistMutationResult(
      sessions,
      viewMutation(normalizeSessionBet(nextSession, nextPips), nextPips),
    );
  }

  if (action.type === "select-game") {
    if (nextSession.state.activeRound) {
      return replyMutation("Finish the current round before switching games.", true);
    }

    return persistMutationResult(
      sessions,
      viewMutation(
        normalizeSessionBet(
          {
            ...nextSession,
            state: {
              ...nextSession.state,
              selectedGame: action.game,
              lastOutcome: null,
            },
          },
          nextPips,
        ),
        nextPips,
      ),
    );
  }

  if (action.type === "adjust-bet") {
    if (nextSession.state.activeRound) {
      return replyMutation("Finish the current round before changing the bet.", true);
    }

    return persistMutationResult(
      sessions,
      viewMutation(
        {
          ...nextSession,
          bet: adjustSessionBet(nextSession.bet, action.adjustment, nextPips),
        },
        nextPips,
      ),
    );
  }

  if (action.type === "play") {
    if (nextSession.state.activeRound) {
      return replyMutation("Finish the current round before starting another one.", true);
    }

    return persistMutationResult(
      sessions,
      getDiceCasinoGameModule(nextSession.state.selectedGame).startRound({
        analytics,
        economy,
        session: nextSession,
        pips: nextPips,
      }),
    );
  }

  const gameMutation = handleDiceCasinoGameAction(
    {
      analytics,
      economy,
      session: nextSession,
      pips: nextPips,
    },
    action,
  );

  return persistMutationResult(sessions, gameMutation ?? invalidCasinoAction());
};

const persistMutationResult = (
  sessions: DiceCasinoSessionRepository,
  result: MutateSessionResult,
): MutateSessionResult => {
  if (result.kind === "view") {
    sessions.saveSession(result.session);
  }

  return result;
};
