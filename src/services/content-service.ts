import crypto from "node:crypto";

import { appConfig } from "../config.js";
import { OpenRouterClient } from "../openrouter/client.js";
import { buildContentMessages } from "../openrouter/prompts.js";
import { getMatchingCalendarSlot } from "../scheduling/calendar.js";
import { StateStore } from "../store/state-store.js";
import { TelegramAccountService } from "../telegram/account-service.js";
import type { GeneratedDraft, PendingPostApproval, PublishedPostRecord, SourceMessage, TargetChannel } from "../types.js";
import { SafetyService } from "./safety-service.js";

export class ContentService {
  constructor(
    private readonly store: StateStore,
    private readonly telegramAccountService: TelegramAccountService,
    private readonly openRouterClient: OpenRouterClient,
    private readonly safetyService: SafetyService
  ) {}

  async generateDraft(targetId: string, onlyNewSources = false): Promise<GeneratedDraft | null> {
    const target = this.requireTarget(targetId);
    const account = this.requireAccount(target.accountId);

    const sourceMessages = await this.collectSourceMessages(target, account, onlyNewSources);
    if (sourceMessages.length === 0) {
      return null;
    }

    const payload = await this.openRouterClient.generateStructuredContent(buildContentMessages(target, sourceMessages));

    const generatedAllowed = await this.safetyService.isAllowedSourceText(
      target,
      payload.post,
      `generated draft for ${target.channelRef}`
    );
    if (!generatedAllowed.allowed) {
      throw new Error(`Сгенерированный пост заблокирован анти-рекламным фильтром: ${generatedAllowed.reason}`);
    }

    let imageDataUrl: string | undefined;
    let imageMimeType: string | undefined;
    if (target.includeImage && payload.imagePrompt) {
      const image = await this.openRouterClient.generateImage(payload.imagePrompt, target.imageAspectRatio);
      imageDataUrl = image.dataUrl;
      imageMimeType = image.mimeType;
    }

    const draft: GeneratedDraft = {
      title: payload.title,
      summary: payload.summary,
      text: payload.post,
      imagePrompt: payload.imagePrompt,
      imageDataUrl,
      imageMimeType,
      sourceMessages,
      sourceCursor: this.buildSourceCursor(sourceMessages),
      generatedAt: new Date().toISOString(),
      model: appConfig.openRouterTextModel,
      imageModel: imageDataUrl ? appConfig.openRouterImageModel : undefined,
      strategySummaryUsed: target.strategyInsight?.summary,
      safetyChecks: ["anti-ads:passed"]
    };

    this.store.saveTarget({
      ...target,
      lastDraft: draft,
      updatedAt: new Date().toISOString()
    });

    return draft;
  }

  async publishDraft(targetId: string, options?: { scheduleAt?: Date }): Promise<GeneratedDraft> {
    const target = this.requireTarget(targetId);
    const draft = target.lastDraft ?? (await this.generateDraft(targetId, false));

    if (!draft) {
      throw new Error("Не удалось сгенерировать черновик: источники пустые");
    }

    await this.publishSpecificDraft(targetId, draft, options);
    return draft;
  }

  async publishSpecificDraft(targetId: string, draft: GeneratedDraft, options?: { scheduleAt?: Date }): Promise<GeneratedDraft> {
    const target = this.requireTarget(targetId);
    const account = this.requireAccount(target.accountId);
    const published = await this.telegramAccountService.publishDraft(account, target.channelRef, draft, options);
    const mergedCursor = {
      ...target.lastSourceMessageByReference,
      ...draft.sourceCursor
    };

    const publishedRecord: PublishedPostRecord = {
      id: crypto.randomUUID().slice(0, 8),
      channelRef: target.channelRef,
      messageId: published.messageId,
      publishedAt: published.publishedAt,
      scheduledFor: published.scheduledFor,
      discussionPeerRef: published.discussion?.discussionPeerRef,
      discussionRootMessageId: published.discussion?.discussionRootMessageId,
      sourceCursor: draft.sourceCursor,
      sourceMessageIds: draft.sourceMessages.map((message) => ({
        referenceId: message.referenceId,
        messageId: message.messageId
      })),
      draftSummary: draft.summary,
      metricsHistory: []
    };

    this.store.saveTarget({
      ...target,
      lastDraft: draft,
      lastSourceMessageByReference: mergedCursor,
      lastPublishedAt: published.publishedAt,
      pendingApprovals: target.pendingApprovals.filter((item) => item.kind !== "post"),
      publishedPosts: [...target.publishedPosts, publishedRecord].slice(-100),
      updatedAt: new Date().toISOString(),
      autoPost: {
        ...target.autoPost,
        lastRunAt: new Date().toISOString()
      }
    });

    return draft;
  }

