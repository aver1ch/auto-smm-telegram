import test from "node:test";
import assert from "node:assert/strict";

import { buildContentMessages } from "../src/openrouter/prompts.js";
import { createCalendarConfig } from "../src/scheduling/calendar.js";
import { createDefaultApprovalConfig } from "../src/target-defaults.js";
import type { TargetChannel } from "../src/types.js";

const target: TargetChannel = {
  id: "target-1",
  accountId: "acc-1",
  title: "Crypto Daily",
  channelRef: "@crypto_daily",
  language: "ru",
  tone: "экспертный, короткие абзацы",
  contentMode: "hybrid",
  includeImage: true,
  imageAspectRatio: "4:5",
  styleNotes: "без кликбейта",
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
    sendAsChannelRef: "@crypto_daily",
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

test("buildContentMessages includes target config and sources", () => {
  const messages = buildContentMessages(target, [
    {
      referenceId: "ref-1",
      channelRef: "@source",
      channelTitle: "Source",
      messageId: 100,
      date: "2026-04-20T10:00:00.000Z",
      text: "Important market update"
    }
  ]);

  assert.equal(messages.length, 2);
  assert.match(messages[0]!.content, /JSON schema/);
  assert.match(messages[1]!.content, /Crypto Daily/);
  assert.match(messages[1]!.content, /Important market update/);
});
