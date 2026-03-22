import type { Client, Guild } from "discord.js";

export type UserDisplayNameResolver = (userId: string) => Promise<string>;

type UserDisplayNameRuntime = {
  client: Client<true>;
  guild: Guild | null;
};

export const createUserDisplayNameResolver = ({
  client,
  guild,
}: UserDisplayNameRuntime): UserDisplayNameResolver => {
  const cache = new Map<string, Promise<string>>();

  return async (userId: string): Promise<string> => {
    const cached = cache.get(userId);
    if (cached) {
      return cached;
    }

    const pendingName = resolveUserDisplayName({ client, guild }, userId);
    cache.set(userId, pendingName);
    return pendingName;
  };
};

const resolveUserDisplayName = async (
  runtime: UserDisplayNameRuntime,
  userId: string,
): Promise<string> => {
  if (runtime.guild) {
    try {
      const member = await runtime.guild.members.fetch(userId);
      return member.displayName;
    } catch {
      // Fall back to the global user profile when the member is not available in the guild cache.
    }
  }

  try {
    const user = await runtime.client.users.fetch(userId);
    return user.globalName ?? user.username;
  } catch {
    return userId;
  }
};
