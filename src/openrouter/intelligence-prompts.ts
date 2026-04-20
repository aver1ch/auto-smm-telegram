import type {
  AdvertisingAssessment,
  BrandCommentSuggestion,
  SourceMessage,
  SpamAssessment,
  StrategyAnalysis,
  TargetChannel
} from "../types.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function buildAdvertisingAssessmentMessages(text: string, contextLabel: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "Ты классификатор контента для Telegram.",
        "Определи, является ли текст рекламой, нативной интеграцией, продажей, партнерским продвижением или прямым промо чужого бренда.",
        "Считай рекламой: промокоды, скидки, призывы купить/подписаться/перейти по ссылке, реферальные коды, спонсорские интеграции.",
        "Верни строго JSON.",
        'Schema: {"isAdvertisement":boolean,"confidence":number,"reason":"string"}'
      ].join("\n")
    },
    {
      role: "user",
      content: `Context: ${contextLabel}\n\nText:\n${text}`
    }
  ];
}

export function buildSpamAssessmentMessages(text: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "Ты модератор Telegram-комментариев.",
        "Определи, является ли комментарий спамом, мошенничеством, массовым промо, фишингом, гемблингом, adult-промо или бессмысленным засорением.",
        "Не считай спамом обычное несогласие, критику или короткий живой комментарий по теме.",
        "Верни строго JSON.",
        'Schema: {"isSpam":boolean,"confidence":number,"reason":"string"}'
      ].join("\n")
    },
    {
      role: "user",
      content: `Comment:\n${text}`
    }
  ];
}

export function buildBrandCommentMessages(target: TargetChannel, source: SourceMessage): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "Ты комьюнити-редактор Telegram-канала.",
        "Твоя задача: написать полезный, не спамный комментарий от имени бренда под постом в референсном канале.",
        "Комментарий должен быть уместным, содержательным и коротким.",
        "Нельзя писать агрессивную рекламу, просить подписаться, давить ссылками или выглядеть как бот-спамер.",
        "Если комментировать неуместно, верни shouldComment=false.",
        "Верни строго JSON.",
        'Schema: {"shouldComment":boolean,"relevanceScore":number,"reason":"string","comment":"string"}'
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Brand channel: ${target.title}`,
        `Brand ref: ${target.channelRef}`,
        `Language: ${target.language}`,
        `Tone: ${target.tone}`,
        `Style notes: ${target.comments.styleNotes?.trim() || target.styleNotes?.trim() || "none"}`,
        "",
        `Reference channel: ${source.channelTitle} (${source.channelRef})`,
        `Reference post id: ${source.messageId}`,
        "Reference text:",
        source.text,
        "",
        "Сделай комментарий экспертным и естественным. Можно мягко показать экспертизу бренда, но без прямой рекламы."
      ].join("\n")
    }
  ];
}

export function buildStrategyAnalysisMessages(target: TargetChannel, payload: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "Ты редакционный стратег Telegram-канала.",
        "На основе метрик канала и постов предложи, как скорректировать подход к ведению.",
        "Нужны конкретные рекомендации для следующих публикаций.",
        "Верни строго JSON.",
        'Schema: {"summary":"string","doMoreOf":["string"],"avoid":["string"],"recommendedPostingWindows":["string"]}'
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Target channel: ${target.title} (${target.channelRef})`,
        `Language: ${target.language}`,
        `Tone: ${target.tone}`,
        `Current style notes: ${target.styleNotes?.trim() || "none"}`,
        "",
        payload,
        "",
        "Сделай выводы только из представленных данных. Не выдумывай недоступные причинно-следственные связи."
      ].join("\n")
    }
  ];
}

export function isHighConfidenceAdvertising(result: AdvertisingAssessment, threshold: number): boolean {
  return result.isAdvertisement && result.confidence >= threshold;
}

export function isHighConfidenceSpam(result: SpamAssessment, threshold: number): boolean {
  return result.isSpam && result.confidence >= threshold;
}

export type { ChatMessage, AdvertisingAssessment, SpamAssessment, BrandCommentSuggestion, StrategyAnalysis };
