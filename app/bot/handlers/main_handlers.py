import logging
from aiogram import Router, types
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery
from app.core.config import settings
from app.bot.keyboards.keyboards import main_menu_keyboard
from app.bot.states.state_manager import user_state_manager, StateType

logger = logging.getLogger(__name__)
router = Router()


@router.message(CommandStart())
async def command_start_handler(message: types.Message) -> None:
    user_id = message.from_user.id
    is_admin = user_id == settings.ADMIN_TELEGRAM_ID

    await user_state_manager.reset(user_id)

    welcome_text = """
🤖 Добро пожаловать в Auto SMM Bot!

AI-система для автоматической генерации, публикации и анализа контента в Telegram.
    """

    if is_admin:
        welcome_text += "\n✅ Вы авторизованы как администратор"

    await message.answer(
        welcome_text,
        reply_markup=main_menu_keyboard(is_admin=is_admin)
    )


@router.callback_query(lambda c: c.data == "menu:main")
async def callback_menu_main(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    is_admin = user_id == settings.ADMIN_TELEGRAM_ID

    await user_state_manager.reset(user_id)

    await callback.message.edit_text(
        "🏠 Главное меню",
        reply_markup=main_menu_keyboard(is_admin=is_admin)
    )
    await callback.answer()