import crypto from "node:crypto";

import { Logger } from "../logger.js";
import { OpenRouterClient } from "../openrouter/client.js";
import { StateStore } from "../store/state-store.js";
import { TelegramAccountService } from "../telegram/account-service.js";
import type { BrandCommentRecord, PendingCommentApproval, ReferenceChannel, TargetChannel } from "../types.js";
import { SafetyService } from "./safety-service.js";

function trimHistory<T>(items: T[], maxSize: number): T[] {
  return items.slice(Math.max(0, items.length - maxSize));
}

function countCommentsLast24h(target: TargetChannel): number {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return target.brandCommentHistory.filter((item) => Date.parse(item.commentedAt) >= since && item.status === "posted").length;
}

function getLastPostedCommentAt(target: TargetChannel): number | undefined {
  const last = [...target.brandCommentHistory].reverse().find((item) => item.status === "posted");
  return last ? Date.parse(last.commentedAt) : undefined;
}

interface CommentAttemptResult {
  target: TargetChannel;
  queuedApproval?: PendingCommentApproval;
  stop: boolean;
}

export class CommunityService {
  constructor(
    private readonly store: StateStore,
    private readonly telegramAccountService: TelegramAccountService,
    private readonly openRouterClient: OpenRouterClient,
    private readonly safetyService: SafetyService,
    private readonly logger: Logger
  ) {}

  async runCommentingCycle(): Promise<PendingCommentApproval[]> {
    const targets = this.store.listTargets().filter((target) => target.comments.enabled);
    const queuedApprovals: PendingCommentApproval[] = [];

    for (const target of targets) {
      const queued = await this.maybeCommentForTarget(target.id);
      if (queued) {
        queuedApprovals.push(queued);
      }
    }

    return queuedApprovals;
  }

  async runModerationCycle(): Promise<void> {
    const targets = this.store.listTargets().filter((target) => target.moderation.enabled);

    for (const target of targets) {
      await this.moderateTargetComments(target.id);
    }
  }

  async publishApprovedComment(targetId: string, approval: PendingCommentApproval): Promise<"posted" | "blocked"> {
    const target = this.requireTarget(targetId);
    const account = this.requireAccount(target.accountId);
    const published = await this.telegramAccountService.commentAsChannel(
      account,
      approval.referenceChannelRef,
      approval.referencePostId,
      approval.commentText,
      approval.sendAsRef
    );

    if (!published) {
      const reference = this.requireReference(target, approval.referenceId);
      const blockedTarget = this.appendBrandCommentRecord(target, reference, {
        referenceId: approval.referenceId,
        referenceChannelRef: approval.referenceChannelRef,
        referencePostId: approval.referencePostId,
        status: "blocked",
        commentedAt: new Date().toISOString(),
        targetSendAsRef: approval.sendAsRef,
        commentText: approval.commentText,
        reason: "Discussion thread missing or send-as unavailable during approval publish"
      });

      this.store.saveTarget({
        ...blockedTarget,
        pendingApprovals: blockedTarget.pendingApprovals.filter((item) => item.id !== approval.id),
        updatedAt: new Date().toISOString()
      });
      return "blocked";
    }

    const reference = this.requireReference(target, approval.referenceId);
    const updatedTarget = this.appendBrandCommentRecord(target, reference, {
      referenceId: approval.referenceId,
      referenceChannelRef: approval.referenceChannelRef,
      referencePostId: approval.referencePostId,
      status: "posted",
      commentedAt: published.publishedAt,
      targetSendAsRef: approval.sendAsRef,
      postedCommentMessageId: published.messageId,
      commentText: approval.commentText
    });

    this.store.saveTarget({
      ...updatedTarget,
      pendingApprovals: updatedTarget.pendingApprovals.filter((item) => item.id !== approval.id),
      updatedAt: new Date().toISOString()
    });
    return "posted";
  }

  async skipApprovedComment(targetId: string, approval: PendingCommentApproval, reason: string): Promise<void> {
    const target = this.requireTarget(targetId);
    const reference = this.requireReference(target, approval.referenceId);
    const updatedTarget = this.appendBrandCommentRecord(target, reference, {
      referenceId: approval.referenceId,
      referenceChannelRef: approval.referenceChannelRef,
      referencePostId: approval.referencePostId,
      status: "skipped",
      commentedAt: new Date().toISOString(),
      targetSendAsRef: approval.sendAsRef,
      commentText: approval.commentText,
      reason
    });

    this.store.saveTarget({
      ...updatedTarget,
      pendingApprovals: updatedTarget.pendingApprovals.filter((item) => item.id !== approval.id),
      updatedAt: new Date().toISOString()
    });
  }