  async runAutopostCycle(): Promise<PendingPostApproval[]> {
    const targets = this.store.listTargets().filter((target) => target.publishMode !== "manual");
    const now = Date.now();
    const queuedApprovals: PendingPostApproval[] = [];

    for (const target of targets) {
      if (this.hasPendingPostApproval(target)) {
        continue;
      }

      if (target.publishMode === "calendar") {
        const slotKey = getMatchingCalendarSlot(target.calendar);
        if (!slotKey || slotKey === target.calendar.lastTriggeredSlotKey) {
          continue;
        }

        const draft = await this.generateDraft(target.id, true);
        if (!draft) {
          continue;
        }

        if (target.approval.posts.enabled) {
          const approval = this.queuePendingPostApproval(target, draft, slotKey);
          queuedApprovals.push(approval);
          continue;
        }

        await this.publishDraft(target.id);
        const refreshed = this.requireTarget(target.id);
        this.store.saveTarget({
          ...refreshed,
          calendar: {
            ...refreshed.calendar,
            lastTriggeredSlotKey: slotKey
          },
          updatedAt: new Date().toISOString()
        });
        continue;
      }

      if (!target.autoPost.enabled) {
        continue;
      }

      const lastRunAt = target.autoPost.lastRunAt ? Date.parse(target.autoPost.lastRunAt) : 0;
      const intervalMs = target.autoPost.intervalMinutes * 60 * 1000;
      if (lastRunAt && now - lastRunAt < intervalMs) {
        continue;
      }

      const draft = await this.generateDraft(target.id, true);
      if (!draft) {
        continue;
      }

      if (target.approval.posts.enabled) {
        const approval = this.queuePendingPostApproval(target, draft);
        queuedApprovals.push(approval);
        continue;
      }

      await this.publishDraft(target.id);
    }

    return queuedApprovals;
  }

  private async collectSourceMessages(
    target: TargetChannel,
    account: ReturnType<ContentService["requireAccount"]>,
    onlyNewSources: boolean
  ): Promise<SourceMessage[]> {
    const bundles = await Promise.all(
      target.referenceChannels.map(async (reference) => {
        const posts = await this.telegramAccountService.fetchRecentPosts(
          account,
          reference.id,
          reference.channelRef,
          reference.fetchLimit
        );

        const filteredByCursor = !onlyNewSources
          ? posts
          : posts.filter((post) => post.messageId > (target.lastSourceMessageByReference[reference.id] ?? 0));

        const approved: SourceMessage[] = [];
        for (const post of filteredByCursor) {
          const allowed = await this.safetyService.isAllowedSourceText(
            target,
            post.text,
            `source ${reference.channelRef}#${post.messageId}`
          );

          if (allowed.allowed) {
            approved.push(post);
          }
        }

        return approved;
      })
    );

    return bundles
      .flat()
      .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
      .slice(0, 8);
  }

  private buildSourceCursor(messages: SourceMessage[]): Record<string, number> {
    const cursor: Record<string, number> = {};

    for (const message of messages) {
      const current = cursor[message.referenceId] ?? 0;
      if (message.messageId > current) {
        cursor[message.referenceId] = message.messageId;
      }
    }

    return cursor;
  }

  private queuePendingPostApproval(target: TargetChannel, draft: GeneratedDraft, calendarSlotKey?: string): PendingPostApproval {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + target.approval.posts.timeoutMinutes * 60_000).toISOString();
    const approval: PendingPostApproval = {
      id: crypto.randomUUID().slice(0, 8),
      kind: "post",
      createdAt,
      expiresAt,
      timeoutAction: target.approval.posts.onTimeout,
      requestedBy: "autopost",
      draft,
      targetId: target.id,
      targetTitle: target.title,
      sourceCount: draft.sourceMessages.length,
      calendarSlotKey
    };

    this.store.saveTarget({
      ...target,
      lastDraft: draft,
      pendingApprovals: [...target.pendingApprovals, approval],
      updatedAt: createdAt,
      autoPost: {
        ...target.autoPost,
        lastRunAt: target.publishMode === "interval" ? createdAt : target.autoPost.lastRunAt
      },
      calendar: calendarSlotKey
        ? {
            ...target.calendar,
            lastTriggeredSlotKey: calendarSlotKey
          }
        : target.calendar
    });

    return approval;
  }

  private hasPendingPostApproval(target: TargetChannel): boolean {
    return target.pendingApprovals.some((item) => item.kind === "post");
  }

  private requireTarget(targetId: string): TargetChannel {
    const target = this.store.getTarget(targetId);
    if (!target) {
      throw new Error(`Target channel not found: ${targetId}`);
    }

    return target;
  }

  private requireAccount(accountId: string) {
    const account = this.store.getAccount(accountId);
    if (!account) {
      throw new Error(`Telegram account not found: ${accountId}`);
    }

    return account;
  }
}
