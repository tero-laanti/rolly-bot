import { SlashCommandBuilder } from "discord.js";
import { execute as rollExecute } from "./roll.command";

export const data = new SlashCommandBuilder().setName("r").setDescription("Roll your dice.");

export const execute = rollExecute;
