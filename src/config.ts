import path from "node:path";

import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  BOT_ADMIN_IDS: z.string().min(1, "BOT_ADMIN_IDS is required"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_TEXT_MODEL: z.string().default("openai/gpt-4.1-mini"),
  OPENROUTER_IMAGE_MODEL: z.string().default("google/gemini-2.5-flash-image"),
  APP_NAME: z.string().default("auto-smm-telegram"),
  APP_URL: z.string().optional(),
  STATE_FILE: z.string().default("data/state.json"),
  LOG_LEVEL: z.string().default("info"),
  DEFAULT_SOURCE_POST_LIMIT: z.coerce.number().int().positive().default(5),
  DEFAULT_IMAGE_ASPECT_RATIO: z.string().default("4:5"),
  DEFAULT_AUTOPUBLISH_INTERVAL_MINUTES: z.coerce.number().int().positive().default(240),
  DEFAULT_CALENDAR_TIMEZONE: z.string().default("Europe/Moscow"),
  DEFAULT_CALENDAR_EXPRESSION: z.string().default("weekdays@09:00,14:00,19:00"),
  ANALYTICS_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  COMMUNITY_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15)
});

const parsedEnv = envSchema.parse(process.env);

export const appConfig = {
  botToken: parsedEnv.BOT_TOKEN,
  botAdminIds: parsedEnv.BOT_ADMIN_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value)),
  openRouterApiKey: parsedEnv.OPENROUTER_API_KEY,
  openRouterBaseUrl: parsedEnv.OPENROUTER_BASE_URL.replace(/\/$/, ""),
  openRouterTextModel: parsedEnv.OPENROUTER_TEXT_MODEL,
  openRouterImageModel: parsedEnv.OPENROUTER_IMAGE_MODEL,
  appName: parsedEnv.APP_NAME,
  appUrl: parsedEnv.APP_URL,
  stateFile: path.resolve(process.cwd(), parsedEnv.STATE_FILE),
  logLevel: parsedEnv.LOG_LEVEL,
  defaultSourcePostLimit: parsedEnv.DEFAULT_SOURCE_POST_LIMIT,
  defaultImageAspectRatio: parsedEnv.DEFAULT_IMAGE_ASPECT_RATIO,
  defaultAutopublishIntervalMinutes: parsedEnv.DEFAULT_AUTOPUBLISH_INTERVAL_MINUTES,
  defaultCalendarTimezone: parsedEnv.DEFAULT_CALENDAR_TIMEZONE,
  defaultCalendarExpression: parsedEnv.DEFAULT_CALENDAR_EXPRESSION,
  analyticsIntervalMinutes: parsedEnv.ANALYTICS_INTERVAL_MINUTES,
  communityIntervalMinutes: parsedEnv.COMMUNITY_INTERVAL_MINUTES
};

if (appConfig.botAdminIds.length === 0) {
  throw new Error("BOT_ADMIN_IDS must contain at least one numeric Telegram user id");
}
