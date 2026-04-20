import { appConfig } from "./config.js";
import { buildApprovalNotificationPayload, createBot } from "./bot/app.js";
import { Logger } from "./logger.js";
import { OpenRouterClient } from "./openrouter/client.js";
import { ApprovalService } from "./services/approval-service.js";
import { AnalyticsService } from "./services/analytics-service.js";
import { CommunityService } from "./services/community-service.js";
import { ContentService } from "./services/content-service.js";
import { SafetyService } from "./services/safety-service.js";
import { StateStore } from "./store/state-store.js";
import { TelegramAccountService } from "./telegram/account-service.js";

const logger = new Logger((appConfig.logLevel as "debug" | "info" | "warn" | "error") || "info");
const store = new StateStore(appConfig.stateFile);
const telegramAccountService = new TelegramAccountService(logger);
const openRouterClient = new OpenRouterClient(logger);
const safetyService = new SafetyService(openRouterClient, logger);
const contentService = new ContentService(store, telegramAccountService, openRouterClient, safetyService);
const analyticsService = new AnalyticsService(store, telegramAccountService, openRouterClient);
const communityService = new CommunityService(store, telegramAccountService, openRouterClient, safetyService, logger);
const approvalService = new ApprovalService(store, contentService, communityService, logger);
const bot = createBot(store, telegramAccountService, contentService, analyticsService, approvalService, logger);

approvalService.setNotifier(async (notification) => {
  const payload = buildApprovalNotificationPayload(notification);

  for (const adminId of appConfig.botAdminIds) {
    try {
      await bot.api.sendMessage(adminId, payload.text, {
        reply_markup: payload.replyMarkup
      });
    } catch (error) {
      logger.warn("Failed to send approval notification", {
        adminId,
        approvalId: notification.approval.id,
        error: String(error)
      });
    }
  }
});

let autoPostRunning = false;
let analyticsRunning = false;
let communityRunning = false;
let approvalRunning = false;

setInterval(async () => {
  if (autoPostRunning) {
    return;
  }

  autoPostRunning = true;
  try {
    const pending = await contentService.runAutopostCycle();
    await approvalService.notifyPendingApprovals(pending);
  } catch (error) {
    logger.error("Autopost cycle failed", { error: String(error) });
  } finally {
    autoPostRunning = false;
  }
}, 60_000);

setInterval(async () => {
  if (analyticsRunning) {
    return;
  }

  analyticsRunning = true;
  try {
    await analyticsService.runCycle();
  } catch (error) {
    logger.error("Analytics cycle failed", { error: String(error) });
  } finally {
    analyticsRunning = false;
  }
}, appConfig.analyticsIntervalMinutes * 60_000);

setInterval(async () => {
  if (communityRunning) {
    return;
  }

  communityRunning = true;
  try {
    const pending = await communityService.runCommentingCycle();
    await approvalService.notifyPendingApprovals(pending);
    await communityService.runModerationCycle();
  } catch (error) {
    logger.error("Community cycle failed", { error: String(error) });
  } finally {
    communityRunning = false;
  }
}, appConfig.communityIntervalMinutes * 60_000);

setInterval(async () => {
  if (approvalRunning) {
    return;
  }

  approvalRunning = true;
  try {
    await approvalService.runTimeoutCycle();
  } catch (error) {
    logger.error("Approval cycle failed", { error: String(error) });
  } finally {
    approvalRunning = false;
  }
}, 60_000);

await bot.init();
logger.info("Bot initialized", {
  username: bot.botInfo.username,
  stateFile: appConfig.stateFile
});

await bot.start({
  onStart: () => {
    logger.info("Bot started");
  }
});
