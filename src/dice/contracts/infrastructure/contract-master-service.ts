import {
  discordMessageCharacterLimit,
  formatDiscordFullTime,
  formatDiscordRelativeTime,
  truncateDiscordText,
} from "../../../shared/discord";
import type { SqliteDatabase } from "../../../shared/db";
import { createSqliteUnitOfWork } from "../../../shared/infrastructure/sqlite/unit-of-work";
import { truncateWithSuffix } from "../../../shared/text";
import {
  chunkActionButtons,
  type ActionButtonSpec,
  type ActionView,
} from "../../../shared-kernel/application/action-view";
import { createManageContractMasterUseCase } from "../application/manage-contract-master/use-case";
import type {
  ContractCadenceView,
  ContractsCatalogReader,
  QueryContractsDependencies,
} from "../application/ports";
import { createQueryContractsUseCase } from "../application/query-contracts/use-case";
import { createResolveContractCadenceViewUseCase } from "../application/resolve-rotation/use-case";
import type { ContractCatalog, ContractCadence, ContractDifficulty } from "../domain/types";
import type { DiceContractsView } from "../application/query-contracts/use-case";
import { createOptionalRollyDataContractsCatalogReader } from "./rolly-data/contracts-catalog";
import {
  createSqliteContractMasterInitialOfferRepository,
  createSqliteContractMasterRerollUsageRepository,
  createSqliteContractMasterRunRepository,
  createSqliteContractMasterUserCadenceStateRepository,
} from "./sqlite/contract-master-repository";
import type { ContractMasterButtonAction } from "../interfaces/discord/buttons/contract-master-buttons";

const descriptionMaxLength = 180;
const trimmedSuffix = "\n...";

type ContractsReplyInput = {
  userId: string;
  userMention: string;
  now: Date;
};

type CadenceViewInput = {
  userId: string;
  cadence: ContractCadence;
  now: Date;
};

type OfferMutationInput = CadenceViewInput & {
  difficulty: ContractDifficulty;
};

export type ContractMasterPanelEmbeds = {
  artwork: {
    title: string;
    imageUrl: string;
  };
  details: {
    title: string;
    description: string;
  };
};

export type ContractMasterService = {
  createPanelView: () => ActionView<ContractMasterButtonAction>;
  createPanelEmbeds: () => ContractMasterPanelEmbeds;
  createCadenceView: (input: CadenceViewInput) => ActionView<ContractMasterButtonAction>;
  createChooserView: (input: CadenceViewInput) => ActionView<ContractMasterButtonAction>;
  acceptOffer: (input: OfferMutationInput) => ActionView<ContractMasterButtonAction>;
  rerollOffer: (input: OfferMutationInput) => ActionView<ContractMasterButtonAction>;
  createContractsReply: (input: ContractsReplyInput) => DiceContractsView;
};

const getUnavailableContractsMessage = (): string =>
  "**Rolly Contracts**\nContracts are currently unavailable on this bot. Add `contracts.v2.json` to the active rolly-data source to enable /contracts.";

const isContractMasterCatalog = (
  catalog: ReturnType<ContractsCatalogReader["getCatalog"]>,
): catalog is ContractCatalog => {
  return "panel" in catalog && !Array.isArray(catalog.daily) && !Array.isArray(catalog.weekly);
};

const assertContractMasterCatalog = (
  catalog: ReturnType<ContractsCatalogReader["getCatalog"]>,
): ContractCatalog => {
  if (!isContractMasterCatalog(catalog)) {
    throw new Error("Contract Master authored data is required for this operation.");
  }

  return catalog;
};

const limitDiscordMessage = (content: string): string => {
  return content.length <= discordMessageCharacterLimit
    ? content
    : truncateWithSuffix(content, discordMessageCharacterLimit, trimmedSuffix);
};

const formatResetLine = (resetAt: Date): string => {
  return `Resets ${formatDiscordRelativeTime(resetAt.getTime())} (${formatDiscordFullTime(resetAt.getTime())})`;
};

const formatOfferSource = (
  source: ContractCadenceView["offers"][number]["source"],
): string | null => {
  switch (source) {
    case "initial":
      return "Initial offer";
    case "reroll":
      return "Rerolled offer";
    case "refill":
      return "Refill offer";
    default:
      return null;
  }
};

const formatRerollStatus = (view: ContractCadenceView): string => {
  return view.offers
    .map((offer) => `${offer.label}: ${offer.rerollUsed ? "used" : "ready"}`)
    .join(" | ");
};

const formatRefillStatus = (view: ContractCadenceView): string => {
  if (view.activeRun) {
    return `Finish your active ${view.activeRun.difficulty} contract first.`;
  }

  if (view.completionCount < 1) {
    return "Locked until your first completion.";
  }

  if (view.completionCount >= view.contractsPerWindow) {
    return "Exhausted for this reset window.";
  }

  const remainingCount = view.contractsPerWindow - view.completionCount;
  const contractLabel = remainingCount === 1 ? "contract" : "contracts";
  return `Available for ${view.refillAvailableDifficulty ?? "unknown"} difficulty (${remainingCount} ${contractLabel} left).`;
};

