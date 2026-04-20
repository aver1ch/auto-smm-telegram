import type { SessionFlavor } from "grammy";

import type { ContentMode } from "../types.js";

type AccountFlow = {
  type: "account_add";
  step: "name" | "apiId" | "apiHash" | "sessionString";
  data: Partial<{
    name: string;
    apiId: number;
    apiHash: string;
    sessionString: string;
  }>;
};

type TargetFlow = {
  type: "target_add";
  step:
    | "accountId"
    | "title"
    | "channelRef"
    | "language"
    | "tone"
    | "contentMode"
    | "includeImage"
    | "imageAspectRatio"
    | "styleNotes"
    | "intervalMinutes";
  data: Partial<{
    accountId: string;
    title: string;
    channelRef: string;
    language: string;
    tone: string;
    contentMode: ContentMode;
    includeImage: boolean;
    imageAspectRatio: string;
    styleNotes: string;
    intervalMinutes: number;
  }>;
};

type ReferenceFlow = {
  type: "reference_add";
  step: "targetId" | "channelRef" | "fetchLimit";
  data: Partial<{
    targetId: string;
    channelRef: string;
    fetchLimit: number;
  }>;
};

export type BotFlow = AccountFlow | TargetFlow | ReferenceFlow;

export interface BotSessionData {
  flow?: BotFlow;
}

export type BotContextFlavor = SessionFlavor<BotSessionData>;

export function initialSessionData(): BotSessionData {
  return {};
}
