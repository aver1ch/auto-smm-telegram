from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
import os
from functools import lru_cache


class Settings(BaseSettings):
    ADMIN_TELEGRAM_ID: int = 765591222
    # Telegram
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_ADMIN_ID: int = 765591222

    # OpenRouter
    OPENROUTER_API_KEY: str
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # AI Models
    AI_LITE_MODEL: str = "meta-llama/llama-3.1-8b-instruct:free"
    AI_PRO_MODEL: str = "anthropic/claude-3.5-sonnet"
    AI_IMAGE_MODEL: str = "openai/dall-e-3"

    # Database
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # App
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "changeme"

    # Webhook
    WEBHOOK_URL: Optional[str] = None
    WEBHOOK_PATH: str = "/webhook"
    WEBAPP_HOST: str = "0.0.0.0"
    WEBAPP_PORT: int = 8080

    # Tariff limits
    LITE_GENERATIONS_PER_DAY: int = 10
    PRO_GENERATIONS_PER_DAY: int = 100
    ENTERPRISE_GENERATIONS_PER_DAY: int = 10000

    LITE_POSTS_PER_DAY: int = 3
    PRO_POSTS_PER_DAY: int = 20
    ENTERPRISE_POSTS_PER_DAY: int = 1000

    LITE_CHANNELS: int = 1
    PRO_CHANNELS: int = 5
    ENTERPRISE_CHANNELS: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

@lru_cache()
def get_settings() -> Settings:
    return Settings()