const renderActiveRunLines = (view: ContractCadenceView): string[] => {
  if (!view.activeRun) {
    return ["No accepted contract right now."];
  }

  const progressLabel = `${view.activeRun.currentCount}/${view.activeRun.requiredCount}`;
  const statusLabel = view.activeRun.completedAt ? "Completed" : "In progress";

  return [
    `**${truncateDiscordText(view.activeRun.contractTitle, 72)}**`,
    truncateDiscordText(view.activeRun.contractDescription, descriptionMaxLength),
    `Difficulty: ${view.activeRun.difficulty}`,
    `Progress: ${progressLabel}`,
    `Reward: ${view.activeRun.rewardPips} Pips`,
    `Status: ${statusLabel}`,
  ];
};

const renderCadenceSummaryContent = ({
  panel,
  view,
  notice,
}: {
  panel: ContractCatalog["panel"];
  view: ContractCadenceView;
  notice?: string;
}): string => {
  const sections = [
    notice ? `**${notice}**` : null,
    [`**${view.label} Contracts**`, formatResetLine(view.resetAt)].join("\n"),
    renderActiveRunLines(view).join("\n"),
    [
      `Completed this window: ${view.completionCount}/${view.contractsPerWindow}`,
      `Rerolls: ${formatRerollStatus(view)}`,
      `Refill: ${formatRefillStatus(view)}`,
    ].join("\n"),
    `Use **${panel.askForContractButtonLabel}** below to open the chooser when a slot is available.`,
  ].filter((part): part is string => Boolean(part));

  return limitDiscordMessage(sections.join("\n\n"));
};

const renderOfferSection = (offer: ContractCadenceView["offers"][number]): string => {
  const lines = [`**${offer.label}** | ${offer.rewardPips} Pips`];

  if (!offer.offer) {
    lines.push(
      offer.unavailableReason ?? "No contract is currently available for this difficulty.",
    );
    return lines.join("\n");
  }

  const sourceLabel = formatOfferSource(offer.source);
  if (sourceLabel) {
    lines.push(sourceLabel);
  }

  lines.push(`**${truncateDiscordText(offer.offer.title, 72)}**`);
  lines.push(truncateDiscordText(offer.offer.description, descriptionMaxLength));
  lines.push(
    `Reroll: ${
      offer.source === "initial" ? (offer.rerollAvailable ? "ready" : "used") : "not available"
    }`,
  );

  return lines.join("\n");
};

const renderChooserContent = ({
  view,
  notice,
}: {
  view: ContractCadenceView;
  notice?: string;
}): string => {
  const sections = [
    notice ? `**${notice}**` : null,
    `**${view.chooserTitle}**`,
    view.chooserDescription,
    formatResetLine(view.resetAt),
    ...view.offers.map(renderOfferSection),
  ].filter((part): part is string => Boolean(part));

  return limitDiscordMessage(sections.join("\n\n"));
};

const getCadenceButtonLabel = (
  panel: ContractCatalog["panel"],
  cadence: ContractCadence,
): string => {
  return cadence === "daily" ? panel.dailyButtonLabel : panel.weeklyButtonLabel;
};

const buildCadenceNavigationButtons = (
  panel: ContractCatalog["panel"],
  currentCadence: ContractCadence,
): ActionButtonSpec<ContractMasterButtonAction>[] => {
  return (["daily", "weekly"] as const).map((cadence) => ({
    action: {
      kind: "view-open-cadence",
      cadence,
    },
    label: getCadenceButtonLabel(panel, cadence),
    style: cadence === currentCadence ? "primary" : "secondary",
  }));
};

const hasOpenChooserSlot = (view: ContractCadenceView): boolean => {
  return view.offers.some((offer) => Boolean(offer.offer) && offer.selectable);
};

const buildPanelView = (
  panel: ContractCatalog["panel"],
): ActionView<ContractMasterButtonAction> => {
  const content = "";

  return {
    content,
    components: chunkActionButtons([
      {
        action: {
          kind: "panel-open-cadence",
          cadence: "daily",
        },
        label: panel.dailyButtonLabel,
        style: "primary",
      },
      {
        action: {
          kind: "panel-open-cadence",
          cadence: "weekly",
        },
        label: panel.weeklyButtonLabel,
        style: "secondary",
      },
    ]),
  };
};

const buildPanelEmbeds = (panel: ContractCatalog["panel"]): ContractMasterPanelEmbeds => {
  return {
    artwork: {
      title: "\u200B",
      imageUrl: panel.imageUrl,
    },
    details: {
      title: panel.title,
      description: limitDiscordMessage([panel.description, panel.helperText].join("\n")),
    },
  };
};

