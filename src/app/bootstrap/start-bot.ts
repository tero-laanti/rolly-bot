import { requireEnv } from "../../shared/env";
import { startDiscordBot } from "../discord/bot-runtime";

requireEnv("DISCORD_TOKEN");
requireEnv("DISCORD_OWNER_ID");

void startDiscordBot();
