import type { DiceCasinoActiveRound, DiceCasinoSession } from "../../domain/casino-session";
import {
  createDefaultDiceCasinoSessionState,
  createDiceCasinoSessionToken,
} from "../../domain/casino-session";
import {
  clampDiceCasinoBet,
  getDiceCasinoDefaultBet,
  getDiceCasinoMaxBet,
  getDiceCasinoMinBet,
  getDiceCasinoSessionTimeoutMs,
} from "../../domain/game-rules";
import type { DiceCasinoBetAdjustment, DiceCasinoResult, MutateSessionResult } from "./types";

export const resolveInitialBet = (
  requestedBet: number | null,
  availablePips: number,
): { ok: true; bet: number } | { ok: false; message: string } => {
  if (availablePips < getDiceCasinoMinBet()) {
    return {
      ok: false,
      message: "You need at least 1 pip to open the casino.",
    };
  }

  if (requestedBet !== null) {
    if (requestedBet > availablePips) {
      return {
        ok: false,
        message: `You need ${requestedBet} pips to use that bet. Current balance: ${availablePips} pips.`,
      };
    }

    return {
      ok: true,
      bet: clampDiceCasinoBet(requestedBet),
    };
  }

  return {
    ok: true,
    bet: availablePips >= getDiceCasinoDefaultBet() ? getDiceCasinoDefaultBet() : availablePips,
  };
};

export const createSessionRecord = (
  userId: string,
  bet: number,
  nowMs: number,
): DiceCasinoSession => {
  return {
    userId,
    bet,
    state: createDefaultDiceCasinoSessionState(),
    expiresAt: new Date(nowMs + getDiceCasinoSessionTimeoutMs()).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };
};

export const refreshSession = (session: DiceCasinoSession, nowMs: number): DiceCasinoSession => {
  return {
    ...session,
    expiresAt: new Date(nowMs + getDiceCasinoSessionTimeoutMs()).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };
};

export const replaceSessionRecord = (
  session: DiceCasinoSession,
  nowMs: number,
): DiceCasinoSession => {
  return {
    ...refreshSession(session, nowMs),
    state: {
      ...session.state,
      sessionToken: createDiceCasinoSessionToken(),
      allowLegacyActions: false,
    },
  };
};

export const reopenSessionRecord = ({
  session,
  requestedBet,
  availablePips,
  nowMs,
}: {
  session: DiceCasinoSession;
  requestedBet: number | null;
  availablePips: number;
  nowMs: number;
}): { ok: true; session: DiceCasinoSession } | { ok: false; message: string } => {
  const replacementSession = replaceSessionRecord(session, nowMs);

  if (requestedBet === null || requestedBet === session.bet) {
    return {
      ok: true,
      session: replacementSession,
    };
  }

  if (session.state.activeRound) {
    return {
      ok: false,
      message: "Finish the current round before changing the bet.",
    };
  }

  const nextBet = resolveInitialBet(requestedBet, availablePips);
  if (!nextBet.ok) {
    return nextBet;
  }

  return {
    ok: true,
    session: {
      ...replacementSession,
      bet: nextBet.bet,
    },
  };
};

export const disableLegacyActions = (session: DiceCasinoSession): DiceCasinoSession => {
  if (!session.state.allowLegacyActions) {
    return session;
  }

  return {
    ...session,
    state: {
      ...session.state,
      allowLegacyActions: false,
    },
  };
};

export const normalizeSessionBet = (
  session: DiceCasinoSession,
  pips: number,
): DiceCasinoSession => {
  if (session.state.activeRound || pips < getDiceCasinoMinBet()) {
    return session;
  }

  return {
    ...session,
    bet: clampBetToBalance(session.bet, pips),
  };
};

const clampBetToBalance = (bet: number, pips: number): number => {
  if (pips < getDiceCasinoMinBet()) {
    return getDiceCasinoMinBet();
  }

  return Math.max(getDiceCasinoMinBet(), Math.min(clampDiceCasinoBet(bet), pips));
};

export const adjustSessionBet = (
  bet: number,
  adjustment: DiceCasinoBetAdjustment,
  availablePips: number,
): number => {
  const maxAffordable = Math.max(
    getDiceCasinoMinBet(),
    Math.min(getDiceCasinoMaxBet(), availablePips),
  );
  const stepMap = {
    min: getDiceCasinoMinBet(),
    max: maxAffordable,
    "-10": bet - 10,
    "-1": bet - 1,
    "+1": bet + 1,
    "+10": bet + 10,
  } as const;

  return Math.max(getDiceCasinoMinBet(), Math.min(maxAffordable, stepMap[adjustment]));
};

export const getExpectedRound = <TRoundType extends DiceCasinoActiveRound["type"]>(
  round: DiceCasinoActiveRound | null,
  type: TRoundType,
): Extract<DiceCasinoActiveRound, { type: TRoundType }> | null => {
  if (!round || round.type !== type) {
    return null;
  }

  return round as Extract<DiceCasinoActiveRound, { type: TRoundType }>;
};

export const canStartCasinoRound = (bet: number, pips: number): boolean => {
  return pips >= bet && bet >= getDiceCasinoMinBet();
};

export const getOutcomeFromPayout = (bet: number, payout: number): "win" | "loss" | "push" => {
  if (payout === 0) {
    return "loss";
  }

  if (payout === bet) {
    return "push";
  }

  return "win";
};

export const viewMutation = (session: DiceCasinoSession, pips: number): MutateSessionResult => {
  return {
    kind: "view",
    session,
    pips,
  };
};

export const replyMutation = (content: string, ephemeral: boolean): MutateSessionResult => {
  return {
    kind: "reply",
    content,
    ephemeral,
  };
};

export const insufficientPipsReply = (bet: number, pips: number): MutateSessionResult => {
  return replyMutation(
    `You need ${bet} pips to play that round. Current balance: ${pips} pips.`,
    true,
  );
};

export const invalidCasinoAction = (): MutateSessionResult => {
  return replyMutation("That casino action is not available right now.", true);
};

export const replyMessage = (content: string, ephemeral: boolean): DiceCasinoResult => {
  return {
    kind: "reply",
    payload: {
      type: "message",
      content,
      ephemeral,
    },
  };
};

export const capitalize = (value: string): string => {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};
