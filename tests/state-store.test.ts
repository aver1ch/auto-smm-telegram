import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createCalendarConfig } from "../src/scheduling/calendar.js";
import { StateStore } from "../src/store/state-store.js";
import { createDefaultApprovalConfig } from "../src/target-defaults.js";

test("StateStore persists accounts and targets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-smm-telegram-"));
  const filePath = path.join(tempDir, "state.json");
  const store = new StateStore(filePath);

  store.saveAccount({
    id: "acc-1",
    name: "Main",
    apiId: 12345,
    apiHash: "hash",
    sessionString: "session",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z"
  });

  store.saveTarget({
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
      enabled: false,
      intervalMinutes: 60
    },
    publishMode: "manual",
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
      enabled: false,
      sendAsChannelRef: "@target",
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
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z"
  });

  const reloaded = new StateStore(filePath);
  assert.equal(reloaded.listAccounts().length, 1);
  assert.equal(reloaded.listTargets().length, 1);
  assert.equal(reloaded.getTarget("target-1")?.channelRef, "@target");
});

test("StateStore normalizes approval defaults for older target records", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-smm-telegram-"));
  const filePath = path.join(tempDir, "state.json");

  fs.writeFileSync(
    filePath,
    JSON.stringify({
      accounts: [],
      targets: [
        {
          id: "target-legacy",
          accountId: "acc-1",
          title: "Legacy",
          channelRef: "@legacy",
          language: "ru",
          tone: "expert",
          contentMode: "rewrite",
          includeImage: false,
          imageAspectRatio: "1:1",
          autoPost: {
            enabled: false,
            intervalMinutes: 60
          },
          publishMode: "manual",
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
          comments: {
            enabled: false,
            sendAsChannelRef: "@legacy",
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
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z"
        }
      ]
    }),
    "utf8"
  );

  const store = new StateStore(filePath);
  const target = store.getTarget("target-legacy");

  assert.ok(target);
  assert.equal(target?.approval.posts.enabled, false);
  assert.equal(target?.approval.comments.timeoutMinutes, 30);
  assert.deepEqual(target?.pendingApprovals, []);
});
