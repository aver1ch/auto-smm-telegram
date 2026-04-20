import { Logger } from "../logger.js";
import { OpenRouterClient } from "../openrouter/client.js";
import {
  isHighConfidenceAdvertising,
  isHighConfidenceSpam
} from "../openrouter/intelligence-prompts.js";
import type { AdvertisingAssessment, SpamAssessment, TargetChannel } from "../types.js";

function obviousAdvertisingHeuristic(text: string): AdvertisingAssessment | undefined {
  const normalized = text.toLowerCase();
  const strongSignals = [
    "промокод",
    "скидк",
    "рефераль",
    "партнерск",
    "sponsored",
    "use code",
    "buy now",
    "sign up",
    "register now",
    "limited offer",
    "реклама",
    "#ad"
  ];

  if (strongSignals.some((signal) => normalized.includes(signal))) {
    return {
      isAdvertisement: true,
      confidence: 0.97,
      reason: "Heuristic matched explicit advertising markers"
    };
  }

  const urlCount = (normalized.match(/https?:\/\//g) || []).length + (normalized.match(/t\.me\//g) || []).length;
  const ctaSignals = ["подпиш", "переходи", "куп", "закаж", "забирай", "получи", "join ", "follow ", "click "];
  if (urlCount >= 2 && ctaSignals.some((signal) => normalized.includes(signal))) {
    return {
      isAdvertisement: true,
      confidence: 0.9,
      reason: "Heuristic matched multiple links plus CTA language"
    };
  }

  return undefined;
}

function obviousSpamHeuristic(text: string): SpamAssessment | undefined {
  const normalized = text.toLowerCase();
  const strongSignals = [
    "dm me",
    "write me privately",
    "заработок без вложений",
    "казино",
    "ставк",
    "18+",
    "sex",
    "onlyfans",
    "airdrop",
    "wallet connect",
    "claim reward",
    "giveaway",
    "pump signal",
    "vip signal"
  ];

  const linkCount = (normalized.match(/https?:\/\//g) || []).length + (normalized.match(/t\.me\//g) || []).length;
  const emojiBurst = /(?:🔥|🚀|💸|💰|❤️|😍){4,}/u.test(text);
  const mentionCount = (normalized.match(/@\w+/g) || []).length;

  if (strongSignals.some((signal) => normalized.includes(signal))) {
    return {
      isSpam: true,
      confidence: 0.98,
      reason: "Heuristic matched common scam/spam markers"
    };
  }

  if (linkCount >= 2 || mentionCount >= 4 || emojiBurst) {
    return {
      isSpam: true,
      confidence: 0.85,
      reason: "Heuristic matched mass-promo or bot-like pattern"
    };
  }

  return undefined;
}

export class SafetyService {
  constructor(
    private readonly openRouterClient: OpenRouterClient,
    private readonly logger: Logger
  ) {}

  async assessAdvertising(text: string, contextLabel: string): Promise<AdvertisingAssessment> {
    const heuristic = obviousAdvertisingHeuristic(text);
    if (heuristic) {
      return heuristic;
    }

    return this.openRouterClient.classifyAdvertising(text, contextLabel);
  }

  async assessSpam(text: string): Promise<SpamAssessment> {
    const heuristic = obviousSpamHeuristic(text);
    if (heuristic) {
      return heuristic;
    }

    return this.openRouterClient.classifySpam(text);
  }

  async isAllowedSourceText(target: TargetChannel, text: string, contextLabel: string): Promise<{ allowed: boolean; reason?: string }> {
    if (!target.safety.antiAdsEnabled) {
      return { allowed: true };
    }

    const assessment = await this.assessAdvertising(text, contextLabel);
    if (isHighConfidenceAdvertising(assessment, target.safety.adConfidenceThreshold)) {
      this.logger.info("Source blocked by anti-ad filter", {
        targetId: target.id,
        contextLabel,
        reason: assessment.reason,
        confidence: assessment.confidence
      });

      return {
        allowed: false,
        reason: assessment.reason
      };
    }

    return { allowed: true };
  }

  async isAllowedComment(target: TargetChannel, text: string): Promise<{ allowed: boolean; reason?: string }> {
    if (!target.safety.antiSpamEnabled) {
      return { allowed: true };
    }

    const assessment = await this.assessSpam(text);
    if (isHighConfidenceSpam(assessment, target.safety.spamConfidenceThreshold)) {
      return {
        allowed: false,
        reason: assessment.reason
      };
    }

    return { allowed: true };
  }
}
