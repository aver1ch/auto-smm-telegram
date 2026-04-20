import { z } from "zod";

import { appConfig } from "../config.js";
import { Logger } from "../logger.js";
import {
  buildAdvertisingAssessmentMessages,
  buildBrandCommentMessages,
  buildSpamAssessmentMessages,
  buildStrategyAnalysisMessages
} from "./intelligence-prompts.js";
import type {
  AdvertisingAssessment,
  BrandCommentSuggestion,
  GeneratedContentPayload,
  SourceMessage,
  SpamAssessment,
  StrategyAnalysis,
  TargetChannel
} from "../types.js";
import { extractJsonObject } from "../utils/json.js";

const contentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  post: z.string().min(1),
  imagePrompt: z.string().optional().default("")
});

const advertisingSchema = z.object({
  isAdvertisement: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1)
});

const spamSchema = z.object({
  isSpam: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1)
});

const brandCommentSchema = z.object({
  shouldComment: z.boolean(),
  relevanceScore: z.number().min(0).max(1),
  reason: z.string().min(1),
  comment: z.string().default("")
});

const strategySchema = z.object({
  summary: z.string().min(1),
  doMoreOf: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  recommendedPostingWindows: z.array(z.string()).default([])
});

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      images?: Array<{
        image_url?: {
          url?: string;
        };
        imageUrl?: {
          url?: string;
        };
      }>;
    };
  }>;
}

export class OpenRouterClient {
  constructor(private readonly logger: Logger) {}

  async generateStructuredContent(messages: ChatMessage[]): Promise<GeneratedContentPayload> {
    const parsed = await this.generateJson(messages, contentSchema, 0.7);

    return {
      title: parsed.title,
      summary: parsed.summary,
      post: parsed.post,
      imagePrompt: parsed.imagePrompt.trim() || undefined
    };
  }

  async classifyAdvertising(text: string, contextLabel: string): Promise<AdvertisingAssessment> {
    return this.generateJson(buildAdvertisingAssessmentMessages(text, contextLabel), advertisingSchema, 0.1);
  }

  async classifySpam(text: string): Promise<SpamAssessment> {
    return this.generateJson(buildSpamAssessmentMessages(text), spamSchema, 0.1);
  }

  async generateBrandComment(target: TargetChannel, source: SourceMessage): Promise<BrandCommentSuggestion> {
    const result = await this.generateJson(buildBrandCommentMessages(target, source), brandCommentSchema, 0.4);
    return {
      ...result,
      comment: result.comment.trim()
    };
  }

  async analyzeStrategy(target: TargetChannel, payload: string): Promise<StrategyAnalysis> {
    return this.generateJson(buildStrategyAnalysisMessages(target, payload), strategySchema, 0.3);
  }

  async generateImage(prompt: string, aspectRatio: string): Promise<{ dataUrl: string; mimeType: string }> {
    const payload = await this.chat({
      model: appConfig.openRouterImageModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: aspectRatio
      }
    });

    const choice = payload.choices?.[0]?.message;
    const imageUrl =
      choice?.images?.[0]?.image_url?.url ??
      choice?.images?.[0]?.imageUrl?.url;

    if (!imageUrl) {
      throw new Error("OpenRouter image response did not contain an image");
    }

    const mimeTypeMatch = imageUrl.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeTypeMatch?.[1] ?? "image/png";

    return {
      dataUrl: imageUrl,
      mimeType
    };
  }

  private async generateJson<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    temperature: number
  ): Promise<T> {
    const payload = await this.chat({
      model: appConfig.openRouterTextModel,
      messages,
      temperature
    });

    const text = this.extractText(payload);
    return schema.parse(extractJsonObject(text));
  }

  private async chat(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
    const response = await fetch(`${appConfig.openRouterBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appConfig.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": appConfig.appUrl || "https://localhost",
        "X-Title": appConfig.appName
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error("OpenRouter request failed", {
        status: response.status,
        errorText
      });
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    return (await response.json()) as ChatCompletionResponse;
  }

  private extractText(payload: ChatCompletionResponse): string {
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((item) => item.text ?? "")
        .join("")
        .trim();

      if (text) {
        return text;
      }
    }

    throw new Error("OpenRouter response did not contain text content");
  }
}