  private async maybeCommentForTarget(targetId: string): Promise<PendingCommentApproval | null> {
    const target = this.requireTarget(targetId);
    const account = this.requireAccount(target.accountId);
    const sendAsRef = target.comments.sendAsChannelRef || target.channelRef;
    let workingTarget = target;

    if (workingTarget.pendingApprovals.some((item) => item.kind === "comment")) {
      return null;
    }

    if (countCommentsLast24h(workingTarget) >= workingTarget.comments.maxCommentsPerDay) {
      return null;
    }

    const lastCommentAt = getLastPostedCommentAt(workingTarget);
    if (lastCommentAt) {
      const minDelayMs = workingTarget.comments.minHoursBetweenComments * 60 * 60 * 1000;
      if (Date.now() - lastCommentAt < minDelayMs) {
        return null;
      }
    }

    for (const reference of workingTarget.referenceChannels.filter((item) => item.commentingEnabled)) {
      const result = await this.tryCommentReference(workingTarget, account, reference, sendAsRef);
      if (result.queuedApproval) {
        return result.queuedApproval;
      }
      if (result.target !== workingTarget) {
        this.store.saveTarget(result.target);
        workingTarget = result.target;
      }
      if (result.stop) {
        return null;
      }
    }

    return null;
  }

  private async tryCommentReference(
    target: TargetChannel,
    account: ReturnType<CommunityService["requireAccount"]>,
    reference: ReferenceChannel,
    sendAsRef: string
  ): Promise<CommentAttemptResult> {
    let workingTarget = target;
    const posts = await this.telegramAccountService.fetchRecentPosts(account, reference.id, reference.channelRef, Math.min(reference.fetchLimit, 3));

    for (const post of posts) {
      if (reference.lastCommentedPostId && post.messageId <= reference.lastCommentedPostId) {
        continue;
      }

      const sourceAllowed = await this.safetyService.isAllowedSourceText(
        target,
        post.text,
        `reference comment source ${reference.channelRef}#${post.messageId}`
      );
      if (!sourceAllowed.allowed) {
        workingTarget = this.appendBrandCommentRecord(workingTarget, reference, {
          referenceId: reference.id,
          referenceChannelRef: reference.channelRef,
          referencePostId: post.messageId,
          status: "blocked",
          commentedAt: new Date().toISOString(),
          targetSendAsRef: sendAsRef,
          reason: sourceAllowed.reason || "Blocked by anti-ad filter"
        });
        continue;
      }

      const suggestion = await this.openRouterClient.generateBrandComment(workingTarget, post);
      if (!suggestion.shouldComment || !suggestion.comment.trim()) {
        workingTarget = this.appendBrandCommentRecord(workingTarget, reference, {
          referenceId: reference.id,
          referenceChannelRef: reference.channelRef,
          referencePostId: post.messageId,
          status: "skipped",
          commentedAt: new Date().toISOString(),
          targetSendAsRef: sendAsRef,
          reason: suggestion.reason
        });
        continue;
      }

      const adAssessment = await this.safetyService.isAllowedSourceText(
        workingTarget,
        suggestion.comment,
        `brand comment draft ${reference.channelRef}#${post.messageId}`
      );
      if (!adAssessment.allowed) {
        workingTarget = this.appendBrandCommentRecord(workingTarget, reference, {
          referenceId: reference.id,
          referenceChannelRef: reference.channelRef,
          referencePostId: post.messageId,
          status: "blocked",
          commentedAt: new Date().toISOString(),
          targetSendAsRef: sendAsRef,
          reason: adAssessment.reason || "Generated comment looked promotional"
        });
        continue;
      }

      if (workingTarget.approval.comments.enabled) {
        const approval = this.queuePendingCommentApproval(workingTarget, reference, post.messageId, sendAsRef, suggestion.comment);
        return {
          target: this.requireTarget(workingTarget.id),
          queuedApproval: approval,
          stop: true
        };
      }

      const published = await this.telegramAccountService.commentAsChannel(
        account,
        reference.channelRef,
        post.messageId,
        suggestion.comment,
        sendAsRef
      );

      if (!published) {
        workingTarget = this.appendBrandCommentRecord(workingTarget, reference, {
          referenceId: reference.id,
          referenceChannelRef: reference.channelRef,
          referencePostId: post.messageId,
          status: "blocked",
          commentedAt: new Date().toISOString(),
          targetSendAsRef: sendAsRef,
          reason: "Discussion thread missing or send-as unavailable"
        });
        continue;
      }

      this.logger.info("Brand comment posted", {
        targetId: target.id,
        referenceChannelRef: reference.channelRef,
        referencePostId: post.messageId,
        commentMessageId: published.messageId
      });

      return {
        target: this.appendBrandCommentRecord(workingTarget, reference, {
          referenceId: reference.id,
          referenceChannelRef: reference.channelRef,
          referencePostId: post.messageId,
          status: "posted",
          commentedAt: published.publishedAt,
          targetSendAsRef: sendAsRef,
          postedCommentMessageId: published.messageId,
          commentText: suggestion.comment
        }),
        stop: true
      };
    }

    return {
      target: workingTarget,
      stop: false
    };
  }

