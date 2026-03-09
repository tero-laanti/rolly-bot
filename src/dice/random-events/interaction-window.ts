import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbed,
} from "discord.js";

export const randomEventButtonPrefix = "random-event:";

export type RandomEventClaimPolicy = "first-click" | "multi-user";
export type RandomEventWindowStatus = "active" | "resolved" | "expired";

export type RandomEventInteractionWindowSnapshot = {
  windowId: string;
  policy: RandomEventClaimPolicy;
  status: RandomEventWindowStatus;
  createdAtMs: number;
  expiresAtMs: number;
  participants: string[];
};

export type RandomEventInteractionWindowLifecycleContext = {
  snapshot: RandomEventInteractionWindowSnapshot;
  reason: "claimed" | "expired" | "manual-close";
};

export type RandomEventInteractionWindowCallbacks = {
  onClaimed?: (
    snapshot: RandomEventInteractionWindowSnapshot,
    userId: string,
  ) => void | Promise<void>;
  onResolved?: (context: RandomEventInteractionWindowLifecycleContext) => void | Promise<void>;
};

export type OpenRandomEventInteractionWindowInput = {
  windowId: string;
  durationMs: number;
  policy: RandomEventClaimPolicy;
  maxParticipants?: number;
  callbacks?: RandomEventInteractionWindowCallbacks;
};

export type RandomEventInteractionClaimResult =
  | {
      status: "accepted";
      snapshot: RandomEventInteractionWindowSnapshot;
      becameResolved: boolean;
    }
  | {
      status: "already-joined";
      snapshot: RandomEventInteractionWindowSnapshot;
    }
  | {
      status: "closed";
      reason: "expired" | "resolved" | "missing";
      snapshot: RandomEventInteractionWindowSnapshot | null;
    }
  | {
      status: "already-claimed";
      snapshot: RandomEventInteractionWindowSnapshot;
      claimedByUserId: string;
    };

