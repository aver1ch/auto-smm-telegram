import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Logger } from "../src/logger.js";
import { createCalendarConfig } from "../src/scheduling/calendar.js";
import { ApprovalService } from "../src/services/approval-service.js";
import { StateStore } from "../src/store/state-store.js";
import { createDefaultApprovalConfig } from "../src/target-defaults.js";
import type { GeneratedDraft, PendingCommentApproval, PendingPostApproval, TargetChannel } from "../src/types.js";

function createTarget(): TargetChannel {
  return {
    id: "target-1",
    accountId: "acc-1",
    title: "Target",
    channelRef: "@target",
    language: "ru",
    tone: "expert",
    contentMode: "rewrite",
    includeImage: false,
    imageAspectRatio: "1:1",
    autoPost: {
      enabled: true,
      intervalMinutes: 60
    },
    publishMode: "interval",
    calendar: {
      ...createCalendarConfig("weekdays@09:00", "Europe/Moscow"),
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
      enabled: true,
      sendAsChannelRef: "@target",
      maxCommentsPerDay: 3,
      minHoursBetweenComments: 6
    },
    moderation: {
      enabled: true,
      maxDeletesPerCycle: 10,
      lookbackMessages: 50
    },
    referenceChannels: [
      {
        id: "ref-1",
        channelRef: "@ref",
        fetchLimit: 3,
        commentingEnabled: true
      }
    ],
    lastSourceMessageByReference: {},
    publishedPosts: [],
    analyticsHistory: [],
    brandCommentHistory: [],
    pendingApprovals: [],
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z"
  };
}

function createDraft(): GeneratedDraft {
  return {
    text: "Generated post",
    summary: "Summary",
    sourceMessages: [],
    sourceCursor: {},
    generatedAt: "2026-04-20T00:00:00.000Z",
    model: "model"
  };
}

function createStoreWithTarget(target: TargetChannel): StateStore {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-smm-telegram-"));
  const filePath = path.join(tempDir, "state.json");
  const store = new StateStore(filePath);
  store.saveTarget(target);
  return store;
}

test("ApprovalService publishes expired post approvals when onTimeout=publish", async () => {
  const draft = createDraft();
  const postApproval: PendingPostApproval = {
    id: "approval-post",
    kind: "post",
    createdAt: "2026-04-20T00:00:00.000Z",
    expiresAt: "2026-04-20T00:01:00.000Z",
    timeoutAction: "publish",
    requestedBy: "autopost",
    draft,
    targetId: "target-1",
    targetTitle: "Target",
    sourceCount: 0
  };

  const store = createStoreWithTarget({
    ...createTarget(),
    pendingApprovals: [postApproval]
  });

  let publishCalls = 0;
  const contentService = {
    async publishSpecificDraft(targetId: string, value: GeneratedDraft) {
      publishCalls += 1;
      const target = store.getTarget(targetId);
      if (!target) {
        throw new Error("missing target");
      }

      store.saveTarget({
        ...target,
        lastDraft: value,
        lastPublishedAt: new Date().toISOString(),
        pendingApprovals: target.pendingApprovals.filter((item) => item.id !== postApproval.id),
        updatedAt: new Date().toISOString()
      });
      return value;
    }
  };

  const communityService = {
    async publishApprovedComment() {
      throw new Error("not expected");
    },
    async skipApprovedComment() {
      throw new Error("not expected");
    }
  };

  const approvalService = new ApprovalService(
    store,
    contentService as never,
    communityService as never,
    new Logger("error")
  );

  await approvalService.runTimeoutCycle();

  assert.equal(publishCalls, 1);
  assert.equal(store.getTarget("target-1")?.pendingApprovals.length, 0);
});

test("ApprovalService skips expired comment approvals when onTimeout=skip", async () => {
  const commentApproval: PendingCommentApproval = {
    id: "approval-comment",
    kind: "comment",
    createdAt: "2026-04-20T00:00:00.000Z",
    expiresAt: "2026-04-20T00:01:00.000Z",
    timeoutAction: "skip",
    requestedBy: "autocomment",
    targetId: "target-1",
    targetTitle: "Target",
    referenceId: "ref-1",
    referenceChannelRef: "@ref",
    referencePostId: 99,
    sendAsRef: "@target",
    commentText: "Comment"
  };

  const store = createStoreWithTarget({
    ...createTarget(),
    pendingApprovals: [commentApproval]
  });

  let skipCalls = 0;
  const contentService = {
    async publishSpecificDraft() {
      throw new Error("not expected");
    }
  };

  const communityService = {
    async publishApprovedComment() {
      throw new Error("not expected");
    },
    async skipApprovedComment(targetId: string, approval: PendingCommentApproval) {
      skipCalls += 1;
      const target = store.getTarget(targetId);
      if (!target) {
        throw new Error("missing target");
      }

      store.saveTarget({
        ...target,
        pendingApprovals: target.pendingApprovals.filter((item) => item.id !== approval.id),
        updatedAt: new Date().toISOString()
      });
    }
  };

  const approvalService = new ApprovalService(
    store,
    contentService as never,
    communityService as never,
    new Logger("error")
  );

  await approvalService.runTimeoutCycle();

  assert.equal(skipCalls, 1);
  assert.equal(store.getTarget("target-1")?.pendingApprovals.length, 0);
});
