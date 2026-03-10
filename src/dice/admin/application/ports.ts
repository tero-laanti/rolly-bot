export type DiceAdminRuntimePort = {
  triggerRandomEventNow: () => Promise<{
    ok: boolean;
    reason?: string;
    result?: {
      created: boolean;
    } | null;
  }>;
  getRandomEventsAdminStatus: () => ReturnType<
    typeof import("../../random-events/infrastructure/admin-controller").getRandomEventsAdminStatus
  >;
};