export type RandomEventInteractionWindowManager = {
  openWindow: (
    input: OpenRandomEventInteractionWindowInput,
  ) => RandomEventInteractionWindowSnapshot;
  claim: (windowId: string, userId: string) => RandomEventInteractionClaimResult;
  closeWindow: (
    windowId: string,
    reason?: "manual-close" | "claimed",
  ) => RandomEventInteractionWindowSnapshot | null;
  getWindow: (windowId: string) => RandomEventInteractionWindowSnapshot | null;
  listWindows: () => RandomEventInteractionWindowSnapshot[];
  stop: () => void;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type RandomEventInteractionWindowState = {
  windowId: string;
  policy: RandomEventClaimPolicy;
  status: RandomEventWindowStatus;
  createdAtMs: number;
  expiresAtMs: number;
  participants: Set<string>;
  maxParticipants: number | null;
  callbacks: RandomEventInteractionWindowCallbacks;
};

type InteractionWindowTimingHooks = {
  nowMs: () => number;
  setTimeoutFn: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeoutFn: (timer: TimerHandle) => void;
};

type InteractionWindowLogger = {
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type CreateManagerInput = {
  timingHooks?: Partial<InteractionWindowTimingHooks>;
  logger?: InteractionWindowLogger;
};

const defaultTimingHooks: InteractionWindowTimingHooks = {
  nowMs: () => Date.now(),
  setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeoutFn: (timer) => clearTimeout(timer),
};

const toSnapshot = (
  state: RandomEventInteractionWindowState,
): RandomEventInteractionWindowSnapshot => {
  return {
    windowId: state.windowId,
    policy: state.policy,
    status: state.status,
    createdAtMs: state.createdAtMs,
    expiresAtMs: state.expiresAtMs,
    participants: [...state.participants],
  };
};

const runCallbackSafely = (
  callback: (() => void | Promise<void>) | undefined,
  logger: InteractionWindowLogger,
): void => {
  if (!callback) {
    return;
  }

  try {
    const result = callback();
    if (result && typeof (result as Promise<void>).then === "function") {
      void (result as Promise<void>).catch((error) => {
        logger.error("[random-events] Interaction callback failed:", error);
      });
    }
  } catch (error) {
    logger.error("[random-events] Interaction callback failed:", error);
  }
};

const closeWindowState = (
  windowsById: Map<string, RandomEventInteractionWindowState>,
  timersByWindowId: Map<string, TimerHandle>,
  timingHooks: InteractionWindowTimingHooks,
  logger: InteractionWindowLogger,
  windowId: string,
  reason: "claimed" | "expired" | "manual-close",
): RandomEventInteractionWindowSnapshot | null => {
  const windowState = windowsById.get(windowId);
  if (!windowState) {
    return null;
  }

  if (windowState.status !== "active") {
    const snapshot = toSnapshot(windowState);
    if (windowsById.get(windowId) === windowState) {
      windowsById.delete(windowId);
    }
    return snapshot;
  }

  windowState.status = reason === "expired" ? "expired" : "resolved";

  const timer = timersByWindowId.get(windowId);
  if (timer) {
    timingHooks.clearTimeoutFn(timer);
    timersByWindowId.delete(windowId);
  }

  const snapshot = toSnapshot(windowState);
  runCallbackSafely(() => windowState.callbacks.onResolved?.({ snapshot, reason }), logger);

  if (windowsById.get(windowId) === windowState) {
    windowsById.delete(windowId);
  }
  return snapshot;
};

export const createRandomEventInteractionWindowManager = ({
  timingHooks,
  logger = console,
}: CreateManagerInput = {}): RandomEventInteractionWindowManager => {
  const resolvedTimingHooks: InteractionWindowTimingHooks = {
    ...defaultTimingHooks,
    ...timingHooks,
  };

  const windowsById = new Map<string, RandomEventInteractionWindowState>();
  const timersByWindowId = new Map<string, TimerHandle>();

  const closeWindow = (
    windowId: string,
    reason: "manual-close" | "claimed" = "manual-close",
  ): RandomEventInteractionWindowSnapshot | null => {
    return closeWindowState(
      windowsById,
      timersByWindowId,
      resolvedTimingHooks,
      logger,
      windowId,
      reason,
    );
  };

  const openWindow = ({
    windowId,
    durationMs,
    policy,
    maxParticipants,
    callbacks = {},
  }: OpenRandomEventInteractionWindowInput): RandomEventInteractionWindowSnapshot => {
    if (durationMs < 1) {
      throw new Error("durationMs must be at least 1.");
    }

    closeWindow(windowId, "manual-close");

    const nowMs = resolvedTimingHooks.nowMs();
    const windowState: RandomEventInteractionWindowState = {
      windowId,
      policy,
      status: "active",
      createdAtMs: nowMs,
      expiresAtMs: nowMs + durationMs,
      participants: new Set(),
      maxParticipants:
        typeof maxParticipants === "number" ? Math.max(1, Math.floor(maxParticipants)) : null,
      callbacks,
    };

    windowsById.set(windowId, windowState);

    const timer = resolvedTimingHooks.setTimeoutFn(() => {
      if (windowsById.get(windowId) !== windowState) {
        return;
      }

      closeWindowState(
        windowsById,
        timersByWindowId,
        resolvedTimingHooks,
        logger,
        windowId,
        "expired",
      );
    }, durationMs);
    timersByWindowId.set(windowId, timer);

    return toSnapshot(windowState);
  };

  const claim = (windowId: string, userId: string): RandomEventInteractionClaimResult => {
    const windowState = windowsById.get(windowId);
    if (!windowState) {
      return {
        status: "closed",
        reason: "missing",
        snapshot: null,
      };
    }

    if (windowState.status === "expired") {
      return {
        status: "closed",
        reason: "expired",
        snapshot: toSnapshot(windowState),
      };
    }

    if (windowState.status === "resolved") {
      return {
        status: "closed",
        reason: "resolved",
        snapshot: toSnapshot(windowState),
      };
    }

    if (resolvedTimingHooks.nowMs() >= windowState.expiresAtMs) {
      const snapshot = closeWindowState(
        windowsById,
        timersByWindowId,
        resolvedTimingHooks,
        logger,
        windowId,
        "expired",
      );
      return {
        status: "closed",
        reason: "expired",
        snapshot,
      };
    }

    if (windowState.policy === "first-click" && windowState.participants.size > 0) {
      const [claimedByUserId] = [...windowState.participants];
      return {
        status: "already-claimed",
        snapshot: toSnapshot(windowState),
        claimedByUserId: claimedByUserId ?? userId,
      };
    }

    if (windowState.participants.has(userId)) {
      return {
        status: "already-joined",
        snapshot: toSnapshot(windowState),
      };
    }

    windowState.participants.add(userId);
    const snapshotAfterClaim = toSnapshot(windowState);
    runCallbackSafely(() => windowState.callbacks.onClaimed?.(snapshotAfterClaim, userId), logger);

    const isSingleWinner = windowState.policy === "first-click";
    const reachedMaxParticipants =
      windowState.maxParticipants !== null &&
      windowState.participants.size >= windowState.maxParticipants;
    const shouldResolve = isSingleWinner || reachedMaxParticipants;

    if (!shouldResolve) {
      return {
        status: "accepted",
        snapshot: snapshotAfterClaim,
        becameResolved: false,
      };
    }

    const resolvedSnapshot = closeWindow(windowId, "claimed") ?? snapshotAfterClaim;
    return {
      status: "accepted",
      snapshot: resolvedSnapshot,
      becameResolved: true,
    };
  };

  const getWindow = (windowId: string): RandomEventInteractionWindowSnapshot | null => {
    const state = windowsById.get(windowId);
    return state ? toSnapshot(state) : null;
  };

  const listWindows = (): RandomEventInteractionWindowSnapshot[] => {
    return [...windowsById.values()].map(toSnapshot);
  };

  const stop = (): void => {
    for (const timer of timersByWindowId.values()) {
      resolvedTimingHooks.clearTimeoutFn(timer);
    }

    timersByWindowId.clear();
    windowsById.clear();
  };

  return {
    openWindow,
    claim,
    closeWindow,
    getWindow,
    listWindows,
    stop,
  };
};

export const buildRandomEventClaimButtonId = (windowId: string): string => {
  return `${randomEventButtonPrefix}${windowId}`;
};

export const parseRandomEventClaimButtonId = (customId: string): string | null => {
  if (!customId.startsWith(randomEventButtonPrefix)) {
    return null;
  }

  const windowId = customId.slice(randomEventButtonPrefix.length);
  return windowId.length > 0 ? windowId : null;
};

export type BuildRandomEventClaimPromptInput = {
  title: string;
  description: string;
  buttonCustomId: string;
  buttonLabel: string;
  color?: number;
  footerText?: string;
};

export const buildRandomEventClaimPrompt = ({
  title,
  description,
  buttonCustomId,
  buttonLabel,
  color,
  footerText,
}: BuildRandomEventClaimPromptInput): {
  embeds: APIEmbed[];
  components: ActionRowBuilder<ButtonBuilder>[];
} => {
  const embed = new EmbedBuilder().setTitle(title).setDescription(description);
  if (typeof color === "number") {
    embed.setColor(color);
  }
  if (footerText) {
    embed.setFooter({ text: footerText });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buttonCustomId)
      .setLabel(buttonLabel)
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embeds: [embed.toJSON()],
    components: [row],
  };
};
