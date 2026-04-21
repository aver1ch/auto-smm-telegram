import httpx
import time
import logging
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)

# Approximate cost per 1M tokens (USD) for known models
MODEL_COSTS = {
    "meta-llama/llama-3.1-8b-instruct:free": {"input": 0.0, "output": 0.0},
    "anthropic/claude-3.5-sonnet": {"input": 3.0, "output": 15.0},
    "anthropic/claude-3-haiku": {"input": 0.25, "output": 1.25},
    "openai/gpt-4o": {"input": 5.0, "output": 15.0},
    "openai/gpt-4o-mini": {"input": 0.15, "output": 0.6},
    "google/gemini-flash-1.5": {"input": 0.075, "output": 0.3},
    "google/gemini-pro-1.5": {"input": 3.5, "output": 10.5},
    "mistralai/mistral-7b-instruct": {"input": 0.01, "output": 0.03},
    "mistralai/mixtral-8x7b-instruct": {"input": 0.3, "output": 0.9},
    "stabilityai/stable-diffusion-xl": {"input": 5.0, "output": 15.0},
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    costs = MODEL_COSTS.get(model, {"input": 1.0, "output": 3.0})
    return (prompt_tokens * costs["input"] + completion_tokens * costs["output"]) / 1_000_000


class OpenRouterClient:
    def __init__(self):
        self.base_url = settings.OPENROUTER_BASE_URL
        self.api_key = settings.OPENROUTER_API_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://auto-smm-telegram.bot",
            "X-Title": "Auto SMM Telegram Bot",
        }

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        **kwargs,
    ) -> Dict[str, Any]:
        model = model or settings.AI_LITE_MODEL
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            **kwargs,
        }
        start_time = time.time()
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        elapsed_ms = int((time.time() - start_time) * 1000)
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        cost = estimate_cost(model, prompt_tokens, completion_tokens)

        logger.info(
            f"OpenRouter [{model}] tokens={usage.get('total_tokens', 0)} "
            f"cost=${cost:.6f} time={elapsed_ms}ms"
        )

        return {
            "content": data["choices"][0]["message"]["content"],
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": usage.get("total_tokens", 0),
            "cost_usd": cost,
            "response_time_ms": elapsed_ms,
        }

    async def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.8,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return await self.chat_completion(messages, model=model, temperature=temperature, max_tokens=max_tokens)

    async def get_available_models(self) -> List[Dict]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/models",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json().get("data", [])


openrouter_client = OpenRouterClient()
