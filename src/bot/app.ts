import { Buffer } from "node:buffer";
import crypto from "node:crypto";

import { Bot, InlineKeyboard, InputFile, session, type Context } from "grammy";

import { appConfig } from "../config.js";
import { Logger } from "../logger.js";
import { createCalendarConfig, describeCalendar } from "../scheduling/calendar.js";
import { StateStore } from "../store/state-store.js";
import { createDefaultApprovalConfig } from "../target-defaults.js";
import { TelegramAccountService } from "../telegram/account-service.js";
import type { ContentMode, GeneratedDraft, PendingApproval, ReferenceChannel, TargetChannel, TelegramAccount } from "../types.js";
import { truncate } from "../utils/format.js";
import type { ApprovalNotification } from "../services/approval-service.js";
import { ApprovalService } from "../services/approval-service.js";
import { AnalyticsService } from "../services/analytics-service.js";
import { ContentService } from "../services/content-service.js";
import type { BotContextFlavor, BotFlow } from "./session.js";
import { initialSessionData } from "./session.js";

export type BotContext = Context & BotContextFlavor;

function isAdmin(userId: number | undefined): boolean {
  return typeof userId === "number" && appConfig.botAdminIds.includes(userId);
}

function parseYesNo(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "да", "д", "1", "on"].includes(normalized)) {
    return true;
  }
  if (["no", "n", "нет", "н", "0", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseApprovalTimeoutAction(value: string): "publish" | "skip" | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "publish") {
    return "publish";
  }
  if (["skip", "cancel"].includes(normalized)) {
    return "skip";
  }
  return undefined;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    hour12: false
  });
}

function buildApprovalKeyboard(approvalId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Approve", `approval:approve:${approvalId}`)
    .text("Reject", `approval:reject:${approvalId}`);
}

function buildApprovalCard(target: TargetChannel, approval: PendingApproval): string {
  const baseLines = [
    `Approval: ${approval.id}`,
    `Target: ${target.title} (${target.id})`,
    `Создано: ${formatDateTime(approval.createdAt)}`,
    `Дедлайн: ${formatDateTime(approval.expiresAt)} -> ${approval.timeoutAction}`
  ];

  if (approval.kind === "post") {
    return truncate(
      [
        "Нужен approve на автопост",
        ...baseLines,
        `Источников: ${approval.sourceCount}`,
        approval.draft.summary ? `Summary: ${approval.draft.summary}` : "",
        "Text:",
        approval.draft.text
      ]
        .filter(Boolean)
        .join("\n\n"),
      3900
    );
  }

  return truncate(
    [
      "Нужен approve на автокомментарий",
      ...baseLines,
      `Референс: ${approval.referenceChannelRef}#${approval.referencePostId}`,
      `Send as: ${approval.sendAsRef}`,
      "Text:",
      approval.commentText
    ]
      .filter(Boolean)
      .join("\n\n"),
    3900
  );
}

function formatApprovalSettings(target: TargetChannel): string {
  return [
    `posts: ${target.approval.posts.enabled ? "on" : "off"}, timeout=${target.approval.posts.timeoutMinutes}m, onTimeout=${target.approval.posts.onTimeout}`,
    `comments: ${target.approval.comments.enabled ? "on" : "off"}, timeout=${target.approval.comments.timeoutMinutes}m, onTimeout=${target.approval.comments.onTimeout}`
  ].join("\n");
}

export function buildApprovalNotificationPayload(notification: ApprovalNotification): {
  text: string;
  replyMarkup?: InlineKeyboard;
} {
  const card = buildApprovalCard(notification.target, notification.approval);

  switch (notification.event) {
    case "requested":
      return {
        text: card,
        replyMarkup: buildApprovalKeyboard(notification.approval.id)
      };
    case "approved":
      return {
        text: `Approve выполнен.\n\n${card}`
      };
    case "rejected":
      return {
        text: `Approve отклонен.\n\n${card}`
      };
    case "timeout_published":
      return {
        text: `Время ожидания истекло, действие выполнено автоматически.\n\n${card}`
      };
    case "timeout_skipped":
      return {
        text: `Время ожидания истекло, действие пропущено.\n\n${card}`
      };
    case "failed":
      return {
        text: truncate(`Approve завершился ошибкой.\n\n${card}\n\nDetail: ${notification.detail || "-"}`, 3900)
      };
  }
}

