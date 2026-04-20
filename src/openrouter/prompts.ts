import type { ContentMode, SourceMessage, TargetChannel } from "../types.js";

function renderModeDescription(mode: ContentMode): string {
  switch (mode) {
    case "rewrite":
      return "Перепиши факты и смысл в новой подаче без близкого копирования оригинала.";
    case "summary":
      return "Собери краткую и плотную выжимку по материалам без лишней воды.";
    case "hybrid":
      return "Синтезируй несколько источников в один авторский пост с новой структурой.";
    default:
      return "Создай качественный пост на основе источников.";
  }
}

export function buildContentMessages(target: TargetChannel, sources: SourceMessage[]): Array<{ role: "system" | "user"; content: string }> {
  const sourceBlocks = sources
    .map((source, index) => {
      const permalink = source.permalink ? `\nPermalink: ${source.permalink}` : "";
      return [
        `Source #${index + 1}`,
        `Reference ID: ${source.referenceId}`,
        `Channel: ${source.channelTitle} (${source.channelRef})`,
        `Message ID: ${source.messageId}`,
        `Date: ${source.date}${permalink}`,
        "Text:",
        source.text
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const wantsImage = target.includeImage
    ? `Сгенерируй также imagePrompt под вертикальный или квадратный постер. Соотношение сторон: ${target.imageAspectRatio}.`
    : "Поле imagePrompt верни пустой строкой.";

  const strategyBlock = target.strategyInsight
    ? [
        `Auto strategy summary: ${target.strategyInsight.summary}`,
        `Do more of: ${target.strategyInsight.doMoreOf.join(" | ") || "none"}`,
        `Avoid: ${target.strategyInsight.avoid.join(" | ") || "none"}`,
        `Recommended windows: ${target.strategyInsight.recommendedPostingWindows.join(" | ") || "none"}`
      ].join("\n")
    : "Auto strategy summary: none";

  return [
    {
      role: "system",
      content: [
        "Ты редактор Telegram-каналов и контент-стратег.",
        "Пиши фактически аккуратно, без явного копирования, без клише и без вымышленных деталей.",
        "Нельзя ссылаться на то, что текст был переписан нейросетью.",
        "Верни строго JSON без markdown-обертки.",
        'JSON schema: {"title":"string","summary":"string","post":"string","imagePrompt":"string"}',
        "Поле post должно быть готовым телеграм-постом.",
        "Поле summary должно кратко объяснять, что именно получилось."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Target channel title: ${target.title}`,
        `Target channel ref: ${target.channelRef}`,
        `Language: ${target.language}`,
        `Tone: ${target.tone}`,
        `Style notes: ${target.styleNotes?.trim() || "none"}`,
        strategyBlock,
        `Content mode: ${target.contentMode}`,
        renderModeDescription(target.contentMode),
        wantsImage,
        "",
        "Материалы для обработки:",
        sourceBlocks,
        "",
        "Требования к post:",
        "1. Сразу готов к публикации в Telegram.",
        "2. Сильный первый абзац, потом плотная структура.",
        "3. Без длинных вступлений и без канцелярита.",
        "4. Никаких прямых упоминаний того, что это сводка источников.",
        "5. Сохраняй факты, но меняй формулировки и композицию."
      ].join("\n")
    }
  ];
}
