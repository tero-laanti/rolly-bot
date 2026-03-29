import type { RaidButtonAction } from "../../../application/manage-lobby/actions";

export const raidButtonPrefix = "raids:";

const parseInteger = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

export const encodeRaidButtonAction = (action: RaidButtonAction): string => {
  switch (action.kind) {
    case "panel-open-boss-chooser":
      return `${raidButtonPrefix}panel-open-boss-chooser:${action.tierId}`;
    case "choose-boss":
      return `${raidButtonPrefix}choose-boss:${action.tierId}:${action.bossId}`;
    case "join-run":
      return `${raidButtonPrefix}join-run:${action.runId}:${action.version}`;
    case "leave-run":
      return `${raidButtonPrefix}leave-run:${action.runId}:${action.version}`;
    case "start-run":
      return `${raidButtonPrefix}start-run:${action.runId}:${action.version}`;
    case "cancel-run":
      return `${raidButtonPrefix}cancel-run:${action.runId}:${action.version}`;
  }
};

export const parseRaidButtonAction = (customId: string): RaidButtonAction | null => {
  if (!customId.startsWith(raidButtonPrefix)) {
    return null;
  }

  const payload = customId.slice(raidButtonPrefix.length);
  const parts = payload.split(":");
  const [kind, arg1, arg2] = parts;

  if (kind === "panel-open-boss-chooser" && parts.length === 2 && arg1) {
    return {
      kind,
      tierId: arg1,
    };
  }

  if (kind === "choose-boss" && parts.length === 3 && arg1 && arg2) {
    return {
      kind,
      tierId: arg1,
      bossId: arg2,
    };
  }

  if (
    (kind === "join-run" ||
      kind === "leave-run" ||
      kind === "start-run" ||
      kind === "cancel-run") &&
    parts.length === 3 &&
    arg1
  ) {
    const version = parseInteger(arg2);
    if (version === null) {
      return null;
    }

    return {
      kind,
      runId: arg1,
      version,
    };
  }

  return null;
};
