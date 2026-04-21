import logging
from typing import Optional, Dict, Any
from app.ai.openrouter_client import openrouter_client
from app.core.config import settings
from app.models.post import ContentStyle
from app.models.user import TariffType

logger = logging.getLogger(__name__)

STYLE_DESCRIPTIONS = {
    ContentStyle.EXPERT: "экспертный, авторитетный, с фактами и данными",
    ContentStyle.PROVOCATIVE: "провокационный, вызывающий дискуссию, смелый",
    ContentStyle.ENTERTAINING: "развлекательный, лёгкий, с юмором",
    ContentStyle.INFORMATIONAL: "информационный, нейтральный, структурированный",
    ContentStyle.PROMOTIONAL: "продающий, убедительный, с призывом к действию",
    ContentStyle.STORYTELLING: "в формате истории, личный, эмоциональный",
}

LENGTH_DESCRIPTIONS = {
    "short": "короткий (до 500 символов)",
    "medium": "средний (500-1500 символов)",
    "long": "длинный (1500-3000 символов)",
}


def select_model(tariff: TariffType, use_powerful: bool = False) -> str:
    if tariff == TariffType.LITE:
        return settings.AI_LITE_MODEL
    elif tariff == TariffType.PRO:
        return settings.AI_PRO_MODEL if use_powerful else settings.AI_LITE_MODEL
    else:  # ENTERPRISE
        return settings.AI_PRO_MODEL  # Always best for enterprise


class ContentGenerator:

    async def generate_post(
        self,
        topic: str,
        style: ContentStyle = ContentStyle.INFORMATIONAL,
        language: str = "ru",
        target_length: str = "medium",
        channel_description: Optional[str] = None,
        additional_instructions: Optional[str] = None,
        tariff: TariffType = TariffType.LITE,
        use_powerful_model: bool = False,
    ) -> Dict[str, Any]:
        model = select_model(tariff, use_powerful_model)
        style_desc = STYLE_DESCRIPTIONS.get(style, "нейтральный")
        length_desc = LENGTH_DESCRIPTIONS.get(target_length, "средний")

        system_prompt = f"""Ты — профессиональный SMM-специалист и копирайтер.
Твоя задача — создавать качественный контент для Telegram-каналов.
Пиши на языке: {language}.
Стиль текста: {style_desc}.
Длина поста: {length_desc}.
{"Описание канала: " + channel_description if channel_description else ""}

Правила:
- Текст должен быть живым, читаемым и вовлекающим
- Используй эмодзи уместно, не перегружай
- Структурируй текст для удобного чтения
- Не используй шаблонные фразы и клише"""

        user_prompt = f"""Напиши пост для Telegram-канала на тему: {topic}
{"Дополнительные инструкции: " + additional_instructions if additional_instructions else ""}

Верни ТОЛЬКО текст поста, без пояснений и комментариев."""

        result = await openrouter_client.generate_text(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=0.8,
            max_tokens=2000,
        )
        result["topic"] = topic
        result["style"] = style
        return result

    async def generate_hashtags(
        self,
        post_text: str,
        language: str = "ru",
        count: int = 5,
        tariff: TariffType = TariffType.LITE,
    ) -> Dict[str, Any]:
        model = select_model(tariff)
        prompt = f"""На основе текста поста сгенерируй {count} релевантных хэштегов.
Язык: {language}.
Хэштеги должны быть популярными и точно отражать тему.

Текст поста:
{post_text[:1000]}

Верни ТОЛЬКО хэштеги через пробел, начиная с #. Например: #маркетинг #smm #контент"""

        return await openrouter_client.generate_text(
            prompt=prompt,
            model=model,
            temperature=0.5,
            max_tokens=200,
        )

    async def generate_title(
        self,
        post_text: str,
        language: str = "ru",
        tariff: TariffType = TariffType.LITE,
    ) -> Dict[str, Any]:
        model = select_model(tariff)
        prompt = f"""Придумай цепляющий заголовок для поста (до 100 символов).
Язык: {language}.

Текст поста:
{post_text[:500]}

Верни ТОЛЬКО заголовок, без кавычек и пояснений."""

        return await openrouter_client.generate_text(
            prompt=prompt,
            model=model,
            temperature=0.7,
            max_tokens=150,
        )

    async def improve_post(
        self,
        post_text: str,
        improvement_instructions: str,
        tariff: TariffType = TariffType.LITE,
        use_powerful_model: bool = False,
    ) -> Dict[str, Any]:
        model = select_model(tariff, use_powerful_model)
        prompt = f"""Улучши текст поста согласно инструкциям.

Оригинальный текст:
{post_text}

Инструкции по улучшению:
{improvement_instructions}

Верни ТОЛЬКО улучшенный текст поста."""

        return await openrouter_client.generate_text(
            prompt=prompt,
            model=model,
            temperature=0.7,
            max_tokens=2000,
        )

    async def generate_content_plan(
        self,
        channel_topic: str,
        days: int = 7,
        posts_per_day: int = 2,
        language: str = "ru",
        tariff: TariffType = TariffType.LITE,
    ) -> Dict[str, Any]:
        model = select_model(tariff, use_powerful=tariff != TariffType.LITE)
        prompt = f"""Создай контент-план для Telegram-канала на {days} дней.
Тематика канала: {channel_topic}
Количество постов в день: {posts_per_day}
Язык: {language}

Для каждого поста укажи:
- День и порядковый номер
- Тема поста
- Стиль (экспертный/развлекательный/информационный/провокационный)
- Краткое описание (1-2 предложения)

Формат: нумерованный список, структурированно."""

        return await openrouter_client.generate_text(
            prompt=prompt,
            model=model,
            temperature=0.7,
            max_tokens=3000,
        )


content_generator = ContentGenerator()
