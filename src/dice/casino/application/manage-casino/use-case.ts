import type { UnitOfWork } from "../../../../shared-kernel/application/unit-of-work";
import type { DiceEconomyRepository } from "../../../economy/application/ports";
import type { DiceCasinoAnalyticsRepository, DiceCasinoSessionRepository } from "../ports";
import {
  adjustSessionBet,
  createSessionRecord,
  disableLegacyActions,
  invalidCasinoAction,
  normalizeSessionBet,
  refreshSession,
  reopenSessionRecord,
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

type DiceCasinoReplyPlan = {
  result: DiceCasinoResult;
  finalizeSessionToken?: string;
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
  ): DiceCasinoReplyPlan => {
    const pips = economy.getPips(userId);
    const activeSession = sessions.getActiveSession(userId, nowMs);

    if (activeSession) {
      const reopenedSession = reopenSessionRecord({
        session: activeSession,
        requestedBet,
        availablePips: pips,
        nowMs,
      });
      if (!reopenedSession.ok) {
        return {
          result: replyMessage(reopenedSession.message, true),
        };
      }

      return {
        result: {
          kind: "reply",
          payload: {
            type: "view",
            view: buildCasinoView(reopenedSession.session, pips),
            ephemeral: false,
          },
        },
        finalizeSessionToken: reopenedSession.session.state.sessionToken,
      };
    }

    const session = unitOfWork.runInTransaction(() => {
      const initialBet = resolveInitialBet(requestedBet, pips);
      if (!initialBet.ok) {
        return {
          message: initialBet.message,
        };
      }

      const nextSession = createSessionRecord(userId, initialBet.bet, nowMs);
      sessions.saveSession(nextSession);
      return nextSession;
    });

    if ("message" in session) {
      return {
        result: replyMessage(session.message, true),
      };
    }

    return {
      result: {
        kind: "reply",
        payload: {
          type: "view",
          view: buildCasinoView(session, pips),
          ephemeral: false,
        },
      },
    };
  };

  const finalizeDiceCasinoReply = (
    userId: string,
    requestedBet: number | null,
    sessionToken: string,
    nowMs: number = Date.now(),
  ): DiceCasinoResult => {
    const pips = economy.getPips(userId);

    const session = unitOfWork.runInTransaction(() => {
      const activeSession = sessions.getActiveSession(userId, nowMs);
      if (activeSession) {
        const reopenedSession = reopenSessionRecord({
          session: activeSession,
          requestedBet,
          availablePips: pips,
          nowMs,
          sessionToken,
        });
        if (!reopenedSession.ok) {
          return {
            message: reopenedSession.message,
          };
        }

        sessions.saveSession(reopenedSession.session);
        return reopenedSession.session;
      }

      const initialBet = resolveInitialBet(requestedBet, pips);
      if (!initialBet.ok) {
        return {
          message: initialBet.message,
        };
      }

      const nextSession = createSessionRecord(userId, initialBet.bet, nowMs, sessionToken);
      sessions.saveSession(nextSession);
      return nextSession;
    });

    if ("message" in session) {
      return {
        kind: "edit",
        payload: {
          type: "message",
          content: session.message,
          clearComponents: true,
        },
      };
    }

    return {
      kind: "edit",
      payload: {
        type: "view",
        view: buildCasinoView(session, pips),
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

    if (mutation.kind === "replaced") {
      return {
        kind: "edit",
        payload: {
          type: "message",
          content:
            "This casino session is no longer current. Start or rerun `/dice-casino` to continue.",
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
    finalizeDiceCasinoReply,
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

  if (action.sessionToken) {
    if (session.state.sessionToken !== action.sessionToken) {
      return {
        kind: "replaced",
      };
    }
  } else if (!session.state.allowLegacyActions) {
    return {
      kind: "replaced",
    };
  }

  const initialPips = economy.getPips(action.ownerId);
  const nextSession = refreshSession(session, nowMs);
  const nextPips = initialPips;

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
  if (result.kind !== "view") {
    return result;
  }

  const session = disableLegacyActions(result.session);
  sessions.saveSession(session);
  return {
    ...result,
    session,
  };
};
