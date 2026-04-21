import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from app.core.config import settings
from app.core.logging import setup_logging
from app.bot.handlers.main_handlers import router as main_router
from app.bot.handlers.post_handlers import router as post_router
from app.bot.handlers.auto_handlers import router as auto_router
from app.bot.states.state_manager import user_state_manager

logger = logging.getLogger(__name__)


async def main() -> None:
    setup_logging()
    logger.info("Starting Auto SMM Telegram Bot...")

    bot = Bot(
        token=settings.TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )

    dp = Dispatcher()
    dp.include_routers(
        main_router,
        post_router,
        auto_router,
    )

    logger.info(f"Admin Telegram ID: {settings.TELEGRAM_ADMIN_ID}")
    logger.info(f"OpenRouter configured: {bool(settings.OPENROUTER_API_KEY)}")

    try:
        logger.info("Bot started successfully")
        await dp.start_polling(bot)
    finally:
        await user_state_manager.close()
        await bot.session.close()
        logger.info("Bot stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot interrupted by user")
    except Exception as e:
        logger.critical(f"Bot crashed: {e}", exc_info=True)