const buildCadenceView = ({
  panel,
  view,
  notice,
}: {
  panel: ContractCatalog["panel"];
  view: ContractCadenceView;
  notice?: string;
}): ActionView<ContractMasterButtonAction> => {
  const buttons = [
    ...buildCadenceNavigationButtons(panel, view.cadence),
    {
      action: {
        kind: "open-chooser" as const,
        cadence: view.cadence,
      },
      label: panel.askForContractButtonLabel,
      style: "success" as const,
      disabled: !hasOpenChooserSlot(view),
    },
  ];

  return {
    content: renderCadenceSummaryContent({ panel, view, notice }),
    components: chunkActionButtons(buttons),
  };
};

const buildChooserView = ({
  panel,
  view,
  notice,
}: {
  panel: ContractCatalog["panel"];
  view: ContractCadenceView;
  notice?: string;
}): ActionView<ContractMasterButtonAction> => {
  return {
    content: renderChooserContent({ view, notice }),
    components: [
      buildCadenceNavigationButtons(panel, view.cadence),
      ...view.offers.map((offer): ActionButtonSpec<ContractMasterButtonAction>[] => [
        {
          action: {
            kind: "reroll-offer",
            cadence: view.cadence,
            difficulty: offer.difficulty,
          },
          label: `Reroll ${offer.label}`,
          style: "secondary",
          disabled:
            !offer.offer ||
            !offer.selectable ||
            offer.source !== "initial" ||
            !offer.rerollAvailable,
        },
        {
          action: {
            kind: "accept-offer",
            cadence: view.cadence,
            difficulty: offer.difficulty,
          },
          label: `Accept ${offer.label}`,
          style: "success",
          disabled: !offer.offer || !offer.selectable,
        },
      ]),
    ],
  };
};

export const createOptionalSqliteContractMasterService = (
  db: SqliteDatabase,
): ContractMasterService | null => {
  const catalogReader = createOptionalRollyDataContractsCatalogReader();
  if (!catalogReader) {
    return null;
  }

  const catalog = assertContractMasterCatalog(catalogReader.getCatalog());
  const initialOfferRepository = createSqliteContractMasterInitialOfferRepository(db);
  const userCadenceStateRepository = createSqliteContractMasterUserCadenceStateRepository(db);
  const runRepository = createSqliteContractMasterRunRepository(db);
  const rerollUsageRepository = createSqliteContractMasterRerollUsageRepository(db);
  const unitOfWork = createSqliteUnitOfWork(db);

  const cadenceResolver = createResolveContractCadenceViewUseCase({
    catalogReader,
    initialOfferRepository,
    userCadenceStateRepository,
    runRepository,
    rerollUsageRepository,
  });

  const selectionManager = createManageContractMasterUseCase({
    catalogReader,
    initialOfferRepository,
    userCadenceStateRepository,
    runRepository,
    rerollUsageRepository,
    unitOfWork,
  });

  const queryContracts = createQueryContractsUseCase({
    cadenceResolver,
  } satisfies QueryContractsDependencies);

  return {
    createPanelView: () => buildPanelView(catalog.panel),
    createPanelEmbeds: () => buildPanelEmbeds(catalog.panel),
    createCadenceView: ({ userId, cadence, now }) =>
      buildCadenceView({
        panel: catalog.panel,
        view: cadenceResolver.resolveCadenceView({ userId, cadence, now }),
      }),
    createChooserView: ({ userId, cadence, now }) =>
      buildChooserView({
        panel: catalog.panel,
        view: cadenceResolver.resolveCadenceView({ userId, cadence, now }),
      }),
    acceptOffer: ({ userId, cadence, difficulty, now }) => {
      const result = selectionManager.acceptOffer({
        userId,
        cadence,
        difficulty,
        now,
      });

      return buildCadenceView({
        panel: catalog.panel,
        view: result.cadenceView,
        notice: `Accepted ${result.acceptedRun.contractTitle}.`,
      });
    },
    rerollOffer: ({ userId, cadence, difficulty, now }) => {
      const view = selectionManager.rerollOffer({
        userId,
        cadence,
        difficulty,
        now,
      });
      const difficultyLabel = view.offers.find((offer) => offer.difficulty === difficulty)?.label;

      return buildChooserView({
        panel: catalog.panel,
        view,
        notice: `Rerolled ${difficultyLabel ?? difficulty}.`,
      });
    },
    createContractsReply: ({ userId, userMention, now }) =>
      queryContracts.createContractsReply({ userId, userMention, now }),
  };
};

export const createSqliteContractMasterService = (db: SqliteDatabase): ContractMasterService => {
  const service = createOptionalSqliteContractMasterService(db);
  if (service) {
    return service;
  }

  throw new Error(getUnavailableContractsMessage());
};