  private appendBrandCommentRecord(
    target: TargetChannel,
    reference: ReferenceChannel,
    record: BrandCommentRecord
  ): TargetChannel {
    return {
      ...target,
      referenceChannels: target.referenceChannels.map((item) =>
        item.id === reference.id
          ? {
              ...item,
              lastCommentedPostId: Math.max(item.lastCommentedPostId ?? 0, record.referencePostId),
              lastCommentedAt: record.commentedAt
            }
          : item
      ),
      brandCommentHistory: trimHistory([...target.brandCommentHistory, record], 100),
      updatedAt: new Date().toISOString()
    };
  }

  private queuePendingCommentApproval(
    target: TargetChannel,
    reference: ReferenceChannel,
    referencePostId: number,
    sendAsRef: string,
    commentText: string
  ): PendingCommentApproval {
    const createdAt = new Date().toISOString();
    const approval: PendingCommentApproval = {
      id: crypto.randomUUID().slice(0, 8),
      kind: "comment",
      createdAt,
      expiresAt: new Date(Date.now() + target.approval.comments.timeoutMinutes * 60_000).toISOString(),
      timeoutAction: target.approval.comments.onTimeout,
      requestedBy: "autocomment",
      targetId: target.id,
      targetTitle: target.title,
      referenceId: reference.id,
      referenceChannelRef: reference.channelRef,
      referencePostId,
      sendAsRef,
      commentText
    };

    this.store.saveTarget({
      ...target,
      referenceChannels: target.referenceChannels.map((item) =>
        item.id === reference.id
          ? {
              ...item,
              lastCommentedPostId: Math.max(item.lastCommentedPostId ?? 0, referencePostId),
              lastCommentedAt: createdAt
            }
          : item
      ),
      pendingApprovals: [...target.pendingApprovals, approval],
      updatedAt: createdAt
    });

    return approval;
  }

  private async moderateTargetComments(targetId: string): Promise<void> {
    const target = this.requireTarget(targetId);
    const account = this.requireAccount(target.accountId);
    const posts = trimHistory(target.publishedPosts.filter((post) => post.discussionPeerRef && post.discussionRootMessageId), 5);

    let updatedPosts = [...target.publishedPosts];

    for (const post of posts) {
      const discussionPeerRef = post.discussionPeerRef;
      const discussionRootMessageId = post.discussionRootMessageId;
      if (!discussionPeerRef || !discussionRootMessageId) {
        continue;
      }

      const comments = await this.telegramAccountService.listThreadComments(
        account,
        discussionPeerRef,
        discussionRootMessageId,
        target.moderation.lookbackMessages,
        post.lastModeratedCommentId ?? 0
      );

      const toDelete: number[] = [];
      let lastScannedId = post.lastModeratedCommentId ?? 0;

      for (const comment of comments) {
        lastScannedId = Math.max(lastScannedId, comment.id);

        if (comment.out || typeof comment.message !== "string" || !comment.message.trim()) {
          continue;
        }

        const assessment = await this.safetyService.assessSpam(comment.message);
        if (!assessment.isSpam || assessment.confidence < target.safety.spamConfidenceThreshold) {
          continue;
        }

        toDelete.push(comment.id);
        if (toDelete.length >= target.moderation.maxDeletesPerCycle) {
          break;
        }
      }

      if (toDelete.length > 0) {
        await this.telegramAccountService.deleteMessages(account, discussionPeerRef, toDelete);
        this.logger.info("Deleted spam comments", {
          targetId: target.id,
          discussionPeerRef,
          deletedCount: toDelete.length
        });
      }

      updatedPosts = updatedPosts.map((item) =>
        item.id === post.id
          ? {
              ...item,
              lastModeratedCommentId: Math.max(item.lastModeratedCommentId ?? 0, lastScannedId)
            }
          : item
      );
    }

    this.store.saveTarget({
      ...target,
      publishedPosts: updatedPosts,
      updatedAt: new Date().toISOString()
    });
  }

  private requireTarget(targetId: string): TargetChannel {
    const target = this.store.getTarget(targetId);
    if (!target) {
      throw new Error(`Target channel not found: ${targetId}`);
    }

    return target;
  }

  private requireReference(target: TargetChannel, referenceId: string): ReferenceChannel {
    const reference = target.referenceChannels.find((item) => item.id === referenceId);
    if (!reference) {
      throw new Error(`Reference channel not found: ${referenceId}`);
    }

    return reference;
  }

  private requireAccount(accountId: string) {
    const account = this.store.getAccount(accountId);
    if (!account) {
      throw new Error(`Telegram account not found: ${accountId}`);
    }

    return account;
  }
}