function parseDraftImage(draft: GeneratedDraft): InputFile | undefined {
  if (!draft.imageDataUrl) {
    return undefined;
  }

  const match = draft.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[2]) {
    return undefined;
  }

  const extension = match[1]?.split("/")[1] || "png";
  return new InputFile(Buffer.from(match[2], "base64"), `generated.${extension}`);
}

function formatAccounts(accounts: TelegramAccount[]): string {
  if (accounts.length === 0) {
    return "Аккаунтов пока нет. Используй /account_add";
  }

  return accounts
    .map((account) => `• ${account.id} — ${account.name}`)
    .join("\n");
}

function formatTargets(targets: TargetChannel[]): string {
  if (targets.length === 0) {
    return "Целевых каналов пока нет. Используй /target_add";
  }

  return targets
    .map((target) => {
      const refs = target.referenceChannels.length;
      const mode =
        target.publishMode === "calendar"
          ? `calendar ${describeCalendar(target.calendar)}`
          : target.publishMode === "interval" && target.autoPost.enabled
            ? `interval ${target.autoPost.intervalMinutes}m`
            : "manual";
      const pending = target.pendingApprovals.length > 0 ? `, pending=${target.pendingApprovals.length}` : "";
      return `• ${target.id} — ${target.title} (${target.channelRef}), refs=${refs}, ${mode}${pending}`;
    })
    .join("\n");
}

function formatReferences(target: TargetChannel): string {
  if (target.referenceChannels.length === 0) {
    return `У канала ${target.title} пока нет референсов. Используй /ref_add`;
  }

  return target.referenceChannels
    .map(
      (reference) =>
        `• ${reference.id} — ${reference.title || reference.channelRef} (${reference.channelRef}), limit=${reference.fetchLimit}, comments=${reference.commentingEnabled ? "on" : "off"}`
    )
    .join("\n");
}

function buildHelpText(): string {
  return [
    "Команды:",
    "/start или /help — показать помощь",
    "/cancel — сбросить текущий пошаговый сценарий",
    "/accounts — список аккаунтов",
    "/account_add — добавить Telegram user-session",
    "/targets — список целевых каналов",
    "/target_add — добавить канал для ведения",
    "/refs <targetId> — показать референсные каналы",
    "/ref_add — добавить референсный канал",
    "/generate <targetId> — собрать новый черновик",
    "/preview <targetId> — показать последний черновик",
    "/publish <targetId> — опубликовать последний черновик",
    "/schedule <targetId> <minutes|off> — интервал-постинг",
    "/calendar <targetId> — показать календарь",
    "/calendar_set <targetId> <timezone> <expression> — включить календарь",
    "/commenting <targetId> <on|off> [maxPerDay] [cooldownHours] [sendAsRef] — бренд-комментарии",
    "/ref_comment <targetId> <referenceId> <on|off> — комментировать конкретный референс",
    "/moderation <targetId> <on|off> [maxDeletesPerCycle] — антиспам в комментариях",
    "/approval <targetId> <posts|comments|all> <on|off> [timeoutMinutes] [publish|skip] — approval-флоу",
    "/pending [targetId] — показать ожидающие approve элементы",
    "/analytics <targetId> — собрать и показать аналитику",
    "",
    "Календарь: `weekdays@09:00,14:00,19:00` или `mon,wed,fri@10:00; sat@12:30`",
    "Сначала создай user-session через `npm run session:create`, затем добавь его через /account_add."
  ].join("\n");
}

async function replyDraftPreview(ctx: BotContext, target: TargetChannel): Promise<void> {
  const draft = target.lastDraft;
  if (!draft) {
    await ctx.reply("У этого канала пока нет черновика. Сначала вызови /generate <targetId>");
    return;
  }

  const preview = [
    `Target: ${target.title} (${target.id})`,
    `Summary: ${draft.summary || "-"}`,
    draft.strategySummaryUsed ? `Strategy: ${draft.strategySummaryUsed}` : "",
    "Text:",
    draft.text
  ]
    .filter(Boolean)
    .join("\n\n");

  const image = parseDraftImage(draft);
  if (image) {
    await ctx.replyWithPhoto(image, {
      caption: truncate(preview, 1024)
    });
    return;
  }

  await ctx.reply(truncate(preview, 3900));
}

