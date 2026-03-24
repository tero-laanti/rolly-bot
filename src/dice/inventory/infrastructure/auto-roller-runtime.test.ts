import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const moduleRequire = createRequire(__filename);

const clearModules = (modulePaths: readonly string[]): void => {
  for (const modulePath of modulePaths) {
    const resolved = moduleRequire.resolve(modulePath);
    delete require.cache[resolved];
  }
};

const withEnv = async (
  overrides: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> => {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    process.env = previous;
  }
};

test("auto-roll sessions publish achievement announcements from roll results", async () => {
  await withEnv({ ACHIEVEMENTS_CHANNEL_ID: "achievements-channel" }, async () => {
    const modulePaths = [
      "../../../shared/config",
      "../../../app/discord/achievement-announcements",
      "../../progression/infrastructure/sqlite/services",
      "./auto-roller-runtime",
    ] as const;
    clearModules(modulePaths);

    const services = moduleRequire(
      "../../progression/infrastructure/sqlite/services",
    ) as typeof import("../../progression/infrastructure/sqlite/services");
    const originalCreateSqliteRollDiceUseCase = services.createSqliteRollDiceUseCase;
    let runtime: typeof import("./auto-roller-runtime") | null = null;

    try {
      (services as { createSqliteRollDiceUseCase: unknown }).createSqliteRollDiceUseCase = () => {
        return () => ({
          autoRollClassification: { kind: "none" },
          achievementAnnouncements: [
            {
              userId: "user-1",
              achievementIds: ["achievement-auto-roll-test"],
            },
          ],
        });
      };

      runtime = moduleRequire("./auto-roller-runtime") as typeof import("./auto-roller-runtime");
      const sentPayloads: Array<{
        content: string;
        allowedMentions: {
          parse: string[];
          users: string[];
        };
      }> = [];
      const editedPayloads: Array<{
        content: string;
        components: [];
      }> = [];
      const reservation = runtime.reserveAutoRollSession({
        userId: "user-1",
        itemName: "Clockwork Croupier",
        durationSeconds: 0.001,
        intervalSeconds: 0.001,
      });

      if (!reservation) {
        throw new Error("Expected auto-roll session reservation.");
      }

      const started = await runtime.startReservedAutoRollSession(reservation, {
        db: {} as never,
        message: {
          client: {
            channels: {
              fetch: async (channelId: string) => {
                if (channelId !== "achievements-channel") {
                  return null;
                }

                return {
                  isTextBased: () => true,
                  send: async (options: {
                    content: string;
                    allowedMentions: {
                      parse: string[];
                      users: string[];
                    };
                  }) => {
                    sentPayloads.push(options);
                    return {} as never;
                  },
                };
              },
            },
          },
          edit: async (payload: { content: string; components: [] }) => {
            editedPayloads.push(payload);
            return {} as never;
          },
        } as never,
        userMention: "<@user-1>",
      });

      assert.equal(started, true);
      await new Promise((resolve) => setTimeout(resolve, 25));

      assert.deepEqual(sentPayloads, [
        {
          content: "<@user-1> Achievement unlocked: achievement-auto-roll-test.",
          allowedMentions: {
            parse: [],
            users: ["user-1"],
          },
        },
      ]);
      assert.equal(editedPayloads.length, 1);
    } finally {
      runtime?.cancelActiveAutoRollSession("user-1");
      (
        services as {
          createSqliteRollDiceUseCase: typeof services.createSqliteRollDiceUseCase;
        }
      ).createSqliteRollDiceUseCase = originalCreateSqliteRollDiceUseCase;
      clearModules(modulePaths);
    }
  });
});
