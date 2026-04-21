import json
import logging
from typing import Optional, Dict, Any, List
from app.ai.openrouter_client import openrouter_client
from app.core.config import settings
from app.models.analytics import SentimentType

logger = logging.getLogger(__name__)


class CommentAnalyzer:

    async def analyze_comment(
        self,
        comment_text: str,
        post_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        system_prompt = """Ты — модератор контента. Анализируй комментарии и возвращай JSON.
Поля ответа:
- sentiment: "positive" | "negative" | "neutral" | "mixed"
- is_toxic: true/false
- is_spam: true/false
- is_ads: true/false
- toxicity_score: 0.0-1.0
- reason: краткое объяснение (1 предложение)

Отвечай ТОЛЬКО валидным JSON без markdown."""

        context = f"\nКонтекст поста: {post_context[:300]}" if post_context else ""
        prompt = f"Проанализируй комментарий:{context}\n\nКомментарий: {comment_text}"

        result = await openrouter_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            model=settings.AI_LITE_MODEL,
            temperature=0.1,
            max_tokens=300,
        )
        try:
            analysis = json.loads(result["content"])
        except json.JSONDecodeError:
            analysis = {
                "sentiment": "neutral",
                "is_toxic": False,
                "is_spam": False,
                "is_ads": False,
                "toxicity_score": 0.0,
                "reason": "Не удалось проанализировать",
            }
        analysis["tokens"] = result.get("total_tokens", 0)
        analysis["cost_usd"] = result.get("cost_usd", 0.0)
        return analysis

    async def analyze_comments_batch(
        self,
        comments: List[Dict[str, str]],
        post_context: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        results = []
        for comment in comments:
            try:
                analysis = await self.analyze_comment(
                    comment.get("text", ""),
                    post_context=post_context,
                )
                analysis["comment_id"] = comment.get("id")
                results.append(analysis)
            except Exception as e:
                logger.error(f"Error analyzing comment {comment.get('id')}: {e}")
                results.append({
                    "comment_id": comment.get("id"),
                    "sentiment": "neutral",
                    "is_toxic": False,
                    "is_spam": False,
                    "is_ads": False,
                    "toxicity_score": 0.0,
                    "error": str(e),
                })
        return results

    async def generate_reply(
        self,
        comment_text: str,
        post_text: str,
        channel_style: str = "профессиональный",
        language: str = "ru",
    ) -> Dict[str, Any]:
        system_prompt = f"""Ты — SMM-менеджер канала. Пиши ответы на комментарии.
Стиль общения: {channel_style}.
Язык: {language}.
Правила:
- Будь вежливым и конструктивным
- Отвечай по существу
- Не более 2-3 предложений
- Не используй шаблонные фразы"""

        prompt = f"""Пост канала: {post_text[:500]}

Комментарий пользователя: {comment_text}

Напиши ответ на комментарий."""

        return await openrouter_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            model=settings.AI_LITE_MODEL,
            temperature=0.7,
            max_tokens=300,
        )

    async def analyze_post_performance(
        self,
        post_text: str,
        metrics: Dict[str, Any],
        channel_avg_metrics: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        model = model or settings.AI_PRO_MODEL
        avg_info = ""
        if channel_avg_metrics:
            avg_info = f"""
Средние показатели канала:
- Просмотры: {channel_avg_metrics.get('avg_views', 'н/д')}
- Engagement Rate: {channel_avg_metrics.get('avg_er', 'н/д')}%
- Реакции: {channel_avg_metrics.get('avg_reactions', 'н/д')}"""

        prompt = f"""Проанализируй эффективность поста и дай рекомендации.

Текст поста:
{post_text[:1000]}

Метрики поста:
- Просмотры: {metrics.get('views', 0)}
- Реакции: {metrics.get('reactions_total', 0)}
- Комментарии: {metrics.get('comments_count', 0)}
- Engagement Rate: {metrics.get('engagement_rate', 0):.2f}%
- Новые подписчики: {metrics.get('subscribers_gained', 0)}
- Отписки: {metrics.get('subscribers_lost', 0)}
{avg_info}

Дай анализ в формате:
1. Что сработало хорошо (2-3 пункта)
2. Что можно улучшить (2-3 пункта)
3. Конкретные рекомендации для следующих постов (3-5 пунктов)"""

        return await openrouter_client.generate_text(
            prompt=prompt,
            model=model,
            temperature=0.5,
            max_tokens=1000,
        )

    async def get_optimal_posting_time_recommendation(
        self,
        analytics_data: List[Dict[str, Any]],
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        model = model or settings.AI_LITE_MODEL
        data_str = json.dumps(analytics_data[:20], ensure_ascii=False, indent=2)
        prompt = f"""На основе данных аналитики определи оптимальное время публикации.

Данные (время публикации и engagement rate):
{data_str}

Ответь:
1. Лучшее время для публикации (часы)
2. Лучшие дни недели
3. Паттерны активности аудитории
4. Рекомендуемое расписание"""

        return await openrouter_client.generate_text(
            prompt=prompt,
            model=model,
            temperature=0.3,
            max_tokens=500,
        )


comment_analyzer = CommentAnalyzer()