export function createBot(
  store: StateStore,
  telegramAccountService: TelegramAccountService,
  contentService: ContentService,
  analyticsService: AnalyticsService,
  approvalService: ApprovalService,
  logger: Logger
): Bot<BotContext> {
  const bot = new Bot<BotContext>(appConfig.botToken);

  bot.use(session({
    initial: initialSessionData
  }));

  bot.use(async (ctx, next) => {
    if (!isAdmin(ctx.from?.id)) {
      if (ctx.message?.text?.startsWith("/start")) {
        await ctx.reply("Доступ запрещен.");
      }
      return;
    }

    await next();
  });

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(buildHelpText());
  });

  bot.command("cancel", async (ctx) => {
    ctx.session.flow = undefined;
    await ctx.reply("Текущий сценарий сброшен.");
  });

  bot.command("accounts", async (ctx) => {
    await ctx.reply(formatAccounts(store.listAccounts()));
  });

  bot.command("targets", async (ctx) => {
    await ctx.reply(formatTargets(store.listTargets()));
  });

  bot.command("refs", async (ctx) => {
    const targetId = ctx.match.trim();
    if (!targetId) {
      await ctx.reply("Использование: /refs <targetId>");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    await ctx.reply(formatReferences(target));
  });

  bot.command("calendar", async (ctx) => {
    const targetId = ctx.match.trim();
    if (!targetId) {
      await ctx.reply("Использование: /calendar <targetId>");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    await ctx.reply(`Calendar for ${target.title}: ${describeCalendar(target.calendar)}`);
  });

  bot.command("calendar_set", async (ctx) => {
    const [targetId, timezone, ...expressionParts] = ctx.match.trim().split(/\s+/);
    const expression = expressionParts.join(" ").trim();

    if (!targetId || !timezone || !expression) {
      await ctx.reply("Использование: /calendar_set <targetId> <timezone> <expression>");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    try {
      const calendar = createCalendarConfig(expression, timezone);
      store.saveTarget({
        ...target,
        publishMode: "calendar",
        calendar,
        updatedAt: new Date().toISOString()
      });

      await ctx.reply(`Календарь для ${target.title} обновлен: ${describeCalendar(calendar)}`);
    } catch (error) {
      await ctx.reply(`Не удалось разобрать календарь: ${String(error)}`);
    }
  });

  bot.command("commenting", async (ctx) => {
    const [targetId, modeRaw, maxRaw, cooldownRaw, sendAsRef] = ctx.match.trim().split(/\s+/);
    if (!targetId || !modeRaw) {
      await ctx.reply("Использование: /commenting <targetId> <on|off> [maxPerDay] [cooldownHours] [sendAsRef]");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    const enabled = parseYesNo(modeRaw);
    if (typeof enabled !== "boolean") {
      await ctx.reply("Укажи `on` или `off`.");
      return;
    }

    const maxCommentsPerDay = maxRaw ? Number(maxRaw) : target.comments.maxCommentsPerDay;
    const minHoursBetweenComments = cooldownRaw ? Number(cooldownRaw) : target.comments.minHoursBetweenComments;

    if (!Number.isInteger(maxCommentsPerDay) || maxCommentsPerDay <= 0) {
      await ctx.reply("maxPerDay должен быть положительным целым.");
      return;
    }

    if (!Number.isFinite(minHoursBetweenComments) || minHoursBetweenComments < 0) {
      await ctx.reply("cooldownHours должен быть числом >= 0.");
      return;
    }

    store.saveTarget({
      ...target,
      comments: {
        ...target.comments,
        enabled,
        maxCommentsPerDay,
        minHoursBetweenComments,
        sendAsChannelRef: sendAsRef || target.comments.sendAsChannelRef || target.channelRef
      },
      updatedAt: new Date().toISOString()
    });

    await ctx.reply(`Brand-комментарии для ${target.title}: ${enabled ? "on" : "off"}`);
  });

  bot.command("ref_comment", async (ctx) => {
    const [targetId, referenceId, modeRaw] = ctx.match.trim().split(/\s+/);
    if (!targetId || !referenceId || !modeRaw) {
      await ctx.reply("Использование: /ref_comment <targetId> <referenceId> <on|off>");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    const enabled = parseYesNo(modeRaw);
    if (typeof enabled !== "boolean") {
      await ctx.reply("Укажи `on` или `off`.");
      return;
    }

    const reference = target.referenceChannels.find((item) => item.id === referenceId);
    if (!reference) {
      await ctx.reply(`Reference ${referenceId} не найден.`);
      return;
    }

    store.saveTarget({
      ...target,
      referenceChannels: target.referenceChannels.map((item) =>
        item.id === referenceId
          ? {
              ...item,
              commentingEnabled: enabled
            }
          : item
      ),
      updatedAt: new Date().toISOString()
    });

    await ctx.reply(`Комментирование референса ${reference.title || reference.channelRef}: ${enabled ? "on" : "off"}`);
  });

  bot.command("moderation", async (ctx) => {
    const [targetId, modeRaw, maxRaw] = ctx.match.trim().split(/\s+/);
    if (!targetId || !modeRaw) {
      await ctx.reply("Использование: /moderation <targetId> <on|off> [maxDeletesPerCycle]");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    const enabled = parseYesNo(modeRaw);
    if (typeof enabled !== "boolean") {
      await ctx.reply("Укажи `on` или `off`.");
      return;
    }

    const maxDeletesPerCycle = maxRaw ? Number(maxRaw) : target.moderation.maxDeletesPerCycle;
    if (!Number.isInteger(maxDeletesPerCycle) || maxDeletesPerCycle <= 0) {
      await ctx.reply("maxDeletesPerCycle должен быть положительным целым.");
      return;
    }

    store.saveTarget({
      ...target,
      moderation: {
        ...target.moderation,
        enabled,
        maxDeletesPerCycle
      },
      updatedAt: new Date().toISOString()
    });

    await ctx.reply(`Модерация комментариев для ${target.title}: ${enabled ? "on" : "off"}`);
  });

  bot.command("approval", async (ctx) => {
    const [targetId, scopeRaw, modeRaw, timeoutRaw, actionRaw] = ctx.match.trim().split(/\s+/);
    if (!targetId || !scopeRaw || !modeRaw) {
      await ctx.reply("Использование: /approval <targetId> <posts|comments|all> <on|off> [timeoutMinutes] [publish|skip]");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    const scope = scopeRaw.toLowerCase();
    if (!["posts", "comments", "all"].includes(scope)) {
      await ctx.reply("scope должен быть `posts`, `comments` или `all`.");
      return;
    }

    const enabled = parseYesNo(modeRaw);
    if (typeof enabled !== "boolean") {
      await ctx.reply("Укажи `on` или `off`.");
      return;
    }

    let parsedTimeoutMinutes: number | undefined;
    if (timeoutRaw) {
      const numericTimeout = Number(timeoutRaw);
      if (!Number.isInteger(numericTimeout) || numericTimeout <= 0) {
        await ctx.reply("timeoutMinutes должен быть положительным целым.");
        return;
      }
      parsedTimeoutMinutes = numericTimeout;
    }

    const onTimeout = actionRaw ? parseApprovalTimeoutAction(actionRaw) : undefined;
    if (actionRaw && !onTimeout) {
      await ctx.reply("Последний аргумент должен быть `publish` или `skip`.");
      return;
    }

    const applyRule = (rule: TargetChannel["approval"]["posts"]) => ({
      ...rule,
      enabled,
      timeoutMinutes: parsedTimeoutMinutes ?? rule.timeoutMinutes,
      onTimeout: onTimeout ?? rule.onTimeout
    });

    store.saveTarget({
      ...target,
      approval: {
        posts: scope === "comments" ? target.approval.posts : applyRule(target.approval.posts),
        comments: scope === "posts" ? target.approval.comments : applyRule(target.approval.comments)
      },
      updatedAt: new Date().toISOString()
    });

    const updatedTarget = store.getTarget(targetId);
    await ctx.reply(
      updatedTarget
        ? `Approval-настройки для ${updatedTarget.title} обновлены:\n${formatApprovalSettings(updatedTarget)}`
        : "Approval-настройки обновлены."
    );
  });

  bot.command("pending", async (ctx) => {
    const targetId = ctx.match.trim() || undefined;
    if (targetId && !store.getTarget(targetId)) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    const pending = approvalService.listPendingApprovals(targetId);
    if (pending.length === 0) {
      await ctx.reply(targetId ? `Для ${targetId} pending approve нет.` : "Pending approve нет.");
      return;
    }

    await ctx.reply(`Найдено pending approve: ${pending.length}`);
    for (const item of pending) {
      await ctx.reply(buildApprovalCard(item.target, item.approval), {
        reply_markup: buildApprovalKeyboard(item.approval.id)
      });
    }
  });

  bot.command("analytics", async (ctx) => {
    const targetId = ctx.match.trim();
    if (!targetId) {
      await ctx.reply("Использование: /analytics <targetId>");
      return;
    }

    try {
      const updated = await analyticsService.updateTargetAnalytics(targetId);
      await ctx.reply(analyticsService.formatTargetAnalytics(updated));
    } catch (error) {
      logger.error("Analytics update failed", { targetId, error: String(error) });
      await ctx.reply(`Ошибка аналитики: ${String(error)}`);
    }
  });

  bot.command("account_add", async (ctx) => {
    ctx.session.flow = {
      type: "account_add",
      step: "name",
      data: {}
    };

    await ctx.reply("Введи имя для аккаунта. Это внутренний label, например `main-editor`.");
  });

  bot.command("target_add", async (ctx) => {
    if (store.listAccounts().length === 0) {
      await ctx.reply("Сначала добавь хотя бы один аккаунт через /account_add");
      return;
    }

    ctx.session.flow = {
      type: "target_add",
      step: "accountId",
      data: {}
    };

    await ctx.reply(`Выбери accountId из списка:\n${formatAccounts(store.listAccounts())}`);
  });

  bot.command("ref_add", async (ctx) => {
    if (store.listTargets().length === 0) {
      await ctx.reply("Сначала добавь целевой канал через /target_add");
      return;
    }

    ctx.session.flow = {
      type: "reference_add",
      step: "targetId",
      data: {}
    };

    await ctx.reply(`Укажи targetId, к которому добавить референс:\n${formatTargets(store.listTargets())}`);
  });

  bot.command("generate", async (ctx) => {
    const targetId = ctx.match.trim();
    if (!targetId) {
      await ctx.reply("Использование: /generate <targetId>");
      return;
    }

    try {
      const draft = await contentService.generateDraft(targetId, false);
      if (!draft) {
        await ctx.reply("Новых или доступных материалов для генерации не нашлось.");
        return;
      }

      const target = store.getTarget(targetId);
      if (!target) {
        await ctx.reply("Черновик создан, но target исчез из state.");
        return;
      }

      await replyDraftPreview(ctx, target);
    } catch (error) {
      logger.error("Draft generation failed", { targetId, error: String(error) });
      await ctx.reply(`Ошибка генерации: ${String(error)}`);
    }
  });

  bot.command("preview", async (ctx) => {
    const targetId = ctx.match.trim();
    if (!targetId) {
      await ctx.reply("Использование: /preview <targetId>");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    await replyDraftPreview(ctx, target);
  });

  bot.command("publish", async (ctx) => {
    const targetId = ctx.match.trim();
    if (!targetId) {
      await ctx.reply("Использование: /publish <targetId>");
      return;
    }

    try {
      const draft = await contentService.publishDraft(targetId);
      await ctx.reply(
        `Пост опубликован.\n\nTarget: ${targetId}\nSummary: ${draft.summary || "-"}\nSources: ${draft.sourceMessages.length}`
      );
    } catch (error) {
      logger.error("Publish failed", { targetId, error: String(error) });
      await ctx.reply(`Ошибка публикации: ${String(error)}`);
    }
  });

  bot.command("schedule", async (ctx) => {
    const [targetId, intervalRaw] = ctx.match.trim().split(/\s+/);
    if (!targetId || !intervalRaw) {
      await ctx.reply("Использование: /schedule <targetId> <minutes|off>");
      return;
    }

    const target = store.getTarget(targetId);
    if (!target) {
      await ctx.reply(`Target ${targetId} не найден.`);
      return;
    }

    if (intervalRaw.toLowerCase() === "off") {
      store.saveTarget({
        ...target,
        publishMode: "manual",
        autoPost: {
          ...target.autoPost,
          enabled: false
        },
        updatedAt: new Date().toISOString()
      });
      await ctx.reply(`Интервальный автопостинг для ${target.title} выключен.`);
      return;
    }

    const intervalMinutes = Number(intervalRaw);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
      await ctx.reply("Интервал должен быть положительным числом минут или `off`.");
      return;
    }

    store.saveTarget({
      ...target,
      publishMode: "interval",
      autoPost: {
        enabled: true,
        intervalMinutes,
        lastRunAt: target.autoPost.lastRunAt
      },
      updatedAt: new Date().toISOString()
    });

    await ctx.reply(`Интервальный автопостинг для ${target.title} включен: каждые ${intervalMinutes} минут.`);
  });

  bot.callbackQuery(/^approval:(approve|reject):([a-z0-9-]+)$/i, async (ctx) => {
    const match = ctx.match;
    const action = match[1]?.toLowerCase();
    const approvalId = match[2];

    if (!approvalId || !action) {
      await ctx.answerCallbackQuery({
        text: "Некорректный approval callback.",
        show_alert: true
      });
      return;
    }

    try {
      const result = action === "approve" ? await approvalService.approve(approvalId) : await approvalService.reject(approvalId);
      const updatedPrefix =
        result.event === "approved"
          ? "Approve выполнен."
          : result.event === "rejected"
            ? "Approve отклонен."
            : result.event === "failed"
              ? "Approve не выполнен."
              : "Approval обработан.";
      await ctx.editMessageText(`${updatedPrefix}\n\n${buildApprovalCard(result.target, result.approval)}`);
      await ctx.answerCallbackQuery({
        text:
          result.event === "approved"
            ? "Действие подтверждено."
            : result.event === "rejected"
              ? "Действие отклонено."
              : "Действие завершилось без публикации."
      });
    } catch (error) {
      await ctx.answerCallbackQuery({
        text: `Не удалось обработать approval: ${String(error)}`,
        show_alert: true
      });
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return;
    }

    const flow = ctx.session.flow;
    if (!flow) {
      return;
    }

    try {
      await handleFlowMessage(ctx, flow, store, telegramAccountService);
    } catch (error) {
      logger.error("Flow handling failed", { flowType: flow.type, error: String(error) });
      ctx.session.flow = undefined;
      await ctx.reply(`Ошибка сценария: ${String(error)}\nСценарий сброшен. Запусти команду снова.`);
    }
  });

  bot.catch((error) => {
    logger.error("Unhandled bot error", {
      error: String(error.error),
      updateId: error.ctx.update.update_id
    });
  });

  return bot;
}

async function handleFlowMessage(
  ctx: BotContext,
  flow: BotFlow,
  store: StateStore,
  telegramAccountService: TelegramAccountService
): Promise<void> {
  const text = ctx.message?.text?.trim();
  if (!text) {
    return;
  }

  switch (flow.type) {
    case "account_add":
      await handleAccountFlow(ctx, text, flow, store, telegramAccountService);
      return;
    case "target_add":
      await handleTargetFlow(ctx, text, flow, store, telegramAccountService);
      return;
    case "reference_add":
      await handleReferenceFlow(ctx, text, flow, store, telegramAccountService);
      return;
    default:
      ctx.session.flow = undefined;
      await ctx.reply("Неизвестный сценарий. Сброшено.");
  }
}

async function handleAccountFlow(
  ctx: BotContext,
  text: string,
  flow: Extract<BotFlow, { type: "account_add" }>,
  store: StateStore,
  telegramAccountService: TelegramAccountService
): Promise<void> {
  switch (flow.step) {
    case "name":
      flow.data.name = text;
      flow.step = "apiId";
      await ctx.reply("Теперь введи Telegram API ID из my.telegram.org");
      return;
    case "apiId": {
      const apiId = Number(text);
      if (!Number.isInteger(apiId) || apiId <= 0) {
        await ctx.reply("API ID должен быть положительным числом.");
        return;
      }

      flow.data.apiId = apiId;
      flow.step = "apiHash";
      await ctx.reply("Введи Telegram API Hash");
      return;
    }
    case "apiHash":
      flow.data.apiHash = text;
      flow.step = "sessionString";
      await ctx.reply("Введи StringSession. Его можно получить локально командой `npm run session:create`.");
      return;
    case "sessionString": {
      flow.data.sessionString = text;

      const now = new Date().toISOString();
      const account: TelegramAccount = {
        id: crypto.randomUUID().slice(0, 8),
        name: flow.data.name || "account",
        apiId: flow.data.apiId as number,
        apiHash: flow.data.apiHash as string,
        sessionString: flow.data.sessionString,
        createdAt: now,
        updatedAt: now
      };

      const verification = await telegramAccountService.verifyAccount(account);
      store.saveAccount(account);
      ctx.session.flow = undefined;
      await ctx.reply(`Аккаунт добавлен: ${account.id} — ${account.name}\nTelegram user: ${verification.displayName}`);
      return;
    }
  }
}

async function handleTargetFlow(
  ctx: BotContext,
  text: string,
  flow: Extract<BotFlow, { type: "target_add" }>,
  store: StateStore,
  telegramAccountService: TelegramAccountService
): Promise<void> {
  switch (flow.step) {
    case "accountId": {
      const account = store.getAccount(text);
      if (!account) {
        await ctx.reply("Такого accountId нет. Введи id из /accounts");
        return;
      }

      flow.data.accountId = text;
      flow.step = "title";
      await ctx.reply("Введи внутреннее имя для target, например `crypto-daily`");
      return;
    }
    case "title":
      flow.data.title = text;
      flow.step = "channelRef";
      await ctx.reply("Введи username или ссылку канала, куда публиковать. Пример: `@my_channel`");
      return;
    case "channelRef": {
      const account = store.getAccount(flow.data.accountId as string);
      if (!account) {
        throw new Error("Указанный accountId больше не существует");
      }

      await telegramAccountService.resolveChannel(account, text);
      flow.data.channelRef = text;
      flow.step = "language";
      await ctx.reply("В каком языке публиковать посты? Пример: `ru`");
      return;
    }
    case "language":
      flow.data.language = text;
      flow.step = "tone";
      await ctx.reply("Опиши tone of voice. Пример: `экспертный, короткие абзацы, без воды`");
      return;
    case "tone":
      flow.data.tone = text;
      flow.step = "contentMode";
      await ctx.reply("Режим контента: `rewrite`, `summary` или `hybrid`");
      return;
    case "contentMode": {
      const normalized = text.toLowerCase() as ContentMode;
      if (!["rewrite", "summary", "hybrid"].includes(normalized)) {
        await ctx.reply("Допустимо только: rewrite, summary, hybrid");
        return;
      }

      flow.data.contentMode = normalized;
      flow.step = "includeImage";
      await ctx.reply("Нужна генерация картинки? Ответь `yes` или `no`");
      return;
    }
    case "includeImage": {
      const includeImage = parseYesNo(text);
      if (typeof includeImage !== "boolean") {
        await ctx.reply("Ответь `yes` или `no`.");
        return;
      }

      flow.data.includeImage = includeImage;
      flow.step = "imageAspectRatio";
      await ctx.reply("Соотношение сторон картинки. Пример: `4:5`, `1:1`, `16:9`");
      return;
    }
    case "imageAspectRatio":
      flow.data.imageAspectRatio = text || appConfig.defaultImageAspectRatio;
      flow.step = "styleNotes";
      await ctx.reply("Дополнительные style notes для канала. Если не нужно, отправь `-`");
      return;
    case "styleNotes":
      flow.data.styleNotes = text === "-" ? "" : text;
      flow.step = "intervalMinutes";
      await ctx.reply("Интервал автопоста в минутах. Введи `0`, если стартовать только вручную. Календарь настроишь потом через /calendar_set");
      return;
    case "intervalMinutes": {
      const intervalMinutes = Number(text);
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 0) {
        await ctx.reply("Введи целое число минут, например 0, 60, 180.");
        return;
      }

      const now = new Date().toISOString();
      const calendar = createCalendarConfig(appConfig.defaultCalendarExpression, appConfig.defaultCalendarTimezone);
      const target: TargetChannel = {
        id: crypto.randomUUID().slice(0, 8),
        accountId: flow.data.accountId as string,
        title: flow.data.title as string,
        channelRef: flow.data.channelRef as string,
        language: flow.data.language as string,
        tone: flow.data.tone as string,
        contentMode: flow.data.contentMode as ContentMode,
        includeImage: flow.data.includeImage as boolean,
        imageAspectRatio: flow.data.imageAspectRatio || appConfig.defaultImageAspectRatio,
        styleNotes: flow.data.styleNotes || undefined,
        autoPost: {
          enabled: intervalMinutes > 0,
          intervalMinutes: intervalMinutes || appConfig.defaultAutopublishIntervalMinutes
        },
        publishMode: intervalMinutes > 0 ? "interval" : "manual",
        calendar: {
          ...calendar,
          enabled: false
        },
        safety: {
          antiAdsEnabled: true,
          adConfidenceThreshold: 0.75,
          antiSpamEnabled: true,
          spamConfidenceThreshold: 0.8
        },
        approval: createDefaultApprovalConfig(),
        comments: {
          enabled: false,
          sendAsChannelRef: flow.data.channelRef as string,
          maxCommentsPerDay: 3,
          minHoursBetweenComments: 6
        },
        moderation: {
          enabled: true,
          maxDeletesPerCycle: 10,
          lookbackMessages: 50
        },
        referenceChannels: [],
        lastSourceMessageByReference: {},
        publishedPosts: [],
        analyticsHistory: [],
        brandCommentHistory: [],
        pendingApprovals: [],
        createdAt: now,
        updatedAt: now
      };

      store.saveTarget(target);
      ctx.session.flow = undefined;
      await ctx.reply(`Target создан: ${target.id} — ${target.title}\nТеперь добавь референсы через /ref_add`);
      return;
    }
  }
}

async function handleReferenceFlow(
  ctx: BotContext,
  text: string,
  flow: Extract<BotFlow, { type: "reference_add" }>,
  store: StateStore,
  telegramAccountService: TelegramAccountService
): Promise<void> {
  switch (flow.step) {
    case "targetId": {
      const target = store.getTarget(text);
      if (!target) {
        await ctx.reply("Такого targetId нет. Введи id из /targets");
        return;
      }

      flow.data.targetId = text;
      flow.step = "channelRef";
      await ctx.reply("Введи username или ссылку референсного канала");
      return;
    }
    case "channelRef":
      flow.data.channelRef = text;
      flow.step = "fetchLimit";
      await ctx.reply("Сколько последних постов брать за проход? Обычно 3-5.");
      return;
    case "fetchLimit": {
      const fetchLimit = Number(text);
      if (!Number.isInteger(fetchLimit) || fetchLimit <= 0) {
        await ctx.reply("Введи положительное число, например 3 или 5.");
        return;
      }

      const target = store.getTarget(flow.data.targetId as string);
      if (!target) {
        throw new Error("Target больше не существует");
      }

      const account = store.getAccount(target.accountId);
      if (!account) {
        throw new Error("Аккаунт target-канала больше не существует");
      }

      const channelMeta = await telegramAccountService.resolveChannel(account, flow.data.channelRef as string);
      const reference: ReferenceChannel = {
        id: crypto.randomUUID().slice(0, 8),
        channelRef: flow.data.channelRef as string,
        title: channelMeta.title,
        fetchLimit,
        commentingEnabled: false
      };

      store.saveTarget({
        ...target,
        referenceChannels: [...target.referenceChannels, reference],
        updatedAt: new Date().toISOString()
      });

      ctx.session.flow = undefined;
      await ctx.reply(`Референс добавлен к ${target.title}: ${reference.id} — ${reference.title}`);
      return;
    }
  }
}
